"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/format";
import type { ClientServiceRow, Page, ServiceRow } from "@/lib/types";
import { api, buildQuery } from "@/lib/api";

/** A flattened view of a client's service for the combobox. */
export interface ServiceOption {
  id: string;
  code: string;
  name: string;
  sac_code: string;
  standard_fee: number | null;
  category: string;
}

/** Transform the client's ClientServiceRow[] → flat ServiceOption[] for the picker. */
export function flattenClientServices(
  clientServices: ClientServiceRow[] | undefined,
): ServiceOption[] {
  return (clientServices ?? [])
    .filter((cs) => cs.service && cs.is_active)
    .map((cs) => {
      const s = cs.service!;
      return {
        id: s.id,
        code: s.code,
        name: s.name,
        sac_code: s.sac_code,
        standard_fee: s.standard_fee,
        category: s.category,
      };
    });
}

const MAX_DROPDOWN_HEIGHT = 360;

interface DropdownPosition {
  top: number;
  left: number;
  width: number;
}

function measurePosition(
  trigger: HTMLElement,
  itemCount: number,
  minWidth = 280,
): DropdownPosition | null {
  if (!trigger) return null;
  const rect = trigger.getBoundingClientRect();
  const dropdownHeight = Math.min(MAX_DROPDOWN_HEIGHT, itemCount * 44 + 8);
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;
  let top: number;

  if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
    top = rect.top - dropdownHeight - 4;
  } else {
    top = rect.bottom + 4;
  }

  // The dropdown is allowed to be wider than the trigger so every option is
  // readable in full, then clamped to the viewport so long service names are
  // never clipped by the screen edge.
  let width = Math.max(minWidth, Math.round(rect.width));
  let left = rect.left;

  if (left + width > window.innerWidth) {
    if (rect.right - width < 4) {
      // Not enough room on either side; clamp to the viewport.
      width = Math.min(window.innerWidth - 8, Math.max(minWidth, width));
      left = 4;
    } else {
      left = rect.right - width;
    }
  }

  return { top, left, width };
}

function ServiceOptionRow({
  opt,
  onSelect,
  dark = false,
}: {
  opt: ServiceOption;
  onSelect: (opt: ServiceOption) => void;
  dark?: boolean;
}) {
  const categoryLabel: Record<string, string> = {
    gst: "GST",
    income_tax: "IT",
    tds: "TDS",
    audit: "Audit",
    roc: "ROC",
    accounting: "Accounts",
    payroll: "Payroll",
    advisory: "Advisory",
    other: "Other",
  };
  return (
    <button
      type="button"
      className={cn(
        "group w-full px-3 py-2 text-left text-sm focus:outline-none",
        dark
          ? "hover:bg-[var(--h-dark-surface-1)]"
          : "hover:bg-slate-50 focus:bg-sky-50",
      )}
      onMouseDown={(e) => {
        e.preventDefault();
        onSelect(opt);
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className={cn("font-medium", dark ? "text-[var(--h-dark-text-primary)] group-hover:text-[var(--h-brand-600)]" : "text-slate-900 group-hover:text-sky-800")}>{opt.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs">
            <span className={cn("font-mono", dark ? "text-[var(--h-dark-text-secondary)]" : "text-slate-500")}>{opt.code}</span>
            <span className={dark ? "text-[var(--h-dark-text-secondary)]" : "text-slate-500"}>· SAC: {opt.sac_code}</span>
            {opt.standard_fee != null && (
              <span className="font-mono" style={{ color: dark ? "var(--h-dark-text-secondary)" : undefined }}>· ₹{opt.standard_fee.toLocaleString("en-IN")}</span>
            )}
          </div>
        </div>
        {opt.category && categoryLabel[opt.category] && (
          <span className={cn("text-xs font-medium", dark ? "text-[var(--h-brand-600)]" : "text-sky-700")}>
            {categoryLabel[opt.category]}
          </span>
        )}
      </div>
    </button>
  );
}

/**
 * A searchable combobox for services.
 *
 * Uses two sources:
 * 1. The client's assigned services (client-side filter — instant)
 * 2. A global `/services?search=` fallback (API call) when the client
 *    has no matching services or the user explicitly searches all services.
 *
 * The dropdown renders into a portal at the document root so it is never
 * clipped by ancestor `overflow` containers (e.g. the table's horizontal
 * scroller). It auto-flips to open upward when there is insufficient space
 * below the trigger.
 *
 * When a service is selected, the parent auto-fills the description, SAC code,
 * rate, and service_id on the line item.
 */
export function ServiceCombobox({
  value,
  onChange,
  clientServices,
  loading: isLoading,
  placeholder = "Search services…",
  dark = false,
  size = "default",
  dropdownMinWidth = 280,
}: {
  value: string;
  onChange: (service: ServiceOption | null) => void;
  clientServices: ServiceOption[];
  loading?: boolean;
  placeholder?: string;
  dark?: boolean;
  size?: "default" | "lg";
  /** Minimum pixel width for the dropdown, so long options are never truncated. */
  dropdownMinWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [globalSearch, setGlobalSearch] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<DropdownPosition | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter client services locally — instant, no network round-trip.
  const clientFiltered = useMemo(() => {
    if (!query.trim()) return clientServices;
    const q = query.toLowerCase();
    return clientServices.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        s.sac_code.toLowerCase().includes(q),
    );
  }, [clientServices, query]);

  // Global fallback: only triggered when client services don't match
  // or when the user clicks "Browse all services".
  const needsGlobal = query.trim().length > 0 && (clientFiltered.length === 0 || globalSearch);

  const { data: globalResults, isFetching: isGlobalFetching } = useQuery({
    queryKey: ["services", "search", query],
    queryFn: () =>
      api.get<Page<ServiceRow>>(
        `/services${buildQuery({ search: query, status: "active", limit: 30 })}`,
      ),
    enabled: needsGlobal && open,
    staleTime: 30_000,
  });

  const selected = value ? clientServices.find((s) => s.id === value) ?? null : null;
  const hasServices = clientServices.length > 0;

  // Larger variant for create-invoice primary search field
  const isLg = size === "lg";
  const inputCls = dark
    ? cn(
        "w-full rounded-md border outline-none",
        isLg ? "px-4 py-3 text-lg" : "px-3 py-2.5 text-base",
        "border-[var(--h-dark-border-color)] bg-[var(--h-dark-surface-1)] text-[var(--h-dark-text-primary)] placeholder:text-[var(--h-dark-text-tertiary)]",
        isLg && "pl-9",
      )
    : cn(
        "w-full rounded-md border outline-none input",
        isLg ? "py-3 pl-10 pr-3 text-lg" : "py-2.5 pl-8 pr-3 text-sm",
      );
  const iconCls = cn(
    "absolute top-1/2 -translate-y-1/2",
    isLg ? "left-3 h-5 w-5" : "left-2.5 h-4 w-4",
    dark ? "text-[var(--h-dark-text-tertiary)]" : "text-slate-400",
  );

  const allOptions: ServiceOption[] = useMemo(() => {
    const clientOpts = clientFiltered;
    const globalOpts = globalResults?.items?.length
      ? globalResults.items.map((s: ServiceRow): ServiceOption => ({
          id: s.id,
          code: s.code,
          name: s.name,
          sac_code: s.sac_code,
          standard_fee: s.standard_fee,
          category: s.category,
        }))
      : [];
    // Deduplicate global options that are already in client options.
    const clientIds = new Set(clientOpts.map((o) => o.id));
    return [...clientOpts, ...globalOpts.filter((o) => !clientIds.has(o.id))];
  }, [clientFiltered, globalResults]);

  const showDropdown = open && (allOptions.length > 0 || isGlobalFetching);

  // Positioning logic
  useEffect(() => {
    if (!open || !inputRef.current) {
      setDropdownPos(null);
      return;
    }

    const updatePos = () => {
      const pos = measurePosition(inputRef.current!, allOptions.length, dropdownMinWidth);
      setDropdownPos(pos);
    };

    const handleDocumentMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setOpen(false);
        setGlobalSearch(false);
        setQuery("");
      }
    };

    const handleScroll = () => {
      // Keep the dropdown anchored to the input as the viewport scrolls.
      // Fixed positioning is relative to the viewport, so we must update
      // the pixel coordinates whenever the page moves.
      if (inputRef.current) {
        updatePos();
      }
    };

    updatePos();

    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", handleScroll, true);
    document.addEventListener("mousedown", handleDocumentMouseDown);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("mousedown", handleDocumentMouseDown);
    };
  }, [open, allOptions.length]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setGlobalSearch(false);
        setQuery("");
        inputRef.current?.blur();
      }
    };
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  }, [open]);

  function handleSelect(opt: ServiceOption) {
    onChange(opt);
    setQuery("");
    setOpen(false);
    setGlobalSearch(false);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    if (!open) setOpen(true);
  }

  function handleInputFocus() {
    setOpen(true);
    if (!hasServices) setGlobalSearch(true);
  }

  function handleInputBlur() {
    // Defer so the onMouseDown on dropdown items can fire first
    setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement as Node)) {
        setOpen(false);
        setGlobalSearch(false);
        setQuery("");
      }
    }, 200);
  }

  // Loading state — when the client detail is still being fetched
  if (isLoading) {
    return (
      <input
        type="text"
        className={inputCls}
        placeholder="Loading services…"
        disabled
        aria-label="Loading services"
      />
    );
  }

  // No services at all — show the global search input
  if (!hasServices) {
    return (
      <div className="relative" ref={containerRef}>
        <div className="relative">
          <Icon name="search" className={iconCls} />
          <input
            ref={inputRef}
            type="text"
            className={inputCls}
            placeholder="Search services…"
            value={open ? query : selected?.name ?? ""}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            onClick={() => {
              setOpen(true);
              setGlobalSearch(true);
            }}
          />
        </div>
        {showDropdown && dropdownPos && (
          <>
            {createPortal(
              <div
                className={cn(
                  "fixed z-[9999] overflow-y-auto rounded-lg border-2 py-1 shadow-xl service-dropdown-portal",
                  dark
                    ? "border-[var(--h-dark-border-color)] bg-[var(--h-dark-surface-0)]"
                    : "border-slate-200 bg-white",
                )}
                ref={dropdownRef}
                style={{
                  top: dropdownPos.top,
                  left: dropdownPos.left,
                  width: dropdownPos.width,
                  maxHeight: MAX_DROPDOWN_HEIGHT,
                }}
              >
                {isGlobalFetching ? (
                  <p className={cn("px-3 py-2 text-sm", dark ? "text-[var(--h-dark-text-tertiary)]" : "text-slate-500")}>Searching…</p>
                ) : globalResults?.items?.length ? (
                  <>
                    <p className={cn("px-3 pb-1 text-xs", dark ? "text-[var(--h-dark-text-tertiary)]" : "text-slate-500")}>
                      {globalResults.items.length} result{globalResults.items.length === 1 ? "" : "s"}
                    </p>
                    {globalResults.items.map((opt: ServiceRow) => (
                      <ServiceOptionRow
                        key={opt.id}
                        opt={{
                          id: opt.id,
                          code: opt.code,
                          name: opt.name,
                          sac_code: opt.sac_code,
                          standard_fee: opt.standard_fee,
                          category: opt.category,
                        }}
                        onSelect={handleSelect}
                        dark={dark}
                      />
                    ))}
                  </>
                ) : query.trim() ? (
                  <p className={cn("px-3 py-2 text-sm", dark ? "text-[var(--h-dark-text-tertiary)]" : "text-slate-500")}>No matching services</p>
                ) : null}
              </div>,
              document.body,
            )}
          </>
        )}
      </div>
    );
  }

  // Has client services — show the combined dropdown
  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <Icon name="search" className={iconCls} />
        <input
          ref={inputRef}
          type="text"
          className={inputCls}
          placeholder={selected?.name ?? placeholder}
          value={open ? query : selected?.name ?? ""}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onClick={() => setOpen(true)}
        />
      </div>
      {showDropdown && dropdownPos && (
        <>
          {createPortal(
            <div
              className={cn(
                "fixed z-[9999] overflow-y-auto rounded-lg border-2 py-1 shadow-xl service-dropdown-portal",
                dark
                  ? "border-[var(--h-dark-border-color)] bg-[var(--h-dark-surface-0)]"
                  : "border-slate-200 bg-white",
              )}
              ref={dropdownRef}
              style={{
                top: dropdownPos.top,
                left: dropdownPos.left,
                width: dropdownPos.width,
                maxHeight: MAX_DROPDOWN_HEIGHT,
              }}
            >
              {clientFiltered.length > 0 && query.trim() && (
                <p className={cn("px-3 pb-1 text-xs", dark ? "text-[var(--h-dark-text-tertiary)]" : "text-slate-500")}>
                  {clientFiltered.length} client service{clientFiltered.length === 1 ? "" : "s"}
                </p>
              )}
              {clientFiltered.length > 0 && (
                <>
                  {clientFiltered.map((opt) => (
                    <ServiceOptionRow
                      key={opt.id}
                      opt={opt}
                      onSelect={handleSelect}
                      dark={dark}
                    />
                  ))}
                </>
              )}

              {/* "Browse all services" — switches to global API search */}
              {query.trim() && clientFiltered.length === 0 && !globalSearch && (
                <button
                  type="button"
                  className={cn(
                    "w-full px-3 py-1.5 text-left text-xs",
                    dark
                      ? "text-[var(--h-brand-600)] hover:bg-[var(--h-dark-surface-1)]"
                      : "text-sky-700 hover:bg-sky-50",
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setGlobalSearch(true);
                  }}
                >
                  Search all services for &ldquo;{query}&rdquo;
                </button>
              )}

              {/* Global search results */}
              {globalSearch && needsGlobal && (
                <>
                  {isGlobalFetching ? (
                    <p className={cn("px-3 py-2 text-sm", dark ? "text-[var(--h-dark-text-tertiary)]" : "text-slate-500")}>Searching all services…</p>
                  ) : allOptions.length > clientFiltered.length ? (
                    <>
                      <p className={cn("px-3 pb-1 text-xs", dark ? "text-[var(--h-dark-text-tertiary)]" : "text-slate-500")}>
                        {allOptions.length - clientFiltered.length} more from all services
                      </p>
                      {allOptions
                        .slice(clientFiltered.length)
                        .map((opt) => (
                          <ServiceOptionRow
                            key={opt.id}
                            opt={opt}
                            onSelect={handleSelect}
                            dark={dark}
                          />
                        ))}
                    </>
                  ) : allOptions.length === 0 ? (
                    <p className={cn("px-3 py-2 text-sm", dark ? "text-[var(--h-dark-text-tertiary)]" : "text-slate-500")}>No services found</p>
                  ) : null}
                </>
              )}
            </div>,
            document.body,
          )}
        </>
      )}
    </div>
  );
}
