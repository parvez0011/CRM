import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, apiErrorMessage } from '../api/client';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';
import type { Container, ProformaInvoice } from '../types';

const EXPENSE_TYPES = [
  'Ocean Freight', 'Insurance', 'Customs Clearance', 'Agent Commission', 'Inland Transport', 'Documentation', 'Other',
];

export function ContainerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [container, setContainer] = useState<Container | null>(null);
  const [error, setError] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [pis, setPis] = useState<ProformaInvoice[]>([]);
  const [selectedPiId, setSelectedPiId] = useState('');
  const [expenseType, setExpenseType] = useState(EXPENSE_TYPES[0]);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCurrency, setExpenseCurrency] = useState('USD');
  const [expenseNotes, setExpenseNotes] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await api.get(`/containers/${id}`);
    setContainer(res.data);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function openLinkModal() {
    const res = await api.get('/proforma-invoices');
    setPis(res.data.filter((pi: ProformaInvoice) => pi.status !== 'cancelled'));
    setSelectedPiId('');
    setLinkOpen(true);
  }

  async function linkPi(e: FormEvent) {
    e.preventDefault();
    if (!selectedPiId) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/containers/${id}/orders`, { proforma_invoice_id: selectedPiId });
      setLinkOpen(false);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function unlinkOrder(linkId: number) {
    if (!window.confirm('Remove this order from the container?')) return;
    await api.delete(`/containers/${id}/orders/${linkId}`);
    load();
  }

  async function addExpense(e: FormEvent) {
    e.preventDefault();
    if (!expenseAmount) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/containers/${id}/expenses`, {
        expense_type: expenseType,
        amount: Number(expenseAmount),
        currency: expenseCurrency,
        notes: expenseNotes,
      });
      setExpenseOpen(false);
      setExpenseAmount('');
      setExpenseNotes('');
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeExpense(expenseId: number) {
    if (!window.confirm('Remove this expense?')) return;
    await api.delete(`/containers/expenses/${expenseId}`);
    load();
  }

  async function generateCommercialInvoice() {
    if (!window.confirm('Generate commercial invoice(s) for all Proforma Invoices linked to this container?')) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.post(`/containers/${id}/generate-commercial-invoice`);
      alert(`${res.data.invoices.length} commercial invoice(s) generated.`);
      navigate('/invoices');
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!container) return <div className="text-stone-400">Loading...</div>;

  const netMargin = (container.totalValue || 0) - (container.totalExpenses || 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/containers" className="text-xs text-sky-600 hover:underline">
            &larr; Back to Containers
          </Link>
          <h1 className="text-2xl font-bold text-stone-800">{container.container_no}</h1>
        </div>
        <StatusBadge status={container.status} />
      </div>

      {error && <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase text-stone-400">Type / Route</div>
          <div className="mt-1 font-medium text-stone-700">{container.container_type}</div>
          <div className="text-sm text-stone-600">
            {container.port_of_loading} &rarr; {container.port_of_discharge}
          </div>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase text-stone-400">Cargo Value</div>
          <div className="mt-1 text-xl font-bold text-stone-800">
            {container.currency} {container.totalValue?.toLocaleString()}
          </div>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase text-stone-400">Shipping Expenses</div>
          <div className="mt-1 text-xl font-bold text-rose-600">{container.totalExpenses?.toLocaleString()}</div>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase text-stone-400">Net (Value - Expenses)</div>
          <div className={`mt-1 text-xl font-bold ${netMargin < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {netMargin.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-stone-700">Linked Proforma Invoices / Orders</h2>
          <div className="space-x-2">
            <button onClick={openLinkModal} className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700">
              + Link Proforma Invoice
            </button>
            <button
              onClick={generateCommercialInvoice}
              disabled={busy}
              className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Generate Commercial Invoice
            </button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-stone-400">
            <tr>
              <th className="py-1">PI / Order No.</th>
              <th className="py-1">Buyer</th>
              <th className="py-1 text-right">Value</th>
              <th className="py-1"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {container.orders?.length ? (
              container.orders.map((o) => (
                <tr key={o.id}>
                  <td className="py-2 font-medium text-stone-700">{o.pi_no || o.sales_order_no}</td>
                  <td className="py-2">{o.customer_name}</td>
                  <td className="py-2 text-right">{o.total_amount.toLocaleString()}</td>
                  <td className="py-2 text-right">
                    <button onClick={() => unlinkOrder(o.id)} className="text-rose-600 hover:underline text-xs">
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="py-3 text-center text-stone-400">
                  No orders linked yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-stone-700">Shipping Expenses</h2>
          <button onClick={() => setExpenseOpen(true)} className="rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700">
            + Add Expense
          </button>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-stone-400">
            <tr>
              <th className="py-1">Type</th>
              <th className="py-1">Notes</th>
              <th className="py-1 text-right">Amount</th>
              <th className="py-1"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {container.expenses?.length ? (
              container.expenses.map((exp) => (
                <tr key={exp.id}>
                  <td className="py-2">{exp.expense_type}</td>
                  <td className="py-2 text-stone-500">{exp.notes}</td>
                  <td className="py-2 text-right">
                    {exp.currency} {exp.amount.toLocaleString()}
                  </td>
                  <td className="py-2 text-right">
                    <button onClick={() => removeExpense(exp.id)} className="text-rose-600 hover:underline text-xs">
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="py-3 text-center text-stone-400">
                  No shipping expenses recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {linkOpen && (
        <Modal title="Link Proforma Invoice" onClose={() => setLinkOpen(false)}>
          <form onSubmit={linkPi} className="space-y-3">
            {error && <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">Proforma Invoice</label>
              <select
                value={selectedPiId}
                onChange={(e) => setSelectedPiId(e.target.value)}
                className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
              >
                <option value="">-- Select PI --</option>
                {pis.map((pi) => (
                  <option key={pi.id} value={pi.id}>
                    {pi.pi_no} - {pi.customer_name} ({pi.currency} {pi.total_amount?.toLocaleString()})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setLinkOpen(false)} className="rounded border border-stone-300 px-4 py-1.5 text-sm text-stone-600 hover:bg-stone-50">
                Cancel
              </button>
              <button type="submit" disabled={busy} className="rounded bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
                {busy ? 'Linking...' : 'Link'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {expenseOpen && (
        <Modal title="Add Shipping Expense" onClose={() => setExpenseOpen(false)}>
          <form onSubmit={addExpense} className="space-y-3">
            {error && <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">Expense Type</label>
              <select
                value={expenseType}
                onChange={(e) => setExpenseType(e.target.value)}
                className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
              >
                {EXPENSE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">Currency</label>
                <select
                  value={expenseCurrency}
                  onChange={(e) => setExpenseCurrency(e.target.value)}
                  className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
                >
                  {['USD', 'INR', 'EUR'].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">Notes</label>
              <input
                value={expenseNotes}
                onChange={(e) => setExpenseNotes(e.target.value)}
                className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setExpenseOpen(false)} className="rounded border border-stone-300 px-4 py-1.5 text-sm text-stone-600 hover:bg-stone-50">
                Cancel
              </button>
              <button type="submit" disabled={busy} className="rounded bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
                {busy ? 'Adding...' : 'Add Expense'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
