const {
  SlashCommandBuilder, PermissionFlagsBits, ChannelType,
} = require('discord.js');
const { db, getConfig }            = require('../../database/db');
const { embed, ok, err, wrn }      = require('../../utils/embed');
const { requirePerm }              = require('../../utils/perms');
const { parseDuration, fmtDuration, rel, trunc, now } = require('../../utils/time');

const LOG = (guildId, guild, e) => {
  const id = getConfig(guildId, 'log_moderation', null);
  if (id) { const ch = guild.channels.cache.get(id); if (ch) ch.send({ embeds: [e] }).catch(() => {}); }
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Moderation commands')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand(s => s.setName('ban').setDescription('Ban a member')
      .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true))
      .addStringOption(o => o.setName('duration').setDescription('Duration e.g. 7d (leave blank = permanent)'))
      .addIntegerOption(o => o.setName('delete_days').setDescription('Days of messages to delete (0-7)').setMinValue(0).setMaxValue(7)))
    .addSubcommand(s => s.setName('unban').setDescription('Unban a user by ID')
      .addStringOption(o => o.setName('userid').setDescription('User ID').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason')))
    .addSubcommand(s => s.setName('kick').setDescription('Kick a member')
      .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)))
    .addSubcommand(s => s.setName('mute').setDescription('Timeout a member')
      .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption(o => o.setName('duration').setDescription('Duration e.g. 1h, 1d (max 28d)').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)))
    .addSubcommand(s => s.setName('unmute').setDescription('Remove timeout from a member')
      .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason')))
    .addSubcommand(s => s.setName('warn').setDescription('Issue a warning')
      .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)))
    .addSubcommand(s => s.setName('warnings').setDescription('View warnings for a user')
      .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true)))
    .addSubcommand(s => s.setName('delwarn').setDescription('Delete a warning by ID')
      .addIntegerOption(o => o.setName('id').setDescription('Warning ID').setRequired(true)))
    .addSubcommand(s => s.setName('clearwarnings').setDescription('Clear all warnings for a user')
      .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true)))
    .addSubcommand(s => s.setName('purge').setDescription('Bulk delete messages')
      .addIntegerOption(o => o.setName('amount').setDescription('Messages to delete (1-100)').setMinValue(1).setMaxValue(100).setRequired(true))
      .addUserOption(o => o.setName('user').setDescription('Filter by user')))
    .addSubcommand(s => s.setName('slowmode').setDescription('Set channel slowmode')
      .addIntegerOption(o => o.setName('seconds').setDescription('Seconds (0 = off)').setMinValue(0).setMaxValue(21600).setRequired(true))
      .addChannelOption(o => o.setName('channel').setDescription('Channel (defaults to current)').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(s => s.setName('lock').setDescription('Lock a channel')
      .addChannelOption(o => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText))
      .addStringOption(o => o.setName('reason').setDescription('Reason')))
    .addSubcommand(s => s.setName('unlock').setDescription('Unlock a channel')
      .addChannelOption(o => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(s => s.setName('modlog').setDescription('View full mod history for a user')
      .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true)))
    .addSubcommand(s => s.setName('note').setDescription('Add a private staff note to a user')
      .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption(o => o.setName('note').setDescription('Note content').setRequired(true)))
    .addSubcommand(s => s.setName('notes').setDescription('View notes for a user')
      .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true)))
    .addSubcommand(s => s.setName('setsoftban').setDescription('Soft-ban a user (ban + immediate unban to delete messages)')
      .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)))
    .addSubcommand(s => s.setName('setlogchannel').setDescription('Set the moderation log channel')
      .addChannelOption(o => o.setName('channel').setDescription('Log channel').addChannelTypes(ChannelType.GuildText).setRequired(true))),

  category: 'moderation',

  async execute(interaction, client) {
    if (!(await requirePerm(interaction, 'moderation', `mod.${interaction.options.getSubcommand()}`))) return;
    const sub = interaction.options.getSubcommand();
    const map = {
      ban: hBan, unban: hUnban, kick: hKick, mute: hMute, unmute: hUnmute,
      warn: hWarn, warnings: hWarnings, delwarn: hDelwarn, clearwarnings: hClearWarns,
      purge: hPurge, slowmode: hSlowmode, lock: hLock, unlock: hUnlock,
      modlog: hModlog, note: hNote, notes: hNotes, setsoftban: hSoftban,
      setlogchannel: hSetLog,
    };
    return map[sub]?.(interaction);
  },
};

// ── ban ───────────────────────────────────────────────────────────────────────
async function hBan(i) {
  await i.deferReply();
  const target  = i.options.getUser('user');
  const reason  = i.options.getString('reason');
  const durStr  = i.options.getString('duration');
  const delDays = i.options.getInteger('delete_days') ?? 0;
  const g = i.guildId;

  const member = await i.guild.members.fetch(target.id).catch(() => null);
  if (member) {
    if (member.id === i.guild.ownerId) return i.editReply({ embeds: [err('Cannot Ban', 'Cannot ban the server owner.', g)] });
    if (i.member.roles.highest.comparePositionTo(member.roles.highest) <= 0 && i.guild.ownerId !== i.user.id)
      return i.editReply({ embeds: [err('Cannot Ban', 'That member has an equal or higher role.', g)] });
  }

  const durMs  = durStr ? parseDuration(durStr) : null;
  const expAt  = durMs ? now() + Math.floor(durMs / 1000) : null;

  try { await target.send({ embeds: [embed({ type:'moderation', title:'🔨  You Were Banned', fields:[
    { name:'🏠  Server', value: i.guild.name, inline:true },
    { name:'📋  Reason', value: reason, inline:false },
    { name:'⏱  Duration', value: durMs ? fmtDuration(durMs) : 'Permanent', inline:true },
  ], guildId: g })] }); } catch {}

  await i.guild.members.ban(target, { deleteMessageDays: delDays, reason }).catch(e2 => {
    return i.editReply({ embeds: [err('Ban Failed', e2.message, g)] });
  });

  db.prepare('INSERT INTO mod_actions(guild_id,user_id,moderator_id,action,reason,duration,expires_at) VALUES(?,?,?,?,?,?,?)')
    .run(g, target.id, i.user.id, 'ban', reason, durStr ?? 'Permanent', expAt);

  const e = embed({ type:'moderation', title:'🔨  Member Banned',
    thumbnail: target.displayAvatarURL({ dynamic:true }),
    fields:[
      { name:'👤  User',      value:`<@${target.id}>  \`${target.tag}\``, inline:true },
      { name:'🔨  Moderator', value:`<@${i.user.id}>`,                    inline:true },
      { name:'⏱  Duration',   value: durMs ? fmtDuration(durMs) : 'Permanent', inline:true },
      { name:'📋  Reason',    value: reason, inline:false },
    ], guildId: g });
  await i.editReply({ embeds: [e] });
  LOG(g, i.guild, e);
}

// ── unban ─────────────────────────────────────────────────────────────────────
async function hUnban(i) {
  await i.deferReply();
  const uid    = i.options.getString('userid');
  const reason = i.options.getString('reason') ?? 'No reason provided';
  const g = i.guildId;
  try { await i.guild.members.unban(uid, reason); } catch (e2) {
    return i.editReply({ embeds: [err('Unban Failed', e2.message, g)] });
  }
  db.prepare('INSERT INTO mod_actions(guild_id,user_id,moderator_id,action,reason) VALUES(?,?,?,?,?)')
    .run(g, uid, i.user.id, 'unban', reason);
  const e = embed({ type:'moderation', title:'✅  User Unbanned',
    fields:[
      { name:'🆔  User ID',   value:`\`${uid}\``,              inline:true },
      { name:'🔨  By',        value:`<@${i.user.id}>`,         inline:true },
      { name:'📋  Reason',    value: reason, inline:false },
    ], guildId: g });
  await i.editReply({ embeds: [e] });
  LOG(g, i.guild, e);
}

// ── kick ──────────────────────────────────────────────────────────────────────
async function hKick(i) {
  await i.deferReply();
  const target = i.options.getUser('user');
  const reason = i.options.getString('reason');
  const g = i.guildId;
  const member = await i.guild.members.fetch(target.id).catch(() => null);
  if (!member) return i.editReply({ embeds: [err('Not Found', 'User not in server.', g)] });
  if (!member.kickable) return i.editReply({ embeds: [err('Cannot Kick', 'Missing permissions to kick.', g)] });

  try { await target.send({ embeds: [embed({ type:'moderation', title:'👢  You Were Kicked',
    fields:[{ name:'🏠  Server', value: i.guild.name, inline:true }, { name:'📋  Reason', value: reason, inline:false }] })] }); } catch {}

  await member.kick(reason);
  db.prepare('INSERT INTO mod_actions(guild_id,user_id,moderator_id,action,reason) VALUES(?,?,?,?,?)')
    .run(g, target.id, i.user.id, 'kick', reason);
  const e = embed({ type:'moderation', title:'👢  Member Kicked',
    thumbnail: target.displayAvatarURL({ dynamic:true }),
    fields:[
      { name:'👤  User',      value:`<@${target.id}>  \`${target.tag}\``, inline:true },
      { name:'🔨  By',        value:`<@${i.user.id}>`, inline:true },
      { name:'📋  Reason',    value: reason, inline:false },
    ], guildId: g });
  await i.editReply({ embeds: [e] });
  LOG(g, i.guild, e);
}

// ── mute ──────────────────────────────────────────────────────────────────────
async function hMute(i) {
  await i.deferReply();
  const target = i.options.getUser('user');
  const durStr = i.options.getString('duration');
  const reason = i.options.getString('reason');
  const g = i.guildId;
  const ms = parseDuration(durStr);
  if (!ms) return i.editReply({ embeds: [err('Bad Duration', 'Use formats like `10m`, `1h`, `7d`.', g)] });
  if (ms > 28 * 86400e3) return i.editReply({ embeds: [err('Too Long', 'Max timeout is 28 days.', g)] });
  const member = await i.guild.members.fetch(target.id).catch(() => null);
  if (!member) return i.editReply({ embeds: [err('Not Found', 'User not in server.', g)] });
  if (!member.moderatable) return i.editReply({ embeds: [err('Cannot Mute', 'Missing permissions.', g)] });
  await member.timeout(ms, reason);
  db.prepare('INSERT INTO mod_actions(guild_id,user_id,moderator_id,action,reason,duration) VALUES(?,?,?,?,?,?)')
    .run(g, target.id, i.user.id, 'mute', reason, durStr);
  try { await target.send({ embeds: [embed({ type:'moderation', title:'🔇  You Were Muted',
    fields:[
      { name:'🏠  Server', value: i.guild.name, inline:true },
      { name:'⏱  Duration', value: fmtDuration(ms), inline:true },
      { name:'📋  Reason', value: reason, inline:false },
    ] })] }); } catch {}
  const e = embed({ type:'moderation', title:'🔇  Member Muted',
    thumbnail: target.displayAvatarURL({ dynamic:true }),
    fields:[
      { name:'👤  User',      value:`<@${target.id}>  \`${target.tag}\``, inline:true },
      { name:'🔨  By',        value:`<@${i.user.id}>`, inline:true },
      { name:'⏱  Duration',   value: fmtDuration(ms), inline:true },
      { name:'📋  Reason',    value: reason, inline:false },
    ], guildId: g });
  await i.editReply({ embeds: [e] });
  LOG(g, i.guild, e);
}

// ── unmute ────────────────────────────────────────────────────────────────────
async function hUnmute(i) {
  await i.deferReply();
  const target = i.options.getUser('user');
  const reason = i.options.getString('reason') ?? 'No reason';
  const g = i.guildId;
  const member = await i.guild.members.fetch(target.id).catch(() => null);
  if (!member) return i.editReply({ embeds: [err('Not Found', 'User not in server.', g)] });
  await member.timeout(null, reason);
  const e = ok('Member Unmuted', `<@${target.id}> timeout removed.\n**Reason:** ${reason}`, g);
  await i.editReply({ embeds: [e] });
  LOG(g, i.guild, e);
}

// ── warn ──────────────────────────────────────────────────────────────────────
async function hWarn(i) {
  await i.deferReply();
  const target = i.options.getUser('user');
  const reason = i.options.getString('reason');
  const g = i.guildId;
  if (target.bot) return i.editReply({ embeds: [err('Invalid', 'Cannot warn bots.', g)] });
  const res  = db.prepare('INSERT INTO warnings(guild_id,user_id,moderator_id,reason) VALUES(?,?,?,?)').run(g, target.id, i.user.id, reason);
  const total = db.prepare('SELECT COUNT(*) as c FROM warnings WHERE guild_id=? AND user_id=?').get(g, target.id).c;
  try { await target.send({ embeds: [embed({ type:'warning', title:'⚠  Warning Received',
    fields:[
      { name:'🏠  Server', value: i.guild.name, inline:true },
      { name:'📊  Total Warnings', value: `${total}`, inline:true },
      { name:'📋  Reason', value: reason, inline:false },
    ] })] }); } catch {}
  const e = embed({ type:'warning', title:'⚠  Warning Issued',
    thumbnail: target.displayAvatarURL({ dynamic:true }),
    fields:[
      { name:'👤  User',          value:`<@${target.id}>  \`${target.tag}\``, inline:true },
      { name:'🔨  By',            value:`<@${i.user.id}>`, inline:true },
      { name:'🆔  Warning ID',    value:`#${res.lastInsertRowid}`, inline:true },
      { name:'📊  Total Warns',   value:`${total}`, inline:true },
      { name:'📋  Reason',        value: reason, inline:false },
    ], guildId: g });
  await i.editReply({ embeds: [e] });
  LOG(g, i.guild, e);
}

// ── warnings ──────────────────────────────────────────────────────────────────
async function hWarnings(i) {
  await i.deferReply({ ephemeral: true });
  const target = i.options.getUser('user');
  const g = i.guildId;
  const list = db.prepare('SELECT * FROM warnings WHERE guild_id=? AND user_id=? ORDER BY created_at DESC LIMIT 20').all(g, target.id);
  if (!list.length) return i.editReply({ embeds: [ok('No Warnings', `${target.tag} has no warnings.`, g)] });
  const desc = list.map(w => `**#${w.id}** · <@${w.moderator_id}> · ${rel(w.created_at)}\n${trunc(w.reason, 80)}`).join('\n\n');
  return i.editReply({ embeds: [embed({ type:'warning', title:`⚠  Warnings — ${target.tag}`,
    description: desc, thumbnail: target.displayAvatarURL({ dynamic:true }),
    fields:[{ name:'📊  Total', value:`${list.length}`, inline:true }], guildId: g })] });
}

// ── delwarn ───────────────────────────────────────────────────────────────────
async function hDelwarn(i) {
  await i.deferReply({ ephemeral: true });
  const id = i.options.getInteger('id');
  const g = i.guildId;
  const row = db.prepare('SELECT * FROM warnings WHERE id=? AND guild_id=?').get(id, g);
  if (!row) return i.editReply({ embeds: [err('Not Found', `Warning #${id} not found.`, g)] });
  db.prepare('DELETE FROM warnings WHERE id=?').run(id);
  return i.editReply({ embeds: [ok('Warning Deleted', `Warning **#${id}** has been removed.`, g)] });
}

// ── clearwarnings ─────────────────────────────────────────────────────────────
async function hClearWarns(i) {
  await i.deferReply({ ephemeral: true });
  const target = i.options.getUser('user');
  const g = i.guildId;
  const { changes } = db.prepare('DELETE FROM warnings WHERE guild_id=? AND user_id=?').run(g, target.id);
  return i.editReply({ embeds: [ok('Warnings Cleared', `Cleared **${changes}** warning(s) for <@${target.id}>.`, g)] });
}

// ── purge ─────────────────────────────────────────────────────────────────────
async function hPurge(i) {
  await i.deferReply({ ephemeral: true });
  const amount = i.options.getInteger('amount');
  const filterUser = i.options.getUser('user');
  const g = i.guildId;
  const cutoff = Date.now() - 14 * 86400e3;
  let msgs = await i.channel.messages.fetch({ limit: filterUser ? 100 : amount });
  if (filterUser) msgs = msgs.filter(m => m.author.id === filterUser.id);
  const toDelete = [...msgs.values()].filter(m => m.createdTimestamp > cutoff).slice(0, amount);
  if (!toDelete.length) return i.editReply({ embeds: [err('No Messages', 'No eligible messages (must be <14 days old).', g)] });
  const del = await i.channel.bulkDelete(toDelete, true);
  return i.editReply({ embeds: [ok('Purged', `Deleted **${del.size}** message(s)${filterUser ? ` from ${filterUser.tag}` : ''}.`, g)] });
}

// ── slowmode ──────────────────────────────────────────────────────────────────
async function hSlowmode(i) {
  await i.deferReply({ ephemeral: true });
  const sec = i.options.getInteger('seconds');
  const ch  = i.options.getChannel('channel') ?? i.channel;
  const g   = i.guildId;
  await ch.setRateLimitPerUser(sec);
  return i.editReply({ embeds: [ok('Slowmode Set', sec === 0 ? `Slowmode disabled in ${ch}.` : `Slowmode set to **${sec}s** in ${ch}.`, g)] });
}

// ── lock ──────────────────────────────────────────────────────────────────────
async function hLock(i) {
  await i.deferReply();
  const ch     = i.options.getChannel('channel') ?? i.channel;
  const reason = i.options.getString('reason') ?? 'Locked by staff';
  const g = i.guildId;
  await ch.permissionOverwrites.edit(i.guild.id, { SendMessages: false });
  const e = wrn('Channel Locked', `${ch} has been locked.\n**Reason:** ${reason}`, g);
  await i.editReply({ embeds: [e] });
  LOG(g, i.guild, e);
}

// ── unlock ────────────────────────────────────────────────────────────────────
async function hUnlock(i) {
  await i.deferReply();
  const ch = i.options.getChannel('channel') ?? i.channel;
  const g  = i.guildId;
  await ch.permissionOverwrites.edit(i.guild.id, { SendMessages: null });
  await i.editReply({ embeds: [ok('Channel Unlocked', `${ch} has been unlocked.`, g)] });
}

// ── modlog ────────────────────────────────────────────────────────────────────
async function hModlog(i) {
  await i.deferReply({ ephemeral: true });
  const target = i.options.getUser('user');
  const g = i.guildId;
  const actions = db.prepare('SELECT * FROM mod_actions WHERE guild_id=? AND user_id=? ORDER BY created_at DESC LIMIT 20').all(g, target.id);
  const warns   = db.prepare('SELECT COUNT(*) as c FROM warnings WHERE guild_id=? AND user_id=?').get(g, target.id).c;
  if (!actions.length && !warns) return i.editReply({ embeds: [ok('Clean Record', `${target.tag} has no moderation history.`, g)] });
  const desc = actions.map(a =>
    `**${a.action.toUpperCase()}** · <@${a.moderator_id}> · ${rel(a.created_at)}\n${trunc(a.reason ?? 'No reason', 80)}${a.duration ? `  _(${a.duration})_` : ''}`
  ).join('\n\n') || 'None';
  return i.editReply({ embeds: [embed({ type:'moderation', title:`📋  Mod Log — ${target.tag}`,
    description: desc, thumbnail: target.displayAvatarURL({ dynamic:true }),
    fields:[
      { name:'⚠  Warnings',     value:`${warns}`,         inline:true },
      { name:'📊  Total Actions', value:`${actions.length}`, inline:true },
    ], guildId: g })] });
}

// ── note ──────────────────────────────────────────────────────────────────────
async function hNote(i) {
  await i.deferReply({ ephemeral: true });
  const target = i.options.getUser('user');
  const note   = i.options.getString('note');
  const g = i.guildId;
  const res = db.prepare('INSERT INTO staff_notes(guild_id,user_id,author_id,note) VALUES(?,?,?,?)').run(g, target.id, i.user.id, note);
  return i.editReply({ embeds: [ok('Note Added', `Note **#${res.lastInsertRowid}** saved for **${target.tag}**.`, g)] });
}

// ── notes ─────────────────────────────────────────────────────────────────────
async function hNotes(i) {
  await i.deferReply({ ephemeral: true });
  const target = i.options.getUser('user');
  const g = i.guildId;
  const list = db.prepare('SELECT * FROM staff_notes WHERE guild_id=? AND user_id=? ORDER BY created_at DESC LIMIT 15').all(g, target.id);
  if (!list.length) return i.editReply({ embeds: [ok('No Notes', `No notes for ${target.tag}.`, g)] });
  const desc = list.map(n => `**#${n.id}** · <@${n.author_id}> · ${rel(n.created_at)}\n${trunc(n.note, 100)}`).join('\n\n');
  return i.editReply({ embeds: [embed({ type:'moderation', title:`📝  Notes — ${target.tag}`, description: desc, guildId: g })] });
}

// ── softban ───────────────────────────────────────────────────────────────────
async function hSoftban(i) {
  await i.deferReply();
  const target = i.options.getUser('user');
  const reason = i.options.getString('reason');
  const g = i.guildId;
  await i.guild.members.ban(target, { deleteMessageDays: 7, reason });
  await i.guild.members.unban(target.id, 'Softban — unban after message delete');
  db.prepare('INSERT INTO mod_actions(guild_id,user_id,moderator_id,action,reason) VALUES(?,?,?,?,?)').run(g, target.id, i.user.id, 'softban', reason);
  const e = embed({ type:'moderation', title:'🧹  Member Soft-Banned',
    thumbnail: target.displayAvatarURL({ dynamic:true }),
    fields:[
      { name:'👤  User',   value:`<@${target.id}>  \`${target.tag}\``, inline:true },
      { name:'🔨  By',     value:`<@${i.user.id}>`, inline:true },
      { name:'📋  Reason', value: reason, inline:false },
    ], guildId: g });
  await i.editReply({ embeds: [e] });
  LOG(g, i.guild, e);
}

// ── setlogchannel ─────────────────────────────────────────────────────────────
async function hSetLog(i) {
  await i.deferReply({ ephemeral: true });
  const ch = i.options.getChannel('channel');
  const { setConfig } = require('../../database/db');
  setConfig(i.guildId, 'log_moderation', ch.id);
  return i.editReply({ embeds: [ok('Log Channel Set', `Moderation logs → ${ch}.`, i.guildId)] });
}
