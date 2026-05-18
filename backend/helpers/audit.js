const db = require('../database');

/**
 * Insert a row in auth_audit_log. Never throws — audit failure must not crash a request.
 *
 * @param {object} event
 * @param {string} event.evento       - event name from spec §4.2
 * @param {number|null} event.userId  - actor user id (null for unauthenticated login_fail)
 * @param {number|null} [event.targetUserId] - target user id for admin actions
 * @param {string} event.ip
 * @param {string} event.userAgent
 * @param {boolean} event.success
 * @param {object} [event.meta]       - arbitrary JSON metadata
 */
function log({ evento, userId, targetUserId = null, ip, userAgent, success, meta = null }) {
  const metadata = meta ? JSON.stringify(meta) : null;
  db.run(
    `INSERT INTO auth_audit_log
       (timestamp, evento, user_id, target_user_id, ip, user_agent, success, metadata_json)
     VALUES (datetime('now'), ?, ?, ?, ?, ?, ?, ?)`,
    [evento, userId ?? null, targetUserId, ip, userAgent, success ? 1 : 0, metadata],
    (err) => {
      if (err) console.error('[AUDIT] Failed to log event:', evento, err.message);
    }
  );
}

module.exports = { log };
