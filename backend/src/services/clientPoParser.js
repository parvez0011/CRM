// Parses a buyer's own purchase order (Excel or PDF) and matches each line to a catalog product.
// Shared by Proforma Invoice import and Customer PO import - the parsing/matching logic is
// identical, only what document gets created from the matched result differs per caller.
import ExcelJS from 'exceljs';
import { PDFParse } from 'pdf-parse';
import db from '../db.js';
import { buildClientPoColumnMap, isBlankRow, matchProduct, readClientPoRow } from '../utils/clientPoImport.js';
import { extractPoLinesFromText } from '../utils/pdfPoImport.js';
import { parseNumeric } from '../utils/numeric.js';

export async function parseClientPoFile(file, { customerId } = {}) {
  const isPdf = /\.pdf$/i.test(file.originalname) || file.mimetype === 'application/pdf';
  const matched = [];
  const unmatched = [];
  let skippedNotOrdered = 0;

  function resolveLine({ row, sku, name, qty, rate }) {
    const qtyText = String(qty ?? '').trim();
    const qtyNum = parseNumeric(qty);
    // Rows with no quantity or an explicit 0 aren't actually part of this order (common in
    // full price-list style POs where most rows are just reference pricing) - skip them
    // entirely instead of cluttering the review list with the whole catalog.
    if (qtyText === '' || qtyNum === 0) {
      skippedNotOrdered += 1;
      return;
    }
    if (Number.isNaN(qtyNum) || qtyNum < 0) {
      unmatched.push({ row, sku, name, qty, rate, reason: 'Quantity is unclear - please review' });
      return;
    }
    const { product, ambiguous } = matchProduct(db, { sku, name, customerId });
    if (!product) {
      const reason = ambiguous
        ? 'Multiple products matched this SKU/name - please match it manually'
        : 'No matching product found in catalog';
      unmatched.push({ row, sku, name, qty, rate, reason });
      return;
    }
    const rateNum = parseNumeric(rate);
    matched.push({
      row,
      product_id: product.id,
      product_name: product.name,
      sku: product.sku,
      description: name || product.name, // preserve the buyer's exact wording from the PO
      hsn_code: product.hsn_code,
      unit: product.unit,
      qty: qtyNum,
      rate: rate && !Number.isNaN(rateNum) ? rateNum : product.unit_price,
    });
  }

  if (isPdf) {
    let text;
    try {
      const parser = new PDFParse({ data: file.buffer });
      const result = await parser.getText();
      text = result.text;
      await parser.destroy();
    } catch {
      const err = new Error('Invalid or corrupted PDF file');
      err.status = 400;
      throw err;
    }

    const lines = extractPoLinesFromText(text);
    if (lines.length === 0) {
      const err = new Error(
        'Could not find any product lines with a quantity in this PDF. Try the Excel template instead for reliable results.'
      );
      err.status = 400;
      throw err;
    }
    lines.forEach((line, idx) =>
      resolveLine({ row: idx + 1, sku: line.firstToken, name: line.textPart, qty: line.qty, rate: line.rate })
    );
    return { matched, unmatched, skippedNotOrdered, totalRows: lines.length };
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(file.buffer);
  } catch {
    const err = new Error('Invalid or corrupted Excel file');
    err.status = 400;
    throw err;
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    const err = new Error('The workbook has no worksheets');
    err.status = 400;
    throw err;
  }

  const headerRow = sheet.getRow(1).values.slice(1);
  const columnMap = buildClientPoColumnMap(headerRow);
  if (columnMap.qty === undefined || (columnMap.sku === undefined && columnMap.name === undefined)) {
    const err = new Error('Could not find product (Name/SKU) and Quantity columns. Please check the file headers.');
    err.status = 400;
    throw err;
  }

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber).values.slice(1);
    if (isBlankRow(row)) continue;
    const { sku, name, qty, rate } = readClientPoRow(row, columnMap);
    resolveLine({ row: rowNumber, sku, name, qty, rate });
  }

  return { matched, unmatched, skippedNotOrdered, totalRows: sheet.rowCount - 1 };
}
