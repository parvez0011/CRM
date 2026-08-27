// Weighted-average inventory costing: every stock movement is recorded (never mutate stock_qty
// directly elsewhere) and a material's unit_cost is always the running weighted-average cost.
import db from '../db.js';

export function receiveMaterialStock(materialId, qty, rate, { refType, refId, notes }) {
  const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(materialId);
  if (!material) throw new Error('Material not found');
  const newStock = material.stock_qty + qty;
  const newAvgCost = newStock > 0 ? (material.stock_qty * material.unit_cost + qty * rate) / newStock : rate;
  db.prepare('UPDATE materials SET stock_qty = ?, unit_cost = ? WHERE id = ?').run(newStock, newAvgCost, materialId);
  db.prepare(
    `INSERT INTO inventory_movements (item_type, item_id, movement_type, qty, unit_cost, ref_type, ref_id, notes)
     VALUES ('material', ?, 'in', ?, ?, ?, ?, ?)`
  ).run(materialId, qty, rate, refType, refId || null, notes || null);
}

// Consumption/issue never changes the weighted-average cost - only receipts do. The movement
// records the material's average cost *at the time of issue* as a costing snapshot.
export function issueMaterialStock(materialId, qty, { refType, refId, notes }) {
  const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(materialId);
  if (!material) throw new Error('Material not found');
  db.prepare('UPDATE materials SET stock_qty = stock_qty - ? WHERE id = ?').run(qty, materialId);
  db.prepare(
    `INSERT INTO inventory_movements (item_type, item_id, movement_type, qty, unit_cost, ref_type, ref_id, notes)
     VALUES ('material', ?, 'out', ?, ?, ?, ?, ?)`
  ).run(materialId, qty, material.unit_cost, refType, refId || null, notes || null);
}
