import { useEffect, useState, type FormEvent } from 'react';
import { api, apiErrorMessage } from '../api/client';
import type { CompanySettings as CompanySettingsType } from '../types';

const FIELD_GROUPS: { title: string; fields: { key: keyof CompanySettingsType; label: string }[] }[] = [
  {
    title: 'Company Details',
    fields: [
      { key: 'company_name', label: 'Company Name' },
      { key: 'address', label: 'Address' },
      { key: 'city', label: 'City / State / PIN' },
      { key: 'country', label: 'Country' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
    ],
  },
  {
    title: 'Statutory Registration (for export documents)',
    fields: [
      { key: 'gstin', label: 'GSTIN' },
      { key: 'iec_code', label: 'IEC Code (Importer Exporter Code)' },
      { key: 'pan', label: 'PAN' },
      { key: 'authorized_signatory', label: 'Authorized Signatory Name' },
    ],
  },
  {
    title: 'Bank Details (shown on Proforma Invoices)',
    fields: [
      { key: 'bank_name', label: 'Bank Name' },
      { key: 'bank_account_name', label: 'Beneficiary / Account Name' },
      { key: 'bank_account_no', label: 'Account Number' },
      { key: 'bank_ifsc', label: 'IFSC Code' },
      { key: 'bank_swift', label: 'SWIFT Code' },
      { key: 'bank_address', label: 'Bank Address' },
    ],
  },
];

export function CompanySettings() {
  const [form, setForm] = useState<Partial<CompanySettingsType>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/company-settings').then((res) => {
      setForm(res.data);
      setLoading(false);
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api.put('/company-settings', form);
      setMessage('Company settings saved.');
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-stone-400">Loading...</div>;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-stone-800">Company Settings</h1>
      <p className="mb-5 text-sm text-stone-500">
        These details appear on Proforma Invoices and other export documents.
      </p>

      <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
        {message && <div className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div>}
        {error && <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

        {FIELD_GROUPS.map((group) => (
          <div key={group.title} className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-stone-700">{group.title}</h2>
            <div className="grid grid-cols-2 gap-3">
              {group.fields.map((f) => (
                <div key={f.key}>
                  <label className="mb-1 block text-xs font-medium text-stone-600">{f.label}</label>
                  <input
                    value={(form[f.key] as string) || ''}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    className="w-full rounded border border-stone-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        <button
          type="submit"
          disabled={saving}
          className="rounded bg-amber-600 px-5 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </form>
    </div>
  );
}
