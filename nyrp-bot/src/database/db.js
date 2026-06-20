const Database = require('better-sqlite3');
const path = require('path');
const fs   = require('fs');

// DATA_DIR is /data on Fly.io (persistent volume), local fallback to ./data
const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'nyrp.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema ───────────────────────────────────────────────────────────────────

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      guild_id TEXT NOT NULL,
      key      TEXT NOT NULL,
      value    TEXT,
      PRIMARY KEY (guild_id, key)
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id    TEXT NOT NULL,
      channel_id  TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      ticket_type TEXT DEFAULT 'general',
      status      TEXT DEFAULT 'open',
      claimed_by  TEXT,
      close_reason TEXT,
      closed_by   TEXT,
      created_at  INTEGER DEFAULT (strftime('%s','now')),
      closed_at   INTEGER
    );

    CREATE TABLE IF NOT EXISTS mod_actions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id     TEXT NOT NULL,
      user_id      TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      action       TEXT NOT NULL,
      reason       TEXT,
      duration     TEXT,
      expires_at   INTEGER,
      created_at   INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS warnings (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id     TEXT NOT NULL,
      user_id      TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      reason       TEXT NOT NULL,
      created_at   INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS staff_notes (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id  TEXT NOT NULL,
      user_id   TEXT NOT NULL,
      author_id TEXT NOT NULL,
      note      TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS infractions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id     TEXT NOT NULL,
      case_id      INTEGER NOT NULL,
      user_id      TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      type         TEXT NOT NULL,
      reason       TEXT NOT NULL,
      points       INTEGER DEFAULT 1,
      active       INTEGER DEFAULT 1,
      created_at   INTEGER DEFAULT (strftime('%s','now')),
      UNIQUE(guild_id, case_id)
    );

    CREATE TABLE IF NOT EXISTS case_counters (
      guild_id    TEXT PRIMARY KEY,
      last_case_id INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS promotions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id     TEXT NOT NULL,
      user_id      TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      action       TEXT NOT NULL,
      old_rank     TEXT,
      new_rank     TEXT,
      reason       TEXT,
      created_at   INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS ranks (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id     TEXT NOT NULL,
      name         TEXT NOT NULL,
      role_id      TEXT NOT NULL,
      level        INTEGER DEFAULT 0,
      requirements TEXT,
      UNIQUE(guild_id, name)
    );

    CREATE TABLE IF NOT EXISTS divisions (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      name     TEXT NOT NULL,
      role_id  TEXT,
      UNIQUE(guild_id, name)
    );

    CREATE TABLE IF NOT EXISTS user_divisions (
      guild_id TEXT NOT NULL,
      user_id  TEXT NOT NULL,
      division TEXT NOT NULL,
      PRIMARY KEY (guild_id, user_id, division)
    );

    CREATE TABLE IF NOT EXISTS award_types (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id    TEXT NOT NULL,
      name        TEXT NOT NULL,
      emoji       TEXT DEFAULT '🏆',
      description TEXT,
      UNIQUE(guild_id, name)
    );

    CREATE TABLE IF NOT EXISTS awards (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id   TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      award_name TEXT NOT NULL,
      given_by   TEXT NOT NULL,
      reason     TEXT,
      given_at   INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS economy (
      guild_id    TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      balance     INTEGER DEFAULT 0,
      last_daily  INTEGER,
      last_weekly INTEGER,
      last_work   INTEGER,
      last_rob    INTEGER,
      last_gamble INTEGER,
      PRIMARY KEY (guild_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS shop_items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id    TEXT NOT NULL,
      name        TEXT NOT NULL,
      price       INTEGER NOT NULL,
      description TEXT,
      UNIQUE(guild_id, name)
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id  TEXT NOT NULL,
      user_id   TEXT NOT NULL,
      item_name TEXT NOT NULL,
      quantity  INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS rotating_statuses (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT,
      type     TEXT NOT NULL,
      text     TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cmd_permissions (
      guild_id     TEXT NOT NULL,
      command_name TEXT NOT NULL,
      role_id      TEXT,
      disabled     INTEGER DEFAULT 0,
      PRIMARY KEY (guild_id, command_name)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id   TEXT NOT NULL,
      host_id    TEXT NOT NULL,
      type       TEXT DEFAULT 'Standard',
      status     TEXT DEFAULT 'active',
      message_id TEXT,
      channel_id TEXT,
      players    INTEGER DEFAULT 0,
      max_players INTEGER DEFAULT 40,
      queue      INTEGER DEFAULT 0,
      staff_count INTEGER DEFAULT 0,
      locked     INTEGER DEFAULT 0,
      started_at INTEGER DEFAULT (strftime('%s','now')),
      ended_at   INTEGER
    );

    CREATE TABLE IF NOT EXISTS suggestions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id   TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      content    TEXT NOT NULL,
      status     TEXT DEFAULT 'pending',
      message_id TEXT,
      channel_id TEXT,
      reviewed_by TEXT,
      review_note TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id   TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message    TEXT NOT NULL,
      fire_at    INTEGER NOT NULL,
      fired      INTEGER DEFAULT 0
    );
  `);

  console.log('✅  Database ready');
}

// ─── Config helpers ───────────────────────────────────────────────────────────

function getConfig(guildId, key, defaultValue = null) {
  const row = db.prepare('SELECT value FROM config WHERE guild_id=? AND key=?').get(guildId, key);
  if (!row) return defaultValue;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

function setConfig(guildId, key, value) {
  const v = typeof value === 'object' ? JSON.stringify(value) : String(value);
  db.prepare(`
    INSERT INTO config (guild_id,key,value) VALUES(?,?,?)
    ON CONFLICT(guild_id,key) DO UPDATE SET value=excluded.value
  `).run(guildId, key, v);
}

function delConfig(guildId, key) {
  db.prepare('DELETE FROM config WHERE guild_id=? AND key=?').run(guildId, key);
}

function getAllConfig(guildId) {
  const rows = db.prepare('SELECT key,value FROM config WHERE guild_id=?').all(guildId);
  const out  = {};
  for (const r of rows) { try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; } }
  return out;
}

// ─── Case ID ──────────────────────────────────────────────────────────────────

function nextCaseId(guildId) {
  db.prepare(`
    INSERT INTO case_counters(guild_id,last_case_id) VALUES(?,1)
    ON CONFLICT(guild_id) DO UPDATE SET last_case_id=last_case_id+1
  `).run(guildId);
  return db.prepare('SELECT last_case_id FROM case_counters WHERE guild_id=?').get(guildId).last_case_id;
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function progressBar(current, max, len = 10) {
  const pct    = Math.min(current, max) / max;
  const filled = Math.round(pct * len);
  const empty  = len - filled;
  return `\`${'█'.repeat(filled)}${'░'.repeat(empty)}\` ${Math.min(current, max)}/${max}`;
}

// ─── Economy ──────────────────────────────────────────────────────────────────

function getEconomy(guildId, userId) {
  db.prepare('INSERT OR IGNORE INTO economy(guild_id,user_id) VALUES(?,?)').run(guildId, userId);
  return db.prepare('SELECT * FROM economy WHERE guild_id=? AND user_id=?').get(guildId, userId);
}

module.exports = {
  db, initDatabase,
  getConfig, setConfig, delConfig, getAllConfig,
  nextCaseId, progressBar, getEconomy,
};
