import { CrudPage } from '../components/CrudPage';

export function Suppliers() {
  return (
    <CrudPage
      title="Suppliers"
      endpoint="/suppliers"
      fields={[
        { key: 'name', label: 'Contact Name', required: true },
        { key: 'company', label: 'Company' },
        { key: 'country', label: 'Country' },
        { key: 'email', label: 'Email', type: 'email' },
        { key: 'phone', label: 'Phone' },
        { key: 'address', label: 'Address', type: 'textarea' },
        { key: 'materials_supplied', label: 'Materials Supplied' },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ]}
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'company', label: 'Company' },
        { key: 'country', label: 'Country' },
        { key: 'materials_supplied', label: 'Materials Supplied' },
        { key: 'phone', label: 'Phone' },
      ]}
    />
  );
}
