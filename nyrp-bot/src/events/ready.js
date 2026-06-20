const { ActivityType } = require('discord.js');
const { getConfig, db } = require('../database/db');

module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    console.log(`\n✅  Logged in as ${client.user.tag}`);
    console.log(`📊  ${client.guilds.cache.size} guild(s)  |  ${client.users.cache.size} users\n`);

    const guildId = client.guilds.cache.first()?.id;
    applyStatus(client, guildId);

    // Rotating status interval (30s)
    setInterval(() => {
      if (!guildId) return;
      if (!getConfig(guildId, 'status_rotate', false)) return;
      const list = db.prepare('SELECT * FROM rotating_statuses WHERE guild_id=? OR guild_id IS NULL').all(guildId);
      if (!list.length) return;
      client._rotIdx = ((client._rotIdx ?? -1) + 1) % list.length;
      const s = list[client._rotIdx];
      setActivity(client, s.type, s.text);
    }, 30_000);

    // Reminder checker (every 30s)
    setInterval(async () => {
      const due = db.prepare('SELECT * FROM reminders WHERE fired=0 AND fire_at<=?').all(Math.floor(Date.now() / 1000));
      for (const r of due) {
        try {
          const ch = await client.channels.fetch(r.channel_id).catch(() => null);
          if (ch) await ch.send({ content: `⏰  <@${r.user_id}> — **Reminder:** ${r.message}` });
          db.prepare('UPDATE reminders SET fired=1 WHERE id=?').run(r.id);
        } catch {}
      }
    }, 30_000);
  },
};

function applyStatus(client, guildId) {
  const type = guildId ? getConfig(guildId, 'status_type', 'Watching') : 'Watching';
  const text = guildId ? getConfig(guildId, 'status_text', 'New York RP') : 'New York RP';
  setActivity(client, type, text);
}

function setActivity(client, type, text) {
  const map = {
    Playing: ActivityType.Playing, Watching: ActivityType.Watching,
    Listening: ActivityType.Listening, Competing: ActivityType.Competing,
    Streaming: ActivityType.Streaming,
  };
  client.user.setPresence({ activities: [{ name: text, type: map[type] ?? ActivityType.Watching }], status: 'online' });
}
