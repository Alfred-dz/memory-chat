function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Please login first.' });
  }
  req.userId = req.session.userId;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.adminAuthenticated) {
    return res.status(401).json({ error: 'Admin access required.' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
