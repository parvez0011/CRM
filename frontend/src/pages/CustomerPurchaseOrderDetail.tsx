import { useEffect, useState, type FormEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, apiErrorMessage } from '../api/client';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';
import { CURRENCIES, INCOTERMS } from '../constants/exportTerms';
import type { CustomerPurchaseOrder, CustomerPurchaseOrderItem, Product } from '../types';

interface AllocationRow {
  customer_po_item_id: number;
  qty: string;
}

function CreatePiModal({
  po,
  onClose,
  onCreated,
}: {
  po: CustomerPurchaseOrder;
  onClose: () => void;
  onCreated: (piId: number) => void;
}) {
  const allocatable = (po.items || []).filter((i) => (i.remaining_qty || 0) > 0);
  const [rows, setRows] = useState<AllocationRow[]>(allocatable.map((i) => ({ customer_po_item_id: i.id!, qty: '' })));
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  function updateQty(itemId: number, qty: string) {
    setRows((prev) => prev.map((r) => (r.customer_po_item_id === itemId ? { ...r, qty } : r)));
  }

  function allocateAllRemaining() {
    setRows(
      allocatable.map((item) => ({
        customer_po_item_id: item.id!,
        qty: String(item.remaining_qty),
      }))
    );
    setError('');
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError('');
    const allocations = rows
      .filter((r) => Number(r.qty) > 0)
      .map((r) => ({ customer_po_item_id: r.customer_po_item_id, qty: Number(r.qty) }));
    if (allocations.length === 0) {
      setError('Enter a quantity for at least one item.');
      return;
    }
    setCreating(true);
    try {
      const res = await api.post(`/customer-purchase-orders/${po.id}/create-pi`, {
        allocations,
        pi_date: new Date().toISOString().slice(0, 10),
      });
      onCreated(res.data.id);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal title={`Create Proforma Invoice from ${po.po_no}`} onClose={onClose} wide>
      <form onSubmit={handleCreate} className="space-y-4">
        {error && <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-stone-500">
            Choose the quantity of each item to include in this PI. Only the remaining (unallocated) PO quantity is available.
          </p>
          <button
            type="button"
            onClick={allocateAllRemaining}
            disabled={allocatable.length === 0}
            className="shrink-0 rounded border border-amber-600 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add Full Remaining Quantity
          </button>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-stone-400">
            <tr>
              <th className="py-1">Product</th>
              <th className="py-1 text-right">PO Qty</th>
              <th className="py-1 text-right">Remaining</th>
              <th className="py-1 text-right">Qty for this PI</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {allocatable.map((item) => (
              <tr key={item.id}>
                <td className="py-2 font-medium text-stone-700">
                  {item.product_name}
                  <div className="text-xs text-stone-400">{item.sku}</div>
                </td>
                <td className="py-2 text-right">{item.qty}</td>
                <td className="py-2 text-right">{item.remaining_qty}</td>
                <td className="py-2 text-right">
                  <input
                    type="number"
                    min="0"
                    max={item.remaining_qty}
                    value={rows.find((r) => r.customer_po_item_id === item.id)?.qty || ''}
                    onChange={(e) => updateQty(item.id!, e.target.value)}
                    className="w-28 rounded border border-stone-300 px-2 py-1 text-right text-sm"
                  />
                </td>
              </tr>
            ))}
            {allocatable.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-stone-400">
                  This PO is fully allocated to Proforma Invoices.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="flex justify-end gap-2 border-t pt-3">
          <button type="button" onClick={onClose} className="rounded border border-stone-300 px-4 py-1.5 text-sm text-stone-600 hover:bg-stone-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={creating || allocatable.length === 0}
            className="rounded bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create Proforma Invoice'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

interface EditItemRow {
  id?: number;
  product_id: string;
  description: string;
  hsn_code: string;
  unit: string;
  qty: string;
  rate: string;
  allocated_qty: number;
  product_name?: string;
  sku?: string;
}

function EditPoModal({
  po,
  products,
  onClose,
  onSaved,
}: {
  po: CustomerPurchaseOrder;
  products: Product[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [poDate, setPoDate] = useState(po.po_date || '');
  const [deliveryDate, setDeliveryDate] = useState(po.delivery_date || '');
  const [currency, setCurrency] = useState(po.currency || 'USD');
  const [incoterm, setIncoterm] = useState(po.incoterm || '');
  const [buyerReference, setBuyerReference] = useState(po.buyer_reference || '');
  const [notes, setNotes] = useState(po.notes || '');
  const [items, setItems] = useState<EditItemRow[]>(
    (po.items || []).map((i: CustomerPurchaseOrderItem) => ({
      id: i.id,
      product_id: String(i.product_id),
      description: i.description || '',
      hsn_code: i.hsn_code || '',
      unit: i.unit || 'pcs',
      qty: String(i.qty),
      rate: String(i.rate),
      allocated_qty: i.allocated_qty || 0,
      product_name: i.product_name,
      sku: i.sku,
    }))
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function updateItem(idx: number, field: 'qty' | 'rate', value: string) {
    setItems((prev) => prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row)));
  }

  function addItem() {
    setItems((prev) => [...prev, { product_id: '', description: '', hsn_code: '', unit: 'pcs', qty: '', rate: '', allocated_qty: 0 }]);
  }

  function updateNewItemProduct(idx: number, productId: string) {
    const p = products.find((prod) => String(prod.id) === productId);
    setItems((prev) =>
      prev.map((row, i) =>
        i === idx
          ? { ...row, product_id: productId, rate: p ? String(p.unit_price) : row.rate, unit: p?.unit || row.unit, hsn_code: p?.hsn_code || '', description: p?.name || '' }
          : row
      )
    );
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError('');
    const validItems = items.filter((i) => i.product_id && i.qty);
    if (validItems.length === 0) {
      setError('At least one product line is required.');
      return;
    }
    setSaving(true);
    try {
      await api.put(`/customer-purchase-orders/${po.id}`, {
        po_date: poDate || undefined,
        delivery_date: deliveryDate || undefined,
        currency,
        incoterm,
        buyer_reference: buyerReference || undefined,
        notes,
        items: validItems.map((i) => ({
          id: i.id,
          product_id: Number(i.product_id),
          description: i.description || undefined,
          hsn_code: i.hsn_code || undefined,
          unit: i.unit || undefined,
          qty: Number(i.qty),
          rate: Number(i.rate) || 0,
        })),
      });
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Edit ${po.po_no}`} onClose={onClose} wide>
      <form onSubmit={handleSave} className="space-y-4">
        {error && <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">Buyer's PO Reference</label>
            <input
              value={buyerReference}
              onChange={(e) => setBuyerReference(e.target.value)}
              className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">Incoterm</label>
            <select
              value={incoterm}
              onChange={(e) => setIncoterm(e.target.value)}
              className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
            >
              <option value="">-- None --</option>
              {INCOTERMS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">PO Date</label>
            <input
              type="date"
              value={poDate}
              onChange={(e) => setPoDate(e.target.value)}
              className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">Delivery Date</label>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-stone-600">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-medium text-stone-600">Products</label>
            <button type="button" onClick={addItem} className="text-xs font-medium text-amber-600 hover:underline">
              + Add line
            </button>
          </div>
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={item.id ?? `new-${idx}`} className="flex items-center gap-2">
                {item.id ? (
                  <div className="flex-1 text-sm text-stone-700">
                    {item.product_name}
                    <div className="text-xs text-stone-400">
                      {item.sku} · {item.allocated_qty} already allocated to PIs
                    </div>
                  </div>
                ) : (
                  <select
                    value={item.product_id}
                    onChange={(e) => updateNewItemProduct(idx, e.target.value)}
                    className="flex-1 rounded border border-stone-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">-- Product --</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.sku})
                      </option>
                    ))}
                  </select>
                )}
                <input
                  type="number"
                  min={item.allocated_qty || 0}
                  placeholder="Qty"
                  value={item.qty}
                  onChange={(e) => updateItem(idx, 'qty', e.target.value)}
                  className="w-24 rounded border border-stone-300 px-2 py-1.5 text-sm"
                />
                <input
                  type="number"
                  placeholder="Rate"
                  value={item.rate}
                  onChange={(e) => updateItem(idx, 'rate', e.target.value)}
                  className="w-28 rounded border border-stone-300 px-2 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  disabled={item.allocated_qty > 0}
                  className="text-rose-600 hover:underline text-xs disabled:cursor-not-allowed disabled:text-stone-300"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t pt-3">
          <button type="button" onClick={onClose} className="rounded border border-stone-300 px-4 py-1.5 text-sm text-stone-600 hover:bg-stone-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PaymentTrackingModal({
  po,
  onClose,
  onSaved,
}: {
  po: CustomerPurchaseOrder;
  onClose: () => void;
  onSaved: () => void;
}) {
  const totalValue = po.total_value || 0;
  const [advanceAmount, setAdvanceAmount] = useState(String(po.advance_payment_amount || 0));
  const [advancePaid, setAdvancePaid] = useState(Boolean(po.advance_payment_paid));
  const [remainingPaid, setRemainingPaid] = useState(Boolean(po.remaining_payment_paid));
  const [advanceTransactionNumber, setAdvanceTransactionNumber] = useState(po.advance_payment_transaction_number || '');
  const [remainingTransactionNumber, setRemainingTransactionNumber] = useState(po.remaining_payment_transaction_number || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const parsedAdvance = Number(advanceAmount) || 0;
  const remainingAmount = Math.max(0, totalValue - parsedAdvance);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (advancePaid && !advanceTransactionNumber.trim()) {
      setError('Enter the advance payment transaction number before marking it paid.');
      return;
    }
    if (remainingPaid && !remainingTransactionNumber.trim()) {
      setError('Enter the remaining payment transaction number before marking it paid.');
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/customer-purchase-orders/${po.id}/payment-tracking`, {
        advance_payment_amount: parsedAdvance,
        advance_payment_paid: advancePaid,
        advance_payment_transaction_number: advanceTransactionNumber,
        remaining_payment_paid: remainingPaid,
        remaining_payment_transaction_number: remainingTransactionNumber,
      });
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Payment Tracking - ${po.po_no}`} onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-4">
        {error && <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <div>
          <label className="mb-1 block text-xs font-medium text-stone-600">Advance Payment Amount ({po.currency})</label>
          <input
            type="number"
            min="0"
            max={totalValue}
            step="0.01"
            value={advanceAmount}
            onChange={(e) => setAdvanceAmount(e.target.value)}
            className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="rounded border border-stone-200 bg-stone-50 px-3 py-2">
          <div className="text-xs uppercase text-stone-500">Remaining Payment</div>
          <div className="font-semibold text-stone-800">
            {po.currency} {remainingAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
        </div>
        <label className="flex items-center justify-between gap-4 rounded border border-stone-200 px-3 py-2">
          <span className="text-sm font-medium text-stone-700">Advance payment received</span>
          <input
            type="checkbox"
            checked={advancePaid}
            onChange={(e) => setAdvancePaid(e.target.checked)}
            className="h-4 w-4 accent-emerald-600"
          />
        </label>
        {advancePaid && (
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">Advance Transaction Number *</label>
            <input value={advanceTransactionNumber} onChange={(e) => setAdvanceTransactionNumber(e.target.value)} required className="w-full rounded border border-stone-300 px-3 py-2 text-sm" />
          </div>
        )}
        <label className="flex items-center justify-between gap-4 rounded border border-stone-200 px-3 py-2">
          <span className="text-sm font-medium text-stone-700">Remaining payment received</span>
          <input
            type="checkbox"
            checked={remainingPaid}
            onChange={(e) => setRemainingPaid(e.target.checked)}
            className="h-4 w-4 accent-emerald-600"
          />
        </label>
        {remainingPaid && (
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">Remaining Payment Transaction Number *</label>
            <input value={remainingTransactionNumber} onChange={(e) => setRemainingTransactionNumber(e.target.value)} required className="w-full rounded border border-stone-300 px-3 py-2 text-sm" />
          </div>
        )}
        <div className="flex justify-end gap-2 border-t pt-3">
          <button type="button" onClick={onClose} className="rounded border border-stone-300 px-4 py-1.5 text-sm text-stone-600 hover:bg-stone-50">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="rounded bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Payment Tracking'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CreateFreightInvoiceModal({
  po,
  onClose,
  onCreated,
}: {
  po: CustomerPurchaseOrder;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [piId, setPiId] = useState('');
  const [amount, setAmount] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [paid, setPaid] = useState(false);
  const [transactionNumber, setTransactionNumber] = useState('');
  const [notes, setNotes] = useState('Freight charges');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!piId || !amount || Number(amount) <= 0) {
      setError('Select a PI and enter a valid freight amount.');
      return;
    }
    if (paid && !transactionNumber.trim()) {
      setError('Enter the freight payment transaction number before marking it paid.');
      return;
    }
    setSaving(true);
    try {
      await api.post(`/customer-purchase-orders/${po.id}/freight-invoices`, {
        proforma_invoice_id: Number(piId),
        invoice_date: invoiceDate || undefined,
        due_date: dueDate || undefined,
        currency: po.currency || 'USD',
        total_amount: Number(amount),
        paid,
        transaction_number: transactionNumber,
        notes,
      });
      onCreated();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Generate Freight Invoice - ${po.po_no}`} onClose={onClose}>
      <form onSubmit={handleCreate} className="space-y-3">
        {error && <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <div>
          <label className="mb-1 block text-xs font-medium text-stone-600">Proforma Invoice *</label>
          <select value={piId} onChange={(e) => setPiId(e.target.value)} className="w-full rounded border border-stone-300 px-3 py-2 text-sm">
            <option value="">-- Select linked PI --</option>
            {(po.proforma_invoices || []).map((pi) => (
              <option key={pi.id} value={pi.id}>{pi.pi_no}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-stone-600">Freight Amount ({po.currency}) *</label>
          <input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded border border-stone-300 px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">Invoice Date</label>
            <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="w-full rounded border border-stone-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">Due Date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full rounded border border-stone-300 px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-stone-600">Description / Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded border border-stone-300 px-3 py-2 text-sm" />
        </div>
        <label className="flex items-center justify-between rounded border border-stone-200 px-3 py-2">
          <span className="text-sm font-medium text-stone-700">Freight payment already received</span>
          <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
        </label>
        {paid && (
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">Freight Payment Transaction Number *</label>
            <input value={transactionNumber} onChange={(e) => setTransactionNumber(e.target.value)} required className="w-full rounded border border-stone-300 px-3 py-2 text-sm" />
          </div>
        )}
        <div className="flex justify-end gap-2 border-t pt-3">
          <button type="button" onClick={onClose} className="rounded border border-stone-300 px-4 py-1.5 text-sm text-stone-600 hover:bg-stone-50">Cancel</button>
          <button type="submit" disabled={saving} className="rounded bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
            {saving ? 'Generating...' : 'Generate Freight Invoice'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function CustomerPurchaseOrderDetail() {
  const { id } = useParams();
  const [po, setPo] = useState<CustomerPurchaseOrder | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState('');
  const [createPiOpen, setCreatePiOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [paymentTrackingOpen, setPaymentTrackingOpen] = useState(false);
  const [freightInvoiceOpen, setFreightInvoiceOpen] = useState(false);

  async function load() {
    try {
      const res = await api.get(`/customer-purchase-orders/${id}`);
      setPo(res.data);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  useEffect(() => {
    load();
    api.get('/products').then((res) => setProducts(res.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function setFreightPaymentStatus(invoiceId: number, paid: boolean) {
    try {
      let transactionNumber = '';
      if (paid) {
        transactionNumber = window.prompt('Enter the freight payment transaction number:')?.trim() || '';
        if (!transactionNumber) return;
      }
      await api.patch(`/customer-purchase-orders/${id}/freight-invoices/${invoiceId}/payment-status`, {
        paid,
        transaction_number: transactionNumber,
      });
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  if (error) return <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>;
  if (!po) return <div className="text-stone-400">Loading...</div>;

  const totalValue = po.total_value || 0;
  const allocatedValue = po.allocated_value || 0;
  const remainingValue = totalValue - allocatedValue;
  const advancePaymentAmount = po.advance_payment_amount || 0;
  const pendingPaymentAmount = Math.max(0, totalValue - advancePaymentAmount);

  const pnlTotals = (po.proforma_invoices || []).reduce(
    (acc, pi) => {
      if (!pi.pnl) return acc;
      acc.revenue += pi.pnl.revenue;
      acc.net_profit += pi.pnl.net_profit;
      acc.invoiced_amount += pi.pnl.invoiced_amount;
      acc.paid_amount += pi.pnl.paid_amount;
      acc.receivable_amount += pi.pnl.receivable_amount;
      return acc;
    },
    { revenue: 0, net_profit: 0, invoiced_amount: 0, paid_amount: 0, receivable_amount: 0 }
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-stone-400">
            <Link to="/customer-purchase-orders" className="hover:underline">
              Customer Purchase Orders
            </Link>{' '}
            / Order 360
          </div>
          <h1 className="text-2xl font-bold text-stone-800">{po.po_no}</h1>
          <div className="text-sm text-stone-500">
            {po.customer_name} ({po.customer_company}) <StatusBadge status={po.status} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditOpen(true)}
            className="rounded border border-stone-400 px-4 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
          >
            ✎ Edit PO
          </button>
          <button
            onClick={() => setCreatePiOpen(true)}
            className="rounded bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
          >
            + Create Proforma Invoice
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase text-stone-400">PO Value</div>
          <div className="mt-1 text-xl font-bold text-stone-800">{po.currency} {totalValue.toLocaleString()}</div>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase text-stone-400">Allocated to PIs</div>
          <div className="mt-1 text-xl font-bold text-sky-600">{po.currency} {allocatedValue.toLocaleString()}</div>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase text-stone-400">Remaining PO</div>
          <div className="mt-1 text-xl font-bold text-amber-600">{po.currency} {remainingValue.toLocaleString()}</div>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase text-stone-400">Net Profit (sent/accepted PIs)</div>
          <div className={`mt-1 text-xl font-bold ${pnlTotals.net_profit < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {po.currency} {pnlTotals.net_profit.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      <div className="border-y border-stone-200 bg-white py-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-stone-700">Payment Tracking</h2>
          <button
            type="button"
            onClick={() => setPaymentTrackingOpen(true)}
            className="rounded border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
          >
            Edit Payment Status
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between border-l-4 border-amber-500 bg-amber-50 px-4 py-3">
            <div>
              <div className="text-xs uppercase text-stone-500">Advance Payment</div>
              <div className="font-semibold text-stone-800">
                {po.currency} {advancePaymentAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
              {po.advance_payment_paid && po.advance_payment_transaction_number && (
                <div className="text-xs text-stone-500">Txn: {po.advance_payment_transaction_number}</div>
              )}
            </div>
            <span className={`rounded px-2 py-1 text-xs font-semibold ${po.advance_payment_paid ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
              {po.advance_payment_paid ? 'Paid' : 'Not Paid'}
            </span>
          </div>
          <div className="flex items-center justify-between border-l-4 border-sky-500 bg-sky-50 px-4 py-3">
            <div>
              <div className="text-xs uppercase text-stone-500">Remaining Payment</div>
              <div className="font-semibold text-stone-800">
                {po.currency} {pendingPaymentAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
              {po.remaining_payment_paid && po.remaining_payment_transaction_number && (
                <div className="text-xs text-stone-500">Txn: {po.remaining_payment_transaction_number}</div>
              )}
            </div>
            <span className={`rounded px-2 py-1 text-xs font-semibold ${po.remaining_payment_paid ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
              {po.remaining_payment_paid ? 'Paid' : 'Not Paid'}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-stone-700">Freight Invoices to Buyer</h2>
            <p className="text-xs text-stone-400">Freight charges linked to a Proforma Invoice under this Customer PO.</p>
          </div>
          <button
            type="button"
            onClick={() => setFreightInvoiceOpen(true)}
            disabled={(po.proforma_invoices || []).length === 0}
            className="rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            + Generate Freight Invoice
          </button>
        </div>
        {(po.freight_invoices || []).length === 0 ? (
          <p className="text-sm text-stone-400">No freight invoices generated for this PO yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-stone-400">
                <tr>
                  <th className="py-1">Invoice No.</th>
                  <th className="py-1">PI</th>
                  <th className="py-1">Invoice / Due Date</th>
                  <th className="py-1 text-right">Freight Amount</th>
                  <th className="py-1 text-center">Payment</th>
                  <th className="py-1 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {(po.freight_invoices || []).map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="py-2 font-medium text-stone-700">{invoice.invoice_no}</td>
                    <td className="py-2 text-stone-600">{invoice.pi_no}</td>
                    <td className="py-2 text-stone-600">
                      {invoice.invoice_date || '-'}
                      <div className="text-xs text-stone-400">Due {invoice.due_date || '-'}</div>
                    </td>
                    <td className="py-2 text-right font-medium">{invoice.currency} {invoice.total_amount.toLocaleString()}</td>
                    <td className="py-2 text-center">
                      <span className={`rounded px-2 py-1 text-xs font-semibold ${invoice.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        {invoice.status === 'paid' ? 'Paid' : 'Unpaid'}
                      </span>
                      {invoice.status === 'paid' && invoice.payment_transaction_number && (
                        <div className="mt-1 text-xs text-stone-500">Txn: {invoice.payment_transaction_number}</div>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link to={`/invoices/${invoice.id}/freight`} className="text-xs font-medium text-amber-700 hover:underline">
                          View / Download
                        </Link>
                        <button type="button" onClick={() => setFreightPaymentStatus(invoice.id, invoice.status !== 'paid')} className="text-xs font-medium text-sky-600 hover:underline">
                          Mark {invoice.status === 'paid' ? 'Unpaid' : 'Paid'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-stone-700">PO Items &amp; Allocation</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-stone-400">
            <tr>
              <th className="py-1">Product</th>
              <th className="py-1 text-right">Ordered Qty</th>
              <th className="py-1 text-right">Allocated to PIs</th>
              <th className="py-1 text-right">Remaining</th>
              <th className="py-1 text-right">Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {(po.items || []).map((item) => (
              <tr key={item.id}>
                <td className="py-2 font-medium text-stone-700">
                  {item.product_name}
                  <div className="text-xs text-stone-400">{item.sku}</div>
                </td>
                <td className="py-2 text-right">{item.qty}</td>
                <td className="py-2 text-right">{item.allocated_qty}</td>
                <td className={`py-2 text-right font-medium ${(item.remaining_qty || 0) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {item.remaining_qty}
                </td>
                <td className="py-2 text-right">{po.currency} {item.rate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-stone-700">Proforma Invoices under this PO</h2>
        {(po.proforma_invoices || []).length === 0 ? (
          <p className="text-sm text-stone-400">No Proforma Invoices created from this PO yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-stone-400">
              <tr>
                <th className="py-1">PI No.</th>
                <th className="py-1">Status</th>
                <th className="py-1 text-right">Revenue</th>
                <th className="py-1 text-right">Net Profit</th>
                <th className="py-1 text-right">Invoiced</th>
                <th className="py-1 text-right">Paid / Due</th>
                <th className="py-1"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {(po.proforma_invoices || []).map((pi) => (
                <tr key={pi.id}>
                  <td className="py-2 font-medium text-stone-700">{pi.pi_no}</td>
                  <td className="py-2">
                    <StatusBadge status={pi.status} />
                  </td>
                  <td className="py-2 text-right">{pi.pnl ? `${pi.currency} ${pi.pnl.revenue.toLocaleString()}` : '-'}</td>
                  <td className={`py-2 text-right font-medium ${pi.pnl && pi.pnl.net_profit < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {pi.pnl ? `${pi.currency} ${pi.pnl.net_profit.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '-'}
                  </td>
                  <td className="py-2 text-right">{pi.pnl ? `${pi.currency} ${pi.pnl.invoiced_amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '-'}</td>
                  <td className="py-2 text-right">
                    {pi.pnl ? (
                      <>
                        {pi.currency} {pi.pnl.paid_amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        <div className="text-xs text-stone-400">Due {pi.currency} {pi.pnl.receivable_amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                      </>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <Link to={`/proforma-invoices/${pi.id}`} className="text-xs font-medium text-sky-600 hover:underline">
                        Open PI
                      </Link>
                      <Link to={`/proforma-invoices/${pi.id}/packing-list`} className="text-xs font-medium text-amber-700 hover:underline">
                        Packing List
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {createPiOpen && (
        <CreatePiModal
          po={po}
          onClose={() => setCreatePiOpen(false)}
          onCreated={() => {
            setCreatePiOpen(false);
            load();
          }}
        />
      )}
      {paymentTrackingOpen && (
        <PaymentTrackingModal
          po={po}
          onClose={() => setPaymentTrackingOpen(false)}
          onSaved={() => {
            setPaymentTrackingOpen(false);
            load();
          }}
        />
      )}
      {freightInvoiceOpen && (
        <CreateFreightInvoiceModal
          po={po}
          onClose={() => setFreightInvoiceOpen(false)}
          onCreated={() => {
            setFreightInvoiceOpen(false);
            load();
          }}
        />
      )}

      {editOpen && (
        <EditPoModal
          po={po}
          products={products}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}
