import { useState } from 'react';
import { api, apiErrorMessage } from '../api/client';
import { Modal } from './Modal';
import { parseNumeric } from '../utils/parseNumeric';
import type { Customer, Product } from '../types';

export interface MatchedPoItem {
  row: number;
  product_id: number;
  product_name: string;
  sku?: string;
  description: string;
  hsn_code?: string;
  unit: string;
  qty: number;
  rate: number;
}

interface UnmatchedPoItem {
  row: number;
  sku?: string;
  name?: string;
  qty?: string;
  rate?: string;
  reason: string;
}

interface UnmatchedDraft extends UnmatchedPoItem {
  draftName: string;
  draftSku: string;
  draftUnit: string;
  draftRate: string;
  adding?: boolean;
  addError?: string;
}

/** Finds a catalog product already matching this SKU or exact name, to avoid creating duplicates. */
function findExistingProduct(list: Product[], sku: string, name: string): Product | undefined {
  const normalizedSku = sku.trim().toLowerCase();
  const normalizedName = name.trim().toLowerCase();
  return list.find(
    (p) =>
      (normalizedSku && p.sku && p.sku.trim().toLowerCase() === normalizedSku) ||
      (normalizedName && p.name.trim().toLowerCase() === normalizedName)
  );
}

/**
 * Generic buyer-PO file import (.xlsx/.xls/.pdf): uploads to `parseEndpoint` for column-mapped
 * SKU/name/qty/rate matching against the product catalog, lets the user review/adjust matched
 * lines and add unmatched lines to the catalog, then hands the final buyer + item list to
 * `onSubmit` so the caller can create whatever document (Proforma Invoice, Customer PO, ...) it
 * needs from the same matched data - the parsing/matching/catalog logic itself is not duplicated
 * per document type.
 */
export function ImportClientPoModal({
  title,
  description,
  submitLabel,
  parseEndpoint,
  customers,
  products,
  onClose,
  onSubmit,
  onCreated,
}: {
  title: string;
  description: string;
  submitLabel: string;
  parseEndpoint: string;
  customers: Customer[];
  products: Product[];
  onClose: () => void;
  onSubmit: (params: { customerId: string; items: MatchedPoItem[] }) => Promise<{ id: number }>;
  onCreated: (id: number) => void;
}) {
  const [customerId, setCustomerId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [bulkAdding, setBulkAdding] = useState(false);
  const [error, setError] = useState('');
  const [processed, setProcessed] = useState(false);
  const [matched, setMatched] = useState<MatchedPoItem[]>([]);
  const [unmatched, setUnmatched] = useState<UnmatchedDraft[]>([]);
  const [skippedNotOrdered, setSkippedNotOrdered] = useState(0);

  async function handleProcess() {
    if (!file) {
      setError('Please choose the client purchase order file (.xlsx, .xls or .pdf).');
      return;
    }
    setProcessing(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (customerId) formData.append('customer_id', customerId);
      const res = await api.post(parseEndpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setMatched(res.data.matched);
      setSkippedNotOrdered(res.data.skippedNotOrdered || 0);
      setUnmatched(
        (res.data.unmatched as UnmatchedPoItem[]).map((u) => {
          const cleanRate = parseNumeric(u.rate);
          return {
            ...u,
            draftName: u.name || '',
            draftSku: u.sku || '',
            draftUnit: 'pcs',
            draftRate: Number.isNaN(cleanRate) ? '' : String(cleanRate),
          };
        })
      );
      setProcessed(true);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setProcessing(false);
    }
  }

  function updateMatched(idx: number, field: 'qty' | 'rate', value: string) {
    const next = [...matched];
    next[idx] = { ...next[idx], [field]: Number(value) };
    setMatched(next);
  }

  function removeMatched(idx: number) {
    setMatched(matched.filter((_, i) => i !== idx));
  }

  function updateUnmatchedDraft(idx: number, field: 'draftName' | 'draftSku' | 'draftUnit' | 'draftRate', value: string) {
    setUnmatched((rows) => rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }

  async function addUnmatchedToCatalog(idx: number) {
    const row = unmatched[idx];
    if (!row.draftName.trim()) {
      setUnmatched((rows) => rows.map((r, i) => (i === idx ? { ...r, addError: 'Product name is required' } : r)));
      return;
    }
    setUnmatched((rows) => rows.map((r, i) => (i === idx ? { ...r, adding: true, addError: '' } : r)));
    try {
      const cleanRate = parseNumeric(row.draftRate);
      const unitPrice = Number.isNaN(cleanRate) ? 0 : cleanRate;
      let product = findExistingProduct(products, row.draftSku, row.draftName);
      if (!product) {
        const res = await api.post('/products', {
          sku: row.draftSku || undefined,
          name: row.draftName.trim(),
          unit: row.draftUnit || 'pcs',
          unit_price: unitPrice,
          currency: 'USD',
          stock_qty: 0,
        });
        product = res.data as Product;
      }
      const cleanQty = parseNumeric(row.qty);
      const qtyNum = Number.isNaN(cleanQty) || cleanQty <= 0 ? 1 : cleanQty;
      const rateToUse = !Number.isNaN(cleanRate) ? cleanRate : product.unit_price;
      setMatched((items) => [
        ...items,
        {
          row: row.row,
          product_id: product.id,
          product_name: product.name,
          sku: product.sku,
          description: row.draftName.trim(),
          hsn_code: product.hsn_code,
          unit: product.unit,
          qty: qtyNum,
          rate: rateToUse,
        },
      ]);
      setUnmatched((rows) => rows.filter((_, i) => i !== idx));
    } catch (err) {
      setUnmatched((rows) => rows.map((r, i) => (i === idx ? { ...r, adding: false, addError: apiErrorMessage(err) } : r)));
    }
  }

  async function addAllUnmatchedToCatalog() {
    setBulkAdding(true);
    const rowsToProcess = unmatched.filter((r) => r.draftName.trim());
    const skipped = unmatched.filter((r) => !r.draftName.trim());
    const newMatched: MatchedPoItem[] = [];
    const failed: UnmatchedDraft[] = [];
    const knownProducts = [...products];
    for (const row of rowsToProcess) {
      try {
        const cleanRate = parseNumeric(row.draftRate);
        const unitPrice = Number.isNaN(cleanRate) ? 0 : cleanRate;
        let product = findExistingProduct(knownProducts, row.draftSku, row.draftName);
        if (!product) {
          const res = await api.post('/products', {
            sku: row.draftSku || undefined,
            name: row.draftName.trim(),
            unit: row.draftUnit || 'pcs',
            unit_price: unitPrice,
            currency: 'USD',
            stock_qty: 0,
          });
          product = res.data as Product;
          knownProducts.push(product);
        }
        const cleanQty = parseNumeric(row.qty);
        const qtyNum = Number.isNaN(cleanQty) || cleanQty <= 0 ? 1 : cleanQty;
        const rateToUse = !Number.isNaN(cleanRate) ? cleanRate : product.unit_price;
        newMatched.push({
          row: row.row,
          product_id: product.id,
          product_name: product.name,
          sku: product.sku,
          description: row.draftName.trim(),
          hsn_code: product.hsn_code,
          unit: product.unit,
          qty: qtyNum,
          rate: rateToUse,
        });
      } catch (err) {
        failed.push({ ...row, addError: apiErrorMessage(err) });
      }
    }
    setMatched((items) => [...items, ...newMatched]);
    setUnmatched([...failed, ...skipped]);
    setBulkAdding(false);
  }

  async function handleCreate() {
    setError('');
    if (!customerId) {
      setError('Please select the buyer this purchase order is from.');
      return;
    }
    if (matched.length === 0) {
      setError('There are no matched line items to create from.');
      return;
    }
    setCreating(true);
    try {
      const result = await onSubmit({ customerId, items: matched });
      onCreated(result.id);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  const total = matched.reduce((sum, m) => sum + m.qty * m.rate, 0);

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-sm text-stone-600">{description}</p>

        {error && <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">Buyer *</label>
            <select
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
            <label className="mb-1 block text-xs font-medium text-stone-600">Client PO File</label>
            <input
              type="file"
              accept=".xlsx,.xls,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleProcess}
          disabled={processing}
          className="rounded bg-stone-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
        >
          {processing ? 'Processing...' : 'Process File'}
        </button>

        {processed && (
          <div className="space-y-3 border-t pt-4">
            {skippedNotOrdered > 0 && (
              <p className="text-xs text-stone-500">
                {skippedNotOrdered} other row(s) with no quantity ordered (blank or 0) were skipped -
                they're just reference pricing, not part of this order.
              </p>
            )}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-stone-700">
                Matched Products ({matched.length})
              </h3>
              {matched.length === 0 ? (
                <p className="text-sm text-stone-400">No lines could be matched to your product catalog.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-stone-400">
                    <tr>
                      <th className="py-1">Product</th>
                      <th className="py-1">SKU</th>
                      <th className="py-1">Qty</th>
                      <th className="py-1">Rate</th>
                      <th className="py-1 text-right">Amount</th>
                      <th className="py-1"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {matched.map((m, idx) => (
                      <tr key={idx}>
                        <td className="py-1.5">
                          {m.description || m.product_name}
                          {m.description && m.description !== m.product_name && (
                            <div className="text-xs text-stone-400">Matched to: {m.product_name}</div>
                          )}
                        </td>
                        <td className="py-1.5">{m.sku}</td>
                        <td className="py-1.5">
                          <input
                            type="number"
                            value={m.qty}
                            onChange={(e) => updateMatched(idx, 'qty', e.target.value)}
                            className="w-20 rounded border border-stone-300 px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="py-1.5">
                          <input
                            type="number"
                            step="0.01"
                            value={m.rate}
                            onChange={(e) => updateMatched(idx, 'rate', e.target.value)}
                            className="w-24 rounded border border-stone-300 px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="py-1.5 text-right">{(m.qty * m.rate).toLocaleString()}</td>
                        <td className="py-1.5 text-right">
                          <button
                            type="button"
                            onClick={() => removeMatched(idx)}
                            className="text-rose-500 hover:text-rose-700"
                          >
                            &times;
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {matched.length > 0 && (
                <div className="mt-2 text-right text-sm font-semibold text-stone-700">
                  Estimated Total: {total.toLocaleString()}
                </div>
              )}
            </div>

            {unmatched.length > 0 && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-rose-700">Could Not Match ({unmatched.length})</h3>
                  <button
                    type="button"
                    onClick={addAllUnmatchedToCatalog}
                    disabled={bulkAdding}
                    className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {bulkAdding ? 'Adding all...' : `+ Add All ${unmatched.length} to Catalog`}
                  </button>
                </div>
                <p className="mb-2 text-xs text-stone-500">
                  These lines from the buyer's PO don't exist in your product catalog yet. Review/adjust
                  the details below and add them to the catalog to include them here.
                </p>
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-stone-400">
                    <tr>
                      <th className="py-1">Name</th>
                      <th className="py-1">SKU</th>
                      <th className="py-1">Unit</th>
                      <th className="py-1">Qty (PO)</th>
                      <th className="py-1">Rate</th>
                      <th className="py-1"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {unmatched.map((u, idx) => (
                      <tr key={idx}>
                        <td className="py-1.5">
                          <input
                            value={u.draftName}
                            onChange={(e) => updateUnmatchedDraft(idx, 'draftName', e.target.value)}
                            className="w-full rounded border border-stone-300 px-2 py-1 text-sm"
                          />
                          <div className="mt-0.5 text-xs text-rose-500">{u.reason}</div>
                        </td>
                        <td className="py-1.5">
                          <input
                            value={u.draftSku}
                            onChange={(e) => updateUnmatchedDraft(idx, 'draftSku', e.target.value)}
                            className="w-24 rounded border border-stone-300 px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="py-1.5">
                          <input
                            value={u.draftUnit}
                            onChange={(e) => updateUnmatchedDraft(idx, 'draftUnit', e.target.value)}
                            className="w-16 rounded border border-stone-300 px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="py-1.5 text-stone-600">{u.qty || '-'}</td>
                        <td className="py-1.5">
                          <input
                            type="number"
                            step="0.01"
                            value={u.draftRate}
                            onChange={(e) => updateUnmatchedDraft(idx, 'draftRate', e.target.value)}
                            className="w-20 rounded border border-stone-300 px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="py-1.5 text-right">
                          <button
                            type="button"
                            onClick={() => addUnmatchedToCatalog(idx)}
                            disabled={u.adding || bulkAdding}
                            className="whitespace-nowrap rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {u.adding ? 'Adding...' : '+ Add to Catalog'}
                          </button>
                          {u.addError && <div className="mt-1 text-xs text-rose-600">{u.addError}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

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
            onClick={handleCreate}
            disabled={creating || matched.length === 0}
            className="rounded bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {creating ? 'Creating...' : submitLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
