// Column-mapping + product-matching helpers for importing a buyer's own purchase order (Excel)
// and converting it into a Proforma Invoice with the same products, quantities and prices.
const COLUMN_ALIASES = {
  sku: ['sku', 'itemcode', 'productcode', 'code', 'style', 'stylenumber', 'itemno', 'itemnumber'],
  name: ['product', 'productname', 'itemdescription', 'description', 'item', 'particulars', 'name', 'goods', 'itemtitle', 'producttitle', 'title'],
  qty: ['qty', 'quantity', 'orderqty', 'orderquantity', 'units', 'ordered', 'orderedqty', 'qtyordered', 'orderedquantity'],
  rate: ['rate', 'price', 'unitprice', 'unitrate', 'unitcost', 'ratepc', 'rateperpc', 'rateperpiece', 'perpiece', 'pcrate'],
};

function normalize(text) {
  return String(text ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function cellText(cell) {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  if (typeof cell === 'object') {
    if (Array.isArray(cell.richText)) return cell.richText.map((part) => part.text).join('').trim();
    if ('result' in cell) return String(cell.result ?? '').trim();
    if ('text' in cell) return String(cell.text).trim();
    return '';
  }
  return String(cell).trim();
}

export function buildClientPoColumnMap(headerRow) {
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

export function isBlankRow(row) {
  return row.every((cell) => cell === null || cell === undefined || String(cell).trim() === '');
}

/** Reads the raw sku/name/qty/rate text out of a spreadsheet row using the resolved column map. */
export function readClientPoRow(row, columnMap) {
  const get = (field) => (columnMap[field] !== undefined ? cellText(row[columnMap[field]]) : '');
  return {
    sku: get('sku'),
    name: get('name'),
    qty: get('qty'),
    rate: get('rate'),
  };
}

/**
 * Attempts to match a client PO line to a catalog product by SKU (exact, case-sensitive first,
 * then case-insensitive if unambiguous) then by name (exact match only, case/whitespace-insensitive).
 * Deliberately does NOT do partial/substring name matching - e.g. "Baby Elephant", "Elephant Trunk
 * up" and "Elephant" are distinct products and must not be silently collapsed into one just because
 * they share a common word. Returns { product, ambiguous } - product is null if no confident match
 * was found, in which case the line is reported as unmatched so it can be reviewed/added manually.
 *
 * When `customerId` is given, matching is scoped to that buyer's own products plus shared/unassigned
 * catalog items (customer_id IS NULL) - since each buyer can have their own private product catalog.
 */
export function matchProduct(db, { sku, name, customerId }) {
  const scopeSql = customerId ? ' AND (customer_id = ? OR customer_id IS NULL)' : '';
  const scopeParams = customerId ? [customerId] : [];

  if (sku) {
    const exactSku = db.prepare(`SELECT * FROM products WHERE sku = ?${scopeSql}`).get(sku, ...scopeParams);
    if (exactSku) return { product: exactSku, ambiguous: false };

    const caseInsensitiveMatches = db
      .prepare(`SELECT * FROM products WHERE LOWER(sku) = LOWER(?)${scopeSql}`)
      .all(sku, ...scopeParams);
    if (caseInsensitiveMatches.length === 1) return { product: caseInsensitiveMatches[0], ambiguous: false };
    if (caseInsensitiveMatches.length > 1) return { product: null, ambiguous: true };
  }
  if (name) {
    const normalizedName = name.trim().replace(/\s+/g, ' ');
    const byExactName = db
      .prepare(`SELECT * FROM products WHERE LOWER(TRIM(name)) = LOWER(?)${scopeSql}`)
      .get(normalizedName, ...scopeParams);
    if (byExactName) return { product: byExactName, ambiguous: false };
  }
  return { product: null, ambiguous: false };
}
