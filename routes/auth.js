const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const USERNAME_RE = /^[a-zA-Z0-9_]{2,30}$/;
const PASSWORD_MIN = 4;

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !USERNAME_RE.test(username)) {
      return res.status(400).json({ error: '用户名：2-30个字符，仅限字母、数字和下划线。' });
    }
    if (!password || password.length < PASSWORD_MIN) {
      return res.status(400).json({ error: '密码至少需要4个字符。' });
    }

    const existing = db.findUserByUsername(username);
    if (existing) {
      return res.status(409).json({ error: '此用户名已被占用。' });
    }

    const hash = await bcrypt.hash(password, 10);
    const userId = db.createUser(username, hash);

    req.session.userId = userId;

    res.json({
      id: userId,
      username,
      messageCount: 0,
      hasProfile: false
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = db.findUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误。' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: '用户名或密码错误。' });
    }

    req.session.userId = user.id;

    const msgCount = db.countMessages(user.id);
    const profile = db.getProfile(user.id);

    res.json({
      id: user.id,
      username: user.username,
      messageCount: msgCount,
      hasProfile: !!profile
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed.' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.json({ authenticated: false });
  }

  const user = db.getUserById(req.session.userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.json({ authenticated: false });
  }

  const msgCount = db.countMessages(user.id);
  const profile = db.getProfile(user.id);

  res.json({
    authenticated: true,
    id: user.id,
    username: user.username,
    messageCount: msgCount,
    hasProfile: !!profile
  });
});

module.exports = router;
