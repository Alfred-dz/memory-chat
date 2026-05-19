require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const QRCode = require('qrcode');
const db = require('./database');

// ── Route modules ──
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const adminRoutes = require('./routes/admin');
const analysisRoutes = require('./routes/analysis');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Session store ──
const SESSION_SECRET = process.env.SESSION_SECRET || 'memory-chat-secret-change-me-in-production';
let sessionStore;

if (db.usePostgres) {
  const PgSession = require('connect-pg-simple')(session);
  sessionStore = new PgSession({
    pool: db.db,
    tableName: 'session',
    createTableIfMissing: true
  });
} else {
  const SqliteStore = require('better-sqlite3-session-store')(session);
  sessionStore = new SqliteStore({ client: db.db, expired: { clear: true, intervalMs: 900000 } });
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Force UTF-8 on all API responses
app.use(session({
  store: sessionStore,
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// ── API routes ──
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/analysis', analysisRoutes);

// ── Dynamic QR code ──
app.get('/api/qr-image', async (req, res) => {
  try {
    const baseUrl = process.env.BASE_URL || 'https://memory-chat.fly.dev';
    const qrBuffer = await QRCode.toBuffer(baseUrl, {
      width: 400,
      margin: 2,
      color: { dark: '#bfa25c', light: '#07090b' }
    });
    res.setHeader('Content-Type', 'image/png');
    res.send(qrBuffer);
  } catch (err) {
    console.error('QR generation error:', err);
    res.status(500).end();
  }
});

// ── Health check ──
app.get('/api/health', (req, res) => {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  res.json({
    status: 'ok',
    apiConfigured: !!(apiKey && apiKey !== 'your-api-key-here')
  });
});

// ── Static pages ──
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/qr', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'qr.html'));
});

// ── Catch-all: serve index.html (the SPA) ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  const configured = process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY !== 'your-api-key-here';
  console.log(`\n  Memory — listening on http://localhost:${PORT}`);
  console.log(`  API key: ${configured ? 'configured' : 'NOT CONFIGURED — set DEEPSEEK_API_KEY in .env'}`);
  console.log(`  Admin:  ${process.env.ADMIN_PASSWORD ? 'configured' : 'NOT CONFIGURED — set ADMIN_PASSWORD in .env'}\n`);
});
