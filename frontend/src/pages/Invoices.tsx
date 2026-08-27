import { useEffect, useState, type FormEvent } from 'react';
import { api, apiErrorMessage } from '../api/client';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';
import type { Customer, Invoice, SalesOrder } from '../types';

export function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [detail, setDetail] = useState<Invoice | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'Bank Transfer', reference: '', notes: '' });
  const [paymentError, setPaymentError] = useState('');

  async function load() {
    setLoading(true);
    const res = await api.get('/invoices');
    setInvoices(res.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    api.get('/customers').then((res) => setCustomers(res.data));
    api.get('/sales-orders').then((res) => setSalesOrders(res.data));
  }, []);

  function openCreate() {
    setForm({ customer_id: '', sales_order_id: '', invoice_date: '', due_date: '', currency: 'USD', total_amount: '', notes: '' });
    setError('');
    setModalOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.customer_id || !form.total_amount) {
      setError('Please select a buyer and enter the total amount.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/invoices', form);
      setModalOpen(false);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function openDetail(invoiceId: number) {
    const res = await api.get(`/invoices/${invoiceId}`);
    setDetail(res.data);
    setPaymentForm({ amount: '', method: 'Bank Transfer', reference: '', notes: '' });
    setPaymentError('');
  }

  async function recordPayment(e: FormEvent) {
    e.preventDefault();
    if (!detail) return;
    setPaymentError('');
    if (!paymentForm.amount || Number(paymentForm.amount) <= 0) {
      setPaymentError('Enter a valid payment amount.');
      return;
    }
    try {
      await api.post(`/invoices/${detail.id}/payments`, paymentForm);
      const res = await api.get(`/invoices/${detail.id}`);
      setDetail(res.data);
      setPaymentForm({ amount: '', method: 'Bank Transfer', reference: '', notes: '' });
      load();
    } catch (err) {
      setPaymentError(apiErrorMessage(err));
    }
  }

  const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.total_amount, 0);
  const totalPaid = invoices.reduce((sum, inv) => sum + inv.paid_amount, 0);
  const totalOutstanding = totalInvoiced - totalPaid;
  const overdueCount = invoices.filter((inv) => inv.status === 'overdue').length;

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-800">Invoices &amp; Payments</h1>
          <p className="text-sm text-stone-500">Payment tracking for every export order / Proforma Invoice</p>
        </div>
        <button onClick={openCreate} className="rounded bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700">
          + New Invoice
        </button>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase text-stone-400">Total Invoiced</div>
          <div className="mt-1 text-xl font-bold text-stone-800">{totalInvoiced.toLocaleString()}</div>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase text-stone-400">Total Collected</div>
          <div className="mt-1 text-xl font-bold text-emerald-600">{totalPaid.toLocaleString()}</div>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase text-stone-400">Outstanding</div>
          <div className="mt-1 text-xl font-bold text-rose-600">{totalOutstanding.toLocaleString()}</div>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase text-stone-400">Overdue Invoices</div>
          <div className="mt-1 text-xl font-bold text-amber-600">{overdueCount}</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Invoice No.</th>
              <th className="px-4 py-3">PI / Container Ref.</th>
              <th className="px-4 py-3">Buyer</th>
              <th className="px-4 py-3">Invoice Date</th>
              <th className="px-4 py-3">Due Date</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Paid</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-stone-400">
                  Loading...
                </td>
              </tr>
            ) : invoices.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-stone-400">
                  No invoices yet.
                </td>
              </tr>
            ) : (
              invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-stone-50">
                  <td className="px-4 py-3 font-medium text-stone-700">{inv.invoice_no}</td>
                  <td className="px-4 py-3 text-stone-500">
                    {inv.pi_no && <div>{inv.pi_no}</div>}
                    {inv.container_no && <div className="text-xs">Container: {inv.container_no}</div>}
                    {!inv.pi_no && !inv.container_no && '-'}
                  </td>
                  <td className="px-4 py-3">
                    {inv.customer_name}
                    <div className="text-xs text-stone-400">{inv.customer_company}</div>
                  </td>
                  <td className="px-4 py-3">{inv.invoice_date}</td>
                  <td className="px-4 py-3">{inv.due_date}</td>
                  <td className="px-4 py-3">
                    {inv.currency} {inv.total_amount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    {inv.currency} {inv.paid_amount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={inv.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openDetail(inv.id)} className="text-sky-600 hover:underline text-xs font-medium">
                      View / Record Payment
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <Modal title="New Invoice" onClose={() => setModalOpen(false)}>
          <form onSubmit={handleSubmit} className="space-y-3">
            {error && <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">Buyer *</label>
              <select
                required
                value={form.customer_id}
                onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
              >
                <option value="">-- Select buyer --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.company})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">Linked Export Order (optional)</label>
              <select
                value={form.sales_order_id}
                onChange={(e) => setForm({ ...form, sales_order_id: e.target.value })}
                className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
              >
                <option value="">-- None --</option>
                {salesOrders
                  .filter((s) => !form.customer_id || String(s.customer_id) === String(form.customer_id))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.order_no} ({s.currency} {s.total_amount})
                    </option>
                  ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">Invoice Date</label>
                <input
                  type="date"
                  value={form.invoice_date || ''}
                  onChange={(e) => setForm({ ...form, invoice_date: e.target.value })}
                  className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">Due Date</label>
                <input
                  type="date"
                  value={form.due_date || ''}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                  className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">Currency</label>
                <select
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
                >
                  {['USD', 'EUR', 'GBP', 'JPY', 'INR'].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">Total Amount *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={form.total_amount}
                  onChange={(e) => setForm({ ...form, total_amount: e.target.value })}
                  className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">Notes</label>
              <textarea
                value={form.notes || ''}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded border border-stone-300 px-4 py-1.5 text-sm text-stone-600 hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Create Invoice'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {detail && (
        <Modal title={`Invoice ${detail.invoice_no}`} onClose={() => setDetail(null)} wide>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-stone-400">Buyer</div>
                <div className="text-stone-700">
                  {detail.customer_name} ({detail.customer_company})
                </div>
              </div>
              <div>
                <div className="text-xs text-stone-400">Status</div>
                <StatusBadge status={detail.status} />
              </div>
              <div>
                <div className="text-xs text-stone-400">Total</div>
                <div className="text-stone-700">
                  {detail.currency} {detail.total_amount.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-xs text-stone-400">Paid / Balance</div>
                <div className="text-stone-700">
                  {detail.currency} {detail.paid_amount.toLocaleString()} / {detail.currency}{' '}
                  {(detail.total_amount - detail.paid_amount).toLocaleString()}
                </div>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-stone-700">Payment History</h3>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-stone-400">
                  <tr>
                    <th className="py-1">Date</th>
                    <th className="py-1">Amount</th>
                    <th className="py-1">Method</th>
                    <th className="py-1">Transaction Number</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {detail.payments?.length ? (
                    detail.payments.map((p) => (
                      <tr key={p.id}>
                        <td className="py-2">{p.payment_date}</td>
                        <td className="py-2">
                          {detail.currency} {p.amount.toLocaleString()}
                        </td>
                        <td className="py-2">{p.method}</td>
                        <td className="py-2">{p.reference}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-3 text-center text-stone-400">
                        No payments recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {detail.status !== 'paid' && (
              <form onSubmit={recordPayment} className="flex items-end gap-2 border-t pt-4">
                {paymentError && <div className="w-full rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{paymentError}</div>}
                <div className="w-28">
                  <label className="mb-1 block text-xs font-medium text-stone-600">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                    className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-stone-600">Method</label>
                  <select
                    value={paymentForm.method}
                    onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}
                    className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
                  >
                    {['Bank Transfer', 'Letter of Credit', 'PayPal', 'Cash', 'Other'].map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-stone-600">Transaction Number *</label>
                  <input
                    required
                    value={paymentForm.reference}
                    onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                    className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
                  />
                </div>
                <button type="submit" className="rounded bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
                  Record Payment
                </button>
              </form>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
