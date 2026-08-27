import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, apiErrorMessage } from '../api/client';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';
import { ImportClientPoModal, type MatchedPoItem } from '../components/ImportClientPoModal';
import { CURRENCIES, INCOTERMS, PAYMENT_TERMS_PRESETS, SHIPMENT_MODES } from '../constants/exportTerms';
import type { CompanySettings, Customer, ManufacturingCostReport, Product, ProformaInvoice } from '../types';

interface ItemRow {
  product_id: string;
  description: string;
  hsn_code: string;
  qty: string;
  unit: string;
  rate: string;
}

function emptyItem(): ItemRow {
  return { product_id: '', description: '', hsn_code: '', qty: '', unit: '', rate: '' };
}

/** Shows the estimated manufacturing cost of a Proforma Invoice, computed per line item from the
 * product's weight (kg) x its raw material rate (from Raw Materials, per KG or per Litre) plus
 * the product's finishing and packaging costs. */
function ManufacturingCostModal({ piId, onClose }: { piId: number; onClose: () => void }) {
  const [report, setReport] = useState<ManufacturingCostReport | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get(`/proforma-invoices/${piId}/manufacturing-cost`)
      .then((res) => setReport(res.data))
      .catch((err) => setError(apiErrorMessage(err)));
  }, [piId]);

  return (
    <Modal title={`Manufacturing Cost - ${report?.pi_no || ''}`} onClose={onClose} wide>
      {error && <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
      {!report && !error && <div className="py-6 text-center text-sm text-stone-400">Calculating...</div>}
      {report && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded border border-stone-200">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2">Material</th>
                  <th className="px-3 py-2 text-right">Weight (kg)</th>
                  <th className="px-3 py-2 text-right">Rate</th>
                  <th className="px-3 py-2 text-right">Raw Mat. Cost</th>
                  <th className="px-3 py-2 text-right">Labour</th>
                  <th className="px-3 py-2 text-right">Finishing</th>
                  <th className="px-3 py-2 text-right">Packaging</th>
                  <th className="px-3 py-2 text-right">Unit Cost</th>
                  <th className="px-3 py-2 text-right">Line Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {report.items.map((item) => (
                  <tr key={item.product_id}>
                    <td className="px-3 py-1.5">
                      {item.product_name}
                      {item.missing_rate && (
                        <div className="text-xs text-rose-600">No rate set for "{item.material_type}" in Raw Materials</div>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right">{item.qty}</td>
                    <td className="px-3 py-1.5">{item.material_type || '-'}</td>
                    <td className="px-3 py-1.5 text-right">{item.weight_kg}</td>
                    <td className="px-3 py-1.5 text-right">
                      {item.material_rate ? `${item.material_rate}/${item.material_unit}` : '-'}
                    </td>
                    <td className="px-3 py-1.5 text-right">{item.raw_material_cost.toFixed(2)}</td>
                    <td className="px-3 py-1.5 text-right">{item.labour_cost.toFixed(2)}</td>
                    <td className="px-3 py-1.5 text-right">{item.finishing_cost.toFixed(2)}</td>
                    <td className="px-3 py-1.5 text-right">{item.packaging_cost.toFixed(2)}</td>
                    <td className="px-3 py-1.5 text-right">{item.unit_manufacturing_cost.toFixed(2)}</td>
                    <td className="px-3 py-1.5 text-right font-medium">{item.line_manufacturing_cost.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded border border-stone-200 bg-stone-50 p-3">
              <div className="text-xs uppercase text-stone-500">Invoice Value</div>
              <div className="text-lg font-semibold text-stone-800">
                {report.currency} {report.total_value.toLocaleString()}
              </div>
            </div>
            <div className="rounded border border-stone-200 bg-stone-50 p-3">
              <div className="text-xs uppercase text-stone-500">Total Manufacturing Cost</div>
              <div className="text-lg font-semibold text-stone-800">
                {report.currency} {report.total_manufacturing_cost.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="rounded border border-stone-200 bg-stone-50 p-3">
              <div className="text-xs uppercase text-stone-500">Estimated Margin</div>
              <div className="text-lg font-semibold text-emerald-700">
                {report.currency} {report.estimated_margin.toLocaleString(undefined, { maximumFractionDigits: 2 })} (
                {report.estimated_margin_percent.toFixed(1)}%)
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-stone-300 px-4 py-1.5 text-sm text-stone-600 hover:bg-stone-50"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function ProformaInvoices() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<ProformaInvoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [mfgCostPiId, setMfgCostPiId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [customerId, setCustomerId] = useState('');
  const [piDate, setPiDate] = useState('');
  const [validityDate, setValidityDate] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [incoterm, setIncoterm] = useState('FOB');
  const [portLoading, setPortLoading] = useState('');
  const [portDischarge, setPortDischarge] = useState('');
  const [countryOrigin, setCountryOrigin] = useState('India');
  const [finalDestination, setFinalDestination] = useState('');
  const [shipmentMode, setShipmentMode] = useState('Sea Freight');
  const [partialShipment, setPartialShipment] = useState('Not Allowed');
  const [transshipment, setTransshipment] = useState('Not Allowed');
  const [paymentTermsPreset, setPaymentTermsPreset] = useState(PAYMENT_TERMS_PRESETS[1]);
  const [paymentTerms, setPaymentTerms] = useState(PAYMENT_TERMS_PRESETS[1]);
  const [bankDetails, setBankDetails] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ItemRow[]>([emptyItem()]);

  async function load() {
    setLoading(true);
    const res = await api.get('/proforma-invoices');
    setInvoices(res.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    api.get('/customers').then((res) => setCustomers(res.data));
    api.get('/products').then((res) => setProducts(res.data));
    api.get('/company-settings').then((res) => setCompany(res.data));
  }, []);

  function resetForm() {
    setCustomerId('');
    setPiDate(new Date().toISOString().slice(0, 10));
    setValidityDate('');
    setCurrency('USD');
    setIncoterm('FOB');
    setPortLoading('');
    setPortDischarge('');
    setCountryOrigin('India');
    setFinalDestination('');
    setShipmentMode('Sea Freight');
    setPartialShipment('Not Allowed');
    setTransshipment('Not Allowed');
    setPaymentTermsPreset(PAYMENT_TERMS_PRESETS[1]);
    setPaymentTerms(PAYMENT_TERMS_PRESETS[1]);
    setBankDetails(
      company
        ? `Beneficiary: ${company.bank_account_name || company.company_name}\nBank: ${company.bank_name || ''}\nA/C No: ${company.bank_account_no || ''}\nIFSC: ${company.bank_ifsc || ''}\nSWIFT: ${company.bank_swift || ''}\nBank Address: ${company.bank_address || ''}`
        : ''
    );
    setNotes('Rates valid for the validity period stated above. Subject to jurisdiction of the exporter\u2019s home country courts.');
    setItems([emptyItem()]);
    setError('');
  }

  function openCreate() {
    resetForm();
    setModalOpen(true);
  }

  function updateItem(idx: number, field: keyof ItemRow, value: string) {
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
      await api.post('/proforma-invoices', {
        customer_id: customerId,
        pi_date: piDate || undefined,
        validity_date: validityDate || undefined,
        currency,
        incoterm,
        port_of_loading: portLoading,
        port_of_discharge: portDischarge,
        country_of_origin: countryOrigin,
        final_destination: finalDestination,
        shipment_mode: shipmentMode,
        partial_shipment: partialShipment,
        transshipment,
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
      setModalOpen(false);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const totalPreview = items.reduce((sum, i) => sum + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0);
  // Each buyer can have their own private product catalog - only offer that buyer's own products
  // plus shared/unassigned catalog items when picking line items for their Proforma Invoice.
  const availableProducts = customerId
    ? products.filter((p) => !p.customer_id || p.customer_id === Number(customerId))
    : products;

  async function handleDelete(pi: ProformaInvoice) {
    if (!window.confirm(`Delete ${pi.pi_no}? This cannot be undone.`)) return;
    try {
      await api.delete(`/proforma-invoices/${pi.id}`);
      load();
    } catch (err) {
      alert(apiErrorMessage(err));
    }
  }

  function toggleSelected(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.size === invoices.length ? new Set() : new Set(invoices.map((i) => i.id))));
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} selected proforma invoice(s)? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      await api.post('/proforma-invoices/bulk-delete', { ids });
      setSelectedIds(new Set());
      load();
    } catch (err) {
      alert(apiErrorMessage(err));
    } finally {
      setBulkDeleting(false);
    }
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-800">Proforma Invoices</h1>
          <p className="text-sm text-stone-500">Pre-shipment quotations for export buyers</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="rounded border border-rose-300 px-4 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
            >
              {bulkDeleting ? 'Deleting...' : `Delete Selected (${selectedIds.size})`}
            </button>
          )}
          <button
            onClick={() => setImportOpen(true)}
            className="rounded border border-stone-400 px-4 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
          >
            📥 Import Client PO
          </button>
          <button onClick={openCreate} className="rounded bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700">
            + New Proforma Invoice
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3 w-8">
                <input
                  type="checkbox"
                  checked={invoices.length > 0 && selectedIds.size === invoices.length}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="px-4 py-3">PI No.</th>
              <th className="px-4 py-3">Buyer</th>
              <th className="px-4 py-3">PI Date</th>
              <th className="px-4 py-3">Valid Until</th>
              <th className="px-4 py-3">Incoterm</th>
              <th className="px-4 py-3">Total</th>
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
            ) : invoices.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-stone-400">
                  No proforma invoices yet.
                </td>
              </tr>
            ) : (
              invoices.map((pi) => (
                <tr key={pi.id} className="hover:bg-stone-50">
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selectedIds.has(pi.id)} onChange={() => toggleSelected(pi.id)} />
                  </td>
                  <td className="px-4 py-3 font-medium text-stone-700">
                    {pi.pi_no}
                    {pi.customer_po_no && <div className="text-xs font-normal text-stone-400">PO: {pi.customer_po_no}</div>}
                  </td>
                  <td className="px-4 py-3">
                    {pi.customer_name}
                    <div className="text-xs text-stone-400">{pi.customer_company}</div>
                  </td>
                  <td className="px-4 py-3">{pi.pi_date}</td>
                  <td className="px-4 py-3">{pi.validity_date}</td>
                  <td className="px-4 py-3">{pi.incoterm}</td>
                  <td className="px-4 py-3">
                    {pi.currency} {pi.total_amount?.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={pi.status} />
                  </td>
                  <td className="px-4 py-3 text-right space-x-3 whitespace-nowrap">
                    <Link to={`/proforma-invoices/${pi.id}`} className="text-sky-600 hover:underline text-xs font-medium">
                      View / Print
                    </Link>
                    <button
                      onClick={() => setMfgCostPiId(pi.id)}
                      className="text-emerald-600 hover:underline text-xs font-medium"
                    >
                      Mfg. Cost
                    </button>
                    <button
                      onClick={() => handleDelete(pi)}
                      className="text-rose-600 hover:underline text-xs font-medium"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {mfgCostPiId && <ManufacturingCostModal piId={mfgCostPiId} onClose={() => setMfgCostPiId(null)} />}

      {modalOpen && (
        <Modal title="New Proforma Invoice" onClose={() => setModalOpen(false)} wide>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
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
                <label className="mb-1 block text-xs font-medium text-stone-600">Partial Shipment</label>
                <select
                  value={partialShipment}
                  onChange={(e) => setPartialShipment(e.target.value)}
                  className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
                >
                  <option value="Allowed">Allowed</option>
                  <option value="Not Allowed">Not Allowed</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-600">Transshipment</label>
                <select
                  value={transshipment}
                  onChange={(e) => setTransshipment(e.target.value)}
                  className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
                >
                  <option value="Allowed">Allowed</option>
                  <option value="Not Allowed">Not Allowed</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">Payment Terms</label>
              <select
                value={paymentTermsPreset}
                onChange={(e) => {
                  setPaymentTermsPreset(e.target.value);
                  setPaymentTerms(e.target.value);
                }}
                className="mb-2 w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
              >
                {PAYMENT_TERMS_PRESETS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
                <option value="__custom__">Custom (edit below)</option>
              </select>
              <textarea
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                rows={2}
                className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">Bank Details for Payment</label>
              <textarea
                value={bankDetails}
                onChange={(e) => setBankDetails(e.target.value)}
                rows={4}
                className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm font-mono"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-medium text-stone-600">Product Line Items</label>
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
                  <div key={idx} className="grid grid-cols-12 items-center gap-2">
                    <select
                      value={item.product_id}
                      onChange={(e) => updateItem(idx, 'product_id', e.target.value)}
                      className="col-span-4 rounded border border-stone-300 px-2 py-1.5 text-sm"
                    >
                      <option value="">-- Product --</option>
                      {availableProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.sku})
                        </option>
                      ))}
                    </select>
                    <input
                      placeholder="HSN"
                      value={item.hsn_code}
                      onChange={(e) => updateItem(idx, 'hsn_code', e.target.value)}
                      className="col-span-2 rounded border border-stone-300 px-2 py-1.5 text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Qty"
                      value={item.qty}
                      onChange={(e) => updateItem(idx, 'qty', e.target.value)}
                      className="col-span-2 rounded border border-stone-300 px-2 py-1.5 text-sm"
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Rate"
                      value={item.rate}
                      onChange={(e) => updateItem(idx, 'rate', e.target.value)}
                      className="col-span-2 rounded border border-stone-300 px-2 py-1.5 text-sm"
                    />
                    <div className="col-span-1 text-right text-xs text-stone-500">
                      {((Number(item.qty) || 0) * (Number(item.rate) || 0)).toLocaleString()}
                    </div>
                    <button
                      type="button"
                      onClick={() => setItems(items.filter((_, i) => i !== idx))}
                      className="col-span-1 text-rose-500 hover:text-rose-700 text-lg leading-none"
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
                {saving ? 'Saving...' : 'Create Proforma Invoice'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {importOpen && (
        <ImportClientPoModal
          title="Import Client Purchase Order"
          description="Upload the purchase order sent by your buyer (.xlsx, .xls or .pdf). Lines are matched to your product catalog by SKU or product name, then can be converted directly into a Proforma Invoice with the same products, quantities and prices. PDF text layouts vary, so review the matched lines below before creating the invoice - for best accuracy, ask buyers for an Excel PO."
          submitLabel="Create Proforma Invoice"
          parseEndpoint="/proforma-invoices/parse-client-po"
          customers={customers}
          products={products}
          onClose={() => setImportOpen(false)}
          onSubmit={async ({ customerId, items }: { customerId: string; items: MatchedPoItem[] }) => {
            const res = await api.post('/proforma-invoices', {
              customer_id: customerId,
              pi_date: new Date().toISOString().slice(0, 10),
              currency: 'USD',
              incoterm: 'FOB',
              country_of_origin: 'India',
              shipment_mode: 'Sea Freight',
              partial_shipment: 'Not Allowed',
              transshipment: 'Not Allowed',
              payment_terms: PAYMENT_TERMS_PRESETS[1],
              bank_details: company
                ? `Beneficiary: ${company.bank_account_name || company.company_name}\nBank: ${company.bank_name || ''}\nA/C No: ${company.bank_account_no || ''}\nIFSC: ${company.bank_ifsc || ''}\nSWIFT: ${company.bank_swift || ''}\nBank Address: ${company.bank_address || ''}`
                : '',
              notes: 'Generated from buyer-supplied purchase order.',
              items: items.map((m) => ({
                product_id: m.product_id,
                description: m.description,
                hsn_code: m.hsn_code,
                qty: m.qty,
                unit: m.unit,
                rate: m.rate,
              })),
            });
            return res.data;
          }}
          onCreated={(id) => {
            setImportOpen(false);
            navigate(`/proforma-invoices/${id}`);
          }}
        />
      )}
    </div>
  );
}
