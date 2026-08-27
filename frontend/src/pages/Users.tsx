import { CrudPage } from '../components/CrudPage';

export function Users() {
  return (
    <CrudPage
      title="Users"
      endpoint="/users"
      fields={[
        { key: 'name', label: 'Full Name', required: true },
        { key: 'email', label: 'Email', type: 'email', required: true },
        { key: 'password', label: 'Password (leave blank to keep unchanged when editing)', type: 'password' },
        {
          key: 'role',
          label: 'Role',
          type: 'select',
          options: [
            { value: 'admin', label: 'Admin' },
            { value: 'manager', label: 'Manager' },
            { value: 'staff', label: 'Staff' },
          ],
          required: true,
        },
      ]}
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'email', label: 'Email' },
        { key: 'role', label: 'Role' },
        { key: 'is_active', label: 'Active', render: (r) => (r.is_active ? 'Yes' : 'No') },
      ]}
      searchable={false}
    />
  );
}
