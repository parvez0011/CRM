import { Router } from 'express';
import db from '../db.js';
import { asyncHandler } from './asyncHandler.js';
import { authRequired } from '../middleware/auth.js';
import { runInTransaction } from './orderNumber.js';

// Generic CRUD router factory for simple master-data tables (no line items).
// `references`: rows elsewhere that point at this table's rows and must be reported (or, with
// force=true, cascade-deleted first) since SQLite FK constraints otherwise block the delete.
// Each entry is either { table, column, label } (deletes `table` WHERE column = id), or
// { label, countSql, deleteSql } for indirect (multi-hop) references - both SQL strings take the
// id as their only `?` parameter. List entries in child-to-parent order (deepest first).
export function createCrudRouter({ table, fields, orderBy = 'id DESC', searchFields = [], references = [] }) {
  const router = Router();

  function countReferences(id) {
    return references
      .map((ref) => ({
        label: ref.label,
        count: ref.countSql
          ? db.prepare(ref.countSql).get(id).c
          : db.prepare(`SELECT COUNT(*) as c FROM ${ref.table} WHERE ${ref.column} = ?`).get(id).c,
      }))
      .filter((r) => r.count > 0);
  }

  function cascadeDelete(id) {
    runInTransaction(db, () => {
      for (const ref of references) {
        if (ref.deleteSql) db.prepare(ref.deleteSql).run(id);
        else db.prepare(`DELETE FROM ${ref.table} WHERE ${ref.column} = ?`).run(id);
      }
      db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    });
  }

  router.get(
    '/',
    authRequired,
    asyncHandler(async (req, res) => {
      const { search } = req.query;
      let sql = `SELECT * FROM ${table}`;
      const params = [];
      if (search && searchFields.length) {
        sql += ' WHERE ' + searchFields.map((f) => `${f} LIKE ?`).join(' OR ');
        searchFields.forEach(() => params.push(`%${search}%`));
      }
      sql += ` ORDER BY ${orderBy}`;
      const rows = db.prepare(sql).all(...params);
      res.json(rows);
    })
  );

  router.get(
    '/:id',
    authRequired,
    asyncHandler(async (req, res) => {
      const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
      if (!row) return res.status(404).json({ error: `${table} record not found` });
      res.json(row);
    })
  );

  router.post(
    '/',
    authRequired,
    asyncHandler(async (req, res) => {
      const values = fields.map((f) => (req.body[f] === undefined ? null : req.body[f]));
      const placeholders = fields.map(() => '?').join(', ');
      const sql = `INSERT INTO ${table} (${fields.join(', ')}) VALUES (${placeholders})`;
      try {
        const info = db.prepare(sql).run(...values);
        const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(info.lastInsertRowid);
        res.status(201).json(row);
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    })
  );

  router.put(
    '/:id',
    authRequired,
    asyncHandler(async (req, res) => {
      const existing = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
      if (!existing) return res.status(404).json({ error: `${table} record not found` });
      const values = fields.map((f) => (req.body[f] === undefined ? existing[f] : req.body[f]));
      const setClause = fields.map((f) => `${f} = ?`).join(', ');
      try {
        db.prepare(`UPDATE ${table} SET ${setClause} WHERE id = ?`).run(...values, req.params.id);
        const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
        res.json(row);
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    })
  );

  router.delete(
    '/:id',
    authRequired,
    asyncHandler(async (req, res) => {
      const existing = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
      if (!existing) return res.status(404).json({ error: `${table} record not found` });

      if (req.query.force === 'true') {
        cascadeDelete(req.params.id);
        return res.status(204).end();
      }

      try {
        db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(req.params.id);
        res.status(204).end();
      } catch (err) {
        const refs = countReferences(req.params.id);
        if (refs.length > 0) {
          return res.status(409).json({ error: 'Record is referenced by other data', references: refs });
        }
        res.status(400).json({ error: 'Cannot delete: record is referenced by other data' });
      }
    })
  );

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
        if (!db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(id)) continue;
        if (force) {
          cascadeDelete(id);
          deleted.push(id);
          continue;
        }
        try {
          db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
          deleted.push(id);
        } catch (err) {
          blocked.push({ id, references: countReferences(id) });
        }
      }
      res.json({ deleted, blocked });
    })
  );

  return router;
}
