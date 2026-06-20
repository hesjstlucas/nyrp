const {
  SlashCommandBuilder, PermissionFlagsBits, ChannelType,
  ButtonBuilder, ButtonStyle, ActionRowBuilder,
} = require('discord.js');
const { db, getConfig, setConfig } = require('../../database/db');
const { embed, ok, err }           = require('../../utils/embed');
const { requirePerm }              = require('../../utils/perms');
const { now }                      = require('../../utils/time');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('session')
    .setDescription('ERLC session management')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName('start').setDescription('Start a session and post the embed')
      .addStringOption(o => o.setName('type').setDescription('Session type').addChoices({ name:'Standard',value:'Standard' },{ name:'Hosted',value:'Hosted' },{ name:'Training',value:'Training' },{ name:'Patrol',value:'Patrol' }))
      .addStringOption(o => o.setName('host').setDescription('Host name'))
      .addStringOption(o => o.setName('cohost').setDescription('Co-host name'))
      .addStringOption(o => o.setName('join_link').setDescription('In-game join link')))
    .addSubcommand(s => s.setName('end').setDescription('End the active session')
      .addStringOption(o => o.setName('reason').setDescription('Reason')))
    .addSubcommand(s => s.setName('update').setDescription('Update player/staff counts on the session embed')
      .addIntegerOption(o => o.setName('players').setDescription('Current players').setMinValue(0))
      .addIntegerOption(o => o.setName('max').setDescription('Max players').setMinValue(1))
      .addIntegerOption(o => o.setName('queue').setDescription('Queue count').setMinValue(0))
      .addIntegerOption(o => o.setName('staff').setDescription('Staff count').setMinValue(0)))
    .addSubcommand(s => s.setName('lock').setDescription('Lock the session'))
    .addSubcommand(s => s.setName('unlock').setDescription('Unlock the session'))
    .addSubcommand(s => s.setName('status').setDescription('View current session status'))
    .addSubcommand(s => s.setName('setchannel').setDescription('Set session announcement channel')
      .addChannelOption(o => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand(s => s.setName('setping').setDescription('Set the session ping role')
      .addRoleOption(o => o.setName('role').setDescription('Role to ping').setRequired(true)))
    .addSubcommand(s => s.setName('setbanner').setDescription('Set the session embed banner')
      .addStringOption(o => o.setName('url').setDescription('Image URL').setRequired(true)))
    .addSubcommand(s => s.setName('setlink').setDescription('Set the default join link')
      .addStringOption(o => o.setName('url').setDescription('Join URL').setRequired(true)))
    .addSubcommand(s => s.setName('setmaxplayers').setDescription('Set default max player count')
      .addIntegerOption(o => o.setName('max').setDescription('Max players').setMinValue(1).setRequired(true)))
    .addSubcommand(s => s.setName('setdescription').setDescription('Set session embed description')
      .addStringOption(o => o.setName('text').setDescription('Description text').setRequired(true))),

  category: 'management',

  async execute(interaction, client) {
    if (!(await requirePerm(interaction, 'management', `session.${interaction.options.getSubcommand()}`))) return;
    const sub = interaction.options.getSubcommand();
    const map = {
      start: hStart, end: hEnd, update: hUpdate, lock: hLock, unlock: hUnlock, status: hStatus,
      setchannel: hSetChannel, setping: hSetPing, setbanner: hSetBanner,
      setlink: hSetLink, setmaxplayers: hSetMax, setdescription: hSetDesc,
    };
    return map[sub]?.(interaction, client);
  },

  buttons: {
    session_join: async (interaction) => {
      const link = getConfig(interaction.guildId, 'session_join_link', null);
      if (!link) return interaction.reply({ embeds: [err('No Link', 'No join link configured.', interaction.guildId)], ephemeral: true });
      return interaction.reply({ embeds: [embed({ type:'management', title:'🎮  Join In-Game', description:`[Click here to join the server](${link})`, guildId: interaction.guildId })], ephemeral: true });
    },
  },
};

function buildSessionEmbed(guildId, data) {
  const { type='Standard', host='Unknown', cohost=null, players=0, maxPlayers, queue=0, staff=0, locked=false } = data;
  const max  = maxPlayers || getConfig(guildId, 'session_max_players', 40);
  const desc = getConfig(guildId, 'session_description', 'Welcome to a New York RP session! Join us in-game for an amazing roleplay experience.');
  const status = locked ? '🔴  **Session Locked** — Not accepting players' : '🟢  **Session Online**';
  const fields = [
    { name:'🎮  Type',    value: type,   inline:true },
    { name:'👑  Host',    value: host,   inline:true },
    ...(cohost ? [{ name:'🤝  Co-Host', value: cohost, inline:true }] : []),
    { name:'\u200b', value:'\u2015'.repeat(30), inline:false },
    { name:'👥  Players', value:`${players} / ${max}`, inline:true },
    { name:'⏳  Queue',   value:`${queue}`,             inline:true },
    { name:'👮  Staff',   value:`${staff}`,             inline:true },
    { name:'\u200b', value: status, inline:false },
  ];
  return embed({ type:'management', title:`🏙  New York RP — ${type} Session`, description: desc, banner: getConfig(guildId,'banner_sessions',null) ?? getConfig(guildId,'banner_default',null), fields, guildId });
}

async function hStart(i, client) {
  await i.deferReply({ ephemeral: true }); const g = i.guildId;
  const active = db.prepare("SELECT id FROM sessions WHERE guild_id=? AND status='active'").get(g);
  if (active) return i.editReply({ embeds: [err('Active Session', 'End the current session first with `/session end`.', g)] });
  const chId = getConfig(g, 'session_channel', null);
  if (!chId) return i.editReply({ embeds: [err('No Channel', 'Set a channel first with `/session setchannel`.', g)] });
  const ch = i.guild.channels.cache.get(chId);
  if (!ch) return i.editReply({ embeds: [err('Channel Missing', 'Session channel not found.', g)] });

  const type   = i.options.getString('type') ?? 'Standard';
  const host   = i.options.getString('host') ?? i.member.displayName;
  const cohost = i.options.getString('cohost') ?? null;
  const link   = i.options.getString('join_link') ?? getConfig(g, 'session_join_link', null);
  const max    = getConfig(g, 'session_max_players', 40);
  if (link) setConfig(g, 'session_join_link', link);

  const data = { type, host, cohost, players:0, maxPlayers:max, queue:0, staff:0, locked:false };
  const e = buildSessionEmbed(g, data);
  const pingId = getConfig(g, 'session_ping_role', null);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('session_join').setLabel('Join In-Game').setStyle(ButtonStyle.Success).setEmoji('🎮')
  );

  const msg = await ch.send({ content: pingId ? `<@&${pingId}>` : undefined, embeds: [e], components: [row] });
  const res = db.prepare('INSERT INTO sessions(guild_id,host_id,type,message_id,channel_id,max_players) VALUES(?,?,?,?,?,?)').run(g, i.user.id, type, msg.id, ch.id, max);
  setConfig(g, 'active_session_id', res.lastInsertRowid);

  return i.editReply({ embeds: [ok('Session Started', `Session embed posted in ${ch}!`, g)] });
}

async function hEnd(i, client) {
  await i.deferReply({ ephemeral: true }); const g = i.guildId;
  const reason = i.options.getString('reason') ?? 'Session ended.';
  const sesId  = getConfig(g, 'active_session_id', null);
  if (!sesId) return i.editReply({ embeds: [err('No Session', 'No active session.', g)] });
  const ses = db.prepare('SELECT * FROM sessions WHERE id=?').get(sesId);
  if (!ses) return i.editReply({ embeds: [err('Not Found', 'Session not found in database.', g)] });
  db.prepare('UPDATE sessions SET status=?,ended_at=? WHERE id=?').run('ended', now(), sesId);
  setConfig(g, 'active_session_id', null);
  try {
    const ch  = i.guild.channels.cache.get(ses.channel_id);
    const msg = await ch?.messages?.fetch(ses.message_id).catch(() => null);
    if (msg) await msg.edit({ components: [] });
    if (ch) await ch.send({ embeds: [embed({ type:'error', title:'🔴  Session Ended', description: reason, guildId: g })] });
  } catch {}
  return i.editReply({ embeds: [ok('Session Ended', 'The session has been closed.', g)] });
}

async function hUpdate(i, client) {
  await i.deferReply({ ephemeral: true }); const g = i.guildId;
  const sesId = getConfig(g, 'active_session_id', null);
  if (!sesId) return i.editReply({ embeds: [err('No Session', 'No active session.', g)] });
  const ses = db.prepare('SELECT * FROM sessions WHERE id=?').get(sesId);
  if (!ses) return i.editReply({ embeds: [err('Not Found', 'Session not found.', g)] });
  const p = i.options.getInteger('players'); const mx = i.options.getInteger('max');
  const q = i.options.getInteger('queue');  const st = i.options.getInteger('staff');
  if (p  !== null) db.prepare('UPDATE sessions SET players=? WHERE id=?').run(p, sesId);
  if (mx !== null) db.prepare('UPDATE sessions SET max_players=? WHERE id=?').run(mx, sesId);
  if (q  !== null) db.prepare('UPDATE sessions SET queue=? WHERE id=?').run(q, sesId);
  if (st !== null) db.prepare('UPDATE sessions SET staff_count=? WHERE id=?').run(st, sesId);
  const updated = db.prepare('SELECT * FROM sessions WHERE id=?').get(sesId);
  const data = { type:updated.type, host:(await i.guild.members.fetch(updated.host_id).catch(()=>null))?.displayName??'Unknown', players:updated.players, maxPlayers:updated.max_players, queue:updated.queue, staff:updated.staff_count, locked:updated.locked===1 };
  const e = buildSessionEmbed(g, data);
  const ch = i.guild.channels.cache.get(updated.channel_id);
  const msg = await ch?.messages?.fetch(updated.message_id).catch(() => null);
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('session_join').setLabel('Join In-Game').setStyle(ButtonStyle.Success).setEmoji('🎮'));
  if (msg) await msg.edit({ embeds: [e], components: [row] });
  return i.editReply({ embeds: [ok('Session Updated', 'Embed refreshed.', g)] });
}

async function hLock(i) {
  await i.deferReply({ ephemeral: true }); const g = i.guildId;
  const sesId = getConfig(g, 'active_session_id', null);
  if (!sesId) return i.editReply({ embeds: [err('No Session', 'No active session.', g)] });
  db.prepare('UPDATE sessions SET locked=1 WHERE id=?').run(sesId);
  return i.editReply({ embeds: [ok('Session Locked', 'Session is now locked.', g)] });
}

async function hUnlock(i) {
  await i.deferReply({ ephemeral: true }); const g = i.guildId;
  const sesId = getConfig(g, 'active_session_id', null);
  if (!sesId) return i.editReply({ embeds: [err('No Session', 'No active session.', g)] });
  db.prepare('UPDATE sessions SET locked=0 WHERE id=?').run(sesId);
  return i.editReply({ embeds: [ok('Session Unlocked', 'Session is now accepting players.', g)] });
}

async function hStatus(i) {
  await i.deferReply({ ephemeral: true }); const g = i.guildId;
  const sesId = getConfig(g, 'active_session_id', null);
  if (!sesId) return i.editReply({ embeds: [err('No Session', 'No active session running.', g)] });
  const ses = db.prepare('SELECT * FROM sessions WHERE id=?').get(sesId);
  if (!ses) return i.editReply({ embeds: [err('Not Found', 'Session not found.', g)] });
  const host = await i.guild.members.fetch(ses.host_id).catch(() => null);
  const data = { type:ses.type, host:host?.displayName??'Unknown', players:ses.players, maxPlayers:ses.max_players, queue:ses.queue, staff:ses.staff_count, locked:ses.locked===1 };
  const e = buildSessionEmbed(g, data);
  e.addFields([{ name:'⏱  Started', value:`<t:${ses.started_at}:R>`, inline:true }]);
  return i.editReply({ embeds: [e] });
}

async function hSetChannel(i) { await i.deferReply({ ephemeral:true }); const ch = i.options.getChannel('channel'); setConfig(i.guildId,'session_channel',ch.id); return i.editReply({ embeds:[ok('Channel Set',`Session embeds → ${ch}.`,i.guildId)] }); }
async function hSetPing(i)    { await i.deferReply({ ephemeral:true }); const r  = i.options.getRole('role');     setConfig(i.guildId,'session_ping_role',r.id);  return i.editReply({ embeds:[ok('Ping Set',`${r} will be pinged on session start.`,i.guildId)] }); }
async function hSetBanner(i)  { await i.deferReply({ ephemeral:true }); const url = i.options.getString('url');   setConfig(i.guildId,'banner_sessions',url);     return i.editReply({ embeds:[ok('Banner Set','Session banner updated.',i.guildId)] }); }
async function hSetLink(i)    { await i.deferReply({ ephemeral:true }); const url = i.options.getString('url');   setConfig(i.guildId,'session_join_link',url);   return i.editReply({ embeds:[ok('Link Set','Default join link updated.',i.guildId)] }); }
async function hSetMax(i)     { await i.deferReply({ ephemeral:true }); const max = i.options.getInteger('max');  setConfig(i.guildId,'session_max_players',max); return i.editReply({ embeds:[ok('Max Set',`Default max players set to **${max}**.`,i.guildId)] }); }
async function hSetDesc(i)    { await i.deferReply({ ephemeral:true }); const txt = i.options.getString('text');  setConfig(i.guildId,'session_description',txt); return i.editReply({ embeds:[ok('Description Set','Session description updated.',i.guildId)] }); }
