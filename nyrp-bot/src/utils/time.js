/** Parse "1h30m", "7d", "10s" → milliseconds. Returns null if invalid. */
function parseDuration(str) {
  if (!str) return null;
  const re = /(\d+)\s*(s|sec|m|min|h|hr|d|day|w|wk)/gi;
  let ms = 0, match;
  while ((match = re.exec(str)) !== null) {
    const v = parseInt(match[1]);
    const u = match[2][0].toLowerCase();
    ms += u === 's' ? v * 1e3
        : u === 'm' ? v * 60e3
        : u === 'h' ? v * 3600e3
        : u === 'd' ? v * 86400e3
        : u === 'w' ? v * 604800e3 : 0;
  }
  return ms > 0 ? ms : null;
}

/** Format milliseconds to "2d 3h 15m 4s" */
function fmtDuration(ms) {
  if (!ms || ms <= 0) return 'Permanent';
  const s = Math.floor(ms / 1000);
  const parts = [];
  const d = Math.floor(s / 86400);  if (d) parts.push(`${d}d`);
  const h = Math.floor(s % 86400 / 3600); if (h) parts.push(`${h}h`);
  const m = Math.floor(s % 3600 / 60);    if (m) parts.push(`${m}m`);
  const sc = s % 60; if (sc && d === 0 && h === 0) parts.push(`${sc}s`);
  return parts.join(' ') || '0s';
}

/** Unix seconds relative Discord timestamp */
const rel  = ts => `<t:${ts}:R>`;
/** Unix seconds full Discord timestamp */
const full = ts => `<t:${ts}:F>`;
/** Current Unix seconds */
const now  = ()  => Math.floor(Date.now() / 1000);

/** Truncate string */
const trunc = (s, n = 1024) => s?.length > n ? s.slice(0, n - 1) + '…' : (s ?? '');

/** Format number with commas */
const fmtNum = n => Number(n).toLocaleString('en-US');

/** Validate hex color */
const isHex = s => /^#?[0-9A-Fa-f]{6}$/.test(s);

/** Divider string */
const line = (n = 32) => '\u2015'.repeat(n);

module.exports = { parseDuration, fmtDuration, rel, full, now, trunc, fmtNum, isHex, line };
