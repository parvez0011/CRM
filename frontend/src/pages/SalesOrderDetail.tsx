import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, apiErrorMessage } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';
import type { SalesOrder, SalesOrderStatus } from '../types';

const STATUS_FLOW: SalesOrderStatus[] = ['draft', 'confirmed', 'in_production', 'ready_to_ship', 'shipped', 'delivered'];

export function SalesOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<SalesOrder | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await api.get(`/sales-orders/${id}`);
    setOrder(res.data);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function changeStatus(status: SalesOrderStatus) {
    setBusy(true);
    setError('');
    try {
      await api.patch(`/sales-orders/${id}/status`, { status });
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function startProduction(productId: number, qty: number) {
    try {
      await api.post('/production-orders', { product_id: productId, sales_order_id: id, qty });
      alert('Production order created.');
    } catch (err) {
      alert(apiErrorMessage(err));
    }
  }

  async function createShipment() {
    try {
      const res = await api.post('/shipments', {
        sales_order_id: id,
        port_of_loading: order?.port_of_loading,
        port_of_discharge: order?.port_of_discharge,
      });
      navigate('/shipments');
      return res.data;
    } catch (err) {
      alert(apiErrorMessage(err));
    }
  }

  async function createInvoice() {
    if (!order) return;
    try {
      await api.post('/invoices', {
        sales_order_id: order.id,
        customer_id: order.customer_id,
        currency: order.currency,
        total_amount: order.total_amount,
      });
      navigate('/invoices');
    } catch (err) {
      alert(apiErrorMessage(err));
    }
  }

  if (!order) return <div className="text-stone-400">Loading...</div>;

  const currentIdx = STATUS_FLOW.indexOf(order.status);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/sales-orders" className="text-xs text-sky-600 hover:underline">
            &larr; Back to Export Orders
          </Link>
          <h1 className="text-2xl font-bold text-stone-800">{order.order_no}</h1>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {error && <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm md:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-stone-700">Order Details</h2>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-stone-400">Buyer</dt>
            <dd className="text-stone-700">
              {order.customer_name} ({order.customer_company})
            </dd>
            <dt className="text-stone-400">Buyer Email</dt>
            <dd className="text-stone-700">{order.customer_email}</dd>
            <dt className="text-stone-400">Order Date</dt>
            <dd className="text-stone-700">{order.order_date}</dd>
            <dt className="text-stone-400">Delivery Date</dt>
            <dd className="text-stone-700">{order.delivery_date}</dd>
            <dt className="text-stone-400">Incoterm</dt>
            <dd className="text-stone-700">{order.incoterm}</dd>
            <dt className="text-stone-400">Ports</dt>
            <dd className="text-stone-700">
              {order.port_of_loading} &rarr; {order.port_of_discharge}
            </dd>
            <dt className="text-stone-400">Notes</dt>
            <dd className="text-stone-700">{order.notes}</dd>
          </dl>
        </div>

        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-stone-700">Update Status</h2>
          <div className="flex flex-wrap gap-2">
            {STATUS_FLOW.map((s, idx) => (
              <button
                key={s}
                disabled={busy || idx <= currentIdx}
                onClick={() => changeStatus(s)}
                className={`rounded px-2.5 py-1 text-xs font-medium capitalize ${
                  idx <= currentIdx
                    ? 'bg-stone-100 text-stone-400'
                    : 'bg-amber-600 text-white hover:bg-amber-700'
                }`}
              >
                {s.replaceAll('_', ' ')}
              </button>
            ))}
          </div>
          <button
            disabled={busy || order.status === 'cancelled'}
            onClick={() => changeStatus('cancelled')}
            className="mt-3 w-full rounded bg-rose-100 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-200"
          >
            Cancel Order
          </button>

          <div className="mt-4 space-y-2 border-t pt-4">
            <button
              onClick={createShipment}
              className="w-full rounded bg-indigo-600 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
            >
              Create Shipment
            </button>
            <button
              onClick={createInvoice}
              className="w-full rounded bg-sky-600 py-1.5 text-xs font-medium text-white hover:bg-sky-700"
            >
              Generate Invoice
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-stone-700">Order Items</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-stone-400">
            <tr>
              <th className="py-1">Product</th>
              <th className="py-1">SKU</th>
              <th className="py-1">Qty</th>
              <th className="py-1">Rate</th>
              <th className="py-1">Amount</th>
              <th className="py-1"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {order.items?.map((item) => (
              <tr key={item.id}>
                <td className="py-2 font-medium text-stone-700">{item.product_name}</td>
                <td className="py-2 text-stone-500">{item.sku}</td>
                <td className="py-2">
                  {item.qty} {item.unit}
                </td>
                <td className="py-2">
                  {order.currency} {item.rate}
                </td>
                <td className="py-2">
                  {order.currency} {(item.qty * item.rate).toLocaleString()}
                </td>
                <td className="py-2 text-right">
                  <button
                    onClick={() => startProduction(item.product_id, item.qty)}
                    className="text-xs font-medium text-emerald-600 hover:underline"
                  >
                    Start Production
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 text-right text-base font-semibold text-stone-800">
          Total: {order.currency} {order.total_amount?.toLocaleString()}
        </div>
      </div>
    </div>
  );
}
