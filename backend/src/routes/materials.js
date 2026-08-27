import { Router } from 'express';
import db from '../db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authRequired } from '../middleware/auth.js';
import { runInTransaction } from '../utils/orderNumber.js';

const router = Router();
const fields = ['name', 'category', 'unit', 'unit_cost', 'stock_qty', 'reorder_level', 'supplier_id'];

// Tables (besides product_materials, which already cascades) that reference a material and must be
// cleaned up manually on a force delete.
const REFERENCING_TABLES = [{ table: 'purchase_order_items', label: 'Purchase Order line item(s)' }];

/** supplier_id is a nullable FK - an empty string (from an unselected form dropdown) must become null. */
function coerceValue(field, value) {
  if (field === 'supplier_id') return value === undefined || value === '' ? null : value;
  return value;
}

router.get(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    const { search } = req.query;
    let sql = `SELECT m.*, s.name as supplier_name FROM materials m LEFT JOIN suppliers s ON s.id = m.supplier_id`;
    const params = [];
    if (search) {
      sql += ' WHERE m.name LIKE ? OR m.category LIKE ?';
      params.push(`%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY m.id DESC';
    res.json(db.prepare(sql).all(...params));
  })
);

router.get(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const row = db.prepare('SELECT * FROM materials WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Material not found' });
    res.json(row);
  })
);

router.post(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    const values = fields.map((f) => coerceValue(f, req.body[f] === undefined ? null : req.body[f]));
    const info = db
      .prepare(`INSERT INTO materials (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`)
      .run(...values);
    res.status(201).json(db.prepare('SELECT * FROM materials WHERE id = ?').get(info.lastInsertRowid));
  })
);

router.put(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM materials WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Material not found' });
    const values = fields.map((f) => coerceValue(f, req.body[f] === undefined ? existing[f] : req.body[f]));
    db.prepare(`UPDATE materials SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`).run(
      ...values,
      req.params.id
    );
    res.json(db.prepare('SELECT * FROM materials WHERE id = ?').get(req.params.id));
  })
);

router.delete(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM materials WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Material not found' });

    if (req.query.force === 'true') {
      runInTransaction(db, () => {
        for (const { table } of REFERENCING_TABLES) {
          db.prepare(`DELETE FROM ${table} WHERE material_id = ?`).run(req.params.id);
        }
        db.prepare('DELETE FROM materials WHERE id = ?').run(req.params.id);
      });
      return res.status(204).end();
    }

    try {
      db.prepare('DELETE FROM materials WHERE id = ?').run(req.params.id);
      res.status(204).end();
    } catch (err) {
      const references = REFERENCING_TABLES.map(({ table, label }) => ({
        label,
        count: db.prepare(`SELECT COUNT(*) as c FROM ${table} WHERE material_id = ?`).get(req.params.id).c,
      })).filter((r) => r.count > 0);
      res.status(409).json({
        error: 'Material is referenced by other records',
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
      if (!db.prepare('SELECT id FROM materials WHERE id = ?').get(id)) continue;
      if (force) {
        runInTransaction(db, () => {
          for (const { table } of REFERENCING_TABLES) {
            db.prepare(`DELETE FROM ${table} WHERE material_id = ?`).run(id);
          }
          db.prepare('DELETE FROM materials WHERE id = ?').run(id);
        });
        deleted.push(id);
        continue;
      }
      try {
        db.prepare('DELETE FROM materials WHERE id = ?').run(id);
        deleted.push(id);
      } catch (err) {
        const references = REFERENCING_TABLES.map(({ table, label }) => ({
          label,
          count: db.prepare(`SELECT COUNT(*) as c FROM ${table} WHERE material_id = ?`).get(id).c,
        })).filter((r) => r.count > 0);
        blocked.push({ id, references });
      }
    }
    res.json({ deleted, blocked });
  })
);

// Manual stock adjustment (e.g. physical stock count correction)
router.post(
  '/:id/adjust-stock',
  authRequired,
  asyncHandler(async (req, res) => {
    const { qty, notes } = req.body;
    const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(req.params.id);
    if (!material) return res.status(404).json({ error: 'Material not found' });
    const delta = Number(qty);
    if (Number.isNaN(delta)) return res.status(400).json({ error: 'qty must be a number' });
    db.prepare('UPDATE materials SET stock_qty = stock_qty + ? WHERE id = ?').run(delta, req.params.id);
    db.prepare(
      `INSERT INTO inventory_movements (item_type, item_id, movement_type, qty, ref_type, notes)
       VALUES ('material', ?, ?, ?, 'manual_adjustment', ?)`
    ).run(req.params.id, delta >= 0 ? 'in' : 'out', Math.abs(delta), notes || null);
    res.json(db.prepare('SELECT * FROM materials WHERE id = ?').get(req.params.id));
  })
);

export default router;
