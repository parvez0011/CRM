import { useEffect, useState, type FormEvent } from 'react';
import { api, apiErrorMessage } from '../api/client';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';
import type { SalesOrder, Shipment, ShipmentStatus } from '../types';

const STATUSES: ShipmentStatus[] = ['pending', 'booked', 'shipped', 'in_transit', 'delivered'];

export function Shipments() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Shipment | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});

  async function load() {
    setLoading(true);
    const res = await api.get('/shipments');
    setShipments(res.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    api.get('/sales-orders').then((res) => setSalesOrders(res.data));
  }, []);

  function openCreate() {
    setEditing(null);
    setForm({
      sales_order_id: '',
      shipping_line: '',
      container_no: '',
      bl_number: '',
      port_of_loading: '',
      port_of_discharge: '',
      etd: '',
      eta: '',
      gross_weight: '',
      net_weight: '',
      cbm: '',
      notes: '',
    });
    setError('');
    setModalOpen(true);
  }

  function openEdit(row: Shipment) {
    setEditing(row);
    setForm({ ...row });
    setError('');
    setModalOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/shipments/${editing.id}`, form);
      } else {
        if (!form.sales_order_id) {
          setError('Please select a linked export order.');
          setSaving(false);
          return;
        }
        await api.post('/shipments', form);
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(row: Shipment, status: ShipmentStatus) {
    try {
      await api.patch(`/shipments/${row.id}/status`, { status });
      load();
    } catch (err) {
      alert(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-800">Shipments</h1>
        <button onClick={openCreate} className="rounded bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700">
          + New Shipment
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Shipment No.</th>
              <th className="px-4 py-3">Export Order</th>
              <th className="px-4 py-3">Buyer</th>
              <th className="px-4 py-3">Container</th>
              <th className="px-4 py-3">ETD / ETA</th>
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
            ) : shipments.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-stone-400">
                  No shipments yet.
                </td>
              </tr>
            ) : (
              shipments.map((s) => {
                const idx = STATUSES.indexOf(s.status);
                const nextStatus = STATUSES[idx + 1];
                return (
                  <tr key={s.id} className="hover:bg-stone-50">
                    <td className="px-4 py-3 font-medium text-stone-700">{s.shipment_no}</td>
                    <td className="px-4 py-3">{s.sales_order_no}</td>
                    <td className="px-4 py-3">{s.customer_name}</td>
                    <td className="px-4 py-3">{s.container_no || '-'}</td>
                    <td className="px-4 py-3">
                      {s.etd || '-'} / {s.eta || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                      <button onClick={() => openEdit(s)} className="text-sky-600 hover:underline text-xs font-medium">
                        Edit
                      </button>
                      {nextStatus && (
                        <button
                          onClick={() => changeStatus(s, nextStatus)}
                          className="text-emerald-600 hover:underline text-xs font-medium capitalize"
                        >
                          Mark {nextStatus.replaceAll('_', ' ')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <Modal title={editing ? `Edit Shipment ${editing.shipment_no}` : 'New Shipment'} onClose={() => setModalOpen(false)} wide>
          <form onSubmit={handleSubmit} className="space-y-3">
            {error && <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
            {!editing && (
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">Export Order *</label>
                <select
                  required
                  value={form.sales_order_id}
                  onChange={(e) => setForm({ ...form, sales_order_id: e.target.value })}
                  className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
                >
                  <option value="">-- Select export order --</option>
                  {salesOrders.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.order_no} - {s.customer_name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">Shipping Line</label>
                <input
                  value={form.shipping_line || ''}
                  onChange={(e) => setForm({ ...form, shipping_line: e.target.value })}
                  className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">Container No.</label>
                <input
                  value={form.container_no || ''}
                  onChange={(e) => setForm({ ...form, container_no: e.target.value })}
                  className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">Bill of Lading No.</label>
                <input
                  value={form.bl_number || ''}
                  onChange={(e) => setForm({ ...form, bl_number: e.target.value })}
                  className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">Port of Loading</label>
                <input
                  value={form.port_of_loading || ''}
                  onChange={(e) => setForm({ ...form, port_of_loading: e.target.value })}
                  className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">Port of Discharge</label>
                <input
                  value={form.port_of_discharge || ''}
                  onChange={(e) => setForm({ ...form, port_of_discharge: e.target.value })}
                  className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">ETD</label>
                <input
                  type="date"
                  value={form.etd || ''}
                  onChange={(e) => setForm({ ...form, etd: e.target.value })}
                  className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">ETA</label>
                <input
                  type="date"
                  value={form.eta || ''}
                  onChange={(e) => setForm({ ...form, eta: e.target.value })}
                  className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">Gross Weight (kg)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.gross_weight || ''}
                  onChange={(e) => setForm({ ...form, gross_weight: e.target.value })}
                  className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">Net Weight (kg)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.net_weight || ''}
                  onChange={(e) => setForm({ ...form, net_weight: e.target.value })}
                  className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">CBM</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.cbm || ''}
                  onChange={(e) => setForm({ ...form, cbm: e.target.value })}
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
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
