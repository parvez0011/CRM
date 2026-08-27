import { createCrudRouter } from '../utils/crudFactory.js';

export default createCrudRouter({
  table: 'suppliers',
  fields: ['name', 'company', 'country', 'email', 'phone', 'address', 'materials_supplied', 'notes'],
  searchFields: ['name', 'company', 'country', 'email'],
});
