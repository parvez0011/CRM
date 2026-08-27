import { useEffect, useState, type FormEvent } from 'react';
import axios from 'axios';
import { api, apiErrorMessage } from '../api/client';
import { Modal } from './Modal';

export interface FieldDef {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'email' | 'textarea' | 'select' | 'password';
  options?: { value: string | number; label: string }[];
  required?: boolean;
  step?: string;
  hideInTable?: boolean;
  /** Small helper text rendered under the input in the create/edit form. */
  hint?: string;
  render?: (row: any) => React.ReactNode;
  /** Right-aligns the column and lets a user click the value to edit it inline in the table. */
  numeric?: boolean;
  /** Right-aligns a (non-numeric) table column without enabling inline number editing. */
  alignRight?: boolean;
  /** Called after this field changes, with the form state already including the new value - lets a
   * field derive/overwrite other fields (e.g. auto-filling currency from a selected buyer). */
  onChange?: (value: string, nextForm: Record<string, any>, setForm: (form: Record<string, any>) => void) => void;
}

export function CrudPage({
  title,
  endpoint,
  fields,
  columns,
  searchable = true,
  extraActions,
  headerActions,
  refreshToken,
  bulkDelete = false,
  extraParams,
}: {
  title: string;
  endpoint: string;
  fields: FieldDef[];
  columns?: FieldDef[];
  searchable?: boolean;
  extraActions?: (row: any, reload: () => void) => React.ReactNode;
  headerActions?: React.ReactNode;
  refreshToken?: number | string;
  /** Extra query params merged into the list request, e.g. { customer_id }. */
  extraParams?: Record<string, any>;
  /** Enables row checkboxes + a "Delete Selected" button, backed by a `POST {endpoint}/bulk-delete` route. */
  bulkDelete?: boolean;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [editingCell, setEditingCell] = useState<{ rowId: number; key: string } | null>(null);
  const [inlineValue, setInlineValue] = useState('');

  const displayColumns = columns || fields.filter((f) => !f.hideInTable);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get(endpoint, { params: { ...(search ? { search } : {}), ...extraParams } });
      setRows(res.data);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, refreshToken, JSON.stringify(extraParams)]);

  function openCreate() {
    setEditing(null);
    const initial: Record<string, any> = {};
    fields.forEach((f) => (initial[f.key] = ''));
    setForm(initial);
    setError('');
    setModalOpen(true);
  }

  function openEdit(row: any) {
    setEditing(row);
    const initial: Record<string, any> = {};
    fields.forEach((f) => (initial[f.key] = row[f.key] ?? ''));
    setForm(initial);
    setError('');
    setModalOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await api.put(`${endpoint}/${editing.id}`, form);
      } else {
        await api.post(endpoint, form);
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row: any) {
    if (!window.confirm(`Delete this record? This cannot be undone.`)) return;
    try {
      await api.delete(`${endpoint}/${row.id}`);
      load();
    } catch (err) {
      const references = axios.isAxiosError(err) ? err.response?.data?.references : undefined;
      if (Array.isArray(references) && references.length > 0) {
        const summary = references.map((r: { label: string; count: number }) => `${r.count} ${r.label}`).join(', ');
        const forceDelete = window.confirm(
          `This record is used in: ${summary}.\n\nDeleting it will PERMANENTLY remove it from those documents too (this changes their totals). Continue?`
        );
        if (!forceDelete) return;
        try {
          await api.delete(`${endpoint}/${row.id}?force=true`);
          load();
        } catch (err2) {
          alert(apiErrorMessage(err2));
        }
        return;
      }
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
    setSelectedIds((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} selected record(s)? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      const res = await api.post(`${endpoint}/bulk-delete`, { ids });
      const blocked = res.data.blocked as { id: number; references: { label: string; count: number }[] }[];
      if (blocked.length > 0) {
        const summary = blocked
          .map((b) => `#${b.id}: ${b.references.map((r) => `${r.count} ${r.label}`).join(', ')}`)
          .join('\n');
        const forceDelete = window.confirm(
          `${blocked.length} of the selected record(s) are used elsewhere:\n${summary}\n\nForce-delete them too? This will PERMANENTLY remove them from those documents (changes their totals).`
        );
        if (forceDelete) {
          await api.post(`${endpoint}/bulk-delete`, { ids: blocked.map((b) => b.id), force: true });
        }
      }
      setSelectedIds(new Set());
      load();
    } catch (err) {
      alert(apiErrorMessage(err));
    } finally {
      setBulkDeleting(false);
    }
  }

  function startInlineEdit(row: any, key: string) {
    setEditingCell({ rowId: row.id, key });
    setInlineValue(String(row[key] ?? ''));
  }

  async function saveInlineEdit(row: any) {
    if (!editingCell) return;
    const { key } = editingCell;
    const newValue = inlineValue;
    setEditingCell(null);
    if (String(row[key] ?? '') === newValue) return;
    const numericValue = newValue === '' ? 0 : Number(newValue);
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, [key]: numericValue } : r)));
    try {
      await api.put(`${endpoint}/${row.id}`, { [key]: newValue });
    } catch (err) {
      alert(apiErrorMessage(err));
      load();
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-stone-800">{title}</h1>
        <div className="flex items-center gap-3">
          {searchable && (
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="rounded border border-stone-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          )}
          {bulkDelete && selectedIds.size > 0 && (
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="rounded border border-rose-300 px-4 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
            >
              {bulkDeleting ? 'Deleting...' : `Delete Selected (${selectedIds.size})`}
            </button>
          )}
          <button
            onClick={openCreate}
            className="rounded bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
          >
            + Add New
          </button>
          {headerActions}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              {bulkDelete && (
                <th className="px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && selectedIds.size === rows.length}
                    onChange={toggleSelectAll}
                  />
                </th>
              )}
              {displayColumns.map((c) => (
                <th key={c.key} className={`px-4 py-3 font-semibold ${c.numeric || c.alignRight ? 'text-right' : ''}`}>
                  {c.label}
                </th>
              ))}
              <th className="px-4 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {loading ? (
              <tr>
                <td colSpan={displayColumns.length + 1 + (bulkDelete ? 1 : 0)} className="px-4 py-6 text-center text-stone-400">
                  Loading...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={displayColumns.length + 1 + (bulkDelete ? 1 : 0)} className="px-4 py-6 text-center text-stone-400">
                  No records found.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-stone-50">
                  {bulkDelete && (
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => toggleSelected(row.id)} />
                    </td>
                  )}
                  {displayColumns.map((c) => (
                    <td key={c.key} className={`px-4 py-3 text-stone-700 ${c.numeric || c.alignRight ? 'text-right' : ''}`}>
                      {c.numeric && editingCell?.rowId === row.id && editingCell?.key === c.key ? (
                        <input
                          type="number"
                          step="any"
                          autoFocus
                          value={inlineValue}
                          onChange={(e) => setInlineValue(e.target.value)}
                          onBlur={() => saveInlineEdit(row)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveInlineEdit(row);
                            if (e.key === 'Escape') setEditingCell(null);
                          }}
                          className="w-24 rounded border border-amber-400 px-1.5 py-0.5 text-right text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                      ) : c.numeric ? (
                        <span
                          onClick={() => startInlineEdit(row, c.key)}
                          className="cursor-pointer underline decoration-dotted decoration-stone-300 hover:decoration-amber-500"
                          title="Click to edit"
                        >
                          {c.render ? c.render(row) : row[c.key]}
                        </span>
                      ) : c.render ? (
                        c.render(row)
                      ) : (
                        row[c.key]
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    {extraActions && extraActions(row, load)}
                    <button onClick={() => openEdit(row)} className="text-sky-600 hover:underline text-xs font-medium">
                      Edit
                    </button>
                    <button onClick={() => handleDelete(row)} className="text-rose-600 hover:underline text-xs font-medium">
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <Modal title={editing ? `Edit ${title}` : `Add ${title}`} onClose={() => setModalOpen(false)}>
          <form onSubmit={handleSubmit} className="space-y-3">
            {error && <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
            {fields.map((f) => (
              <div key={f.key}>
                <label className="mb-1 block text-xs font-medium text-stone-600">
                  {f.label}
                  {f.required && <span className="text-rose-500"> *</span>}
                </label>
                {f.type === 'textarea' ? (
                  <textarea
                    required={f.required}
                    value={form[f.key] ?? ''}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    rows={3}
                  />
                ) : f.type === 'select' ? (
                  <select
                    required={f.required}
                    value={form[f.key] ?? ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      const next = { ...form, [f.key]: value };
                      setForm(next);
                      f.onChange?.(value, next, setForm);
                    }}
                    className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">-- Select --</option>
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={f.type === 'password' ? 'password' : f.type === 'number' ? 'number' : f.type || 'text'}
                    step={f.step}
                    required={f.required}
                    value={form[f.key] ?? ''}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                )}
                {f.hint && <p className="mt-1 text-[11px] text-stone-500">{f.hint}</p>}
              </div>
            ))}
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
