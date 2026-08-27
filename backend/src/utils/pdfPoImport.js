// Best-effort text-based parser for buyer purchase orders supplied as PDF.
// PDF table layouts vary widely, so this uses line-level heuristics (trailing
// qty/rate numbers) rather than assuming fixed columns like the Excel importer.
const SKIP_LINE_PATTERN =
  /^(purchase order|po\s*(number|no)?[:#]?$|buyer|consignee|ship\s*to|bill\s*to|date|page|total|subtotal|grand total|terms|remarks|notes|item\s*code|description|--|tel:|fax:|email:|please call|\d{4}\s+\w{3}\s+\d{1,2}$)/i;

// Matches a trailing number that may be currency/comma-formatted (e.g. "$1,200.50"); the
// caller is responsible for stripping symbols/commas before treating it as a plain number.
const NUM = '(?:[$\u20B9\u00A3\u20AC]\\s?)?[\\d,]+(?:\\.\\d+)?';
const TWO_NUM_PATTERN = new RegExp(`^(.+?)\\s+(${NUM})\\s+(${NUM})\\s*$`);
const ONE_NUM_PATTERN = new RegExp(`^(.+?)\\s+(${NUM})\\s*$`);
const CLEAN_NUM_PATTERN = /^[\d,]+(?:\.\d+)?$/;
// A recognizable product/SKU code: starts with a letter, no internal whitespace, reasonably short.
const SKU_TOKEN_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{1,29}$/;

/**
 * Parses a single tab-delimited PO line as exported by ERP systems (e.g. Khaos Control) with
 * columns like SKU / [Supplier Code] / Item Title / Ordered / [Ref] / Delivered / Unit Cost /
 * Cost / [BinRack]. Only SKU, Item Title, Ordered (qty) and Unit Cost (rate) are needed for the
 * PI/PO import - this also sidesteps the Cost value and BinRack text sometimes wrapping onto a
 * following physical text line when the PDF is extracted, since neither is parsed here.
 */
function extractTabDelimitedLine(line) {
  const fields = line
    .split('\t')
    .map((f) => f.trim())
    .filter((f) => f !== '');
  if (fields.length < 3) return null;
  const [sku, ...rest] = fields;
  if (!SKU_TOKEN_PATTERN.test(sku)) return null;

  let i = 0;
  const textFields = [];
  while (i < rest.length && !CLEAN_NUM_PATTERN.test(rest[i])) {
    textFields.push(rest[i]);
    i++;
  }
  if (textFields.length === 0) return null;

  const numericFields = [];
  while (i < rest.length && CLEAN_NUM_PATTERN.test(rest[i])) {
    numericFields.push(rest[i]);
    i++;
  }
  if (numericFields.length === 0) return null;

  const name = textFields[textFields.length - 1];
  const qty = numericFields[0];
  // Column order is Ordered / [Ref] / Delivered / Unit Cost / Cost - Unit Cost is the 3rd numeric
  // field when all are present, or the last one found when Ref/Delivered were omitted entirely.
  let rate = '';
  if (numericFields.length >= 3) rate = numericFields[2];
  else if (numericFields.length === 2) rate = numericFields[1];

  return { textPart: name, firstToken: sku, qty, rate };
}

/** Splits raw extracted PDF text into candidate product lines with a description and qty/rate. */
export function extractPoLinesFromText(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const results = [];
  for (const line of lines) {
    if (SKIP_LINE_PATTERN.test(line)) continue;

    if (line.includes('\t')) {
      const tabRow = extractTabDelimitedLine(line);
      if (tabRow) results.push({ raw: line, ...tabRow });
      // Tab-delimited lines are handled exclusively by the column-aware parser above - a failed
      // match here is a continuation/wrap fragment (e.g. a split Cost value or BinRack), not a
      // plain-text row, so it must not fall through to the trailing-number heuristic below.
      continue;
    }

    const twoNumbers = line.match(TWO_NUM_PATTERN);
    const oneNumber = !twoNumbers && line.match(ONE_NUM_PATTERN);
    const match = twoNumbers || oneNumber;
    if (!match) continue;

    const textPart = match[1].trim();
    if (!textPart || textPart.length < 2) continue;

    results.push({
      raw: line,
      textPart,
      firstToken: textPart.split(/\s+/)[0],
      qty: match[2],
      rate: twoNumbers ? twoNumbers[3] : '',
    });
  }
  return results;
}

