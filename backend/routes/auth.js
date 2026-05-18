const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const db = require('../database');
const { hash, compare } = require('../helpers/password');
const { log } = require('../helpers/audit');
const requireAuth = require('../middleware/requireAuth');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting entirely in test environment to prevent self-rate-limiting across tests
  skip: () => process.env.NODE_ENV === 'test',
  handler: (req, res) => res.status(429).json({ error: 'too_many_attempts' })
});

function getUser(email) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE TRIM(LOWER(email)) = ?', [email.toLowerCase().trim()], (err, row) => {
      if (err) reject(err); else resolve(row);
    });
  });
}

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password, remember } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email_and_password_required' });
  }

  try {
    const user = await getUser(email);
    console.log(`[AUTH-DEBUG] login attempt: email="${email}" (len=${email.length}), user_found=${!!user}`);
    if (user) {
      console.log(`[AUTH-DEBUG] stored email="${user.email}" (len=${user.email.length}), hash_len=${user.password_hash?.length}`);
    }
    const pwdMatch = user ? await compare(password, user.password_hash) : false;
    console.log(`[AUTH-DEBUG] password_len=${password.length}, bcrypt_match=${pwdMatch}`);
    const valid = user && pwdMatch;

    if (!valid) {
      log({ evento: 'login_fail', userId: user?.id ?? null, ip: req.ip, userAgent: req.get('User-Agent'), success: false, meta: { attempted_email: email } });
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    // Anti session-fixation
    await new Promise((resolve, reject) => {
      req.session.regenerate((err) => { if (err) reject(err); else resolve(); });
    });

    req.session.userId = user.id;
    req.session.role = user.role;
    if (remember) {
      req.session.cookie.maxAge = 30 * 24 * 3600 * 1000;
    }

    db.run("UPDATE users SET ultimo_login = datetime('now') WHERE id = ?", [user.id]);
    log({ evento: 'login_success', userId: user.id, ip: req.ip, userAgent: req.get('User-Agent'), success: true });

    return res.json({ user: { id: user.id, email: user.email, nome: user.nome, role: user.role } });
  } catch (err) {
    console.error('[AUTH] Login error:', err.message);
    return res.status(500).json({ error: 'server_error' });
  }
});

// POST /api/auth/logout  (idempotent — works even without a session)
router.post('/logout', (req, res) => {
  const userId = req.session?.userId ?? null;
  if (!req.session || !userId) {
    return res.json({ ok: true });
  }
  const ip = req.ip;
  const ua = req.get('User-Agent');
  req.session.destroy(() => {
    res.clearCookie('cvv.sid');
    if (userId) log({ evento: 'logout', userId, ip, userAgent: ua, success: true });
    res.json({ ok: true });
  });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  db.get('SELECT id, email, nome, role FROM users WHERE id = ?', [req.session.userId], (err, user) => {
    if (err || !user) return res.status(401).json({ error: 'auth_required' });
    res.json(user);
  });
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body;
  const userId = req.session.userId;
  const ip = req.ip;
  const ua = req.get('User-Agent');

  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'both_passwords_required' });
  }
  if (new_password.length < 8) {
    return res.status(400).json({ error: 'password_too_short' });
  }

  try {
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });

    const valid = await compare(current_password, user.password_hash);
    if (!valid) {
      log({ evento: 'password_changed', userId, ip, userAgent: ua, success: false });
      return res.status(401).json({ error: 'wrong_current_password' });
    }

    const newHash = await hash(new_password);
    await new Promise((resolve, reject) => {
      db.run('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, userId], (err) => {
        if (err) reject(err); else resolve();
      });
    });

    // Invalidate ALL sessions for this user
    await new Promise((resolve) => {
      db.run(
        "DELETE FROM sessions WHERE json_extract(sess, '$.userId') = ?",
        [userId],
        (err) => {
          if (err) console.error('[AUTH] Failed to invalidate sessions after password change:', err.message);
          resolve();
        }
      );
    });

    log({ evento: 'password_changed', userId, ip, userAgent: ua, success: true });
    log({ evento: 'session_invalidated_after_password_change', userId, ip, userAgent: ua, success: true });

    return res.json({ ok: true });
  } catch (err) {
    console.error('[AUTH] change-password error:', err.message);
    return res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;
