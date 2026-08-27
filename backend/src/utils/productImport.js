// Column-mapping helpers for bulk product import/export via Excel (.xlsx).
const COLUMN_ALIASES = {
  sku: ['sku'],
  name: ['name', 'productname'],
  category: ['category'],
  description: ['description', 'desc'],
  hsn_code: ['hsncode', 'hsn'],
  unit: ['unit', 'uom'],
  unit_price: ['unitprice', 'price'],
  currency: ['currency'],
  stock_qty: ['stockqty', 'stock', 'quantity', 'qty'],
  image_url: ['imageurl', 'image'],
  material_type: ['material', 'materialtype'],
  weight_kg: ['weight', 'weightkg'],
  finish_type: ['finishtype', 'finish'],
  finishing_cost: ['finishcost', 'finishingcost'],
  packaging_type: ['packagingtype', 'packaging'],
  packaging_cost: ['packagingcost'],
  box_dimension: ['boxdimension', 'boxdimensions'],
  box_weight: ['boxweight', 'boxweightkg'],
  units_per_carton: ['unitspercarton', 'pcspercarton', 'piecespercarton', 'qtypercarton'],
  customer_name: ['customer', 'buyer', 'customername', 'buyername'],
};

export const TEMPLATE_HEADERS = [
  'SKU', 'Name', 'Price', 'Category', 'Material', 'Weight', 'Finish Type', 'Finish Cost',
  'Packaging Type', 'Packaging Cost', 'Box Dimension', 'Box Weight', 'Units Per Carton', 'Customer',
  'Description', 'HSN Code', 'Unit', 'Currency', 'Stock Qty', 'Image URL',
];

function normalize(text) {
  return String(text ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Maps a header row's cell values to { fieldName: columnIndex }. */
export function buildColumnMap(headerRow) {
  const map = {};
  headerRow.forEach((cell, idx) => {
    const normalized = normalize(cell);
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (aliases.includes(normalized) && map[field] === undefined) {
        map[field] = idx;
      }
    }
  });
  return map;
}

function cellText(cell) {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  if (typeof cell === 'object') {
    if (Array.isArray(cell.richText)) return cell.richText.map((part) => part.text).join('').trim(); // rich text
    if ('result' in cell) return String(cell.result ?? '').trim(); // formula
    if ('text' in cell) return String(cell.text).trim();
    return '';
  }
  return String(cell).trim();
}

/** Extracts a single product record from a raw spreadsheet row using the resolved column map. */
export function parseProductRow(row, columnMap) {
  const get = (field) => (columnMap[field] !== undefined ? cellText(row[columnMap[field]]) : '');

  const name = get('name');
  const unit = get('unit') || 'pcs';
  const unitPriceRaw = get('unit_price');
  const stockQtyRaw = get('stock_qty');
  const weightRaw = get('weight_kg');
  const finishingCostRaw = get('finishing_cost');
  const packagingCostRaw = get('packaging_cost');
  const boxWeightRaw = get('box_weight');
  const unitsPerCartonRaw = get('units_per_carton');

  const unitPrice = unitPriceRaw === '' ? 0 : Number(unitPriceRaw);
  const stockQty = stockQtyRaw === '' ? 0 : Number(stockQtyRaw);
  const weightKg = weightRaw === '' ? 0 : Number(weightRaw);
  const finishingCost = finishingCostRaw === '' ? 0 : Number(finishingCostRaw);
  const packagingCost = packagingCostRaw === '' ? 0 : Number(packagingCostRaw);
  const boxWeight = boxWeightRaw === '' ? 0 : Number(boxWeightRaw);
  const unitsPerCarton = unitsPerCartonRaw === '' ? 1 : Number(unitsPerCartonRaw);

  const errors = [];
  if (!name) errors.push('Name is required');
  if (unitPriceRaw !== '' && Number.isNaN(unitPrice)) errors.push('Unit Price must be a number');
  if (stockQtyRaw !== '' && Number.isNaN(stockQty)) errors.push('Stock Qty must be a number');
  if (weightRaw !== '' && Number.isNaN(weightKg)) errors.push('Weight must be a number');
  if (finishingCostRaw !== '' && Number.isNaN(finishingCost)) errors.push('Finish Cost must be a number');
  if (packagingCostRaw !== '' && Number.isNaN(packagingCost)) errors.push('Packaging Cost must be a number');
  if (boxWeightRaw !== '' && Number.isNaN(boxWeight)) errors.push('Box Weight must be a number');
  if (unitsPerCartonRaw !== '' && Number.isNaN(unitsPerCarton)) errors.push('Units Per Carton must be a number');

  return {
    errors,
    record: {
      sku: get('sku') || null,
      name,
      category: get('category') || null,
      description: get('description') || null,
      hsn_code: get('hsn_code') || null,
      unit,
      unit_price: Number.isNaN(unitPrice) ? 0 : unitPrice,
      currency: get('currency') || 'USD',
      stock_qty: Number.isNaN(stockQty) ? 0 : stockQty,
      image_url: get('image_url') || null,
      material_type: get('material_type') || null,
      weight_kg: Number.isNaN(weightKg) ? 0 : weightKg,
      finish_type: get('finish_type') || null,
      finishing_cost: Number.isNaN(finishingCost) ? 0 : finishingCost,
      packaging_type: get('packaging_type') || null,
      packaging_cost: Number.isNaN(packagingCost) ? 0 : packagingCost,
      box_dimension: get('box_dimension') || null,
      box_weight: Number.isNaN(boxWeight) ? 0 : boxWeight,
      units_per_carton: Number.isNaN(unitsPerCarton) || unitsPerCarton <= 0 ? 1 : unitsPerCarton,
      customer_name: get('customer_name') || null,
    },
  };
}
