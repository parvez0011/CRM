import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, apiErrorMessage } from '../api/client';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';
import type { Container, ContainerStatus } from '../types';

const CONTAINER_TYPES = ['20ft', '40ft', '40HC', 'LCL'];

export function Containers() {
  const [containers, setContainers] = useState<Container[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [containerType, setContainerType] = useState('40HC');
  const [shippingLine, setShippingLine] = useState('');
  const [portLoading, setPortLoading] = useState('');
  const [portDischarge, setPortDischarge] = useState('');
  const [etd, setEtd] = useState('');
  const [eta, setEta] = useState('');

  async function load() {
    setLoading(true);
    const res = await api.get('/containers');
    setContainers(res.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function resetForm() {
    setContainerType('40HC');
    setShippingLine('');
    setPortLoading('');
    setPortDischarge('');
    setEtd('');
    setEta('');
    setError('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/containers', {
        container_type: containerType,
        shipping_line: shippingLine,
        port_of_loading: portLoading,
        port_of_discharge: portDischarge,
        etd: etd || undefined,
        eta: eta || undefined,
      });
      setModalOpen(false);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(container: Container, status: ContainerStatus) {
    try {
      await api.patch(`/containers/${container.id}/status`, { status });
      load();
    } catch (err) {
      alert(apiErrorMessage(err));
    }
  }

  const STATUS_FLOW: ContainerStatus[] = ['planning', 'booked', 'loading', 'shipped', 'in_transit', 'delivered'];

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-800">Container &amp; Export Shipping</h1>
          <p className="text-sm text-stone-500">Plan containers, consolidate Proforma Invoices, and track shipping expenses</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setModalOpen(true);
          }}
          className="rounded bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
        >
          + New Container
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Container No.</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Route</th>
              <th className="px-4 py-3">ETD / ETA</th>
              <th className="px-4 py-3">Linked Orders</th>
              <th className="px-4 py-3">Value</th>
              <th className="px-4 py-3">Expenses</th>
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
            ) : containers.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-stone-400">
                  No containers planned yet.
                </td>
              </tr>
            ) : (
              containers.map((c) => {
                const idx = STATUS_FLOW.indexOf(c.status);
                const nextStatus = STATUS_FLOW[idx + 1];
                return (
                  <tr key={c.id} className="hover:bg-stone-50">
                    <td className="px-4 py-3 font-medium text-stone-700">{c.container_no}</td>
                    <td className="px-4 py-3">{c.container_type}</td>
                    <td className="px-4 py-3">
                      {c.port_of_loading} &rarr; {c.port_of_discharge}
                    </td>
                    <td className="px-4 py-3">
                      {c.etd || '-'} / {c.eta || '-'}
                    </td>
                    <td className="px-4 py-3">{c.orderCount}</td>
                    <td className="px-4 py-3">
                      {c.currency} {c.totalValue?.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">{c.totalExpenses?.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                      <Link to={`/containers/${c.id}`} className="text-sky-600 hover:underline text-xs font-medium">
                        View
                      </Link>
                      {nextStatus && (
                        <button
                          onClick={() => changeStatus(c, nextStatus)}
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
        <Modal title="New Container" onClose={() => setModalOpen(false)}>
          <form onSubmit={handleSubmit} className="space-y-3">
            {error && <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">Container Type</label>
              <select
                value={containerType}
                onChange={(e) => setContainerType(e.target.value)}
                className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
              >
                {CONTAINER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">Shipping Line</label>
              <input
                value={shippingLine}
                onChange={(e) => setShippingLine(e.target.value)}
                className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">Port of Loading</label>
                <input
                  value={portLoading}
                  onChange={(e) => setPortLoading(e.target.value)}
                  className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">Port of Discharge</label>
                <input
                  value={portDischarge}
                  onChange={(e) => setPortDischarge(e.target.value)}
                  className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">ETD</label>
                <input
                  type="date"
                  value={etd}
                  onChange={(e) => setEtd(e.target.value)}
                  className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">ETA</label>
                <input
                  type="date"
                  value={eta}
                  onChange={(e) => setEta(e.target.value)}
                  className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
                />
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
                {saving ? 'Creating...' : 'Create Container'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
