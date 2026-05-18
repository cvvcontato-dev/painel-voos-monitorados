const crypto = require('crypto');
const COOKIE_NAME = 'csrf';
const COOKIE_MAX_AGE = 30 * 24 * 3600 * 1000;
const MUTATING = ['POST', 'PUT', 'DELETE'];

// Paths exempt from CSRF validation (the public login endpoint)
const EXEMPT = ['/api/auth/login'];

function csrfMiddleware(req, res, next) {
  // Always ensure the csrf cookie exists
  let token = req.cookies[COOKIE_NAME];
  if (!token) {
    token = crypto.randomBytes(32).toString('hex');
    res.cookie(COOKIE_NAME, token, {
      httpOnly: false,  // Frontend reads this to send in header
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: COOKIE_MAX_AGE
    });
    req.cookies[COOKIE_NAME] = token;
  }

  // Validate on mutating methods (except exempt paths)
  if (MUTATING.includes(req.method) && !EXEMPT.includes(req.path)) {
    const headerToken = req.get('X-CSRF-Token');
    if (!headerToken || headerToken !== token) {
      return res.status(403).json({ error: 'csrf_invalid' });
    }
  }

  next();
}

module.exports = csrfMiddleware;
