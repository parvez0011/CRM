import { Router } from 'express';
import PDFDocument from 'pdfkit';
import db from '../db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authRequired } from '../middleware/auth.js';
import { nextDocNumber } from '../utils/orderNumber.js';
import { maybeAutoCompleteCustomerPosForInvoice } from '../services/customerPoStatus.js';
import { recordAudit } from '../services/auditLog.js';

const router = Router();

function refreshInvoiceStatus(invoiceId) {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
  if (!invoice) return;
  const paidRow = db.prepare('SELECT COALESCE(SUM(amount), 0) as paid FROM payments WHERE invoice_id = ?').get(invoiceId);
  const paid = paidRow.paid;
  let status = 'unpaid';
  if (paid >= invoice.total_amount && invoice.total_amount > 0) status = 'paid';
  else if (paid > 0) status = 'partial';
  else if (invoice.due_date && new Date(invoice.due_date) < new Date()) status = 'overdue';
  db.prepare('UPDATE invoices SET paid_amount = ?, status = ? WHERE id = ?').run(paid, status, invoiceId);
}

router.get(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    const { status, customer_id, container_id } = req.query;
    let sql = `SELECT i.*, c.name as customer_name, c.company as customer_company, ct.container_no,
              COALESCE(direct_pi.pi_no, pi.pi_no) as pi_no
               FROM invoices i JOIN customers c ON c.id = i.customer_id
               LEFT JOIN containers ct ON ct.id = i.container_id
           LEFT JOIN proforma_invoices direct_pi ON direct_pi.id = i.proforma_invoice_id
               LEFT JOIN proforma_invoices pi ON pi.sales_order_id = i.sales_order_id WHERE 1=1`;
    const params = [];
    if (status) {
      sql += ' AND i.status = ?';
      params.push(status);
    }
    if (customer_id) {
      sql += ' AND i.customer_id = ?';
      params.push(customer_id);
    }
    if (container_id) {
      sql += ' AND i.container_id = ?';
      params.push(container_id);
    }
    sql += ' ORDER BY i.id DESC';
    res.json(db.prepare(sql).all(...params));
  })
);

router.get(
  '/:id/freight-pdf',
  authRequired,
  asyncHandler(async (req, res) => {
    const invoice = db
      .prepare(
        `SELECT i.*, c.name as customer_name, c.company as customer_company, c.address as customer_address,
                c.country as customer_country, c.email as customer_email, pi.pi_no, cpo.po_no as customer_po_no
         FROM invoices i
         JOIN customers c ON c.id = i.customer_id
         LEFT JOIN proforma_invoices pi ON pi.id = i.proforma_invoice_id
         LEFT JOIN customer_purchase_orders cpo ON cpo.id = i.customer_po_id
         WHERE i.id = ? AND i.invoice_type = 'freight'`
      )
      .get(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Freight invoice not found' });
    const company = db.prepare('SELECT * FROM company_settings WHERE id = 1').get() || {};

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Freight Invoice - ${invoice.invoice_no}.pdf"`);
    const document = new PDFDocument({ size: 'A4', margin: 44 });
    document.pipe(res);

    document.fontSize(17).font('Helvetica-Bold').text(company.company_name || 'Akbar Handicrafts');
    document.fontSize(9).font('Helvetica').fillColor('#57534e');
    document.text([company.address, company.city, company.country].filter(Boolean).join(', '));
    document.text([company.email, company.phone].filter(Boolean).join(' | '));
    document.moveUp(3).fontSize(20).font('Helvetica-Bold').fillColor('#a16207').text('FREIGHT INVOICE', { align: 'right' });
    document.fontSize(10).font('Helvetica').fillColor('#292524');
    document.text(`Invoice No: ${invoice.invoice_no}`, { align: 'right' });
    document.text(`Invoice Date: ${invoice.invoice_date || '-'}`, { align: 'right' });
    document.text(`Due Date: ${invoice.due_date || '-'}`, { align: 'right' });
    document.moveDown(2);
    document.moveTo(44, document.y).lineTo(551, document.y).strokeColor('#a8a29e').stroke();
    document.moveDown();

    const detailTop = document.y;
    document.font('Helvetica-Bold').text('BILL TO', 44, detailTop);
    document.font('Helvetica').text(invoice.customer_name, 44);
    if (invoice.customer_company) document.text(invoice.customer_company, 44);
    if (invoice.customer_address) document.text(invoice.customer_address, 44, document.y, { width: 235 });
    if (invoice.customer_country) document.text(invoice.customer_country, 44);
    if (invoice.customer_email) document.text(invoice.customer_email, 44);
    document.font('Helvetica-Bold').text('REFERENCES', 330, detailTop);
    document.font('Helvetica').text(`Customer PO: ${invoice.customer_po_no || '-'}`, 330);
    document.text(`Proforma Invoice: ${invoice.pi_no || '-'}`, 330);
    document.text(`Payment Status: ${invoice.status === 'paid' ? 'PAID' : 'UNPAID'}`, 330);
        if (invoice.payment_transaction_number) {
          document.text(`Transaction No: ${invoice.payment_transaction_number}`, 330);
        }
    document.y = Math.max(document.y, detailTop + 110);

    document.rect(44, document.y, 507, 24).fill('#f5f5f4');
    document.fillColor('#292524').font('Helvetica-Bold').text('Description', 54, document.y + 7);
    document.text('Amount', 430, document.y, { width: 110, align: 'right' });
    document.moveDown(1.8);
    const lineTop = document.y;
    document.font('Helvetica').text(invoice.notes || `Freight charges against ${invoice.pi_no || 'Proforma Invoice'}`, 54, lineTop, { width: 350 });
    document.text(`${invoice.currency} ${Number(invoice.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 430, lineTop, { width: 110, align: 'right' });
    document.y = lineTop + 46;
    document.moveTo(44, document.y).lineTo(551, document.y).strokeColor('#d6d3d1').stroke();
    document.moveDown();
    document.font('Helvetica-Bold').fontSize(13).text(
      `TOTAL: ${invoice.currency} ${Number(invoice.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      { align: 'right' }
    );
    document.moveDown(2);
    document.fontSize(9).font('Helvetica-Bold').text('BANK DETAILS');
    document.font('Helvetica').text([
      company.bank_account_name && `Beneficiary: ${company.bank_account_name}`,
      company.bank_name && `Bank: ${company.bank_name}`,
      company.bank_account_no && `A/C No: ${company.bank_account_no}`,
      company.bank_ifsc && `IFSC: ${company.bank_ifsc}`,
      company.bank_swift && `SWIFT: ${company.bank_swift}`,
      company.bank_address && `Bank Address: ${company.bank_address}`,
    ].filter(Boolean).join('\n'));
    document.moveDown(4);
    document.font('Helvetica').text(`For ${company.company_name || 'Akbar Handicrafts'}`, { align: 'right' });
    document.moveDown(2).font('Helvetica-Bold').text(company.authorized_signatory || 'Authorized Signatory', { align: 'right' });
    document.font('Helvetica').text('Authorized Signatory', { align: 'right' });
    document.end();
  })
);

router.get(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const invoice = db
      .prepare(
        `SELECT i.*, c.name as customer_name, c.company as customer_company, c.address as customer_address,
          c.country as customer_country, c.email as customer_email, so.order_no as sales_order_no,
          ct.container_no, COALESCE(direct_pi.pi_no, pi.pi_no) as pi_no, cpo.po_no as customer_po_no
         FROM invoices i JOIN customers c ON c.id = i.customer_id
         LEFT JOIN sales_orders so ON so.id = i.sales_order_id
         LEFT JOIN containers ct ON ct.id = i.container_id
                LEFT JOIN proforma_invoices direct_pi ON direct_pi.id = i.proforma_invoice_id
         LEFT JOIN customer_purchase_orders cpo ON cpo.id = i.customer_po_id
         LEFT JOIN proforma_invoices pi ON pi.sales_order_id = i.sales_order_id WHERE i.id = ?`
      )
      .get(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    const payments = db.prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY payment_date DESC').all(req.params.id);
    let items = db
      .prepare(
        `SELECT ii.*, p.name as product_name, p.sku
         FROM invoice_items ii LEFT JOIN products p ON p.id = ii.product_id WHERE ii.invoice_id = ?`
      )
      .all(req.params.id);
    if (items.length === 0 && invoice.sales_order_id) {
      items = db
        .prepare(
          `SELECT soi.*, p.name as product_name, p.sku
           FROM sales_order_items soi JOIN products p ON p.id = soi.product_id WHERE soi.sales_order_id = ?`
        )
        .all(invoice.sales_order_id);
    }
    res.json({ ...invoice, payments, items });
  })
);

router.post(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    const { sales_order_id, customer_id, invoice_date, due_date, currency, total_amount, notes } = req.body;
    if (!customer_id || total_amount === undefined) {
      return res.status(400).json({ error: 'customer_id and total_amount are required' });
    }
    const invoiceNo = nextDocNumber(db, 'invoices', 'invoice_no', 'INV');
    const info = db
      .prepare(
        `INSERT INTO invoices (invoice_no, sales_order_id, customer_id, invoice_date, due_date, currency, total_amount, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(invoiceNo, sales_order_id || null, customer_id, invoice_date || null, due_date || null, currency || 'USD', total_amount, notes || null);
    res.status(201).json(db.prepare('SELECT * FROM invoices WHERE id = ?').get(info.lastInsertRowid));
  })
);

router.put(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Invoice not found' });
    const { invoice_date, due_date, currency, total_amount, notes } = req.body;
    db.prepare('UPDATE invoices SET invoice_date = ?, due_date = ?, currency = ?, total_amount = ?, notes = ? WHERE id = ?').run(
      invoice_date ?? existing.invoice_date,
      due_date ?? existing.due_date,
      currency ?? existing.currency,
      total_amount ?? existing.total_amount,
      notes ?? existing.notes,
      req.params.id
    );
    refreshInvoiceStatus(req.params.id);
    maybeAutoCompleteCustomerPosForInvoice(Number(req.params.id));
    res.json(db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id));
  })
);

router.delete(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Invoice not found' });
    db.prepare('DELETE FROM invoices WHERE id = ?').run(req.params.id);
    res.status(204).end();
  })
);

// Record a payment against an invoice
router.post(
  '/:id/payments',
  authRequired,
  asyncHandler(async (req, res) => {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    const { amount, payment_date, method, reference, notes } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'amount must be a positive number' });
    if (!String(reference || '').trim()) return res.status(400).json({ error: 'Transaction number is required' });
    db.prepare(
      `INSERT INTO payments (invoice_id, amount, payment_date, method, reference, notes)
       VALUES (?, ?, COALESCE(?, date('now')), ?, ?, ?)`
    ).run(req.params.id, amount, payment_date || null, method || null, reference || null, notes || null);
    refreshInvoiceStatus(req.params.id);
    maybeAutoCompleteCustomerPosForInvoice(Number(req.params.id));
    recordAudit(req, {
      entity_type: 'invoice',
      entity_id: Number(req.params.id),
      action: 'payment_recorded',
      after: { amount, method, reference },
    });
    res.status(201).json(db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id));
  })
);

export default router;
