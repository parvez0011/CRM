import { CrudPage } from '../components/CrudPage';

export function Customers() {
  return (
    <CrudPage
      title="Buyers / Customers"
      endpoint="/customers"
      bulkDelete
      fields={[
        { key: 'name', label: 'Contact Name', required: true },
        { key: 'company', label: 'Company' },
        { key: 'country', label: 'Country' },
        { key: 'email', label: 'Email', type: 'email' },
        { key: 'phone', label: 'Phone' },
        { key: 'address', label: 'Address', type: 'textarea' },
        { key: 'tax_id', label: 'Tax / VAT ID' },
        {
          key: 'currency',
          label: 'Preferred Currency',
          type: 'select',
          options: ['USD', 'EUR', 'GBP', 'JPY', 'INR', 'AUD', 'CAD'].map((c) => ({ value: c, label: c })),
        },
        { key: 'credit_limit', label: 'Credit Limit', type: 'number', step: '0.01' },
        {
          key: 'pi_item_format',
          label: 'Proforma Invoice Item Table Format',
          type: 'select',
          options: [
            { value: 'standard', label: 'Standard (Description / HSN / Qty / Unit / Rate / Amount)' },
            { value: 'sku_simple', label: 'Simple (SKU / Item Title / Ordered / Unit Cost / Cost)' },
          ],
          hint: 'Controls the item table column headers shown on this buyer\'s Proforma Invoice document.',
        },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ]}
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'company', label: 'Company' },
        { key: 'country', label: 'Country' },
        { key: 'email', label: 'Email' },
        { key: 'currency', label: 'Currency' },
        { key: 'credit_limit', label: 'Credit Limit', render: (r) => `${r.currency || ''} ${r.credit_limit ?? 0}` },
        { key: 'pi_item_format', label: 'PI Item Format', render: (r) => (r.pi_item_format === 'sku_simple' ? 'Simple (SKU)' : 'Standard') },
      ]}
    />
  );
}
