const path = require('path');
const fs = require('fs');

const usePostgres = !!process.env.DATABASE_URL;

let db; // pg Pool or better-sqlite3 instance

if (usePostgres) {
  // ── PostgreSQL (for Render / cloud deployment) ──
  const { Pool } = require('pg');
  db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  async function initDB() {
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id          SERIAL PRIMARY KEY,
        username    TEXT    UNIQUE NOT NULL,
        password    TEXT    NOT NULL,
        is_admin    INTEGER DEFAULT 0,
        blocked     INTEGER DEFAULT 0,
        created_at  TEXT    DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS'))
      );
      ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked INTEGER DEFAULT 0;
      CREATE TABLE IF NOT EXISTS messages (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role        TEXT    NOT NULL CHECK(role IN ('user','assistant')),
        content     TEXT    NOT NULL,
        created_at  TEXT    DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS'))
      );
      CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id, created_at);
      CREATE TABLE IF NOT EXISTS personality_profiles (
        id                 SERIAL PRIMARY KEY,
        user_id            INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        profile_text       TEXT    NOT NULL,
        matched_figure     TEXT,
        figure_description TEXT,
        traits             TEXT,
        analyzed_at        TEXT    DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS'))
      );
      CREATE TABLE IF NOT EXISTS session (
        sid       VARCHAR PRIMARY KEY,
        sess      JSON NOT NULL,
        expired   TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_session_expire ON session(expired);
    `);
  }

  function createUser(username, passwordHash) {
    return db.query('INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id', [username, passwordHash])
      .then(r => r.rows[0].id);
  }
  function findUserByUsername(username) {
    return db.query('SELECT * FROM users WHERE username = $1', [username])
      .then(r => r.rows[0] || null);
  }
  function getUserById(id) {
    return db.query('SELECT id, username, is_admin, blocked, created_at FROM users WHERE id = $1', [id])
      .then(r => r.rows[0] || null);
  }
  function getAllUsers() {
    return db.query(`
      SELECT u.id, u.username, u.blocked, u.created_at,
             COUNT(m.id)::int AS message_count,
             CASE WHEN p.id IS NOT NULL THEN 1 ELSE 0 END::int AS has_profile
      FROM users u
      LEFT JOIN messages m ON m.user_id = u.id
      LEFT JOIN personality_profiles p ON p.user_id = u.id
      WHERE u.is_admin = 0
      GROUP BY u.id, p.id
      ORDER BY u.created_at DESC
    `).then(r => r.rows);
  }
  function saveMessage(userId, role, content) {
    return db.query('INSERT INTO messages (user_id, role, content) VALUES ($1, $2, $3)', [userId, role, content]);
  }
  function getMessages(userId, limit) {
    let sql = 'SELECT id, role, content, created_at FROM messages WHERE user_id = $1 ORDER BY created_at ASC';
    const params = [userId];
    if (limit) { sql += ' LIMIT $2'; params.push(limit); }
    return db.query(sql, params).then(r => r.rows);
  }
  function countMessages(userId) {
    return db.query('SELECT COUNT(*)::int AS count FROM messages WHERE user_id = $1', [userId])
      .then(r => r.rows[0].count);
  }
  function saveProfile(userId, profileText, matchedFigure, figureDescription, traits) {
    return db.query(`
      INSERT INTO personality_profiles (user_id, profile_text, matched_figure, figure_description, traits)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT(user_id) DO UPDATE SET
        profile_text = excluded.profile_text,
        matched_figure = excluded.matched_figure,
        figure_description = excluded.figure_description,
        traits = excluded.traits,
        analyzed_at = to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
    `, [userId, profileText, matchedFigure, figureDescription, traits]);
  }
  function getProfile(userId) {
    return db.query('SELECT * FROM personality_profiles WHERE user_id = $1', [userId])
      .then(r => r.rows[0] || null);
  }

  function blockUser(userId, blocked) {
    return db.query('UPDATE users SET blocked = $1 WHERE id = $2', [blocked ? 1 : 0, userId]);
  }

  function deleteUser(userId) {
    return db.query('DELETE FROM users WHERE id = $1', [userId]);
  }

} else {
  // ── SQLite (for local development) ──
  const Database = require('better-sqlite3');
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  db = new Database(path.join(dataDir, 'memory.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  function initDB() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        username    TEXT    UNIQUE NOT NULL COLLATE NOCASE,
        password    TEXT    NOT NULL,
        is_admin    INTEGER DEFAULT 0,
        blocked     INTEGER DEFAULT 0,
        created_at  TEXT    DEFAULT (datetime('now'))
      );
    `);
    // Add blocked column if missing (migration)
    try { db.prepare('ALTER TABLE users ADD COLUMN blocked INTEGER DEFAULT 0').run(); } catch(e) {}
    db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     INTEGER NOT NULL,
        role        TEXT    NOT NULL CHECK(role IN ('user','assistant')),
        content     TEXT    NOT NULL,
        created_at  TEXT    DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id, created_at);
      CREATE TABLE IF NOT EXISTS personality_profiles (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id            INTEGER UNIQUE NOT NULL,
        profile_text       TEXT    NOT NULL,
        matched_figure     TEXT,
        figure_description TEXT,
        traits             TEXT,
        analyzed_at        TEXT    DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
  }

  function createUser(username, passwordHash) {
    const r = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, passwordHash);
    return r.lastInsertRowid;
  }
  function findUserByUsername(username) {
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  }
  function getUserById(id) {
    return db.prepare('SELECT id, username, is_admin, blocked, created_at FROM users WHERE id = ?').get(id);
  }
  function getAllUsers() {
    return db.prepare(`
      SELECT u.id, u.username, u.blocked, u.created_at,
             COUNT(m.id) AS message_count,
             CASE WHEN p.id IS NOT NULL THEN 1 ELSE 0 END AS has_profile
      FROM users u
      LEFT JOIN messages m ON m.user_id = u.id
      LEFT JOIN personality_profiles p ON p.user_id = u.id
      WHERE u.is_admin = 0
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `).all();
  }
  function saveMessage(userId, role, content) {
    return db.prepare('INSERT INTO messages (user_id, role, content) VALUES (?, ?, ?)').run(userId, role, content);
  }
  function getMessages(userId, limit) {
    let sql = 'SELECT id, role, content, created_at FROM messages WHERE user_id = ? ORDER BY created_at ASC';
    if (limit) sql += ' LIMIT ?';
    return limit ? db.prepare(sql).all(userId, limit) : db.prepare(sql).all(userId);
  }
  function countMessages(userId) {
    return db.prepare('SELECT COUNT(*) AS count FROM messages WHERE user_id = ?').get(userId).count;
  }
  function saveProfile(userId, profileText, matchedFigure, figureDescription, traits) {
    return db.prepare(`
      INSERT INTO personality_profiles (user_id, profile_text, matched_figure, figure_description, traits)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        profile_text = excluded.profile_text,
        matched_figure = excluded.matched_figure,
        figure_description = excluded.figure_description,
        traits = excluded.traits,
        analyzed_at = datetime('now')
    `).run(userId, profileText, matchedFigure, figureDescription, traits);
  }
  function getProfile(userId) {
    return db.prepare('SELECT * FROM personality_profiles WHERE user_id = ?').get(userId);
  }

  function blockUser(userId, blocked) {
    db.prepare('UPDATE users SET blocked = ? WHERE id = ?').run(blocked ? 1 : 0, userId);
  }

  function deleteUser(userId) {
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  }
}

initDB();

module.exports = {
  db,
  usePostgres,
  createUser,
  findUserByUsername,
  getUserById,
  getAllUsers,
  saveMessage,
  getMessages,
  countMessages,
  saveProfile,
  getProfile,
  blockUser,
  deleteUser
};
