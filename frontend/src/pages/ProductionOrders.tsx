import { useEffect, useState, type FormEvent } from 'react';
import { api, apiErrorMessage } from '../api/client';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';
import type { Product, ProductionOrder, ProductionStage, SalesOrder } from '../types';

const STAGES: ProductionStage[] = ['cutting', 'assembly', 'finishing', 'quality_check', 'packing', 'completed'];

export function ProductionOrders() {
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [viewOrder, setViewOrder] = useState<any | null>(null);
  const [qcOrder, setQcOrder] = useState<ProductionOrder | null>(null);
  const [qcStatus, setQcStatus] = useState('pending');
  const [qcNotes, setQcNotes] = useState('');
  const [packagingNotes, setPackagingNotes] = useState('');
  const [cartonsCount, setCartonsCount] = useState('');
  const [qcSaving, setQcSaving] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [productId, setProductId] = useState('');
  const [salesOrderId, setSalesOrderId] = useState('');
  const [qty, setQty] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');

  async function load() {
    setLoading(true);
    const res = await api.get('/production-orders');
    setOrders(res.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    api.get('/products').then((res) => setProducts(res.data));
    api.get('/sales-orders').then((res) => setSalesOrders(res.data));
  }, []);

  function resetForm() {
    setProductId('');
    setSalesOrderId('');
    setQty('');
    setStartDate('');
    setDueDate('');
    setNotes('');
    setError('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!productId || !qty) {
      setError('Please select a product and enter a quantity.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/production-orders', {
        product_id: productId,
        sales_order_id: salesOrderId || undefined,
        qty,
        start_date: startDate || undefined,
        due_date: dueDate || undefined,
        notes,
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

  async function advanceStage(order: ProductionOrder) {
    const idx = STAGES.indexOf(order.stage);
    const nextStage = STAGES[idx + 1];
    if (!nextStage) return;
    if (nextStage === 'completed' && !window.confirm('Completing this order will deduct raw materials and add finished goods stock. Continue?')) {
      return;
    }
    try {
      await api.patch(`/production-orders/${order.id}/stage`, { stage: nextStage });
      load();
    } catch (err) {
      alert(apiErrorMessage(err));
    }
  }

  async function cancelOrder(order: ProductionOrder) {
    if (!window.confirm('Cancel this production order?')) return;
    try {
      await api.patch(`/production-orders/${order.id}/status`, { status: 'cancelled' });
      load();
    } catch (err) {
      alert(apiErrorMessage(err));
    }
  }

  async function viewMaterials(order: ProductionOrder) {
    const res = await api.get(`/production-orders/${order.id}`);
    setViewOrder(res.data);
  }

  function openQc(order: ProductionOrder) {
    setQcOrder(order);
    setQcStatus(order.qc_status || 'pending');
    setQcNotes(order.qc_notes || '');
    setPackagingNotes(order.packaging_notes || '');
    setCartonsCount(order.cartons_count ? String(order.cartons_count) : '');
  }

  async function saveQc() {
    if (!qcOrder) return;
    setQcSaving(true);
    try {
      await api.patch(`/production-orders/${qcOrder.id}/qc`, {
        qc_status: qcStatus,
        qc_notes: qcNotes,
        packaging_notes: packagingNotes,
        cartons_count: cartonsCount ? Number(cartonsCount) : null,
      });
      setQcOrder(null);
      load();
    } catch (err) {
      alert(apiErrorMessage(err));
    } finally {
      setQcSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-800">Production Orders</h1>
        <button
          onClick={() => {
            resetForm();
            setModalOpen(true);
          }}
          className="rounded bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
        >
          + New Production Order
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Order No.</th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Linked Export Order</th>
              <th className="px-4 py-3">Qty</th>
              <th className="px-4 py-3">Stage</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">QC</th>
              <th className="px-4 py-3">Due Date</th>
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
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-stone-400">
                  No production orders yet.
                </td>
              </tr>
            ) : (
              orders.map((o) => (
                <tr key={o.id} className="hover:bg-stone-50">
                  <td className="px-4 py-3 font-medium text-stone-700">{o.order_no}</td>
                  <td className="px-4 py-3">
                    {o.product_name}
                    <div className="text-xs text-stone-400">{o.sku}</div>
                  </td>
                  <td className="px-4 py-3">{o.sales_order_no || '-'}</td>
                  <td className="px-4 py-3">{o.qty}</td>
                  <td className="px-4 py-3 capitalize">{o.stage.replaceAll('_', ' ')}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={o.qc_status || 'pending'} />
                  </td>
                  <td className="px-4 py-3">{o.due_date}</td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    <button onClick={() => viewMaterials(o)} className="text-sky-600 hover:underline text-xs font-medium">
                      Materials
                    </button>
                    <button onClick={() => openQc(o)} className="text-indigo-600 hover:underline text-xs font-medium">
                      QC / Packaging
                    </button>
                    {o.status !== 'completed' && o.status !== 'cancelled' && (
                      <>
                        <button onClick={() => advanceStage(o)} className="text-emerald-600 hover:underline text-xs font-medium">
                          Advance Stage
                        </button>
                        <button onClick={() => cancelOrder(o)} className="text-rose-600 hover:underline text-xs font-medium">
                          Cancel
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {viewOrder && (
        <Modal title={`Materials Needed - ${viewOrder.order_no}`} onClose={() => setViewOrder(null)}>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-stone-400">
              <tr>
                <th className="py-1">Material</th>
                <th className="py-1">Required (total)</th>
                <th className="py-1">Current Stock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {viewOrder.materialsNeeded?.length ? (
                viewOrder.materialsNeeded.map((m: any) => (
                  <tr key={m.material_id}>
                    <td className="py-2">{m.name}</td>
                    <td className="py-2">
                      {m.total_required} {m.unit}
                    </td>
                    <td className={`py-2 ${m.stock_qty < m.total_required ? 'text-rose-600 font-semibold' : ''}`}>
                      {m.stock_qty} {m.unit}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="py-3 text-center text-stone-400">
                    No bill of materials configured for this product.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Modal>
      )}

      {qcOrder && (
        <Modal title={`QC & Packaging - ${qcOrder.order_no}`} onClose={() => setQcOrder(null)}>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">Quality Check Status</label>
              <select
                value={qcStatus}
                onChange={(e) => setQcStatus(e.target.value)}
                className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
              >
                <option value="pending">Pending</option>
                <option value="passed">Passed</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">QC Notes</label>
              <textarea
                value={qcNotes}
                onChange={(e) => setQcNotes(e.target.value)}
                rows={2}
                className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">Packaging Notes</label>
              <textarea
                value={packagingNotes}
                onChange={(e) => setPackagingNotes(e.target.value)}
                rows={2}
                className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">Cartons Count</label>
              <input
                type="number"
                value={cartonsCount}
                onChange={(e) => setCartonsCount(e.target.value)}
                className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setQcOrder(null)}
                className="rounded border border-stone-300 px-4 py-1.5 text-sm text-stone-600 hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveQc}
                disabled={qcSaving}
                className="rounded bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {qcSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {modalOpen && (
        <Modal title="New Production Order" onClose={() => setModalOpen(false)}>
          <form onSubmit={handleSubmit} className="space-y-3">
            {error && <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">Product *</label>
              <select
                required
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
              >
                <option value="">-- Select product --</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">Linked Export Order (optional)</label>
              <select
                value={salesOrderId}
                onChange={(e) => setSalesOrderId(e.target.value)}
                className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
              >
                <option value="">-- None --</option>
                {salesOrders.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.order_no} - {s.customer_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">Quantity *</label>
              <input
                type="number"
                required
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
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
                {saving ? 'Saving...' : 'Create'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
