import { Router } from 'express';
import ExcelJS from 'exceljs';
import db from '../db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authRequired } from '../middleware/auth.js';
import { buildColumnMap, parseProductRow, TEMPLATE_HEADERS } from '../utils/productImport.js';
import { handleExcelUpload } from '../utils/excelUpload.js';
import { runInTransaction } from '../utils/orderNumber.js';

const router = Router();
const fields = ['sku', 'name', 'category', 'description', 'hsn_code', 'unit', 'unit_price', 'currency', 'stock_qty', 'image_url', 'weight_kg', 'material_type', 'labour_cost_category', 'finish_type', 'finishing_cost', 'packaging_type', 'packaging_cost', 'box_dimension', 'box_weight', 'units_per_carton', 'customer_id'];

// Tables (besides product_materials, which already cascades) that reference a product and must be
// cleaned up manually on a force delete.
const REFERENCING_TABLES = [
  { table: 'production_orders', label: 'Production Order(s)' },
  { table: 'sales_order_items', label: 'Sales Order line item(s)' },
  { table: 'proforma_invoice_items', label: 'Proforma Invoice line item(s)' },
  { table: 'invoice_items', label: 'Invoice line item(s)' },
];

/** weight_kg/box_weight/finishing_cost/packaging_cost must always be numbers - form inputs may submit them as empty strings. */
function coerceValue(field, value) {
  if (['weight_kg', 'box_weight', 'finishing_cost', 'packaging_cost'].includes(field)) {
    return value === undefined || value === '' ? 0 : Number(value);
  }
  if (field === 'units_per_carton') {
    return value === undefined || value === '' ? 1 : Number(value);
  }
  if (field === 'customer_id') return value === undefined || value === '' ? null : value;
  return value;
}

function getUnitLabourCost(product) {
  return product.labour_cost_mode === 'per_kg'
    ? (product.weight_kg || 0) * (product.labour_cost_per_kg || 0)
    : product.labour_cost || 0;
}

router.get(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    const { search, customer_id, unassigned } = req.query;
    let sql = 'SELECT p.*, c.name as customer_name FROM products p LEFT JOIN customers c ON c.id = p.customer_id WHERE 1=1';
    const params = [];
    if (search) {
      sql += ' AND (p.name LIKE ? OR p.sku LIKE ? OR p.category LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (unassigned === 'true') {
      sql += ' AND p.customer_id IS NULL';
    } else if (customer_id) {
      sql += ' AND p.customer_id = ?';
      params.push(customer_id);
    }
    sql += ' ORDER BY p.id DESC';
    res.json(db.prepare(sql).all(...params));
  })
);

router.get(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Product not found' });
    const bom = db
      .prepare(
        `SELECT pm.id, pm.material_id, pm.qty_required, m.name as material_name, m.unit, m.unit_cost
         FROM product_materials pm JOIN materials m ON m.id = pm.material_id WHERE pm.product_id = ?`
      )
      .all(req.params.id);
    res.json({ ...row, bom });
  })
);

router.post(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    const values = fields.map((f) => coerceValue(f, req.body[f] === undefined ? null : req.body[f]));
    const info = db
      .prepare(`INSERT INTO products (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`)
      .run(...values);
    res.status(201).json(db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid));
  })
);

router.put(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Product not found' });
    const values = fields.map((f) => coerceValue(f, req.body[f] === undefined ? existing[f] : req.body[f]));
    db.prepare(`UPDATE products SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`).run(
      ...values,
      req.params.id
    );
    res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id));
  })
);

router.delete(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Product not found' });

    if (req.query.force === 'true') {
      runInTransaction(db, () => {
        for (const { table } of REFERENCING_TABLES) {
          db.prepare(`DELETE FROM ${table} WHERE product_id = ?`).run(req.params.id);
        }
        db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
      });
      return res.status(204).end();
    }

    try {
      db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
      res.status(204).end();
    } catch (err) {
      const references = REFERENCING_TABLES.map(({ table, label }) => ({
        label,
        count: db.prepare(`SELECT COUNT(*) as c FROM ${table} WHERE product_id = ?`).get(req.params.id).c,
      })).filter((r) => r.count > 0);
      res.status(409).json({
        error: 'Product is referenced by other records',
        references,
      });
    }
  })
);

// Bulk delete: deletes each id, collecting reference conflicts instead of failing the whole batch.
router.post(
  '/bulk-delete',
  authRequired,
  asyncHandler(async (req, res) => {
    const { ids, force } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }
    const deleted = [];
    const blocked = [];
    for (const id of ids) {
      if (!db.prepare('SELECT id FROM products WHERE id = ?').get(id)) continue;
      if (force) {
        runInTransaction(db, () => {
          for (const { table } of REFERENCING_TABLES) {
            db.prepare(`DELETE FROM ${table} WHERE product_id = ?`).run(id);
          }
          db.prepare('DELETE FROM products WHERE id = ?').run(id);
        });
        deleted.push(id);
        continue;
      }
      try {
        db.prepare('DELETE FROM products WHERE id = ?').run(id);
        deleted.push(id);
      } catch (err) {
        const references = REFERENCING_TABLES.map(({ table, label }) => ({
          label,
          count: db.prepare(`SELECT COUNT(*) as c FROM ${table} WHERE product_id = ?`).get(id).c,
        })).filter((r) => r.count > 0);
        blocked.push({ id, references });
      }
    }
    res.json({ deleted, blocked });
  })
);

// Production cost sheet: raw material cost (from BOM) + labour + finishing + packaging.
router.get(
  '/:id/cost-sheet',
  authRequired,
  asyncHandler(async (req, res) => {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const bom = db
      .prepare(
        `SELECT pm.id, pm.material_id, pm.qty_required, m.name as material_name, m.unit, m.unit_cost,
                (pm.qty_required * m.unit_cost) as line_cost
         FROM product_materials pm JOIN materials m ON m.id = pm.material_id WHERE pm.product_id = ?`
      )
      .all(req.params.id);
    const rawMaterialCost = bom.reduce((sum, b) => sum + b.line_cost, 0);
    const unitLabourCost = getUnitLabourCost(product);
    const totalCost = rawMaterialCost + unitLabourCost + product.finishing_cost + product.packaging_cost;
    const margin = product.unit_price - totalCost;
    const marginPercent = product.unit_price > 0 ? (margin / product.unit_price) * 100 : 0;
    res.json({
      product_id: product.id,
      sku: product.sku,
      name: product.name,
      category: product.category,
      unit: product.unit,
      unit_price: product.unit_price,
      currency: product.currency,
      weight_kg: product.weight_kg,
      material_type: product.material_type,
      bom,
      raw_material_cost: rawMaterialCost,
      labour_cost: unitLabourCost,
      labour_cost_fixed: product.labour_cost,
      labour_cost_category: product.labour_cost_category,
      labour_cost_mode: product.labour_cost_mode,
      labour_cost_per_kg: product.labour_cost_per_kg,
      finishing_cost: product.finishing_cost,
      packaging_cost: product.packaging_cost,
      total_cost: totalCost,
      margin,
      margin_percent: marginPercent,
    });
  })
);

router.put(
  '/:id/cost-sheet',
  authRequired,
  asyncHandler(async (req, res) => {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const labourCost = req.body.labour_cost === undefined ? product.labour_cost : Number(req.body.labour_cost);
    const labourCostMode = req.body.labour_cost_mode === undefined ? product.labour_cost_mode : req.body.labour_cost_mode;
    if (!['fixed', 'per_kg'].includes(labourCostMode)) {
      return res.status(400).json({ error: 'Labour cost basis must be fixed or per_kg' });
    }
    const labourCostPerKg = req.body.labour_cost_per_kg === undefined
      ? product.labour_cost_per_kg
      : Number(req.body.labour_cost_per_kg);
    const weightKg = req.body.weight_kg === undefined ? product.weight_kg : Number(req.body.weight_kg);
    const labourCostCategory = req.body.labour_cost_category === undefined
      ? product.labour_cost_category
      : req.body.labour_cost_category || null;
    const finishingCost = req.body.finishing_cost === undefined ? product.finishing_cost : Number(req.body.finishing_cost);
    const packagingCost = req.body.packaging_cost === undefined ? product.packaging_cost : Number(req.body.packaging_cost);
    db.prepare('UPDATE products SET labour_cost = ?, labour_cost_category = ?, labour_cost_mode = ?, labour_cost_per_kg = ?, weight_kg = ?, finishing_cost = ?, packaging_cost = ? WHERE id = ?').run(
      labourCost,
      labourCostCategory,
      labourCostMode,
      labourCostPerKg,
      weightKg,
      finishingCost,
      packagingCost,
      req.params.id
    );
    const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    const bom = db
      .prepare(
        `SELECT pm.id, pm.material_id, pm.qty_required, m.name as material_name, m.unit, m.unit_cost,
                (pm.qty_required * m.unit_cost) as line_cost
         FROM product_materials pm JOIN materials m ON m.id = pm.material_id WHERE pm.product_id = ?`
      )
      .all(req.params.id);
    const rawMaterialCost = bom.reduce((sum, b) => sum + b.line_cost, 0);
    const unitLabourCost = getUnitLabourCost(updated);
    const totalCost = rawMaterialCost + unitLabourCost + updated.finishing_cost + updated.packaging_cost;
    const margin = updated.unit_price - totalCost;
    const marginPercent = updated.unit_price > 0 ? (margin / updated.unit_price) * 100 : 0;
    res.json({
      product_id: updated.id,
      sku: updated.sku,
      name: updated.name,
      category: updated.category,
      unit: updated.unit,
      unit_price: updated.unit_price,
      currency: updated.currency,
      weight_kg: updated.weight_kg,
      material_type: updated.material_type,
      bom,
      raw_material_cost: rawMaterialCost,
      labour_cost: unitLabourCost,
      labour_cost_fixed: updated.labour_cost,
      labour_cost_category: updated.labour_cost_category,
      labour_cost_mode: updated.labour_cost_mode,
      labour_cost_per_kg: updated.labour_cost_per_kg,
      finishing_cost: updated.finishing_cost,
      packaging_cost: updated.packaging_cost,
      total_cost: totalCost,
      margin,
      margin_percent: marginPercent,
    });
  })
);

// Bill of materials management
router.post(
  '/:id/bom',
  authRequired,
  asyncHandler(async (req, res) => {
    const { material_id, qty_required } = req.body;
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const info = db
      .prepare('INSERT INTO product_materials (product_id, material_id, qty_required) VALUES (?, ?, ?)')
      .run(req.params.id, material_id, qty_required);
    res.status(201).json(db.prepare('SELECT * FROM product_materials WHERE id = ?').get(info.lastInsertRowid));
  })
);

router.delete(
  '/bom/:bomId',
  authRequired,
  asyncHandler(async (req, res) => {
    db.prepare('DELETE FROM product_materials WHERE id = ?').run(req.params.bomId);
    res.status(204).end();
  })
);

// Downloadable .xlsx template with the expected column headers and a sample row.
router.get(
  '/bulk-upload/template',
  authRequired,
  asyncHandler(async (req, res) => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Products');
    sheet.addRow(TEMPLATE_HEADERS);
    sheet.getRow(1).font = { bold: true };
    sheet.addRow([
      'AH-BR-005', 'Sample Brass Bowl', 12.5, 'Brass Decor', 'Brass', 0.4, 'Polished', 2,
      'Bubble Wrap Box', 1.5, '20x20x15 cm', 0.6, '',
      'Hand-engraved brass bowl, 8 inch', '7419', 'pcs', 'USD', 100, '',
    ]);
    sheet.columns.forEach((col) => {
      col.width = 22;
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="product_upload_template.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  })
);

// Bulk-create/update products from an uploaded Excel file (matched by SKU when present).
router.post(
  '/bulk-upload',
  authRequired,
  handleExcelUpload,
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(req.file.buffer);
    } catch {
      return res.status(400).json({ error: 'Invalid or corrupted Excel file' });
    }

    const sheet = workbook.worksheets[0];
    if (!sheet) return res.status(400).json({ error: 'The workbook has no worksheets' });

    const headerRow = sheet.getRow(1).values.slice(1); // exceljs rows are 1-indexed and values[0] is empty
    const columnMap = buildColumnMap(headerRow);
    if (columnMap.name === undefined) {
      return res.status(400).json({ error: 'Could not find a "Name" column in the uploaded file. Please use the provided template.' });
    }

    let created = 0;
    let updated = 0;
    const errors = [];
    const insertStmt = db.prepare(`INSERT INTO products (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`);
    const updateStmt = db.prepare(`UPDATE products SET ${fields.filter((f) => f !== 'sku').map((f) => `${f} = ?`).join(', ')} WHERE sku = ?`);
    const findBySku = db.prepare('SELECT id FROM products WHERE sku = ?');
    const findCustomerByName = db.prepare('SELECT id FROM customers WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))');

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber).values.slice(1);
      const isBlank = row.every((cell) => cell === null || cell === undefined || String(cell).trim() === '');
      if (isBlank) continue;

      const { record, errors: rowErrors } = parseProductRow(row, columnMap);
      if (rowErrors.length > 0) {
        errors.push({ row: rowNumber, message: rowErrors.join('; ') });
        continue;
      }
      // Resolve the "Customer" column text to an id - left unassigned (shared catalog item) if blank or unmatched.
      record.customer_id = record.customer_name ? findCustomerByName.get(record.customer_name)?.id ?? null : null;

      try {
        const existing = record.sku ? findBySku.get(record.sku) : undefined;
        if (existing) {
          const updateFields = fields.filter((f) => f !== 'sku');
          updateStmt.run(...updateFields.map((f) => record[f] ?? null), record.sku);
          updated += 1;
        } else {
          insertStmt.run(...fields.map((f) => record[f] ?? null));
          created += 1;
        }
      } catch (err) {
        errors.push({ row: rowNumber, message: err.message });
      }
    }

    res.json({ created, updated, errorCount: errors.length, errors: errors.slice(0, 50) });
  })
);

export default router;
