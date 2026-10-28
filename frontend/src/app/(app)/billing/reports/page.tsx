"use client";

import { PageHeader, Card, EmptyState, LoadingState } from "@/components/ui";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";

export default function BillingReportsPage() {
  const revenue = useQuery({
    queryKey: ["billing", "reports", "revenue"],
    queryFn: () => api.get<any>("/billing/reports/revenue"),
  });
  const gst = useQuery({
    queryKey: ["billing", "reports", "gst"],
    queryFn: () => api.get<any>("/billing/reports/gst"),
  });
  const outstanding = useQuery({
    queryKey: ["billing", "reports", "outstanding"],
    queryFn: () => api.get<any>("/billing/reports/outstanding"),
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Billing Reports" subtitle="Revenue, GST collected, outstanding balances, and collection reports." />
      {revenue.isPending && <LoadingState label="Loading reports…" />}
      {!revenue.isPending && (
        <>
          <Card title="Revenue Summary" subtitle="Total invoiced vs collected.">
            <div className="grid grid-cols-3 gap-4 p-4 text-center">
              <div><p className="text-xs text-slate-500">Invoiced</p><p className="tabular text-xl font-semibold">{formatMoney(revenue.data?.invoiced ?? 0)}</p></div>
              <div><p className="text-xs text-slate-500">Collected</p><p className="tabular text-xl font-semibold">{formatMoney(revenue.data?.collected ?? 0)}</p></div>
              <div><p className="text-xs text-slate-500">Outstanding</p><p className="tabular text-xl font-semibold">{formatMoney(revenue.data?.outstanding ?? 0)}</p></div>
            </div>
          </Card>
          <Card title="GST Collected" subtitle="CGST, SGST, IGST breakdown.">
            <div className="grid grid-cols-4 gap-4 p-4 text-center">
              <div><p className="text-xs text-slate-500">CGST</p><p className="tabular font-semibold">{formatMoney(gst.data?.cgst ?? 0)}</p></div>
              <div><p className="text-xs text-slate-500">SGST</p><p className="tabular font-semibold">{formatMoney(gst.data?.sgst ?? 0)}</p></div>
              <div><p className="text-xs text-slate-500">IGST</p><p className="tabular font-semibold">{formatMoney(gst.data?.igst ?? 0)}</p></div>
              <div><p className="text-xs text-slate-500">Total Tax</p><p className="tabular font-semibold">{formatMoney(gst.data?.total_tax ?? 0)}</p></div>
            </div>
          </Card>
          <Card title="Outstanding by Client" subtitle="Unbilled / outstanding balances per client.">
            <div className="p-4">
              {outstanding.data?.items?.length === 0 && <EmptyState message="No outstanding invoices." />}
              {outstanding.data?.items?.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[40rem]">
                    <thead>
                      <tr><th className="th">Client</th><th className="th">Invoice</th><th className="th text-right">Total</th><th className="th text-right">Balance</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(outstanding.data.items as any[]).map((i) => (
                        <tr key={i.invoice_id} className="dashboard-row">
                          <td className="td">{i.client_name}</td>
                          <td className="td text-sky-700">{i.invoice_number}</td>
                          <td className="td tabular text-right">{formatMoney(i.total)}</td>
                          <td className="td tabular text-right font-semibold">{formatMoney(i.outstanding)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
