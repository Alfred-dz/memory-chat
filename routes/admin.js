const express = require('express');
const db = require('../database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// POST /api/admin/login
router.post('/login', (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return res.status(500).json({ error: 'Admin password not configured on server.' });
  }

  if (password === adminPassword) {
    req.session.adminAuthenticated = true;
    return res.json({ success: true });
  }

  res.status(401).json({ error: 'Incorrect password.' });
});

// GET /api/admin/check
router.get('/check', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.adminAuthenticated) });
});

// POST /api/admin/logout
router.post('/logout', (req, res) => {
  req.session.adminAuthenticated = false;
  res.json({ success: true });
});

// GET /api/admin/users
router.get('/users', requireAdmin, (req, res) => {
  try {
    const users = db.getAllUsers();
    res.json({ users });
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ error: 'Failed to load users.' });
  }
});

// GET /api/admin/conversations/:userId
router.get('/conversations/:userId', requireAdmin, (req, res) => {
  try {
    const user = db.getUserById(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const messages = db.getMessages(req.params.userId);
    const profile = db.getProfile(req.params.userId);

    res.json({
      user: { id: user.id, username: user.username, created_at: user.created_at },
      messages,
      profile: profile ? {
        profileText: profile.profile_text,
        matchedFigure: profile.matched_figure,
        traits: JSON.parse(profile.traits || '[]')
      } : null
    });
  } catch (err) {
    console.error('Admin conversations error:', err);
    res.status(500).json({ error: 'Failed to load conversation.' });
  }
});

// POST /api/admin/users/:userId/block
router.post('/users/:userId/block', requireAdmin, (req, res) => {
  try {
    const user = db.getUserById(req.params.userId);
    if (!user) return res.status(404).json({ error: '用户不存在。' });

    const newBlocked = user.blocked ? 0 : 1;
    db.blockUser(req.params.userId, newBlocked);

    res.json({ success: true, blocked: !!newBlocked });
  } catch (err) {
    console.error('Block error:', err);
    res.status(500).json({ error: '操作失败。' });
  }
});

// DELETE /api/admin/users/:userId
router.delete('/users/:userId', requireAdmin, (req, res) => {
  try {
    const user = db.getUserById(req.params.userId);
    if (!user) return res.status(404).json({ error: '用户不存在。' });

    db.deleteUser(req.params.userId);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: '删除失败。' });
  }
});

module.exports = router;
