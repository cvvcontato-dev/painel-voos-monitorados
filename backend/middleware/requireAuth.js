function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'auth_required' });
  }
  next();
}

module.exports = requireAuth;
