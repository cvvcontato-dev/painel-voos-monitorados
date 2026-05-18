const express = require('express');
const router = express.Router();
const db = require('../database');
const { hash, compare } = require('../helpers/password');
const { log } = require('../helpers/audit');
const requireAdmin = require('../middleware/requireAdmin');

// All user management routes require admin role
router.use(requireAdmin);

function getAdminUser(adminId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE id = ?', [adminId], (err, row) => {
      if (err) reject(err); else resolve(row);
    });
  });
}

function countAdmins() {
  return new Promise((resolve, reject) => {
    db.get("SELECT COUNT(*) as cnt FROM users WHERE role = 'admin'", [], (err, row) => {
      if (err) reject(err); else resolve(row.cnt);
    });
  });
}

// GET /api/users
router.get('/', (req, res) => {
  db.all(
    'SELECT id, email, nome, role, criado_em, ultimo_login FROM users ORDER BY nome',
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

// POST /api/users — create user (admin reauth required)
router.post('/', async (req, res) => {
  const { email, nome, password, role = 'user', confirm_password } = req.body;
  const adminId = req.session.userId;
  const ip = req.ip;
  const ua = req.get('User-Agent');

  if (!email || !nome || !password || !confirm_password) {
    return res.status(400).json({ error: 'missing_fields' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'password_too_short' });
  }
  if (!['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: 'invalid_role' });
  }

  try {
    const admin = await getAdminUser(adminId);
    if (!await compare(confirm_password, admin.password_hash)) {
      log({ evento: 'user_create_fail', userId: adminId, ip, userAgent: ua, success: false });
      return res.status(401).json({ error: 'wrong_admin_password' });
    }

    const password_hash = await hash(password);
    const stmt = await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO users (email, nome, password_hash, role, criado_em)
         VALUES (?, ?, ?, ?, datetime('now'))`,
        [email.toLowerCase().trim(), nome, password_hash, role],
        function(err) { if (err) reject(err); else resolve(this); }
      );
    });

    log({ evento: 'user_created', userId: adminId, targetUserId: stmt.lastID, ip, userAgent: ua, success: true, meta: { email } });

    db.get('SELECT id, email, nome, role, criado_em FROM users WHERE id = ?', [stmt.lastID], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json(row);
    });
  } catch (err) {
    if (err.message?.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'email_already_exists' });
    }
    console.error('[USERS] Create error:', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// PUT /api/users/:id — update nome and/or role
router.put('/:id', async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) return res.status(400).json({ error: 'invalid_id' });
  const { nome, role, confirm_password } = req.body;
  const adminId = req.session.userId;
  const ip = req.ip;
  const ua = req.get('User-Agent');

  if (!nome && role === undefined) {
    return res.status(400).json({ error: 'nothing_to_update' });
  }

  try {
    // Role change requires reauth
    if (role !== undefined) {
      if (!['admin', 'user'].includes(role)) {
        return res.status(400).json({ error: 'invalid_role' });
      }
      if (!confirm_password) {
        return res.status(400).json({ error: 'confirm_password_required_for_role_change' });
      }
      const admin = await getAdminUser(adminId);
      if (!await compare(confirm_password, admin.password_hash)) {
        return res.status(401).json({ error: 'wrong_admin_password' });
      }
    }

    const current = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE id = ?', [targetId], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });
    if (!current) return res.status(404).json({ error: 'user_not_found' });

    const newNome = nome ?? current.nome;
    const newRole = role ?? current.role;

    await new Promise((resolve, reject) => {
      db.run('UPDATE users SET nome = ?, role = ? WHERE id = ?', [newNome, newRole, targetId], (err) => {
        if (err) reject(err); else resolve();
      });
    });

    if (role !== undefined && role !== current.role) {
      await new Promise((resolve) => {
        db.run("DELETE FROM sessions WHERE json_extract(sess, '$.userId') = ?", [targetId], (err) => {
          if (err) console.error('[USERS] Failed to invalidate sessions after role change:', err.message);
          resolve();
        });
      });
      log({ evento: 'role_changed', userId: adminId, targetUserId: targetId, ip, userAgent: ua, success: true, meta: { role_before: current.role, role_after: role } });
    } else {
      log({ evento: 'user_updated', userId: adminId, targetUserId: targetId, ip, userAgent: ua, success: true });
    }

    db.get('SELECT id, email, nome, role, criado_em, ultimo_login FROM users WHERE id = ?', [targetId], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(row);
    });
  } catch (err) {
    console.error('[USERS] Update error:', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// DELETE /api/users/:id
router.delete('/:id', async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) return res.status(400).json({ error: 'invalid_id' });
  const adminId = req.session.userId;
  const ip = req.ip;
  const ua = req.get('User-Agent');
  const { confirm_password } = req.body;

  if (targetId === adminId) {
    return res.status(409).json({ error: 'cannot_delete_self' });
  }

  if (!confirm_password) {
    return res.status(400).json({ error: 'confirm_password_required' });
  }

  try {
    const admin = await getAdminUser(adminId);
    if (!await compare(confirm_password, admin.password_hash)) {
      return res.status(401).json({ error: 'wrong_admin_password' });
    }

    const target = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE id = ?', [targetId], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });
    if (!target) return res.status(404).json({ error: 'user_not_found' });

    if (target.role === 'admin') {
      const adminCount = await countAdmins();
      if (adminCount <= 1) {
        return res.status(409).json({ error: 'cannot_delete_last_admin' });
      }
    }

    // Invalidate sessions before deletion (awaited so deletion ordering is deterministic)
    await new Promise((resolve) => {
      db.run("DELETE FROM sessions WHERE json_extract(sess, '$.userId') = ?", [targetId], (err) => {
        if (err) console.error('[USERS] Failed to invalidate sessions before delete:', err.message);
        resolve();
      });
    });

    await new Promise((resolve, reject) => {
      db.run('DELETE FROM users WHERE id = ?', [targetId], (err) => {
        if (err) reject(err); else resolve();
      });
    });

    log({ evento: 'user_deleted', userId: adminId, targetUserId: targetId, ip, userAgent: ua, success: true, meta: { deleted_user_email: target.email } });

    res.json({ ok: true });
  } catch (err) {
    console.error('[USERS] Delete error:', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;
