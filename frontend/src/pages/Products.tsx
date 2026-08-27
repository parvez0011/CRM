import { useEffect, useRef, useState } from 'react';
import { CrudPage } from '../components/CrudPage';
import { Modal } from '../components/Modal';
import { api, apiErrorMessage } from '../api/client';
import type { Customer, Material, Product, ProductCostSheet } from '../types';

interface BulkUploadResult {
  created: number;
  updated: number;
  errorCount: number;
  errors: { row: number; message: string }[];
}

function BulkUploadModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<BulkUploadResult | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function downloadTemplate() {
    const res = await api.get('/products/bulk-upload/template', { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'product_upload_template.xlsx';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  async function handleUpload() {
    if (!file) {
      setError('Please choose an .xlsx or .xls file first.');
      return;
    }
    setUploading(true);
    setError('');
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/products/bulk-upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(res.data);
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <Modal title="Bulk Upload Products from Excel" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-stone-600">
          Upload an .xlsx/.xls file with your product list. Rows with a matching <strong>SKU</strong> update
          existing products; all other rows create new products.
        </p>
        <button type="button" onClick={downloadTemplate} className="text-sm font-medium text-sky-600 hover:underline">
          ⬇ Download Excel Template
        </button>

        {error && <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
          />
        </div>

        {result && (
          <div className="rounded border border-stone-200 bg-stone-50 p-3 text-sm">
            <div className="text-emerald-700">
              ✓ {result.created} product(s) created, {result.updated} updated.
            </div>
            {result.errorCount > 0 && (
              <div className="mt-2">
                <div className="font-medium text-rose-700">{result.errorCount} row(s) had errors:</div>
                <ul className="mt-1 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-rose-600">
                  {result.errors.map((e, idx) => (
                    <li key={idx}>
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-stone-300 px-4 py-1.5 text-sm text-stone-600 hover:bg-stone-50"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading}
            className="rounded bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function BomManager({ productId, onClose }: { productId: number; onClose: () => void }) {
  const [product, setProduct] = useState<Product | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [materialId, setMaterialId] = useState('');
  const [qty, setQty] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const [prodRes, matRes] = await Promise.all([api.get(`/products/${productId}`), api.get('/materials')]);
    setProduct(prodRes.data);
    setMaterials(matRes.data);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  async function addBomItem(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!materialId || !qty) return;
    try {
      await api.post(`/products/${productId}/bom`, { material_id: materialId, qty_required: qty });
      setMaterialId('');
      setQty('');
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function removeBomItem(bomId: number) {
    await api.delete(`/products/bom/${bomId}`);
    load();
  }

  if (!product) return null;

  return (
    <Modal title={`Bill of Materials - ${product.name}`} onClose={onClose}>
      <div className="space-y-4">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-stone-400">
            <tr>
              <th className="py-1">Material</th>
              <th className="py-1">Qty Required / Unit</th>
              <th className="py-1"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {product.bom?.length ? (
              product.bom.map((b) => (
                <tr key={b.id}>
                  <td className="py-2">{b.material_name}</td>
                  <td className="py-2">
                    {b.qty_required} {b.unit}
                  </td>
                  <td className="py-2 text-right">
                    <button onClick={() => removeBomItem(b.id)} className="text-rose-600 hover:underline text-xs">
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="py-3 text-center text-stone-400">
                  No materials linked yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <form onSubmit={addBomItem} className="flex items-end gap-2 border-t pt-4">
          {error && <div className="w-full rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-stone-600">Material</label>
            <select
              value={materialId}
              onChange={(e) => setMaterialId(e.target.value)}
              className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
            >
              <option value="">-- Select material --</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.unit})
                </option>
              ))}
            </select>
          </div>
          <div className="w-32">
            <label className="mb-1 block text-xs font-medium text-stone-600">Qty per unit</label>
            <input
              type="number"
              step="0.01"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
            />
          </div>
          <button type="submit" className="rounded bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700">
            Add
          </button>
        </form>
      </div>
    </Modal>
  );
}

function CostSheetModal({ productId, onClose }: { productId: number; onClose: () => void }) {
  const [sheet, setSheet] = useState<ProductCostSheet | null>(null);
  const [labourCost, setLabourCost] = useState('');
  const [labourCostCategory, setLabourCostCategory] = useState('');
  const [labourCostMode, setLabourCostMode] = useState<'fixed' | 'per_kg'>('fixed');
  const [labourCostPerKg, setLabourCostPerKg] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [finishingCost, setFinishingCost] = useState('');
  const [packagingCost, setPackagingCost] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const res = await api.get(`/products/${productId}/cost-sheet`);
    setSheet(res.data);
    setLabourCost(String(res.data.labour_cost_fixed ?? res.data.labour_cost));
    setLabourCostCategory(res.data.labour_cost_category || '');
    setLabourCostMode(res.data.labour_cost_mode || 'fixed');
    setLabourCostPerKg(String(res.data.labour_cost_per_kg || ''));
    setWeightKg(String(res.data.weight_kg || ''));
    setFinishingCost(String(res.data.finishing_cost));
    setPackagingCost(String(res.data.packaging_cost));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const res = await api.put(`/products/${productId}/cost-sheet`, {
        labour_cost: Number(labourCost) || 0,
        labour_cost_category: labourCostCategory,
        labour_cost_mode: labourCostMode,
        labour_cost_per_kg: Number(labourCostPerKg) || 0,
        weight_kg: Number(weightKg) || 0,
        finishing_cost: Number(finishingCost) || 0,
        packaging_cost: Number(packagingCost) || 0,
      });
      setSheet(res.data);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (!sheet) return null;

  const productWeight = Number(weightKg) || 0;
  const fixedLabourCost = Number(labourCost) || 0;
  const labourRatePerKg = Number(labourCostPerKg) || 0;
  const effectiveLabourCost = labourCostMode === 'per_kg' ? productWeight * labourRatePerKg : fixedLabourCost;
  const draftFinishingCost = Number(finishingCost) || 0;
  const draftPackagingCost = Number(packagingCost) || 0;
  const draftTotalCost = sheet.raw_material_cost + effectiveLabourCost + draftFinishingCost + draftPackagingCost;
  const draftMargin = sheet.unit_price - draftTotalCost;
  const draftMarginPercent = sheet.unit_price > 0 ? (draftMargin / sheet.unit_price) * 100 : 0;

  return (
    <Modal title={`Production Cost Sheet - ${sheet.name}`} onClose={onClose}>
      <div className="space-y-5">
        {error && <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

        <div className="grid grid-cols-2 gap-x-5 gap-y-2 border-b border-stone-200 pb-4 text-sm sm:grid-cols-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-stone-400">SKU</div>
            <div className="mt-0.5 font-medium text-stone-800">{sheet.sku || 'Not assigned'}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-stone-400">Production Type</div>
            <div className="mt-0.5 font-medium text-stone-800">{sheet.category || 'Not assigned'}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-stone-400">Material</div>
            <div className="mt-0.5 font-medium text-stone-800">{sheet.material_type || 'Not assigned'}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-stone-400">Selling Price</div>
            <div className="mt-0.5 font-semibold text-stone-800">{sheet.currency} {sheet.unit_price.toFixed(2)} / {sheet.unit}</div>
          </div>
        </div>

        <div className="border-b border-stone-200 pb-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Raw Materials from BOM</h3>
            <span className="text-sm font-semibold text-stone-800">{sheet.raw_material_cost.toFixed(2)} / {sheet.unit}</span>
          </div>
          {sheet.bom.length === 0 ? (
            <p className="text-sm text-stone-400">No BOM configured. Add materials from the product BOM.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-stone-100 text-left text-xs uppercase tracking-wide text-stone-400">
                <tr>
                  <th className="pb-2 font-medium">Material</th>
                  <th className="pb-2 text-right font-medium">Usage</th>
                  <th className="pb-2 text-right font-medium">Rate</th>
                  <th className="pb-2 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {sheet.bom.map((b) => (
                  <tr key={b.id}>
                    <td className="py-2 font-medium text-stone-700">{b.material_name}</td>
                    <td className="py-2 text-right text-stone-500">{b.qty_required} {b.unit}</td>
                    <td className="py-2 text-right text-stone-500">{Number(b.unit_cost || 0).toFixed(2)}</td>
                    <td className="py-2 text-right font-medium text-stone-700">{b.line_cost.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="border-b border-stone-200 pb-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-500">Labour Setup</h3>
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">Product Weight (kg)</label>
              <input
                type="number"
                min="0"
                step="0.001"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
              />
            </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">Labour Cost Category</label>
            <select
              value={labourCostCategory}
              onChange={(e) => setLabourCostCategory(e.target.value)}
              className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
            >
              <option value="">-- Select category --</option>
              <option value="INHOUSE">INHOUSE</option>
              <option value="POLISH ITEM">POLISH ITEM</option>
              <option value="OUTSOURCED">OUTSOURCED</option>
            </select>
          </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">Labour Cost Method</label>
              <div className="flex overflow-hidden rounded border border-stone-300 text-sm">
                <button
                  type="button"
                  onClick={() => setLabourCostMode('fixed')}
                  className={`flex-1 px-2 py-1.5 font-medium ${labourCostMode === 'fixed' ? 'bg-amber-600 text-white' : 'bg-white text-stone-600 hover:bg-stone-50'}`}
                >
                  Fixed
                </button>
                <button
                  type="button"
                  onClick={() => setLabourCostMode('per_kg')}
                  className={`flex-1 border-l border-stone-300 px-2 py-1.5 font-medium ${labourCostMode === 'per_kg' ? 'bg-amber-600 text-white' : 'bg-white text-stone-600 hover:bg-stone-50'}`}
                >
                  Per kg
                </button>
              </div>
            </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">
              {labourCostMode === 'per_kg' ? 'Labour Rate / kg' : 'Fixed Labour Cost / Unit'}
            </label>
            <input
              type="number"
              step="0.01"
              value={labourCostMode === 'per_kg' ? labourCostPerKg : labourCost}
              onChange={(e) => {
                if (labourCostMode === 'per_kg') setLabourCostPerKg(e.target.value);
                else setLabourCost(e.target.value);
              }}
              className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
            />
          </div>
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2">
              <div className="text-xs font-medium text-amber-800">Effective Labour / Unit</div>
              <div className="mt-1 text-lg font-semibold text-amber-950">{effectiveLabourCost.toFixed(2)}</div>
              {labourCostMode === 'per_kg' && (
                <div className="mt-0.5 text-xs text-amber-800">{productWeight.toFixed(3)} kg &times; {labourRatePerKg.toFixed(2)}</div>
              )}
            </div>
          </div>
        </div>

        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-500">Other Unit Costs</h3>
          <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">Finishing Cost</label>
            <input
              type="number"
              step="0.01"
              value={finishingCost}
              onChange={(e) => setFinishingCost(e.target.value)}
              className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">Packaging Cost</label>
            <input
              type="number"
              step="0.01"
              value={packagingCost}
              onChange={(e) => setPackagingCost(e.target.value)}
              className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
            />
          </div>
          </div>
        </div>

        <div className="grid grid-cols-2 border-y border-stone-200 text-sm sm:grid-cols-4">
          <div className="py-3 sm:pr-4">
            <div className="text-xs font-medium uppercase tracking-wide text-stone-400">Raw Material</div>
            <div className="mt-1 font-semibold text-stone-800">{sheet.raw_material_cost.toFixed(2)}</div>
          </div>
          <div className="border-l border-stone-200 py-3 pl-4">
            <div className="text-xs font-medium uppercase tracking-wide text-stone-400">Labour</div>
            <div className="mt-1 font-semibold text-stone-800">{effectiveLabourCost.toFixed(2)}</div>
          </div>
          <div className="border-t border-stone-200 py-3 sm:border-l sm:border-t-0 sm:px-4">
            <div className="text-xs font-medium uppercase tracking-wide text-stone-400">Finishing + Packaging</div>
            <div className="mt-1 font-semibold text-stone-800">{(draftFinishingCost + draftPackagingCost).toFixed(2)}</div>
          </div>
          <div className="border-l border-t border-stone-200 py-3 pl-4 sm:border-t-0">
            <div className="text-xs font-medium uppercase tracking-wide text-stone-400">Production Cost</div>
            <div className="mt-1 text-base font-semibold text-stone-900">{draftTotalCost.toFixed(2)}</div>
          </div>
        </div>

        <div className="flex items-center justify-between border-b border-stone-200 pb-4 text-sm">
          <span className="text-stone-500">Margin per {sheet.unit}</span>
          <span className={`text-base font-semibold ${draftMargin < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {sheet.currency} {draftMargin.toFixed(2)} ({draftMarginPercent.toFixed(1)}%)
          </span>
        </div>

        <div className="flex justify-end gap-2 border-t pt-3">
          <button onClick={onClose} className="rounded border border-stone-300 px-4 py-1.5 text-sm text-stone-600 hover:bg-stone-50">
            Close
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Cost Sheet'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function Products() {
  const [bomProductId, setBomProductId] = useState<number | null>(null);
  const [costSheetProductId, setCostSheetProductId] = useState<number | null>(null);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filterCustomerId, setFilterCustomerId] = useState('');

  useEffect(() => {
    api.get('/customers').then((res) => setCustomers(res.data));
  }, []);

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <label className="text-xs font-medium text-stone-600">Buyer's Catalog:</label>
        <select
          value={filterCustomerId}
          onChange={(e) => setFilterCustomerId(e.target.value)}
          className="rounded border border-stone-300 px-2 py-1 text-sm"
        >
          <option value="">All Products</option>
          <option value="unassigned">Shared / Unassigned</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.company})
            </option>
          ))}
        </select>
      </div>
      <CrudPage
        title="Products"
        endpoint="/products"
        refreshToken={refreshToken}
        bulkDelete
        extraParams={
          filterCustomerId === 'unassigned'
            ? { unassigned: 'true' }
            : filterCustomerId
              ? { customer_id: filterCustomerId }
              : undefined
        }
        headerActions={
          <button
            onClick={() => setBulkUploadOpen(true)}
            className="rounded border border-amber-600 px-4 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50"
          >
            ⬆ Bulk Upload (Excel)
          </button>
        }
        fields={[
          { key: 'sku', label: 'SKU' },
          { key: 'name', label: 'Product Name', required: true },
          { key: 'category', label: 'Category' },
          { key: 'description', label: 'Description', type: 'textarea' },
          { key: 'hsn_code', label: 'HSN Code' },
          { key: 'unit', label: 'Unit', required: true },
          { key: 'unit_price', label: 'Unit Price', type: 'number', step: '0.01' },
          {
            key: 'currency',
            label: 'Currency',
            type: 'select',
            options: ['USD', 'EUR', 'GBP', 'INR'].map((c) => ({ value: c, label: c })),
          },
          { key: 'stock_qty', label: 'Stock Qty', type: 'number', step: '0.01' },
          { key: 'image_url', label: 'Image URL' },
          { key: 'weight_kg', label: 'Weight per Unit (kg)', type: 'number', step: '0.001' },
          {
            key: 'material_type',
            label: 'Raw Material Type (matches a Raw Material category, e.g. Aluminum / Iron / Resin)',
          },
          {
            key: 'labour_cost_category',
            label: 'Labour Cost Category',
            type: 'select',
            options: ['INHOUSE', 'POLISH ITEM', 'OUTSOURCED'].map((category) => ({
              value: category,
              label: category,
            })),
          },
          { key: 'finish_type', label: 'Finish Type' },
          { key: 'finishing_cost', label: 'Finish Cost', type: 'number', step: '0.01' },
          { key: 'packaging_type', label: 'Packaging Type' },
          { key: 'packaging_cost', label: 'Packaging Cost', type: 'number', step: '0.01' },
          { key: 'box_dimension', label: 'Box Dimension' },
          { key: 'box_weight', label: 'Box Weight (kg)', type: 'number', step: '0.001' },
          {
            key: 'units_per_carton',
            label: 'Master Carton Packing (PCS per CTN)',
            type: 'number',
            step: '1',
            hint: 'e.g. 1 CTN = 10 PCS → enter 10. Leave as 1 for 1 CTN = 1 PCS.',
          },
          {
            key: 'customer_id',
            label: 'Buyer (leave blank for a shared/generic catalog item)',
            type: 'select',
            options: customers.map((c) => ({ value: c.id, label: `${c.name} (${c.company || ''})` })),
            // Buyer's own preferred currency drives this product's price currency.
            onChange: (value, nextForm, setForm) => {
              const buyer = customers.find((c) => String(c.id) === value);
              if (buyer?.currency) setForm({ ...nextForm, currency: buyer.currency });
            },
          },
        ]}
        columns={[
          { key: 'sku', label: 'SKU' },
          { key: 'name', label: 'Name' },
          { key: 'category', label: 'Category' },
          { key: 'hsn_code', label: 'HSN Code' },
          { key: 'material_type', label: 'Material' },
          { key: 'finish_type', label: 'Finish Type' },
          { key: 'packaging_type', label: 'Packaging Type' },
          { key: 'stock_qty', label: 'Stock', numeric: true, render: (r) => `${r.stock_qty} ${r.unit}` },
          { key: 'customer_name', label: 'Buyer', render: (r) => r.customer_name || '— Shared —' },
          { key: 'unit_price', label: 'Price', numeric: true, render: (r) => r.unit_price },
          { key: 'weight_kg', label: 'Weight (kg)', numeric: true },
          { key: 'finishing_cost', label: 'Finish Cost', numeric: true },
          { key: 'packaging_cost', label: 'Packaging Cost', numeric: true },
          { key: 'box_dimension', label: 'Box Dimension', alignRight: true },
          { key: 'box_weight', label: 'Box Weight (kg)', numeric: true },
          { key: 'units_per_carton', label: 'PCS/CTN (Master Box)', numeric: true },
        ]}
        extraActions={(row) => (
          <>
            <button onClick={() => setBomProductId(row.id)} className="text-indigo-600 hover:underline text-xs font-medium">
              BOM
            </button>
            <button onClick={() => setCostSheetProductId(row.id)} className="text-emerald-600 hover:underline text-xs font-medium">
              Cost Sheet
            </button>
          </>
        )}
      />
      {bomProductId && <BomManager productId={bomProductId} onClose={() => setBomProductId(null)} />}
      {costSheetProductId && (
        <CostSheetModal productId={costSheetProductId} onClose={() => setCostSheetProductId(null)} />
      )}
      {bulkUploadOpen && (
        <BulkUploadModal
          onClose={() => setBulkUploadOpen(false)}
          onDone={() => setRefreshToken((t) => t + 1)}
        />
      )}
    </>
  );
}
