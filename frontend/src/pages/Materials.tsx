import { useEffect, useState } from 'react';
import { CrudPage } from '../components/CrudPage';
import { api, apiErrorMessage } from '../api/client';
import type { Supplier } from '../types';

export function Materials() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.get('/suppliers').then((res) => {
      setSuppliers(res.data);
      setLoaded(true);
    });
  }, []);

  async function adjustStock(row: any, reload: () => void) {
    const qtyStr = window.prompt(
      `Adjust stock for ${row.name} (current: ${row.stock_qty} ${row.unit}).\nEnter a positive number to add stock, negative to remove:`
    );
    if (qtyStr === null || qtyStr.trim() === '') return;
    const qty = Number(qtyStr);
    if (Number.isNaN(qty)) return alert('Please enter a valid number');
    try {
      await api.post(`/materials/${row.id}/adjust-stock`, { qty, notes: 'Manual adjustment from UI' });
      reload();
    } catch (err) {
      alert(apiErrorMessage(err));
    }
  }

  if (!loaded) return <div className="text-stone-400">Loading...</div>;

  return (
    <CrudPage
      title="Raw Materials"
      endpoint="/materials"
      bulkDelete
      fields={[
        { key: 'name', label: 'Material Name', required: true },
        { key: 'category', label: 'Category' },
        { key: 'unit', label: 'Unit (kg, meter, pcs...)', required: true },
        { key: 'unit_cost', label: 'Unit Cost (INR)', type: 'number', step: '0.01' },
        { key: 'stock_qty', label: 'Current Stock Qty', type: 'number', step: '0.01' },
        { key: 'reorder_level', label: 'Reorder Level', type: 'number', step: '0.01' },
        {
          key: 'supplier_id',
          label: 'Supplier',
          type: 'select',
          options: suppliers.map((s) => ({ value: s.id, label: `${s.name} (${s.company || ''})` })),
        },
      ]}
      columns={[
        { key: 'name', label: 'Material' },
        { key: 'category', label: 'Category' },
        { key: 'unit', label: 'Unit' },
        {
          key: 'stock_qty',
          label: 'Stock',
          render: (r) => (
            <span className={r.stock_qty <= r.reorder_level ? 'font-semibold text-rose-600' : ''}>
              {r.stock_qty} {r.unit}
            </span>
          ),
        },
        { key: 'reorder_level', label: 'Reorder Level' },
        { key: 'unit_cost', label: 'Unit Cost', render: (r) => `₹${r.unit_cost}` },
        { key: 'supplier_name', label: 'Supplier' },
      ]}
      extraActions={(row, reload) => (
        <button
          onClick={() => adjustStock(row, reload)}
          className="text-emerald-600 hover:underline text-xs font-medium"
        >
          Adjust Stock
        </button>
      )}
    />
  );
}
