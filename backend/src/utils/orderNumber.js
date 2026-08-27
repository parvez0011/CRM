// Generates sequential document numbers like SO-2026-0001 based on existing rows in a table/column.
export function nextDocNumber(db, table, column, prefix) {
  const year = new Date().getFullYear();
  const like = `${prefix}-${year}-%`;
  const row = db
    .prepare(`SELECT ${column} as val FROM ${table} WHERE ${column} LIKE ? ORDER BY id DESC LIMIT 1`)
    .get(like);
  let next = 1;
  if (row && row.val) {
    const parts = row.val.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!Number.isNaN(lastNum)) next = lastNum + 1;
  }
  return `${prefix}-${year}-${String(next).padStart(4, '0')}`;
}

export function runInTransaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
