// Builds Packing List data from a Proforma Invoice (products, company profile, buyer, linked
// Customer PO and Commercial Invoice) and renders it as an .xlsx workbook matching the exporter's
// standard layout: header block, one 3-row carton block per line item, totals, and a
// weight-by-material breakdown.
import ExcelJS from 'exceljs';
import db from '../db.js';

function splitAddress(text) {
  return String(text || '')
    .split(/\r?\n|,/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function buildPackingListData(piId) {
  const pi = db
    .prepare(
      `SELECT pi.*, c.name as customer_name, c.company as customer_company, c.address as customer_address,
              c.country as customer_country, cpo.po_no as customer_po_no, cpo.po_date as customer_po_date
       FROM proforma_invoices pi
       JOIN customers c ON c.id = pi.customer_id
       LEFT JOIN customer_purchase_orders cpo ON cpo.id = pi.customer_po_id
       WHERE pi.id = ?`
    )
    .get(piId);
  if (!pi) return null;

  const company = db.prepare('SELECT * FROM company_settings WHERE id = 1').get();

  // Prefer the commercial invoice raised against this PI (via its container), since a packing
  // list is a shipping document normally issued alongside the commercial invoice.
  const commercialInvoice = db
    .prepare(
      `SELECT i.invoice_no, i.invoice_date FROM invoice_proforma_invoices ipi
       JOIN invoices i ON i.id = ipi.invoice_id WHERE ipi.proforma_invoice_id = ? ORDER BY i.id DESC LIMIT 1`
    )
    .get(piId);

  const items = db
    .prepare(
      `SELECT pii.qty, pii.hsn_code as item_hsn_code, p.sku, p.name, p.hsn_code as product_hsn_code,
              p.finish_type, p.box_dimension, p.weight_kg, p.box_weight, p.units_per_carton, p.material_type
       FROM proforma_invoice_items pii JOIN products p ON p.id = pii.product_id
       WHERE pii.proforma_invoice_id = ?
       ORDER BY pii.id ASC`
    )
    .all(piId);

  let cartonCounter = 1;
  let totalCartons = 0;
  let totalNet = 0;
  let totalGross = 0;
  const materialTotals = new Map();

  const lines = items.map((item) => {
    const perCarton = Math.max(1, item.units_per_carton || 1);
    const cartons = Math.max(1, Math.ceil(item.qty / perCarton));
    const netWeight = item.qty * (item.weight_kg || 0);
    const grossWeight = netWeight + cartons * (item.box_weight || 0);
    const perCartonNet = netWeight / cartons;
    const perCartonGross = grossWeight / cartons;
    const ctnFrom = cartonCounter;
    const ctnTo = cartonCounter + cartons - 1;
    cartonCounter = ctnTo + 1;

    totalCartons += cartons;
    totalNet += netWeight;
    totalGross += grossWeight;

    const materialKey = (item.material_type || 'OTHER').trim().toUpperCase();
    materialTotals.set(materialKey, (materialTotals.get(materialKey) || 0) + grossWeight);

    return {
      ctn_range: cartons === 1 ? String(ctnFrom) : `${ctnFrom} TO ${ctnTo}`,
      sku: item.sku,
      name: item.name,
      finish: item.finish_type || '',
      size: item.box_dimension ? `SIZE:- ${item.box_dimension} CM` : '',
      hs_code: item.item_hsn_code || item.product_hsn_code || '',
      qty: item.qty,
      cartons,
      packing_ratio: `1 CTN = ${perCarton % 1 === 0 ? perCarton : perCarton.toFixed(2)} PCS`,
      per_carton_net: perCartonNet,
      per_carton_gross: perCartonGross,
      total_net: netWeight,
      total_gross: grossWeight,
    };
  });

  const materialBreakdown = [...materialTotals.entries()].map(([material, weight]) => ({ material, weight }));

  return {
    pi_no: pi.pi_no,
    pi_date: pi.pi_date,
    invoice_no: commercialInvoice?.invoice_no || pi.pi_no,
    invoice_date: commercialInvoice?.invoice_date || pi.pi_date,
    exporter: {
      name: company?.company_name || 'Akbar Handicrafts',
      address_lines: [company?.address, `${company?.city || ''}`, company?.country].filter(Boolean),
      iec_code: company?.iec_code || '',
    },
    consignee: {
      name: `${pi.customer_name}${pi.customer_company ? ' / ' + pi.customer_company : ''}`,
      address_lines: splitAddress(pi.customer_address),
      country: pi.customer_country || '',
    },
    buyer_order_no: pi.customer_po_no || '',
    buyer_order_date: pi.customer_po_date || '',
    other_reference: pi.packing_list_other_reference || '',
    pre_carriage_by: pi.pre_carriage_by || '',
    place_of_receipt: pi.place_of_receipt || '',
    vessel_flight_no: pi.vessel_flight_no || '',
    notify_party: pi.notify_party || '',
    country_of_origin: pi.country_of_origin || 'India',
    final_destination: pi.final_destination || '',
    terms_of_delivery_payment: [pi.incoterm, pi.payment_terms].filter(Boolean).join(' / '),
    port_of_loading: pi.port_of_loading || '',
    port_of_discharge: pi.port_of_discharge || '',
    lines,
    totals: { cartons: totalCartons, net: totalNet, gross: totalGross },
    material_breakdown: materialBreakdown,
  };
}

/** overrides (optional, one-off) = { pre_carriage_by, place_of_receipt, vessel_flight_no, notify_party, other_reference } */
export async function buildPackingListWorkbook(data, overrides = {}) {
  const header = {
    pre_carriage_by: overrides.pre_carriage_by || data.pre_carriage_by,
    place_of_receipt: overrides.place_of_receipt || data.place_of_receipt,
    vessel_flight_no: overrides.vessel_flight_no || data.vessel_flight_no,
    notify_party: overrides.notify_party || data.notify_party,
    other_reference: overrides.other_reference || data.other_reference,
  };
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Packing List');
  sheet.columns = Array(13).fill({ width: 10 });

  function merge(r1, c1, r2, c2, value, opts = {}) {
    sheet.mergeCells(r1, c1, r2, c2);
    const cell = sheet.getCell(r1, c1);
    cell.value = value;
    cell.alignment = { vertical: 'middle', wrapText: true, horizontal: opts.align || 'left' };
    if (opts.bold) cell.font = { bold: true };
    return cell;
  }

  merge(1, 1, 1, 13, 'PACKING LIST', { align: 'center', bold: true });

  // Left block: exporter + consignee. Right block: invoice/reference/order/terms.
  merge(2, 1, 2, 6, 'Exporter:', { bold: true });
  merge(3, 1, 6, 6, [data.exporter.name, ...data.exporter.address_lines].join('\n'));
  merge(2, 7, 2, 10, 'INVOICE NO. & DATE', { bold: true });
  merge(2, 11, 2, 13, 'EXPORTER REF. NO.', { bold: true });
  merge(3, 7, 3, 10, `${data.invoice_no}  DTD  ${data.invoice_date || ''}`);
  merge(3, 11, 3, 13, data.exporter.iec_code ? `IEC# ${data.exporter.iec_code}` : '');
  merge(4, 7, 4, 13, 'BUYER ORDER NO. & DATE', { bold: true });
  merge(5, 7, 5, 13, [data.buyer_order_no, data.buyer_order_date].filter(Boolean).join('  DTD  '));
  merge(6, 7, 6, 13, `OTHER REFERENCE: ${header.other_reference || ''}`);

  merge(7, 1, 7, 6, 'CONSIGNEE ADDRESS:', { bold: true });
  merge(7, 7, 7, 13, 'Notify party :', { bold: true });
  merge(8, 1, 11, 6, [data.consignee.name, ...data.consignee.address_lines, data.consignee.country].join('\n'));
  merge(8, 7, 11, 13, header.notify_party || 'Same as Consignee');

  merge(12, 1, 12, 3, 'COUNTRY OF ORIGIN', { bold: true });
  merge(12, 4, 12, 6, 'FINAL DESTINATION', { bold: true });
  merge(12, 7, 12, 13, 'TERMS OF DELIVERY & PAYMENT', { bold: true });
  merge(13, 1, 13, 3, data.country_of_origin);
  merge(13, 4, 13, 6, data.final_destination);
  merge(13, 7, 14, 13, data.terms_of_delivery_payment);

  merge(14, 1, 14, 3, 'PRE CARRIAGE BY', { bold: true });
  merge(14, 4, 14, 6, 'PLACE OF RECEIPT', { bold: true });
  merge(15, 1, 15, 3, header.pre_carriage_by || '');
  merge(15, 4, 15, 6, header.place_of_receipt || '');

  merge(16, 1, 16, 3, 'VESSEL/FLIGHT NO.', { bold: true });
  merge(16, 4, 16, 6, 'PORT OF LOADING', { bold: true });
  merge(16, 7, 16, 9, 'PORT OF DISCHARGE', { bold: true });
  merge(16, 10, 16, 13, 'FINAL DESTINATION', { bold: true });
  merge(17, 1, 17, 3, header.vessel_flight_no || '');
  merge(17, 4, 17, 6, data.port_of_loading);
  merge(17, 7, 17, 9, data.port_of_discharge);
  merge(17, 10, 17, 13, data.final_destination);

  const headerRow = 18;
  merge(headerRow, 1, headerRow, 2, 'CTN#', { bold: true, align: 'center' });
  merge(headerRow, 3, headerRow, 3, 'Item #', { bold: true, align: 'center' });
  merge(headerRow, 4, headerRow, 6, 'Description', { bold: true, align: 'center' });
  merge(headerRow, 7, headerRow, 7, 'HS CODE', { bold: true, align: 'center' });
  merge(headerRow, 8, headerRow, 8, 'Quantity', { bold: true, align: 'center' });
  merge(headerRow, 9, headerRow, 10, 'NWT/GWT/KG', { bold: true, align: 'center' });
  merge(headerRow, 11, headerRow, 11, 'T.CTN', { bold: true, align: 'center' });
  merge(headerRow, 12, headerRow, 12, 'T. NET WT/KG', { bold: true, align: 'center' });
  merge(headerRow, 13, headerRow, 13, 'T. GR WT/KG', { bold: true, align: 'center' });

  let row = headerRow + 1;
  for (const line of data.lines) {
    merge(row, 1, row, 2, line.ctn_range, { align: 'center' });
    merge(row, 4, row, 6, line.name);
    merge(row, 9, row, 10, Number(line.per_carton_net.toFixed(2)));
    row += 1;

    merge(row, 1, row, 2, `${line.cartons} CTN`, { align: 'center' });
    sheet.getCell(row, 3).value = line.sku;
    merge(row, 4, row, 4, line.finish);
    merge(row, 5, row, 6, line.size);
    sheet.getCell(row, 7).value = line.hs_code;
    sheet.getCell(row, 8).value = line.qty;
    sheet.getCell(row, 11).value = line.cartons;
    sheet.getCell(row, 12).value = Number(line.total_net.toFixed(2));
    sheet.getCell(row, 13).value = Number(line.total_gross.toFixed(2));
    row += 1;

    merge(row, 4, row, 4, line.packing_ratio);
    merge(row, 9, row, 10, Number(line.per_carton_gross.toFixed(2)));
    row += 1;
  }

  row += 1;
  merge(row, 11, row, 11, data.totals.cartons, { bold: true });
  merge(row, 12, row, 12, Number(data.totals.net.toFixed(2)), { bold: true });
  merge(row, 13, row, 13, Number(data.totals.gross.toFixed(2)), { bold: true });
  row += 1;
  merge(row, 1, row, 2, 'TOTAL CTNS:', { bold: true });
  sheet.getCell(row, 3).value = data.totals.cartons;
  row += 2;

  const weightLines = data.material_breakdown
    .map((m) => `${m.material.padEnd(20, ' ')}: ${m.weight.toFixed(3)} KGS`)
    .concat([`${'G. TOTAL'.padEnd(20, ' ')}: ${data.totals.gross.toFixed(3)} KGS`])
    .join('\n');
  merge(row, 1, row + 2, 9, `WEIGHT DETAILS:-\n${weightLines}`);
  merge(row, 11, row + 2, 13, `FOR: ${data.exporter.name}`, { bold: true, align: 'center' });

  return wb;
}
