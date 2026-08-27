// Automatically completes a Customer PO once it's fully allocated, invoiced, and paid - so the
// buyer's commitment reflects real fulfillment without requiring anyone to remember to close it.
// Never auto-reopens a PO (status changes backward are a deliberate manual action only).
import db from '../db.js';
import { computePiProfitability } from './piProfitability.js';

export function maybeAutoCompleteCustomerPo(poId) {
  if (!poId) return;
  const po = db.prepare('SELECT * FROM customer_purchase_orders WHERE id = ?').get(poId);
  if (!po || po.status === 'completed' || po.status === 'cancelled') return;

  const items = db
    .prepare(
      `SELECT cpoi.qty,
              COALESCE((
                SELECT SUM(pii.qty) FROM proforma_invoice_items pii
                JOIN proforma_invoices pi ON pi.id = pii.proforma_invoice_id
                WHERE pii.customer_po_item_id = cpoi.id AND pi.status != 'cancelled'
              ), 0) as allocated_qty
       FROM customer_purchase_order_items cpoi WHERE cpoi.customer_po_id = ?`
    )
    .all(poId);
  if (items.length === 0 || items.some((i) => i.allocated_qty < i.qty)) return; // not fully allocated yet

  const pis = db
    .prepare("SELECT id, status FROM proforma_invoices WHERE customer_po_id = ? AND status != 'cancelled'")
    .all(poId);
  if (pis.length === 0 || pis.some((pi) => pi.status !== 'accepted')) return; // still draft/sent

  const { byProformaInvoice } = computePiProfitability({ piIds: pis.map((pi) => pi.id) });
  const fullyPaid =
    byProformaInvoice.length === pis.length &&
    byProformaInvoice.every((pi) => pi.invoiced_amount > 0 && pi.receivable_amount <= 0.01);
  if (!fullyPaid) return;

  db.prepare("UPDATE customer_purchase_orders SET status = 'completed' WHERE id = ?").run(poId);
}

// A commercial invoice can cover several PIs (and therefore several Customer POs) at once.
export function maybeAutoCompleteCustomerPosForInvoice(invoiceId) {
  const poIds = db
    .prepare(
      `SELECT DISTINCT pi.customer_po_id FROM invoice_proforma_invoices ipi
       JOIN proforma_invoices pi ON pi.id = ipi.proforma_invoice_id
       WHERE ipi.invoice_id = ? AND pi.customer_po_id IS NOT NULL`
    )
    .all(invoiceId)
    .map((row) => row.customer_po_id);
  poIds.forEach((id) => maybeAutoCompleteCustomerPo(id));
}
