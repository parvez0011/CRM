import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, apiErrorMessage } from '../api/client';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';
import type { Customer, Product, SalesOrder } from '../types';

interface ItemRow {
  product_id: string;
  qty: string;
  rate: string;
}

export function SalesOrders() {
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [customerId, setCustomerId] = useState('');
  const [orderDate, setOrderDate] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [incoterm, setIncoterm] = useState('FOB');
  const [currency, setCurrency] = useState('USD');
  const [portLoading, setPortLoading] = useState('');
  const [portDischarge, setPortDischarge] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ItemRow[]>([{ product_id: '', qty: '', rate: '' }]);

  async function load() {
    setLoading(true);
    const res = await api.get('/sales-orders');
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
    setOrderDate('');
    setDeliveryDate('');
    setIncoterm('FOB');
    setCurrency('USD');
    setPortLoading('');
    setPortDischarge('');
    setNotes('');
    setItems([{ product_id: '', qty: '', rate: '' }]);
    setError('');
  }

  function updateItem(idx: number, field: keyof ItemRow, value: string) {
    const next = [...items];
    next[idx] = { ...next[idx], [field]: value };
    if (field === 'product_id') {
      const p = products.find((prod) => prod.id === Number(value));
      if (p) next[idx].rate = String(p.unit_price);
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
      await api.post('/sales-orders', {
        customer_id: customerId,
        order_date: orderDate || undefined,
        delivery_date: deliveryDate || undefined,
        incoterm,
        currency,
        port_of_loading: portLoading,
        port_of_discharge: portDischarge,
        notes,
        items: validItems.map((i) => ({ product_id: Number(i.product_id), qty: Number(i.qty), rate: Number(i.rate) })),
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

  const totalPreview = items.reduce((sum, i) => sum + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0);
  const availableProducts = customerId
    ? products.filter((p) => !p.customer_id || p.customer_id === Number(customerId))
    : products;

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-800">Export / Sales Orders</h1>
        <button
          onClick={() => {
            resetForm();
            setModalOpen(true);
          }}
          className="rounded bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
        >
          + New Export Order
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Order No.</th>
              <th className="px-4 py-3">Buyer</th>
              <th className="px-4 py-3">Order Date</th>
              <th className="px-4 py-3">Delivery Date</th>
              <th className="px-4 py-3">Incoterm</th>
              <th className="px-4 py-3">Total</th>
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
                  No export orders yet.
                </td>
              </tr>
            ) : (
              orders.map((o) => (
                <tr key={o.id} className="hover:bg-stone-50">
                  <td className="px-4 py-3 font-medium text-stone-700">{o.order_no}</td>
                  <td className="px-4 py-3">
                    {o.customer_name}
                    <div className="text-xs text-stone-400">{o.customer_company}</div>
                  </td>
                  <td className="px-4 py-3">{o.order_date}</td>
                  <td className="px-4 py-3">{o.delivery_date}</td>
                  <td className="px-4 py-3">{o.incoterm}</td>
                  <td className="px-4 py-3">
                    {o.currency} {o.total_amount?.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/sales-orders/${o.id}`} className="text-sky-600 hover:underline text-xs font-medium">
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <Modal title="New Export Order" onClose={() => setModalOpen(false)} wide>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">Buyer *</label>
                <select
                  required
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
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
                <label className="mb-1 block text-xs font-medium text-stone-600">Incoterm</label>
                <select
                  value={incoterm}
                  onChange={(e) => setIncoterm(e.target.value)}
                  className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
                >
                  {['FOB', 'CIF', 'EXW', 'CFR', 'DAP', 'DDP'].map((t) => (
                    <option key={t} value={t}>
                      {t}
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
                <label className="mb-1 block text-xs font-medium text-stone-600">Delivery Date</label>
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
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
                  {['USD', 'EUR', 'GBP', 'JPY', 'INR'].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
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
                <label className="text-xs font-medium text-stone-600">Order Items</label>
                <button
                  type="button"
                  onClick={() => setItems([...items, { product_id: '', qty: '', rate: '' }])}
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
                      {availableProducts.map((p) => (
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
