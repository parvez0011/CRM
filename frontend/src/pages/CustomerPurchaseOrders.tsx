import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, apiErrorMessage } from '../api/client';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';
import { ImportClientPoModal, type MatchedPoItem } from '../components/ImportClientPoModal';
import { CURRENCIES, INCOTERMS } from '../constants/exportTerms';
import type { Customer, CustomerPoStatus, CustomerPurchaseOrder, Product } from '../types';

interface ItemRow {
  product_id: string;
  description: string;
  hsn_code: string;
  unit: string;
  qty: string;
  rate: string;
}

function emptyItem(): ItemRow {
  return { product_id: '', description: '', hsn_code: '', unit: 'pcs', qty: '', rate: '' };
}

const STATUSES: CustomerPoStatus[] = ['draft', 'received', 'under_review', 'approved', 'in_progress', 'completed', 'cancelled'];

export function CustomerPurchaseOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<CustomerPurchaseOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [customerId, setCustomerId] = useState('');
  const [poDate, setPoDate] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [incoterm, setIncoterm] = useState('FOB');
  const [buyerReference, setBuyerReference] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ItemRow[]>([emptyItem()]);

  async function load() {
    setLoading(true);
    const res = await api.get('/customer-purchase-orders');
    setOrders(res.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    api.get('/customers').then((res) => setCustomers(res.data));
    api.get('/products').then((res) => setProducts(res.data));
  }, []);

  function resetForm() {
    setCustomerId('');
    setPoDate('');
    setDeliveryDate('');
    setCurrency('USD');
    setIncoterm('FOB');
    setBuyerReference('');
    setNotes('');
    setItems([emptyItem()]);
    setError('');
  }

  function updateItem(idx: number, field: keyof ItemRow, value: string) {
    const next = [...items];
    next[idx] = { ...next[idx], [field]: value };
    if (field === 'product_id') {
      const p = products.find((prod) => prod.id === Number(value));
      if (p) {
        next[idx].rate = String(p.unit_price);
        next[idx].unit = p.unit;
        next[idx].hsn_code = p.hsn_code || '';
        if (!next[idx].description) next[idx].description = p.name;
      }
    }
    setItems(next);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const validItems = items.filter((i) => i.product_id && i.qty);
    if (!customerId || validItems.length === 0) {
      setError('Please select a buyer and add at least one product line.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/customer-purchase-orders', {
        customer_id: customerId,
        po_date: poDate || undefined,
        delivery_date: deliveryDate || undefined,
        currency,
        incoterm,
        buyer_reference: buyerReference || undefined,
        notes,
        items: validItems.map((i) => ({
          product_id: Number(i.product_id),
          description: i.description || undefined,
          hsn_code: i.hsn_code || undefined,
          unit: i.unit || undefined,
          qty: Number(i.qty),
          rate: Number(i.rate) || 0,
        })),
      });
      setModalOpen(false);
      resetForm();
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(order: CustomerPurchaseOrder, status: CustomerPoStatus) {
    try {
      await api.patch(`/customer-purchase-orders/${order.id}/status`, { status });
      load();
    } catch (err) {
      alert(apiErrorMessage(err));
    }
  }

  async function handleDelete(order: CustomerPurchaseOrder) {
    if (!window.confirm(`Delete ${order.po_no}? This cannot be undone.`)) return;
    try {
      await api.delete(`/customer-purchase-orders/${order.id}`);
      load();
    } catch (err) {
      alert(apiErrorMessage(err));
    }
  }

  const totalPreview = items.reduce((sum, i) => sum + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0);

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-800">Customer Purchase Orders</h1>
          <p className="text-sm text-stone-500">The buyer's commitment - one PO can be fulfilled across several Proforma Invoices.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setImportOpen(true)}
            className="rounded border border-stone-400 px-4 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
          >
            📥 Import Client PO
          </button>
          <button
            onClick={() => {
              resetForm();
              setModalOpen(true);
            }}
            className="rounded bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
          >
            + New Customer PO
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">PO No.</th>
              <th className="px-4 py-3">Buyer</th>
              <th className="px-4 py-3">PO Date</th>
              <th className="px-4 py-3 text-right">PO Value</th>
              <th className="px-4 py-3 text-right">Allocated to PIs</th>
              <th className="px-4 py-3 text-right">Remaining</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-stone-400">
                  Loading...
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-stone-400">
                  No customer purchase orders yet.
                </td>
              </tr>
            ) : (
              orders.map((o) => {
                const remaining = (o.total_value || 0) - (o.allocated_value || 0);
                return (
                  <tr key={o.id} className="hover:bg-stone-50">
                    <td className="px-4 py-3 font-medium text-stone-700">
                      <Link to={`/customer-purchase-orders/${o.id}`} className="text-sky-600 hover:underline">
                        {o.po_no}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {o.customer_name}
                      <div className="text-xs text-stone-400">{o.customer_company}</div>
                    </td>
                    <td className="px-4 py-3">{o.po_date}</td>
                    <td className="px-4 py-3 text-right">{o.currency} {(o.total_value || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">{o.currency} {(o.allocated_value || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-medium">{o.currency} {remaining.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                      <Link to={`/customer-purchase-orders/${o.id}`} className="text-sky-600 hover:underline text-xs font-medium">
                        Order 360
                      </Link>
                      {o.status === 'draft' && (
                        <button onClick={() => changeStatus(o, 'approved')} className="text-emerald-600 hover:underline text-xs font-medium">
                          Approve
                        </button>
                      )}
                      {STATUSES.includes(o.status) && !['completed', 'cancelled'].includes(o.status) && (
                        <button onClick={() => changeStatus(o, 'cancelled')} className="text-rose-600 hover:underline text-xs font-medium">
                          Cancel
                        </button>
                      )}
                      <button onClick={() => handleDelete(o)} className="text-rose-600 hover:underline text-xs font-medium">
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <Modal title="New Customer Purchase Order" onClose={() => setModalOpen(false)} wide>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">Buyer *</label>
                <select
                  required
                  value={customerId}
                  onChange={(e) => {
                    setCustomerId(e.target.value);
                    const c = customers.find((cust) => String(cust.id) === e.target.value);
                    if (c?.currency) setCurrency(c.currency);
                  }}
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
                <button
                  type="button"
                  onClick={() => setItems([...items, emptyItem()])}
                  className="text-xs font-medium text-amber-600 hover:underline"
                >
                  + Add line
                </button>
              </div>
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={item.product_id}
                      onChange={(e) => updateItem(idx, 'product_id', e.target.value)}
                      className="flex-1 rounded border border-stone-300 px-2 py-1.5 text-sm"
                    >
                      <option value="">-- Product --</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.sku})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
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
                      onClick={() => setItems(items.filter((_, i) => i !== idx))}
                      className="text-rose-600 hover:underline text-xs"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-right text-sm font-medium text-stone-700">
                Total: {currency} {totalPreview.toLocaleString()}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t pt-3">
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
                {saving ? 'Saving...' : 'Create Customer PO'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {importOpen && (
        <ImportClientPoModal
          title="Import Client Purchase Order"
          description="Upload the purchase order sent by your buyer (.xlsx, .xls or .pdf). Lines are matched to your product catalog by SKU or product name, then can be converted directly into a Customer PO with the same products, quantities and prices. PDF text layouts vary, so review the matched lines below before creating the PO - for best accuracy, ask buyers for an Excel PO."
          submitLabel="Create Customer PO"
          parseEndpoint="/customer-purchase-orders/parse-po"
          customers={customers}
          products={products}
          onClose={() => setImportOpen(false)}
          onSubmit={async ({ customerId, items }: { customerId: string; items: MatchedPoItem[] }) => {
            const buyer = customers.find((c) => String(c.id) === customerId);
            const res = await api.post('/customer-purchase-orders', {
              customer_id: customerId,
              po_date: new Date().toISOString().slice(0, 10),
              currency: buyer?.currency || 'USD',
              notes: 'Generated from buyer-supplied purchase order.',
              items: items.map((m) => ({
                product_id: m.product_id,
                description: m.description,
                hsn_code: m.hsn_code,
                unit: m.unit,
                qty: m.qty,
                rate: m.rate,
              })),
            });
            return res.data;
          }}
          onCreated={(id) => {
            setImportOpen(false);
            navigate(`/customer-purchase-orders/${id}`);
          }}
        />
      )}
    </div>
  );
}
