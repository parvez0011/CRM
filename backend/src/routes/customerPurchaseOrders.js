import { Router } from 'express';
import db from '../db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authRequired } from '../middleware/auth.js';
import { nextDocNumber, runInTransaction } from '../utils/orderNumber.js';
import { computePiProfitability } from '../services/piProfitability.js';
import { parseClientPoFile } from '../services/clientPoParser.js';
import { handlePoFileUpload } from '../utils/poUpload.js';
import { maybeAutoCompleteCustomerPo } from '../services/customerPoStatus.js';
import { recordAudit } from '../services/auditLog.js';

const router = Router();
const STATUSES = ['draft', 'received', 'under_review', 'approved', 'in_progress', 'completed', 'cancelled'];
const headerFields = [
  'customer_id', 'po_date', 'delivery_date', 'currency', 'payment_terms', 'incoterm',
  'destination', 'port_of_loading', 'buyer_reference', 'salesperson', 'notes',
];

function getItemsWithAllocation(customerPoId) {
  return db
    .prepare(
      `SELECT cpoi.*, p.name as product_name, p.sku,
              COALESCE((
                SELECT SUM(pii.qty) FROM proforma_invoice_items pii
                JOIN proforma_invoices pi ON pi.id = pii.proforma_invoice_id
                WHERE pii.customer_po_item_id = cpoi.id AND pi.status != 'cancelled'
              ), 0) as allocated_qty
       FROM customer_purchase_order_items cpoi
       JOIN products p ON p.id = cpoi.product_id
       WHERE cpoi.customer_po_id = ?`
    )
    .all(customerPoId)
    .map((item) => ({ ...item, remaining_qty: item.qty - item.allocated_qty }));
}

function getTotals(items) {
  return items.reduce(
    (acc, item) => {
      acc.total_qty += item.qty;
      acc.total_value += item.qty * item.rate;
      acc.allocated_value += item.allocated_qty * item.rate;
      return acc;
    },
    { total_qty: 0, total_value: 0, allocated_value: 0 }
  );
}

// Parses a buyer's own purchase order (Excel or PDF) and matches each line to a catalog product,
// so it can be turned directly into a Customer PO with the same products, quantities and prices.
router.post(
  '/parse-po',
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
    const { customer_id, status } = req.query;
    let sql = `SELECT cpo.*, c.name as customer_name, c.company as customer_company
               FROM customer_purchase_orders cpo JOIN customers c ON c.id = cpo.customer_id WHERE 1=1`;
    const params = [];
    if (customer_id) {
      sql += ' AND cpo.customer_id = ?';
      params.push(customer_id);
    }
    if (status) {
      sql += ' AND cpo.status = ?';
      params.push(status);
    }
    sql += ' ORDER BY cpo.id DESC';
    const orders = db.prepare(sql).all(...params);
    res.json(
      orders.map((o) => {
        const items = getItemsWithAllocation(o.id);
        return { ...o, ...getTotals(items) };
      })
    );
  })
);

router.get(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const order = db
      .prepare(
        `SELECT cpo.*, c.name as customer_name, c.company as customer_company, c.email as customer_email,
                c.currency as customer_currency
         FROM customer_purchase_orders cpo JOIN customers c ON c.id = cpo.customer_id WHERE cpo.id = ?`
      )
      .get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Customer purchase order not found' });
    const items = getItemsWithAllocation(order.id);
    const pis = db
      .prepare(
        `SELECT pi.id, pi.pi_no, pi.status, pi.pi_date, pi.currency
         FROM proforma_invoices pi WHERE pi.customer_po_id = ? ORDER BY pi.id DESC`
      )
      .all(order.id);
    const piProfitability = computePiProfitability({ piIds: pis.map((pi) => pi.id) });
    const piPnlById = new Map(piProfitability.byProformaInvoice.map((pi) => [pi.id, pi]));
    const pisWithPnl = pis.map((pi) => ({ ...pi, pnl: piPnlById.get(pi.id) || null }));
    const freightInvoices = db
      .prepare(
        `SELECT i.id, i.invoice_no, i.proforma_invoice_id, i.invoice_date, i.due_date, i.currency,
                i.total_amount, i.paid_amount, i.status, i.payment_transaction_number, i.notes, pi.pi_no
         FROM invoices i
         JOIN proforma_invoices pi ON pi.id = i.proforma_invoice_id
         WHERE i.customer_po_id = ? AND i.invoice_type = 'freight'
         ORDER BY i.id DESC`
      )
      .all(order.id);
    res.json({ ...order, items, ...getTotals(items), proforma_invoices: pisWithPnl, freight_invoices: freightInvoices });
  })
);

router.post(
  '/:id/freight-invoices',
  authRequired,
  asyncHandler(async (req, res) => {
    const po = db.prepare('SELECT * FROM customer_purchase_orders WHERE id = ?').get(req.params.id);
    if (!po) return res.status(404).json({ error: 'Customer purchase order not found' });

    const pi = db
      .prepare('SELECT * FROM proforma_invoices WHERE id = ? AND customer_po_id = ?')
      .get(req.body.proforma_invoice_id, po.id);
    if (!pi) return res.status(400).json({ error: 'Select a Proforma Invoice linked to this Customer PO' });

    const amount = Number(req.body.total_amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Freight amount must be a positive number' });
    }

    const invoiceNo = nextDocNumber(db, 'invoices', 'invoice_no', 'FRT');
    const paid = req.body.paid === true || req.body.paid === 1;
    const transactionNumber = String(req.body.transaction_number || '').trim();
    if (paid && !transactionNumber) {
      return res.status(400).json({ error: 'Transaction number is required when freight payment is marked paid' });
    }
    const info = db
      .prepare(
        `INSERT INTO invoices
           (invoice_no, customer_id, customer_po_id, proforma_invoice_id, invoice_date, due_date,
            currency, total_amount, paid_amount, status, invoice_type, payment_transaction_number, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'freight', ?, ?)`
      )
      .run(
        invoiceNo,
        po.customer_id,
        po.id,
        pi.id,
        req.body.invoice_date || null,
        req.body.due_date || null,
        req.body.currency || po.currency || 'USD',
        amount,
        paid ? amount : 0,
        paid ? 'paid' : 'unpaid',
        paid ? transactionNumber : null,
        req.body.notes || null
      );
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(info.lastInsertRowid);
    recordAudit(req, { entity_type: 'invoice', entity_id: Number(invoice.id), action: 'freight_invoice_create', after: invoice });
    res.status(201).json(invoice);
  })
);

router.patch(
  '/:id/freight-invoices/:invoiceId/payment-status',
  authRequired,
  asyncHandler(async (req, res) => {
    const invoice = db
      .prepare("SELECT * FROM invoices WHERE id = ? AND customer_po_id = ? AND invoice_type = 'freight'")
      .get(req.params.invoiceId, req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Freight invoice not found for this Customer PO' });

    const paid = req.body.paid === true || req.body.paid === 1;
    const transactionNumber = String(req.body.transaction_number || '').trim();
    if (paid && invoice.status !== 'paid' && !transactionNumber) {
      return res.status(400).json({ error: 'Transaction number is required to mark freight payment as paid' });
    }
    db.prepare('UPDATE invoices SET paid_amount = ?, status = ?, payment_transaction_number = ? WHERE id = ?').run(
      paid ? invoice.total_amount : 0,
      paid ? 'paid' : 'unpaid',
      paid ? transactionNumber || invoice.payment_transaction_number : null,
      invoice.id
    );
    const updated = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoice.id);
    recordAudit(req, {
      entity_type: 'invoice',
      entity_id: Number(invoice.id),
      action: 'freight_payment_status_update',
      before: { paid_amount: invoice.paid_amount, status: invoice.status, transaction_number: invoice.payment_transaction_number },
      after: { paid_amount: updated.paid_amount, status: updated.status, transaction_number: updated.payment_transaction_number },
    });
    res.json(updated);
  })
);

router.post(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    const { customer_id, items, po_no } = req.body;
    if (!customer_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'customer_id and at least one item are required' });
    }
    const poNo = po_no || nextDocNumber(db, 'customer_purchase_orders', 'po_no', 'CPO');
    try {
      const orderId = runInTransaction(db, () => {
        const values = headerFields.map((f) => (req.body[f] === undefined ? null : req.body[f]));
        const info = db
          .prepare(
            `INSERT INTO customer_purchase_orders (po_no, status, ${headerFields.join(', ')})
             VALUES (?, 'draft', ${headerFields.map(() => '?').join(', ')})`
          )
          .run(poNo, ...values);
        const id = info.lastInsertRowid;
        const insertItem = db.prepare(
          'INSERT INTO customer_purchase_order_items (customer_po_id, product_id, description, hsn_code, unit, qty, rate) VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        for (const item of items) {
          insertItem.run(id, item.product_id, item.description || null, item.hsn_code || null, item.unit || null, item.qty, item.rate);
        }
        return id;
      });
      res.status(201).json(db.prepare('SELECT * FROM customer_purchase_orders WHERE id = ?').get(orderId));
      recordAudit(req, { entity_type: 'customer_po', entity_id: orderId, action: 'create', after: req.body });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  })
);

router.put(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM customer_purchase_orders WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Customer purchase order not found' });
    const { items } = req.body;

    // Reducing an item's quantity below what's already allocated to PIs would make the PO
    // understate real commitments - block it instead of silently corrupting allocation.
    if (Array.isArray(items)) {
      const currentItems = getItemsWithAllocation(req.params.id);
      const byId = new Map(currentItems.map((i) => [i.id, i]));
      for (const item of items) {
        if (item.id && byId.has(item.id)) {
          const current = byId.get(item.id);
          if (item.qty < current.allocated_qty) {
            return res.status(400).json({
              error: `Cannot reduce ${current.product_name} quantity below ${current.allocated_qty} - it is already allocated to Proforma Invoices`,
            });
          }
        }
      }
      const removedIds = currentItems.filter((i) => !items.some((it) => it.id === i.id) && i.allocated_qty > 0);
      if (removedIds.length > 0) {
        return res.status(400).json({
          error: `Cannot remove ${removedIds[0].product_name} - it is already allocated to Proforma Invoices`,
        });
      }
    }

    runInTransaction(db, () => {
      const values = headerFields.map((f) => (req.body[f] === undefined ? existing[f] : req.body[f]));
      db.prepare(`UPDATE customer_purchase_orders SET ${headerFields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`).run(
        ...values,
        req.params.id
      );
      if (Array.isArray(items)) {
        const keepIds = items.filter((i) => i.id).map((i) => i.id);
        if (keepIds.length > 0) {
          db.prepare(
            `DELETE FROM customer_purchase_order_items WHERE customer_po_id = ? AND id NOT IN (${keepIds.map(() => '?').join(', ')})`
          ).run(req.params.id, ...keepIds);
        } else {
          db.prepare('DELETE FROM customer_purchase_order_items WHERE customer_po_id = ?').run(req.params.id);
        }
        const insertItem = db.prepare(
          'INSERT INTO customer_purchase_order_items (customer_po_id, product_id, description, hsn_code, unit, qty, rate) VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        const updateItem = db.prepare(
          'UPDATE customer_purchase_order_items SET product_id = ?, description = ?, hsn_code = ?, unit = ?, qty = ?, rate = ? WHERE id = ?'
        );
        for (const item of items) {
          if (item.id) {
            updateItem.run(item.product_id, item.description || null, item.hsn_code || null, item.unit || null, item.qty, item.rate, item.id);
          } else {
            insertItem.run(req.params.id, item.product_id, item.description || null, item.hsn_code || null, item.unit || null, item.qty, item.rate);
          }
        }
      }
    });
    maybeAutoCompleteCustomerPo(Number(req.params.id));
    res.json(db.prepare('SELECT * FROM customer_purchase_orders WHERE id = ?').get(req.params.id));
  })
);

router.patch(
  '/:id/payment-tracking',
  authRequired,
  asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM customer_purchase_orders WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Customer purchase order not found' });

    const total = db
      .prepare('SELECT COALESCE(SUM(qty * rate), 0) as total FROM customer_purchase_order_items WHERE customer_po_id = ?')
      .get(req.params.id).total;
    const advanceAmount = Number(req.body.advance_payment_amount ?? 0);
    if (!Number.isFinite(advanceAmount) || advanceAmount < 0 || advanceAmount > total) {
      return res.status(400).json({ error: `Advance payment must be between 0 and ${total}` });
    }

    const advancePaid = req.body.advance_payment_paid === true || req.body.advance_payment_paid === 1;
    const remainingPaid = req.body.remaining_payment_paid === true || req.body.remaining_payment_paid === 1;
    const advanceTransactionNumber = String(req.body.advance_payment_transaction_number || '').trim();
    const remainingTransactionNumber = String(req.body.remaining_payment_transaction_number || '').trim();
    if (advancePaid && !existing.advance_payment_paid && !advanceTransactionNumber) {
      return res.status(400).json({ error: 'Advance payment transaction number is required to mark it paid' });
    }
    if (remainingPaid && !existing.remaining_payment_paid && !remainingTransactionNumber) {
      return res.status(400).json({ error: 'Remaining payment transaction number is required to mark it paid' });
    }
    db.prepare(
      `UPDATE customer_purchase_orders
       SET advance_payment_amount = ?, advance_payment_paid = ?, advance_payment_transaction_number = ?,
           remaining_payment_paid = ?, remaining_payment_transaction_number = ?
       WHERE id = ?`
    ).run(
      advanceAmount,
      advancePaid ? 1 : 0,
      advancePaid ? advanceTransactionNumber || existing.advance_payment_transaction_number : null,
      remainingPaid ? 1 : 0,
      remainingPaid ? remainingTransactionNumber || existing.remaining_payment_transaction_number : null,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM customer_purchase_orders WHERE id = ?').get(req.params.id);
    recordAudit(req, {
      entity_type: 'customer_po',
      entity_id: Number(req.params.id),
      action: 'payment_tracking_update',
      before: {
        advance_payment_amount: existing.advance_payment_amount,
        advance_payment_paid: existing.advance_payment_paid,
        remaining_payment_paid: existing.remaining_payment_paid,
      },
      after: {
        advance_payment_amount: updated.advance_payment_amount,
        advance_payment_paid: updated.advance_payment_paid,
        remaining_payment_paid: updated.remaining_payment_paid,
      },
    });
    res.json(updated);
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
    const existing = db.prepare('SELECT * FROM customer_purchase_orders WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Customer purchase order not found' });
    db.prepare('UPDATE customer_purchase_orders SET status = ? WHERE id = ?').run(status, req.params.id);
    recordAudit(req, {
      entity_type: 'customer_po',
      entity_id: Number(req.params.id),
      action: 'status_change',
      before: { status: existing.status },
      after: { status },
    });
    res.json(db.prepare('SELECT * FROM customer_purchase_orders WHERE id = ?').get(req.params.id));
  })
);

router.delete(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM customer_purchase_orders WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Customer purchase order not found' });
    const linkedPiCount = db
      .prepare('SELECT COUNT(*) as c FROM proforma_invoices WHERE customer_po_id = ?')
      .get(req.params.id).c;
    if (linkedPiCount > 0) {
      return res.status(409).json({ error: `Cannot delete - ${linkedPiCount} Proforma Invoice(s) reference this PO` });
    }
    db.prepare('DELETE FROM customer_purchase_orders WHERE id = ?').run(req.params.id);
    recordAudit(req, { entity_type: 'customer_po', entity_id: Number(req.params.id), action: 'delete', before: existing });
    res.status(204).end();
  })
);

// One-click PI creation from selected PO items/quantities - no re-entry of customer, product,
// price, or terms. Validates remaining quantity server-side to prevent over-allocation even
// under concurrent requests (re-checked inside the transaction).
router.post(
  '/:id/create-pi',
  authRequired,
  asyncHandler(async (req, res) => {
    const po = db.prepare('SELECT * FROM customer_purchase_orders WHERE id = ?').get(req.params.id);
    if (!po) return res.status(404).json({ error: 'Customer purchase order not found' });
    const { allocations, pi_date, validity_date, incoterm, port_of_loading, port_of_discharge, payment_terms, bank_details, notes } = req.body;
    if (!Array.isArray(allocations) || allocations.length === 0) {
      return res.status(400).json({ error: 'At least one item allocation (customer_po_item_id + qty) is required' });
    }

    try {
      const piId = runInTransaction(db, () => {
        const poItems = getItemsWithAllocation(po.id);
        const poItemsById = new Map(poItems.map((i) => [i.id, i]));
        const piNo = nextDocNumber(db, 'proforma_invoices', 'pi_no', 'PI');
        const piInsert = db
          .prepare(
            `INSERT INTO proforma_invoices
               (pi_no, customer_id, customer_po_id, status, pi_date, validity_date, currency, incoterm,
                port_of_loading, port_of_discharge, payment_terms, bank_details, notes)
             VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            piNo,
            po.customer_id,
            po.id,
            pi_date || null,
            validity_date || null,
            po.currency,
            incoterm || po.incoterm || null,
            port_of_loading || po.port_of_loading || null,
            port_of_discharge || null,
            payment_terms || po.payment_terms || null,
            bank_details || null,
            notes || null
          );
        const piId = piInsert.lastInsertRowid;
        const insertItem = db.prepare(
          `INSERT INTO proforma_invoice_items
             (proforma_invoice_id, product_id, customer_po_item_id, description, hsn_code, qty, unit, rate)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const alloc of allocations) {
          const poItem = poItemsById.get(alloc.customer_po_item_id);
          if (!poItem) throw new Error('One of the selected PO items no longer exists');
          const qty = Number(alloc.qty);
          if (!(qty > 0)) throw new Error(`Quantity for ${poItem.product_name} must be greater than zero`);
          if (qty > poItem.remaining_qty) {
            throw new Error(
              `Cannot allocate ${qty} of ${poItem.product_name} - only ${poItem.remaining_qty} remaining on ${po.po_no}`
            );
          }
          insertItem.run(piId, poItem.product_id, poItem.id, poItem.description, poItem.hsn_code, qty, poItem.unit, poItem.rate);
        }
        if (po.status === 'draft') {
          db.prepare("UPDATE customer_purchase_orders SET status = 'in_progress' WHERE id = ?").run(po.id);
        }
        return piId;
      });
      res.status(201).json(db.prepare('SELECT * FROM proforma_invoices WHERE id = ?').get(piId));
      recordAudit(req, { entity_type: 'customer_po', entity_id: po.id, action: 'create_pi', after: { pi_id: piId, allocations } });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  })
);

export default router;
