import { Router } from 'express';
import db from '../db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authRequired } from '../middleware/auth.js';
import { computePiProfitability } from '../services/piProfitability.js';

const router = Router();

router.get(
  '/summary',
  authRequired,
  asyncHandler(async (req, res) => {
    const totalCustomers = db.prepare('SELECT COUNT(*) as c FROM customers').get().c;
    const totalSuppliers = db.prepare('SELECT COUNT(*) as c FROM suppliers').get().c;
    const totalProducts = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
    const activeProformaInvoices = db
      .prepare("SELECT COUNT(*) as c FROM proforma_invoices WHERE status IN ('sent', 'accepted')")
      .get().c;
    const activeProduction = db
      .prepare("SELECT COUNT(*) as c FROM production_orders WHERE status NOT IN ('completed', 'cancelled')")
      .get().c;
    const pendingShipments = db
      .prepare("SELECT COUNT(*) as c FROM shipments WHERE status NOT IN ('delivered')")
      .get().c;
    const outstandingReceivables = db
      .prepare("SELECT COALESCE(SUM(total_amount - paid_amount), 0) as amt FROM invoices WHERE status != 'paid'")
      .get().amt;
    const lowStockMaterials = db
      .prepare(
        `SELECT id, name, unit,
                COALESCE(CAST(NULLIF(stock_qty, '') AS REAL), 0) as stock_qty,
                CAST(NULLIF(reorder_level, '') AS REAL) as reorder_level
         FROM materials
         WHERE CAST(NULLIF(reorder_level, '') AS REAL) > 0
           AND COALESCE(CAST(NULLIF(stock_qty, '') AS REAL), 0) <= CAST(NULLIF(reorder_level, '') AS REAL)`
      )
      .all();

    const proformaInvoicesByStatus = db
      .prepare('SELECT status, COUNT(*) as count FROM proforma_invoices GROUP BY status')
      .all();
    const productionByStage = db
      .prepare("SELECT stage, COUNT(*) as count FROM production_orders WHERE status != 'cancelled' GROUP BY stage")
      .all();
    const revenueByMonth = db
      .prepare(
        `SELECT strftime('%Y-%m', invoice_date) as month, COALESCE(SUM(total_amount), 0) as total
         FROM invoices WHERE invoice_date IS NOT NULL GROUP BY month ORDER BY month DESC LIMIT 6`
      )
      .all()
      .reverse();
    const topProducts = db
      .prepare(
        `SELECT p.name, SUM(pii.qty) as total_qty
         FROM proforma_invoice_items pii
         JOIN proforma_invoices pi ON pi.id = pii.proforma_invoice_id
         JOIN products p ON p.id = pii.product_id
         WHERE pi.status IN ('sent', 'accepted')
         GROUP BY p.id ORDER BY total_qty DESC LIMIT 5`
      )
      .all();
    const recentProformaInvoices = db
      .prepare(
        `SELECT pi.id, pi.pi_no, pi.status, pi.pi_date, c.name as customer_name,
                COALESCE(SUM(pii.qty * pii.rate), 0) as total_amount, pi.currency
         FROM proforma_invoices pi
         JOIN customers c ON c.id = pi.customer_id
         LEFT JOIN proforma_invoice_items pii ON pii.proforma_invoice_id = pi.id
         GROUP BY pi.id ORDER BY pi.id DESC LIMIT 5`
      )
      .all();

    res.json({
      totals: {
        customers: totalCustomers,
        suppliers: totalSuppliers,
        products: totalProducts,
        activeProformaInvoices,
        activeProduction,
        pendingShipments,
        outstandingReceivables,
      },
      lowStockMaterials,
      proformaInvoicesByStatus,
      productionByStage,
      revenueByMonth,
      topProducts,
      recentProformaInvoices,
    });
  })
);

// PI-led P&L: one row per commercial PI, with manufacturing, allocated same-currency shipping,
// invoicing, and payment collection retained independently of any derived Sales Order.
router.get(
  '/profitability',
  authRequired,
  asyncHandler(async (req, res) => {
    res.json(computePiProfitability());
  })
);

export default router;
