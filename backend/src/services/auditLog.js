// Central audit logging: who did what to which entity, with a before/after snapshot for
// financial/status-changing actions. Call from route handlers after a mutation succeeds.
import db from '../db.js';

export function recordAudit(req, { entity_type, entity_id, action, before, after, reason }) {
  db.prepare(
    `INSERT INTO audit_logs (user_id, user_name, entity_type, entity_id, action, before_json, after_json, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    req.user?.id || null,
    req.user?.name || req.user?.email || null,
    entity_type,
    entity_id ?? null,
    action,
    before !== undefined ? JSON.stringify(before) : null,
    after !== undefined ? JSON.stringify(after) : null,
    reason || null
  );
}
