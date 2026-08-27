import { Router } from 'express';
import db from '../db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authRequired } from '../middleware/auth.js';
import { nextDocNumber, runInTransaction } from '../utils/orderNumber.js';
import { handlePoFileUpload } from '../utils/poUpload.js';
import { parseClientPoFile } from '../services/clientPoParser.js';
import { maybeAutoCompleteCustomerPo } from '../services/customerPoStatus.js';
import { recordAudit } from '../services/auditLog.js';
import { buildPackingListData, buildPackingListWorkbook } from '../services/packingList.js';

const router = Router();
const STATUSES = ['draft', 'sent', 'accepted', 'cancelled'];
const headerFields = [
  'customer_id', 'sales_order_id', 'customer_po_id', 'pi_date', 'validity_date', 'currency', 'incoterm',
  'port_of_loading', 'port_of_discharge', 'country_of_origin', 'final_destination',
  'shipment_mode', 'partial_shipment', 'transshipment', 'payment_terms', 'bank_details', 'notes',
];

// A PI item linked to a Customer PO item must never exceed that PO item's remaining quantity.
// excludePiId lets an edit re-validate its own items without double-counting its prior allocation.
function assertPoAllocation(customerPoItemId, qtyForThisPi, excludePiId) {
  const poItem = db
    .prepare(
      `SELECT cpoi.*, p.name as product_name FROM customer_purchase_order_items cpoi
       JOIN products p ON p.id = cpoi.product_id WHERE cpoi.id = ?`
    )
    .get(customerPoItemId);
  if (!poItem) throw new Error('The linked Customer PO item no longer exists');
  const otherAllocated = db
    .prepare(
      `SELECT COALESCE(SUM(pii.qty), 0) as qty FROM proforma_invoice_items pii
       JOIN proforma_invoices pi ON pi.id = pii.proforma_invoice_id
       WHERE pii.customer_po_item_id = ? AND pi.status != 'cancelled' AND pi.id != ?`
    )
    .get(customerPoItemId, excludePiId || 0).qty;
  if (otherAllocated + qtyForThisPi > poItem.qty) {
    throw new Error(
      `Cannot allocate ${qtyForThisPi} of ${poItem.product_name} - only ${poItem.qty - otherAllocated} remaining on the linked Customer PO`
    );
  }
}

function getTotal(piId) {
  const row = db
    .prepare('SELECT COALESCE(SUM(qty * rate), 0) as total FROM proforma_invoice_items WHERE proforma_invoice_id = ?')
    .get(piId);
  return row.total;
}

// Parses a buyer's own purchase order (Excel or PDF) and matches each line to a catalog product
// so it can be turned straight into a Proforma Invoice with the same products, quantities and prices.
router.post(
  '/parse-client-po',
  authRequired,
  handlePoFileUpload,
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const customerId = req.body.customer_id ? Number(req.body.customer_id) : undefined;
    try {
      const result = await parseClientPoFile(req.file, { customerId });
      res.json(result);
    } catch (err) {
      res.status(err.status || 400).json({ error: err.message });
    }
  })
);

router.get(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    const { status, customer_id } = req.query;
    let sql = `SELECT pi.*, c.name as customer_name, c.company as customer_company, cpo.po_no as customer_po_no
               FROM proforma_invoices pi
               JOIN customers c ON c.id = pi.customer_id
               LEFT JOIN customer_purchase_orders cpo ON cpo.id = pi.customer_po_id
               WHERE 1=1`;
    const params = [];
    if (status) {
      sql += ' AND pi.status = ?';
      params.push(status);
    }
    if (customer_id) {
      sql += ' AND pi.customer_id = ?';
      params.push(customer_id);
    }
    sql += ' ORDER BY pi.id DESC';
    const rows = db.prepare(sql).all(...params);
    res.json(rows.map((r) => ({ ...r, total_amount: getTotal(r.id) })));
  })
);

router.get(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const pi = db
      .prepare(
        `SELECT pi.*, c.name as customer_name, c.company as customer_company, c.email as customer_email,
                c.address as customer_address, c.country as customer_country, c.pi_item_format as customer_pi_item_format,
                so.order_no as sales_order_no,
                cpo.po_no as customer_po_no
         FROM proforma_invoices pi
         JOIN customers c ON c.id = pi.customer_id
         LEFT JOIN sales_orders so ON so.id = pi.sales_order_id
         LEFT JOIN customer_purchase_orders cpo ON cpo.id = pi.customer_po_id
         WHERE pi.id = ?`
      )
      .get(req.params.id);
    if (!pi) return res.status(404).json({ error: 'Proforma invoice not found' });
    const items = db
      .prepare(
        `SELECT pii.*, p.name as product_name, p.sku
         FROM proforma_invoice_items pii JOIN products p ON p.id = pii.product_id WHERE pii.proforma_invoice_id = ?`
      )
      .all(req.params.id);
    const company = db.prepare('SELECT * FROM company_settings WHERE id = 1').get();
    res.json({ ...pi, items, total_amount: items.reduce((s, i) => s + i.qty * i.rate, 0), company });
  })
);

router.get(
  '/:id/manufacturing-cost',
  authRequired,
  asyncHandler(async (req, res) => {
    const pi = db.prepare('SELECT * FROM proforma_invoices WHERE id = ?').get(req.params.id);
    if (!pi) return res.status(404).json({ error: 'Proforma invoice not found' });

    const items = db
      .prepare(
        `SELECT pii.id, pii.qty, pii.rate, pii.description, p.id as product_id, p.name as product_name, p.sku,
                p.weight_kg, p.material_type, p.labour_cost, p.labour_cost_mode, p.labour_cost_per_kg,
                p.finishing_cost, p.packaging_cost
         FROM proforma_invoice_items pii JOIN products p ON p.id = pii.product_id
         WHERE pii.proforma_invoice_id = ?`
      )
      .all(req.params.id);

    // Raw material rates are maintained on the Raw Materials page: rate per KG for materials like
    // Aluminum/Iron, rate per Litre for Resin. A product's material_type (e.g. "Aluminum", "Iron",
    // "Resin") is matched against the raw material's name first (since several metals can share one
    // category like "Metal"), falling back to an exact category match.
    const materials = db.prepare('SELECT name, category, unit, unit_cost FROM materials').all();
    function findMaterial(materialType) {
      const key = materialType.trim().toLowerCase();
      return (
        materials.find((m) => m.name.toLowerCase().includes(key)) ||
        materials.find((m) => (m.category || '').trim().toLowerCase() === key)
      );
    }

    let totalManufacturingCost = 0;
    const breakdown = items.map((item) => {
      const materialType = (item.material_type || '').trim();
      const material = materialType ? findMaterial(materialType) : undefined;
      const rate = material ? material.unit_cost : 0;
      const rawMaterialCost = (item.weight_kg || 0) * rate;
      const labourCost = item.labour_cost_mode === 'per_kg'
        ? (item.weight_kg || 0) * (item.labour_cost_per_kg || 0)
        : item.labour_cost || 0;
      const unitCost = rawMaterialCost + labourCost + (item.finishing_cost || 0) + (item.packaging_cost || 0);
      const lineCost = unitCost * item.qty;
      totalManufacturingCost += lineCost;
      return {
        product_id: item.product_id,
        product_name: item.product_name,
        sku: item.sku,
        qty: item.qty,
        sale_rate: item.rate,
        line_value: item.qty * item.rate,
        material_type: item.material_type || null,
        material_rate: rate,
        material_unit: material ? material.unit : null,
        weight_kg: item.weight_kg || 0,
        raw_material_cost: rawMaterialCost,
        labour_cost: labourCost,
        finishing_cost: item.finishing_cost || 0,
        packaging_cost: item.packaging_cost || 0,
        unit_manufacturing_cost: unitCost,
        line_manufacturing_cost: lineCost,
        missing_rate: Boolean(materialType) && !material,
      };
    });

    const totalValue = items.reduce((sum, i) => sum + i.qty * i.rate, 0);
    res.json({
      pi_id: pi.id,
      pi_no: pi.pi_no,
      currency: pi.currency,
      total_value: totalValue,
      total_manufacturing_cost: totalManufacturingCost,
      estimated_margin: totalValue - totalManufacturingCost,
      estimated_margin_percent: totalValue > 0 ? ((totalValue - totalManufacturingCost) / totalValue) * 100 : 0,
      items: breakdown,
    });
  })
);

router.get(
  '/:id/packing-list',
  authRequired,
  asyncHandler(async (req, res) => {
    const data = buildPackingListData(req.params.id);
    if (!data) return res.status(404).json({ error: 'Proforma invoice not found' });
    res.json(data);
  })
);

// Persists the shipment-specific fields shown on the Packing List (not part of the main PI
// edit form) so the document is stable/reprintable rather than re-entered on every visit.
router.patch(
  '/:id/shipping-details',
  authRequired,
  asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM proforma_invoices WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Proforma invoice not found' });
    const { pre_carriage_by, place_of_receipt, vessel_flight_no, notify_party, packing_list_other_reference } = req.body;
    db.prepare(
      `UPDATE proforma_invoices
       SET pre_carriage_by = ?, place_of_receipt = ?, vessel_flight_no = ?, notify_party = ?, packing_list_other_reference = ?
       WHERE id = ?`
    ).run(
      pre_carriage_by ?? existing.pre_carriage_by,
      place_of_receipt ?? existing.place_of_receipt,
      vessel_flight_no ?? existing.vessel_flight_no,
      notify_party ?? existing.notify_party,
      packing_list_other_reference ?? existing.packing_list_other_reference,
      req.params.id
    );
    res.json(buildPackingListData(req.params.id));
  })
);

router.post(
  '/:id/packing-list/export',
  authRequired,
  asyncHandler(async (req, res) => {
    const data = buildPackingListData(req.params.id);
    if (!data) return res.status(404).json({ error: 'Proforma invoice not found' });
    const workbook = await buildPackingListWorkbook(data, req.body || {});
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Packing List - ${data.pi_no}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  })
);

router.post(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    const { customer_id, items } = req.body;
    if (!customer_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'customer_id and at least one item are required' });
    }
    const piNo = nextDocNumber(db, 'proforma_invoices', 'pi_no', 'PI');
    try {
      const piId = runInTransaction(db, () => {
        const values = headerFields.map((f) => (req.body[f] === undefined ? null : req.body[f]));
        const info = db
          .prepare(
            `INSERT INTO proforma_invoices (pi_no, status, ${headerFields.join(', ')})
             VALUES (?, 'draft', ${headerFields.map(() => '?').join(', ')})`
          )
          .run(piNo, ...values);
        const id = info.lastInsertRowid;
        const insertItem = db.prepare(
          'INSERT INTO proforma_invoice_items (proforma_invoice_id, product_id, customer_po_item_id, description, hsn_code, qty, unit, rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        for (const item of items) {
          if (item.customer_po_item_id) assertPoAllocation(item.customer_po_item_id, item.qty, null);
          insertItem.run(id, item.product_id, item.customer_po_item_id || null, item.description || null, item.hsn_code || null, item.qty, item.unit || null, item.rate);
        }
        return id;
      });
      res.status(201).json(db.prepare('SELECT * FROM proforma_invoices WHERE id = ?').get(piId));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  })
);

router.put(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM proforma_invoices WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Proforma invoice not found' });
    const { items } = req.body;
    try {
      runInTransaction(db, () => {
        const values = headerFields.map((f) => (req.body[f] === undefined ? existing[f] : req.body[f]));
        db.prepare(`UPDATE proforma_invoices SET ${headerFields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`).run(
          ...values,
          req.params.id
        );
        if (Array.isArray(items)) {
          db.prepare('DELETE FROM proforma_invoice_items WHERE proforma_invoice_id = ?').run(req.params.id);
          const insertItem = db.prepare(
            'INSERT INTO proforma_invoice_items (proforma_invoice_id, product_id, customer_po_item_id, description, hsn_code, qty, unit, rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          );
          for (const item of items) {
            if (item.customer_po_item_id) assertPoAllocation(item.customer_po_item_id, item.qty, Number(req.params.id));
            insertItem.run(req.params.id, item.product_id, item.customer_po_item_id || null, item.description || null, item.hsn_code || null, item.qty, item.unit || null, item.rate);
          }
        }
      });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    res.json(db.prepare('SELECT * FROM proforma_invoices WHERE id = ?').get(req.params.id));
  })
);

router.patch(
  '/:id/status',
  authRequired,
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${STATUSES.join(', ')}` });
    }
    const existing = db.prepare('SELECT * FROM proforma_invoices WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Proforma invoice not found' });
    db.prepare('UPDATE proforma_invoices SET status = ? WHERE id = ?').run(status, req.params.id);
    recordAudit(req, {
      entity_type: 'proforma_invoice',
      entity_id: Number(req.params.id),
      action: 'status_change',
      before: { status: existing.status },
      after: { status },
    });
    if (status === 'accepted' && existing.customer_po_id) {
      maybeAutoCompleteCustomerPo(existing.customer_po_id);
    }
    res.json(db.prepare('SELECT * FROM proforma_invoices WHERE id = ?').get(req.params.id));
  })
);

router.delete(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM proforma_invoices WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Proforma invoice not found' });
    db.prepare('DELETE FROM proforma_invoices WHERE id = ?').run(req.params.id);
    recordAudit(req, { entity_type: 'proforma_invoice', entity_id: Number(req.params.id), action: 'delete', before: existing });
    res.status(204).end();
  })
);

// Bulk delete: items/container links cascade automatically, so this always succeeds for existing ids.
router.post(
  '/bulk-delete',
  authRequired,
  asyncHandler(async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }
    const deleted = [];
    for (const id of ids) {
      if (!db.prepare('SELECT id FROM proforma_invoices WHERE id = ?').get(id)) continue;
      db.prepare('DELETE FROM proforma_invoices WHERE id = ?').run(id);
      deleted.push(id);
    }
    res.json({ deleted, blocked: [] });
  })
);

// Convert an accepted proforma invoice into a confirmed export/sales order.
router.post(
  '/:id/convert-to-sales-order',
  authRequired,
  asyncHandler(async (req, res) => {
    const pi = db.prepare('SELECT * FROM proforma_invoices WHERE id = ?').get(req.params.id);
    if (!pi) return res.status(404).json({ error: 'Proforma invoice not found' });
    const items = db.prepare('SELECT * FROM proforma_invoice_items WHERE proforma_invoice_id = ?').all(pi.id);
    if (items.length === 0) return res.status(400).json({ error: 'Proforma invoice has no line items' });

    const orderNo = nextDocNumber(db, 'sales_orders', 'order_no', 'SO');
    const orderId = runInTransaction(db, () => {
      const info = db
        .prepare(
          `INSERT INTO sales_orders (order_no, customer_id, status, order_date, delivery_date, incoterm, currency, port_of_loading, port_of_discharge, notes)
           VALUES (?, ?, 'confirmed', date('now'), ?, ?, ?, ?, ?, ?)`
        )
        .run(orderNo, pi.customer_id, pi.validity_date, pi.incoterm, pi.currency, pi.port_of_loading, pi.port_of_discharge, `Converted from ${pi.pi_no}`);
      const id = info.lastInsertRowid;
      const insertItem = db.prepare('INSERT INTO sales_order_items (sales_order_id, product_id, qty, rate) VALUES (?, ?, ?, ?)');
      for (const item of items) {
        insertItem.run(id, item.product_id, item.qty, item.rate);
      }
      db.prepare("UPDATE proforma_invoices SET status = 'accepted', sales_order_id = ? WHERE id = ?").run(id, pi.id);
      return id;
    });

    recordAudit(req, { entity_type: 'proforma_invoice', entity_id: pi.id, action: 'convert_to_sales_order', after: { sales_order_id: orderId } });
    res.status(201).json(db.prepare('SELECT * FROM sales_orders WHERE id = ?').get(orderId));
  })
);

export default router;
