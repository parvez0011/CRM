import { useEffect, useState, type FormEvent } from 'react';
import { api, apiErrorMessage } from '../api/client';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';
import type { Material, PurchaseOrder, PurchaseOrderStatus } from '../types';

interface ItemRow {
  material_id: string;
  qty: string;
  rate: string;
}

const STATUSES: PurchaseOrderStatus[] = ['draft', 'ordered', 'received', 'cancelled'];

export function PurchaseOrders() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: number; name: string; company?: string }[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [viewOrder, setViewOrder] = useState<PurchaseOrder | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [supplierId, setSupplierId] = useState('');
  const [orderDate, setOrderDate] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ItemRow[]>([{ material_id: '', qty: '', rate: '' }]);

  async function load() {
    setLoading(true);
    const res = await api.get('/purchase-orders');
    setOrders(res.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    api.get('/suppliers').then((res) => setSuppliers(res.data));
    api.get('/materials').then((res) => setMaterials(res.data));
  }, []);

  function resetForm() {
    setSupplierId('');
    setOrderDate('');
    setExpectedDate('');
    setCurrency('INR');
    setNotes('');
    setItems([{ material_id: '', qty: '', rate: '' }]);
    setError('');
  }

  function updateItem(idx: number, field: keyof ItemRow, value: string) {
    const next = [...items];
    next[idx] = { ...next[idx], [field]: value };
    if (field === 'material_id') {
      const m = materials.find((mat) => mat.id === Number(value));
      if (m) next[idx].rate = String(m.unit_cost);
    }
    setItems(next);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const validItems = items.filter((i) => i.material_id && i.qty);
    if (!supplierId || validItems.length === 0) {
      setError('Please select a supplier and add at least one material line.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/purchase-orders', {
        supplier_id: supplierId,
        order_date: orderDate || undefined,
        expected_date: expectedDate || undefined,
        currency,
        notes,
        items: validItems.map((i) => ({ material_id: Number(i.material_id), qty: Number(i.qty), rate: Number(i.rate) })),
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

  async function changeStatus(order: PurchaseOrder, status: PurchaseOrderStatus) {
    try {
      await api.patch(`/purchase-orders/${order.id}/status`, { status });
      load();
    } catch (err) {
      alert(apiErrorMessage(err));
    }
  }

  async function handleDelete(order: PurchaseOrder) {
    if (!window.confirm(`Delete ${order.po_no}? This cannot be undone.`)) return;
    try {
      await api.delete(`/purchase-orders/${order.id}`);
      load();
    } catch (err) {
      alert(apiErrorMessage(err));
    }
  }

  const totalPreview = items.reduce((sum, i) => sum + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0);

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-800">Purchase Orders</h1>
        <button
          onClick={() => {
            resetForm();
            setModalOpen(true);
          }}
          className="rounded bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
        >
          + New Purchase Order
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">PO No.</th>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Order Date</th>
              <th className="px-4 py-3">Expected</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-stone-400">
                  Loading...
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-stone-400">
                  No purchase orders yet.
                </td>
              </tr>
            ) : (
              orders.map((o) => (
                <tr key={o.id} className="hover:bg-stone-50">
                  <td className="px-4 py-3 font-medium text-stone-700">{o.po_no}</td>
                  <td className="px-4 py-3">
                    {o.supplier_name}
                    <div className="text-xs text-stone-400">{o.supplier_company}</div>
                  </td>
                  <td className="px-4 py-3">{o.order_date}</td>
                  <td className="px-4 py-3">{o.expected_date}</td>
                  <td className="px-4 py-3">
                    {o.currency} {o.total_amount?.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    <button
                      onClick={async () => {
                        const res = await api.get(`/purchase-orders/${o.id}`);
                        setViewOrder(res.data);
                      }}
                      className="text-sky-600 hover:underline text-xs font-medium"
                    >
                      View
                    </button>
                    {o.status === 'draft' && (
                      <button onClick={() => changeStatus(o, 'ordered')} className="text-amber-600 hover:underline text-xs font-medium">
                        Mark Ordered
                      </button>
                    )}
                    {o.status === 'ordered' && (
                      <button onClick={() => changeStatus(o, 'received')} className="text-emerald-600 hover:underline text-xs font-medium">
                        Mark Received
                      </button>
                    )}
                    {STATUSES.includes(o.status) && o.status !== 'received' && o.status !== 'cancelled' && (
                      <button onClick={() => changeStatus(o, 'cancelled')} className="text-rose-600 hover:underline text-xs font-medium">
                        Cancel
                      </button>
                    )}
                    <button onClick={() => handleDelete(o)} className="text-rose-600 hover:underline text-xs font-medium">
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {viewOrder && (
        <Modal title={`Purchase Order ${viewOrder.po_no}`} onClose={() => setViewOrder(null)}>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-stone-400">
              <tr>
                <th className="py-1">Material</th>
                <th className="py-1">Qty</th>
                <th className="py-1">Rate</th>
                <th className="py-1">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {viewOrder.items?.map((i) => (
                <tr key={i.id}>
                  <td className="py-2">{i.material_name}</td>
                  <td className="py-2">
                    {i.qty} {i.unit}
                  </td>
                  <td className="py-2">
                    {viewOrder.currency} {i.rate}
                  </td>
                  <td className="py-2">
                    {viewOrder.currency} {(i.qty * i.rate).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}

      {modalOpen && (
        <Modal title="New Purchase Order" onClose={() => setModalOpen(false)} wide>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">Supplier *</label>
                <select
                  required
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
                >
                  <option value="">-- Select supplier --</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.company})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
                >
                  {['INR', 'USD', 'EUR'].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">Order Date</label>
                <input
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                  className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">Expected Date</label>
                <input
                  type="date"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
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
                <label className="text-xs font-medium text-stone-600">Materials</label>
                <button
                  type="button"
                  onClick={() => setItems([...items, { material_id: '', qty: '', rate: '' }])}
                  className="text-xs font-medium text-amber-600 hover:underline"
                >
                  + Add line
                </button>
              </div>
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={item.material_id}
                      onChange={(e) => updateItem(idx, 'material_id', e.target.value)}
                      className="flex-1 rounded border border-stone-300 px-2 py-1.5 text-sm"
                    >
                      <option value="">-- Material --</option>
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.unit})
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
                      step="0.01"
                      placeholder="Rate"
                      value={item.rate}
                      onChange={(e) => updateItem(idx, 'rate', e.target.value)}
                      className="w-28 rounded border border-stone-300 px-2 py-1.5 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setItems(items.filter((_, i) => i !== idx))}
                      className="text-rose-500 hover:text-rose-700 text-lg leading-none px-1"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-right text-sm font-semibold text-stone-700">
                Estimated Total: {currency} {totalPreview.toLocaleString()}
              </div>
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
                {saving ? 'Saving...' : 'Create Order'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
