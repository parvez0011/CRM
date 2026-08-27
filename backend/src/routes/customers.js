import { createCrudRouter } from '../utils/crudFactory.js';

export default createCrudRouter({
  table: 'customers',
  fields: ['name', 'company', 'country', 'email', 'phone', 'address', 'tax_id', 'currency', 'credit_limit', 'notes', 'pi_item_format'],
  searchFields: ['name', 'company', 'country', 'email'],
  // Order matters: deepest children first so parent deletes below don't hit FK blocks.
  references: [
    {
      label: 'Shipment(s)',
      countSql: 'SELECT COUNT(*) as c FROM shipments WHERE sales_order_id IN (SELECT id FROM sales_orders WHERE customer_id = ?)',
      deleteSql: 'DELETE FROM shipments WHERE sales_order_id IN (SELECT id FROM sales_orders WHERE customer_id = ?)',
    },
    // payments/proforma_invoice_items/sales_order_items/container_orders cascade automatically.
    { table: 'invoices', column: 'customer_id', label: 'Invoice(s)' },
    { table: 'proforma_invoices', column: 'customer_id', label: 'Proforma Invoice(s)' },
    { table: 'sales_orders', column: 'customer_id', label: 'Sales Order(s)' },
  ],
});
