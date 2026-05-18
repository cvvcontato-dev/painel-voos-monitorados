function requireAdmin(req, res, next) {
  if (req.session?.role !== 'admin') {
    return res.status(403).json({ error: 'admin_required' });
  }
  next();
}

module.exports = requireAdmin;
