import { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from 'recharts';
import { api } from '../api/client';
import type { DashboardSummary, ProfitabilityReport } from '../types';
import { StatusBadge } from '../components/StatusBadge';

const COLORS = ['#d97706', '#0ea5e9', '#6366f1', '#059669', '#e11d48', '#78716c'];

function amount(value: number, currency?: string) {
  return `${currency ? `${currency} ` : ''}${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-stone-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent || 'text-stone-800'}`}>{value}</div>
    </div>
  );
}

export function Dashboard() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [profitability, setProfitability] = useState<ProfitabilityReport | null>(null);

  useEffect(() => {
    api.get('/dashboard/summary').then((res) => setData(res.data));
    api.get('/dashboard/profitability').then((res) => setProfitability(res.data));
  }, []);

  if (!data) return <div className="text-stone-400">Loading dashboard...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-stone-800">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Buyers" value={data.totals.customers} />
        <StatCard label="Suppliers" value={data.totals.suppliers} />
        <StatCard label="Products" value={data.totals.products} />
        <StatCard label="Active Proforma Invoices" value={data.totals.activeProformaInvoices} accent="text-amber-600" />
        <StatCard label="In Production" value={data.totals.activeProduction} accent="text-sky-600" />
        <StatCard label="Pending Shipments" value={data.totals.pendingShipments} accent="text-indigo-600" />
        <StatCard
          label="Outstanding Receivables"
          value={`$${data.totals.outstandingReceivables.toLocaleString()}`}
          accent="text-rose-600"
        />
        <StatCard label="Low Stock Materials" value={data.lowStockMaterials.length} accent="text-rose-600" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-stone-700">Proforma Invoices by Status</h2>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={data.proformaInvoicesByStatus}
                dataKey="count"
                nameKey="status"
                cx="50%"
                cy="50%"
                outerRadius={90}
                label={(entry: any) => entry.status}
              >
                {data.proformaInvoicesByStatus.map((_, idx) => (
                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-stone-700">Production by Stage</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.productionByStage}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#d97706" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-stone-700">Revenue Trend (Invoiced)</h2>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data.revenueByMonth}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="total" stroke="#0ea5e9" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-stone-700">Top Products by PI Quantity</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.topProducts} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="total_qty" fill="#059669" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-stone-700">Recent Proforma Invoices</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-stone-400">
              <tr>
                <th className="py-1">PI No.</th>
                <th className="py-1">Buyer</th>
                <th className="py-1">Status</th>
                <th className="py-1 text-right">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data.recentProformaInvoices.map((o) => (
                <tr key={o.id}>
                  <td className="py-2 font-medium text-stone-700">{o.pi_no}</td>
                  <td className="py-2 text-stone-600">{o.customer_name}</td>
                  <td className="py-2">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="py-2 text-right text-stone-700">{amount(o.total_amount, o.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-stone-700">Low Stock Materials</h2>
          {data.lowStockMaterials.length === 0 ? (
            <p className="text-sm text-stone-400">All materials are above reorder level.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-stone-400">
                <tr>
                  <th className="py-1">Material</th>
                  <th className="py-1">Stock</th>
                  <th className="py-1">Reorder Level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {data.lowStockMaterials.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2 font-medium text-stone-700">{m.name}</td>
                    <td className="py-2 text-rose-600">
                      {m.stock_qty} {m.unit}
                    </td>
                    <td className="py-2 text-stone-600">{m.reorder_level}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {profitability && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-stone-800">PI-based Profit &amp; Loss</h2>
            <p className="mt-1 text-sm text-stone-500">Sent and accepted PIs are the master records. Shipping and payment amounts are allocated only within the same currency.</p>
          </div>
          {profitability.currencyGroups.length === 0 ? (
            <div className="border-y border-stone-200 py-6 text-sm text-stone-400">No sent or accepted Proforma Invoices are available for P&amp;L yet.</div>
          ) : (
            <>
              <div className="grid gap-4 xl:grid-cols-2">
                {profitability.currencyGroups.map((group) => (
                  <div key={group.currency} className="border border-stone-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-stone-700">{group.currency} P&amp;L</h3>
                      <span className="text-xs text-stone-400">{group.pi_count} PI(s)</span>
                    </div>
                    <div className="grid grid-cols-3 gap-x-4 gap-y-3 text-sm">
                      <div><div className="text-xs text-stone-400">Revenue</div><div className="font-semibold">{amount(group.revenue, group.currency)}</div></div>
                      <div><div className="text-xs text-stone-400">Production Cost</div><div className="font-semibold">{amount(group.product_cost, group.currency)}</div></div>
                      <div><div className="text-xs text-stone-400">Shipping</div><div className="font-semibold">{amount(group.shipping_expenses, group.currency)}</div></div>
                      <div><div className="text-xs text-stone-400">Net P&amp;L</div><div className={group.net_profit < 0 ? 'font-semibold text-rose-600' : 'font-semibold text-emerald-600'}>{amount(group.net_profit, group.currency)}</div></div>
                      <div><div className="text-xs text-stone-400">Commercial Invoiced</div><div className="font-semibold">{amount(group.invoiced_amount, group.currency)}</div></div>
                      <div><div className="text-xs text-stone-400">Paid</div><div className="font-semibold">{amount(group.paid_amount, group.currency)}</div></div>
                      <div><div className="text-xs text-stone-400">Receivable</div><div className="font-semibold">{amount(group.receivable_amount, group.currency)}</div></div>
                      <div><div className="text-xs text-stone-400">Net Margin</div><div className="font-semibold">{group.margin_percent.toFixed(1)}%</div></div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto border border-stone-200 bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
                    <tr><th className="px-3 py-2">PI / Buyer</th><th className="px-3 py-2 text-right">Revenue</th><th className="px-3 py-2 text-right">Production</th><th className="px-3 py-2 text-right">Shipping</th><th className="px-3 py-2 text-right">Net P&amp;L</th><th className="px-3 py-2 text-right">Invoiced</th><th className="px-3 py-2 text-right">Paid / Due</th></tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {profitability.byProformaInvoice.map((pi) => (
                      <tr key={pi.id}>
                        <td className="px-3 py-2"><div className="font-medium text-stone-700">{pi.pi_no}</div><div className="text-xs text-stone-400">{pi.customer_name} · {pi.status}</div></td>
                        <td className="px-3 py-2 text-right">{amount(pi.revenue, pi.currency)}</td>
                        <td className="px-3 py-2 text-right">{amount(pi.product_cost, pi.currency)}</td>
                        <td className="px-3 py-2 text-right">{amount(pi.shipping_expenses, pi.currency)}</td>
                        <td className={`px-3 py-2 text-right font-medium ${pi.net_profit < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{amount(pi.net_profit, pi.currency)}<div className="text-xs text-stone-400">{pi.margin_percent.toFixed(1)}%</div></td>
                        <td className="px-3 py-2 text-right">{amount(pi.invoiced_amount, pi.currency)}</td>
                        <td className="px-3 py-2 text-right">{amount(pi.paid_amount, pi.currency)}<div className="text-xs text-stone-400">Due {amount(pi.receivable_amount, pi.currency)}</div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
