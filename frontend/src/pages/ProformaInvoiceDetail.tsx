import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, apiErrorMessage } from '../api/client';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';
import { amountInWords } from '../utils/numberToWords';
import { CURRENCIES, INCOTERMS, SHIPMENT_MODES } from '../constants/exportTerms';
import type { Product, ProformaInvoice, ProformaInvoiceStatus } from '../types';

const STATUS_FLOW: ProformaInvoiceStatus[] = ['draft', 'sent', 'accepted'];

interface EditItemRow {
  product_id: string;
  description: string;
  hsn_code: string;
  qty: string;
  unit: string;
  rate: string;
}

function EditPiModal({ pi, onClose, onSaved }: { pi: ProformaInvoice; onClose: () => void; onSaved: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [piDate, setPiDate] = useState(pi.pi_date || '');
  const [validityDate, setValidityDate] = useState(pi.validity_date || '');
  const [currency, setCurrency] = useState(pi.currency || 'USD');
  const [incoterm, setIncoterm] = useState(pi.incoterm || 'FOB');
  const [portLoading, setPortLoading] = useState(pi.port_of_loading || '');
  const [portDischarge, setPortDischarge] = useState(pi.port_of_discharge || '');
  const [countryOrigin, setCountryOrigin] = useState(pi.country_of_origin || 'India');
  const [finalDestination, setFinalDestination] = useState(pi.final_destination || '');
  const [shipmentMode, setShipmentMode] = useState<string>(pi.shipment_mode || 'Sea Freight');
  const [paymentTerms, setPaymentTerms] = useState(pi.payment_terms || '');
  const [bankDetails, setBankDetails] = useState(pi.bank_details || '');
  const [notes, setNotes] = useState(pi.notes || '');
  const [items, setItems] = useState<EditItemRow[]>(
    (pi.items || []).map((i) => ({
      product_id: String(i.product_id),
      description: i.description || i.product_name || '',
      hsn_code: i.hsn_code || '',
      qty: String(i.qty),
      unit: i.unit || '',
      rate: String(i.rate),
    }))
  );

  useEffect(() => {
    api.get('/products').then((res) => setProducts(res.data));
  }, []);

  function updateItem(idx: number, field: keyof EditItemRow, value: string) {
    const next = [...items];
    next[idx] = { ...next[idx], [field]: value };
    if (field === 'product_id') {
      const p = products.find((prod) => prod.id === Number(value));
      if (p) {
        next[idx].rate = String(p.unit_price);
        next[idx].description = p.name;
        next[idx].hsn_code = p.hsn_code || '';
        next[idx].unit = p.unit;
      }
    }
    setItems(next);
  }

  async function handleSave() {
    setError('');
    const validItems = items.filter((i) => i.product_id && i.qty);
    if (validItems.length === 0) {
      setError('Please keep at least one product line.');
      return;
    }
    setSaving(true);
    try {
      await api.put(`/proforma-invoices/${pi.id}`, {
        pi_date: piDate || null,
        validity_date: validityDate || null,
        currency,
        incoterm,
        port_of_loading: portLoading,
        port_of_discharge: portDischarge,
        country_of_origin: countryOrigin,
        final_destination: finalDestination,
        shipment_mode: shipmentMode,
        payment_terms: paymentTerms,
        bank_details: bankDetails,
        notes,
        items: validItems.map((i) => ({
          product_id: Number(i.product_id),
          description: i.description,
          hsn_code: i.hsn_code,
          qty: Number(i.qty),
          unit: i.unit,
          rate: Number(i.rate),
        })),
      });
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const totalPreview = items.reduce((sum, i) => sum + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0);

  return (
    <Modal title={`Edit ${pi.pi_no}`} onClose={onClose} wide>
      <div className="space-y-4">
        {error && <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">PI Date</label>
            <input
              type="date"
              value={piDate}
              onChange={(e) => setPiDate(e.target.value)}
              className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">Valid Until</label>
            <input
              type="date"
              value={validityDate}
              onChange={(e) => setValidityDate(e.target.value)}
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
              {INCOTERMS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">Shipment Mode</label>
            <select
              value={shipmentMode}
              onChange={(e) => setShipmentMode(e.target.value)}
              className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
            >
              {SHIPMENT_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">Country of Origin</label>
            <input
              value={countryOrigin}
              onChange={(e) => setCountryOrigin(e.target.value)}
              className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">Final Destination</label>
            <input
              value={finalDestination}
              onChange={(e) => setFinalDestination(e.target.value)}
              className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
            />
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
          <label className="mb-1 block text-xs font-medium text-stone-600">Payment Terms</label>
          <textarea
            value={paymentTerms}
            onChange={(e) => setPaymentTerms(e.target.value)}
            rows={2}
            className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-stone-600">Bank Details</label>
          <textarea
            value={bankDetails}
            onChange={(e) => setBankDetails(e.target.value)}
            rows={3}
            className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm font-mono"
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-medium text-stone-600">Product Line Items</label>
            <button
              type="button"
              onClick={() => setItems([...items, { product_id: '', description: '', hsn_code: '', qty: '', unit: '', rate: '' }])}
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

        <div>
          <label className="mb-1 block text-xs font-medium text-stone-600">Remarks / Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
          />
        </div>

        <div className="flex justify-end gap-2 border-t pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-stone-300 px-4 py-1.5 text-sm text-stone-600 hover:bg-stone-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function ProformaInvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [pi, setPi] = useState<ProformaInvoice | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  async function load() {
    const res = await api.get(`/proforma-invoices/${id}`);
    setPi(res.data);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function changeStatus(status: ProformaInvoiceStatus) {
    setBusy(true);
    setError('');
    try {
      await api.patch(`/proforma-invoices/${id}/status`, { status });
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function convertToSalesOrder() {
    if (!window.confirm('Convert this proforma invoice into a confirmed export order?')) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.post(`/proforma-invoices/${id}/convert-to-sales-order`);
      navigate(`/sales-orders/${res.data.id}`);
    } catch (err) {
      setError(apiErrorMessage(err));
      setBusy(false);
    }
  }

  if (!pi) return <div className="text-stone-400">Loading...</div>;

  const total = pi.total_amount || 0;
  const currentIdx = STATUS_FLOW.indexOf(pi.status);
  const company = pi.company;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <div>
          <Link to="/proforma-invoices" className="text-xs text-sky-600 hover:underline">
            &larr; Back to Proforma Invoices
          </Link>
          <h1 className="text-2xl font-bold text-stone-800">{pi.pi_no}</h1>
          {pi.customer_po_id && (
            <div className="text-xs text-stone-500">
              From Customer PO:{' '}
              <Link to={`/customer-purchase-orders/${pi.customer_po_id}`} className="text-sky-600 hover:underline">
                {pi.customer_po_no}
              </Link>
            </div>
          )}
        </div>
        <StatusBadge status={pi.status} />
      </div>

      {error && <div className="mb-4 rounded bg-rose-50 px-3 py-2 text-sm text-rose-700 print:hidden">{error}</div>}

      <div className="mb-5 flex flex-wrap items-center gap-2 print:hidden">
        {STATUS_FLOW.map((s, idx) => (
          <button
            key={s}
            disabled={busy || idx <= currentIdx || pi.status === 'cancelled'}
            onClick={() => changeStatus(s)}
            className={`rounded px-3 py-1.5 text-xs font-medium capitalize ${
              idx <= currentIdx ? 'bg-stone-100 text-stone-400' : 'bg-amber-600 text-white hover:bg-amber-700'
            }`}
          >
            Mark {s}
          </button>
        ))}
        {pi.status !== 'cancelled' && pi.status !== 'accepted' && (
          <button
            disabled={busy}
            onClick={() => changeStatus('cancelled')}
            className="rounded bg-rose-100 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-200"
          >
            Cancel
          </button>
        )}
        <button
          disabled={busy || !!pi.sales_order_id}
          onClick={convertToSalesOrder}
          className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {pi.sales_order_id ? `Converted to ${pi.sales_order_no}` : 'Convert to Export Order'}
        </button>
        {pi.status === 'draft' && (
          <button
            onClick={() => setEditOpen(true)}
            className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700"
          >
            ✎ Edit
          </button>
        )}
        <Link
          to={`/proforma-invoices/${id}/packing-list`}
          className="rounded border border-stone-400 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
        >
          📦 Packing List
        </Link>
        <button
          onClick={() => window.print()}
          className="ml-auto rounded bg-stone-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-800"
        >
          🖨 Print / Save PDF
        </button>
      </div>

      {/* Printable document */}
      <div className="rounded-lg border border-stone-200 bg-white p-8 shadow-sm print:border-0 print:shadow-none print:p-0 text-sm text-stone-800">
        <div className="mb-6 flex items-start justify-between border-b border-stone-300 pb-4">
          <div>
            <div className="text-xl font-bold">{company?.company_name || 'Akbar Handicrafts'}</div>
            <div className="text-stone-600">{company?.address}</div>
            <div className="text-stone-600">
              {company?.city}, {company?.country}
            </div>
            <div className="text-stone-600">{company?.email} | {company?.phone}</div>
            <div className="mt-1 text-xs text-stone-500">
              GSTIN: {company?.gstin} &nbsp;|&nbsp; IEC Code: {company?.iec_code} &nbsp;|&nbsp; PAN: {company?.pan}
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold uppercase tracking-wide text-amber-700">Proforma Invoice</div>
            <div className="mt-2 text-stone-600">
              PI No: <span className="font-semibold text-stone-800">{pi.pi_no}</span>
            </div>            {pi.customer_po_no && (
              <div className="text-stone-600">Buyer PO No: <span className="font-semibold text-stone-800">{pi.customer_po_no}</span></div>
            )}            <div className="text-stone-600">Date: {pi.pi_date}</div>
            <div className="text-stone-600">Valid Until: {pi.validity_date}</div>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-6">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">Buyer / Consignee</div>
            <div className="font-semibold">{pi.customer_name}</div>
            <div>{pi.customer_company}</div>
            <div className="whitespace-pre-line text-stone-600">{pi.customer_address}</div>
            <div className="text-stone-600">{pi.customer_country}</div>
            <div className="text-stone-600">{pi.customer_email}</div>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">Shipment Details</div>
            <table className="w-full text-xs">
              <tbody>
                <tr>
                  <td className="py-0.5 text-stone-500">Terms of Delivery (Incoterm)</td>
                  <td className="py-0.5 text-right font-medium">{pi.incoterm}</td>
                </tr>
                <tr>
                  <td className="py-0.5 text-stone-500">Country of Origin</td>
                  <td className="py-0.5 text-right font-medium">{pi.country_of_origin}</td>
                </tr>
                <tr>
                  <td className="py-0.5 text-stone-500">Final Destination</td>
                  <td className="py-0.5 text-right font-medium">{pi.final_destination}</td>
                </tr>
                <tr>
                  <td className="py-0.5 text-stone-500">Port of Loading</td>
                  <td className="py-0.5 text-right font-medium">{pi.port_of_loading}</td>
                </tr>
                <tr>
                  <td className="py-0.5 text-stone-500">Port of Discharge</td>
                  <td className="py-0.5 text-right font-medium">{pi.port_of_discharge}</td>
                </tr>
                <tr>
                  <td className="py-0.5 text-stone-500">Mode of Shipment</td>
                  <td className="py-0.5 text-right font-medium">{pi.shipment_mode}</td>
                </tr>
                <tr>
                  <td className="py-0.5 text-stone-500">Partial Shipment</td>
                  <td className="py-0.5 text-right font-medium">{pi.partial_shipment}</td>
                </tr>
                <tr>
                  <td className="py-0.5 text-stone-500">Transshipment</td>
                  <td className="py-0.5 text-right font-medium">{pi.transshipment}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <table className="mb-4 w-full border-collapse text-xs">
          <thead>
            <tr className="border-b-2 border-stone-700 text-left uppercase text-stone-600">
              {pi.customer_pi_item_format === 'sku_simple' ? (
                <>
                  <th className="py-2 pr-2">SKU</th>
                  <th className="py-2 pr-2">Item Title</th>
                  <th className="py-2 pr-2 text-right">Ordered</th>
                  <th className="py-2 pr-2 text-right">Unit Cost ({pi.currency})</th>
                  <th className="py-2 text-right">Cost ({pi.currency})</th>
                </>
              ) : (
                <>
                  <th className="py-2 pr-2">#</th>
                  <th className="py-2 pr-2">Description of Goods</th>
                  <th className="py-2 pr-2">HSN Code</th>
                  <th className="py-2 pr-2 text-right">Qty</th>
                  <th className="py-2 pr-2">Unit</th>
                  <th className="py-2 pr-2 text-right">Rate ({pi.currency})</th>
                  <th className="py-2 text-right">Amount ({pi.currency})</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {pi.items?.map((item, idx) =>
              pi.customer_pi_item_format === 'sku_simple' ? (
                <tr key={item.id} className="border-b border-stone-200">
                  <td className="py-2 pr-2">{item.sku}</td>
                  <td className="py-2 pr-2">{item.description || item.product_name}</td>
                  <td className="py-2 pr-2 text-right">{item.qty}</td>
                  <td className="py-2 pr-2 text-right">{item.rate.toLocaleString()}</td>
                  <td className="py-2 text-right">{(item.qty * item.rate).toLocaleString()}</td>
                </tr>
              ) : (
                <tr key={item.id} className="border-b border-stone-200">
                  <td className="py-2 pr-2">{idx + 1}</td>
                  <td className="py-2 pr-2">{item.description || item.product_name}</td>
                  <td className="py-2 pr-2">{item.hsn_code}</td>
                  <td className="py-2 pr-2 text-right">{item.qty}</td>
                  <td className="py-2 pr-2">{item.unit}</td>
                  <td className="py-2 pr-2 text-right">{item.rate.toLocaleString()}</td>
                  <td className="py-2 text-right">{(item.qty * item.rate).toLocaleString()}</td>
                </tr>
              )
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={pi.customer_pi_item_format === 'sku_simple' ? 4 : 6} className="pt-3 text-right font-semibold">
                Total
              </td>
              <td className="pt-3 text-right text-base font-bold">
                {pi.currency} {total.toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
        <div className="mb-6 text-xs italic text-stone-600">
          Amount in Words: {amountInWords(total, pi.currency)}
        </div>

        <div className="mb-6 grid grid-cols-2 gap-6">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">Payment Terms</div>
            <div className="whitespace-pre-line text-stone-700">{pi.payment_terms}</div>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">Bank Details</div>
            <div className="whitespace-pre-line text-stone-700">{pi.bank_details}</div>
          </div>
        </div>

        {pi.notes && (
          <div className="mb-8">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">Remarks</div>
            <div className="whitespace-pre-line text-stone-700">{pi.notes}</div>
          </div>
        )}

        <div className="mt-12 flex justify-end">
          <div className="text-center">
            <div className="mb-8 text-stone-500">For {company?.company_name}</div>
            <div className="border-t border-stone-400 pt-1 font-medium">{company?.authorized_signatory}</div>
            <div className="text-xs text-stone-500">Authorized Signatory</div>
          </div>
        </div>
      </div>

      {editOpen && (
        <EditPiModal
          pi={pi}
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
