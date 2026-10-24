/**
 * Client-side GST arithmetic for **live preview only**.
 *
 * The backend (`backend/app/services/billing.py`) is the source of truth; these
 * functions mirror its logic so the on-screen preview updates instantly without a
 * round-trip. A comment on the preview calls this out so nobody mistakes it for
 * the real calculation.
 */

import type { DraftLine } from "@/components/InvoiceLineTable";

export type GstTaxType = "intra_state" | "inter_state" | "none";

export interface TaxResolution {
  taxType: GstTaxType;
  /** Plain-language explanation shown in the UI. */
  reason: string;
  placeOfSupply: string | null;
}

/** Half-up rounding to 2 decimals (paise), matching the backend. */
function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Decide CGST+SGST vs IGST based on the firm's and client's state codes.
 *
 * Mirrors `billing_math.resolve_tax`. The reason string is surfaced so the user
 * understands why a particular tax head was chosen.
 */
export function resolveTax(
  firmStateCode: string | null | undefined,
  clientStateCode: string | null | undefined,
  rate: number,
): TaxResolution {
  const firmState = firmStateCode?.trim();
  const clientState = clientStateCode?.trim();

  if (!firmState || !clientState) {
    return {
      taxType: "none",
      reason:
        "GST is not applied: the firm or the client has no state code on file. " +
        "Add a state to the firm settings or the client record to compute tax.",
      placeOfSupply: clientState ?? firmState ?? null,
    };
  }

  const placeOfSupply = clientState;

  if (firmState === clientState) {
    return {
      taxType: "intra_state",
      reason: `Same-state supply (${clientState}) → CGST ${rate / 2}% + SGST ${rate / 2}%`,
      placeOfSupply,
    };
  }

  return {
    taxType: "inter_state",
    reason: `Different-state supply (${firmState} → ${clientState}) → IGST ${rate}%`,
    placeOfSupply,
  };
}

export interface InvoiceTotals {
  subtotal: number;
  discountTotal: number;
  taxableTotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

/**
 * Compute all invoice totals from draft lines.
 *
 * Mirrors `billing_math.compute_invoice`:
 * - line amount = qty × rate − discount (pre-tax)
 * - non-taxable lines are excluded from the GST base
 * - tax is computed once on the taxable value, then split (SGST takes remainder)
 */
export function computeTotals(lines: DraftLine[], rate: number, taxType: GstTaxType): InvoiceTotals {
  const taxableLineAmounts = lines
    .filter((line) => line.description.trim().length > 0)
    .map((line) => {
      const qty = Number(line.quantity ?? 1);
      const rate_per = Number(line.unit_price ?? 0);
      const disc = Number(line.discount ?? 0);
      return qty * rate_per - disc;
    });

  const subtotal = roundMoney(taxableLineAmounts.reduce((sum, amt) => sum + amt, 0));
  const discountTotal = roundMoney(
    lines
      .filter((l) => l.description.trim())
      .reduce((sum, l) => sum + Number(l.discount || 0), 0),
  );
  const taxableTotal = roundMoney(subtotal - discountTotal);

  if (taxType === "none" || !taxableLineAmounts.length) {
    return { subtotal, discountTotal, taxableTotal, cgst: 0, sgst: 0, igst: 0, total: taxableTotal };
  }

  const totalTax = roundMoney(taxableTotal * (rate / 100));

  let cgst = 0,
    sgst = 0,
    igst = 0;

  if (taxType === "inter_state") {
    igst = totalTax;
  } else {
    // intra_state: CGST = half, SGST = remainder (avoids paisa drift)
    cgst = roundMoney(totalTax / 2);
    sgst = roundMoney(totalTax - cgst);
  }

  const total = roundMoney(taxableTotal + cgst + sgst + igst);

  return { subtotal, discountTotal, taxableTotal, cgst, sgst, igst, total };
}

/**
 * Convert a number to Indian-words ("Rupees Twelve Thousand Five Hundred Only").
 *
 * Supports values up to 99,999,99,999.99. Mirrors the backend's formatter.
 */
const _ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
];
const _TEENS = [
  "Ten", "Eleven", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
];
const _TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
];
const _SCALES = ["", "Thousand", "Lakh", "Crore"];

function _belowHundred(n: number): string {
  if (n < 10) return _ONES[n];
  if (n < 20) return n < 10 ? _ONES[n] : _TEENS[n - 10];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return _TENS[tens] + (ones ? " " + _ONES[ones] : "");
}

function _belowThousand(n: number): string {
  if (n < 100) return _belowHundred(n);
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return (
    _ONES[hundreds] + " Hundred" + (rest ? " " + _belowHundred(rest) : "")
  );
}

export function amountInWords(value: number): string {
  const num = Math.round(value * 100) / 100;

  if (num === 0) return "Rupees Zero Only";

  const intPart = Math.floor(num);
  const decPart = Math.round((num - intPart) * 100);

  // Indian numbering: groups of 2 after the first 3
  let words = "";
  let scaleIdx = 0;
  let remaining = intPart;

  while (remaining > 0) {
    let group: number;
    if (scaleIdx === 0) {
      group = remaining % 1000;
      remaining = Math.floor(remaining / 1000);
    } else {
      group = remaining % 100;
      remaining = Math.floor(remaining / 100);
    }
    if (group > 0) {
      const groupWords = _belowThousand(group);
      words = `${groupWords} ${_SCALES[scaleIdx] || ""} ${words}`.trim();
    }
    scaleIdx++;
  }

  words = words.replace(/\s+/g, " ").trim();

  let result = `Rupees ${words}`;

  if (decPart > 0) {
    result += ` and ${decPart < 10 ? "0" : ""}${_belowHundred(decPart)} Paise`;
  }

  return `${result} Only`;
}
