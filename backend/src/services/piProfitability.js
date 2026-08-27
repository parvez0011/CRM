// Central PI-led profitability calculation: revenue/cost/shipping/invoicing/payment per PI.
// Used by both the management dashboard and the per-Customer-PO Order 360 view so the numbers
// never diverge between screens.
import db from '../db.js';

export function getProductUnitCost(productId) {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!product) return 0;
  const bomCost = db
    .prepare(
      `SELECT COALESCE(SUM(pm.qty_required * m.unit_cost), 0) as c
       FROM product_materials pm JOIN materials m ON m.id = pm.material_id WHERE pm.product_id = ?`
    )
    .get(productId).c;
  const labourCost = product.labour_cost_mode === 'per_kg'
    ? (product.weight_kg || 0) * (product.labour_cost_per_kg || 0)
    : product.labour_cost || 0;
  return bomCost + labourCost + product.finishing_cost + product.packaging_cost;
}

// Computes PI-led P&L for sent/accepted PIs, optionally restricted to a specific set of PI ids
// (e.g. all PIs under one Customer PO for its Order 360 rollup).
export function computePiProfitability({ piIds } = {}) {
  const products = db.prepare('SELECT id, name, sku FROM products').all();
  const costMap = {};
  products.forEach((p) => (costMap[p.id] = getProductUnitCost(p.id)));

  let piRows;
  if (piIds) {
    if (piIds.length === 0) piRows = [];
    else {
      piRows = db
        .prepare(
          `SELECT pi.id, pi.pi_no, pi.pi_date, pi.status, pi.currency, pi.customer_po_id, c.name as customer_name
           FROM proforma_invoices pi JOIN customers c ON c.id = pi.customer_id
           WHERE pi.status IN ('sent', 'accepted') AND pi.id IN (${piIds.map(() => '?').join(', ')})
           ORDER BY pi.pi_date DESC, pi.id DESC`
        )
        .all(...piIds);
    }
  } else {
    piRows = db
      .prepare(
        `SELECT pi.id, pi.pi_no, pi.pi_date, pi.status, pi.currency, pi.customer_po_id, c.name as customer_name
         FROM proforma_invoices pi JOIN customers c ON c.id = pi.customer_id
         WHERE pi.status IN ('sent', 'accepted')
         ORDER BY pi.pi_date DESC, pi.id DESC`
      )
      .all();
  }

  const piPnl = new Map();
  const productProfit = {};
  for (const pi of piRows) {
    const items = db.prepare('SELECT product_id, qty, rate FROM proforma_invoice_items WHERE proforma_invoice_id = ?').all(pi.id);
    let revenue = 0;
    let productCost = 0;
    for (const item of items) {
      const lineRevenue = item.qty * item.rate;
      const lineCost = item.qty * (costMap[item.product_id] || 0);
      revenue += lineRevenue;
      productCost += lineCost;
      if (!productProfit[item.product_id]) productProfit[item.product_id] = { revenue: 0, cost: 0 };
      productProfit[item.product_id].revenue += lineRevenue;
      productProfit[item.product_id].cost += lineCost;
    }
    piPnl.set(pi.id, { ...pi, revenue, product_cost: productCost, shipping_expenses: 0, other_expenses: 0, invoiced_amount: 0, paid_amount: 0 });
  }

  const topProfitableProducts = Object.entries(productProfit)
    .map(([id, v]) => {
      const p = products.find((pr) => pr.id === Number(id));
      const profit = v.revenue - v.cost;
      return {
        product_id: Number(id),
        name: p?.name,
        sku: p?.sku,
        revenue: v.revenue,
        cost: v.cost,
        profit,
        margin_percent: v.revenue > 0 ? (profit / v.revenue) * 100 : 0,
      };
    })
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 10);

  const containerLinks = db.prepare('SELECT container_id, proforma_invoice_id FROM container_orders WHERE proforma_invoice_id IS NOT NULL').all();
  const piIdsByContainer = new Map();
  for (const link of containerLinks) {
    if (!piPnl.has(link.proforma_invoice_id)) continue;
    const ids = piIdsByContainer.get(link.container_id) || [];
    ids.push(link.proforma_invoice_id);
    piIdsByContainer.set(link.container_id, ids);
  }
  for (const [containerId, ids] of piIdsByContainer) {
    const expenses = db.prepare('SELECT amount, currency FROM shipping_expenses WHERE container_id = ?').all(containerId);
    for (const expense of expenses) {
      const matchingPis = ids.map((id) => piPnl.get(id)).filter((pi) => pi.currency === expense.currency);
      const totalValue = matchingPis.reduce((sum, pi) => sum + pi.revenue, 0);
      if (totalValue === 0) continue;
      for (const pi of matchingPis) pi.shipping_expenses += expense.amount * (pi.revenue / totalValue);
    }
  }

  // Approved general expenses (labour/transport/customs/bank charges/...) allocated directly to a
  // PI, or to its Customer PO (spread proportionally across that PO's included PIs by revenue).
  const directExpenseAllocs = db
    .prepare(
      `SELECT ea.target_id as pi_id, ea.amount
       FROM expense_allocations ea JOIN expenses e ON e.id = ea.expense_id
       WHERE ea.target_type = 'proforma_invoice' AND e.approval_status = 'approved'`
    )
    .all();
  for (const alloc of directExpenseAllocs) {
    const pi = piPnl.get(alloc.pi_id);
    if (pi) pi.other_expenses += alloc.amount;
  }

  const poExpenseAllocs = db
    .prepare(
      `SELECT ea.target_id as po_id, ea.amount
       FROM expense_allocations ea JOIN expenses e ON e.id = ea.expense_id
       WHERE ea.target_type = 'customer_po' AND e.approval_status = 'approved'`
    )
    .all();
  const piIdsByPo = new Map();
  for (const pi of piPnl.values()) {
    if (!pi.customer_po_id) continue;
    const ids = piIdsByPo.get(pi.customer_po_id) || [];
    ids.push(pi.id);
    piIdsByPo.set(pi.customer_po_id, ids);
  }
  for (const alloc of poExpenseAllocs) {
    const piIds = piIdsByPo.get(alloc.po_id);
    if (!piIds || piIds.length === 0) continue;
    const matchingPis = piIds.map((id) => piPnl.get(id));
    const totalValue = matchingPis.reduce((sum, pi) => sum + pi.revenue, 0);
    if (totalValue === 0) continue;
    for (const pi of matchingPis) pi.other_expenses += alloc.amount * (pi.revenue / totalValue);
  }

  const invoiceLinks = db
    .prepare(
      `SELECT ipi.proforma_invoice_id, i.id as invoice_id, i.currency, i.total_amount, i.paid_amount
       FROM invoice_proforma_invoices ipi JOIN invoices i ON i.id = ipi.invoice_id`
    )
    .all();
  const piIdsByInvoice = new Map();
  for (const link of invoiceLinks) {
    if (!piPnl.has(link.proforma_invoice_id)) continue;
    const links = piIdsByInvoice.get(link.invoice_id) || [];
    links.push(link);
    piIdsByInvoice.set(link.invoice_id, links);
  }
  for (const links of piIdsByInvoice.values()) {
    const totalValue = links.reduce((sum, link) => sum + piPnl.get(link.proforma_invoice_id).revenue, 0);
    if (totalValue === 0) continue;
    for (const link of links) {
      const pi = piPnl.get(link.proforma_invoice_id);
      if (pi.currency !== link.currency) continue;
      const share = pi.revenue / totalValue;
      pi.invoiced_amount += link.total_amount * share;
      pi.paid_amount += link.paid_amount * share;
    }
  }

  const byProformaInvoice = [...piPnl.values()].map((pi) => {
    const gross_profit = pi.revenue - pi.product_cost;
    const net_profit = gross_profit - pi.shipping_expenses - pi.other_expenses;
    return {
      ...pi,
      gross_profit,
      net_profit,
      receivable_amount: Math.max(0, pi.invoiced_amount - pi.paid_amount),
      margin_percent: pi.revenue > 0 ? (net_profit / pi.revenue) * 100 : 0,
    };
  });

  const currencyGroups = Object.values(
    byProformaInvoice.reduce((groups, pi) => {
      const group = groups[pi.currency] || {
        currency: pi.currency,
        revenue: 0,
        product_cost: 0,
        shipping_expenses: 0,
        other_expenses: 0,
        gross_profit: 0,
        net_profit: 0,
        invoiced_amount: 0,
        paid_amount: 0,
        receivable_amount: 0,
        pi_count: 0,
      };
      group.revenue += pi.revenue;
      group.product_cost += pi.product_cost;
      group.shipping_expenses += pi.shipping_expenses;
      group.other_expenses += pi.other_expenses;
      group.gross_profit += pi.gross_profit;
      group.net_profit += pi.net_profit;
      group.invoiced_amount += pi.invoiced_amount;
      group.paid_amount += pi.paid_amount;
      group.receivable_amount += pi.receivable_amount;
      group.pi_count += 1;
      groups[pi.currency] = group;
      return groups;
    }, {})
  ).map((group) => ({ ...group, margin_percent: group.revenue > 0 ? (group.net_profit / group.revenue) * 100 : 0 }));

  return { topProfitableProducts, byProformaInvoice, currencyGroups };
}
