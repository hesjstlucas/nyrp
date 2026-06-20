const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { db, getConfig, setConfig, nextCaseId, progressBar } = require('../../database/db');
const { embed, ok, err, infractionEmbed } = require('../../utils/embed');
const { requirePerm }  = require('../../utils/perms');
const { rel, trunc }   = require('../../utils/time');

const INF_POINTS = { Warning: 1, Strike: 2, Suspension: 4, Termination: 10 };
const INF_TYPES  = Object.keys(INF_POINTS).map(v => ({ name: v, value: v }));

function totalPoints(guildId, userId) {
  return db.prepare('SELECT SUM(points) as t FROM infractions WHERE guild_id=? AND user_id=? AND active=1').get(guildId, userId)?.t ?? 0;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('staff')
    .setDescription('Staff tools — infractions, promotions, awards, ranks')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    // infractions
    .addSubcommand(s => s.setName('infraction').setDescription('Add an infraction case')
      .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption(o => o.setName('type').setDescription('Type').setRequired(true).addChoices(...INF_TYPES))
      .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)))
    .addSubcommand(s => s.setName('infraction_remove').setDescription('Remove an infraction by case ID')
      .addIntegerOption(o => o.setName('case_id').setDescription('Case number').setRequired(true)))
    .addSubcommand(s => s.setName('infraction_view').setDescription('View all infractions for a user')
      .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true)))
    .addSubcommand(s => s.setName('infraction_case').setDescription('View a single case')
      .addIntegerOption(o => o.setName('case_id').setDescription('Case number').setRequired(true)))
    .addSubcommand(s => s.setName('infraction_history').setDescription('Server-wide infraction history'))
    .addSubcommand(s => s.setName('infraction_config').setDescription('Configure infraction settings')
      .addStringOption(o => o.setName('type').setDescription('Type').addChoices(...INF_TYPES))
      .addIntegerOption(o => o.setName('points').setDescription('Points for this type').setMinValue(0))
      .addIntegerOption(o => o.setName('max_points').setDescription('Max points before auto-action'))
      .addStringOption(o => o.setName('appeal_url').setDescription('Appeal form URL'))
      .addChannelOption(o => o.setName('log_channel').setDescription('Infraction log channel').addChannelTypes(ChannelType.GuildText)))
    // promotions
    .addSubcommand(s => s.setName('promote').setDescription('Promote a member to a rank')
      .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption(o => o.setName('rank').setDescription('Rank name').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)))
    .addSubcommand(s => s.setName('demote').setDescription('Demote a member from a rank')
      .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption(o => o.setName('rank').setDescription('Rank name').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)))
    .addSubcommand(s => s.setName('rank_create').setDescription('Create a new rank')
      .addStringOption(o => o.setName('name').setDescription('Rank name').setRequired(true))
      .addRoleOption(o => o.setName('role').setDescription('Linked role').setRequired(true))
      .addIntegerOption(o => o.setName('level').setDescription('Rank level/order').setRequired(true)))
    .addSubcommand(s => s.setName('rank_delete').setDescription('Delete a rank')
      .addStringOption(o => o.setName('name').setDescription('Rank name').setRequired(true)))
    .addSubcommand(s => s.setName('rank_list').setDescription('List all ranks'))
    // awards
    .addSubcommand(s => s.setName('award_give').setDescription('Give an award to a member')
      .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption(o => o.setName('award').setDescription('Award name').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason')))
    .addSubcommand(s => s.setName('award_revoke').setDescription('Revoke an award from a member')
      .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption(o => o.setName('award').setDescription('Award name').setRequired(true)))
    .addSubcommand(s => s.setName('award_create').setDescription('Create a new award type')
      .addStringOption(o => o.setName('name').setDescription('Award name').setRequired(true))
      .addStringOption(o => o.setName('emoji').setDescription('Emoji').setRequired(true))
      .addStringOption(o => o.setName('description').setDescription('Description')))
    .addSubcommand(s => s.setName('award_list').setDescription('List all awards for a user')
      .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))),

  category: 'staff',

  async execute(interaction, client) {
    if (!(await requirePerm(interaction, 'staff', `staff.${interaction.options.getSubcommand()}`))) return;
    const sub = interaction.options.getSubcommand();
    const map = {
      infraction: hInfraction, infraction_remove: hInfRemove, infraction_view: hInfView,
      infraction_case: hInfCase, infraction_history: hInfHistory, infraction_config: hInfConfig,
      promote: hPromote, demote: hDemote,
      rank_create: hRankCreate, rank_delete: hRankDelete, rank_list: hRankList,
      award_give: hAwardGive, award_revoke: hAwardRevoke, award_create: hAwardCreate, award_list: hAwardList,
    };
    return map[sub]?.(interaction, client);
  },
};

// ── infractions ───────────────────────────────────────────────────────────────
async function hInfraction(i) {
  await i.deferReply();
  const target = i.options.getUser('user');
  const type   = i.options.getString('type');
  const reason = i.options.getString('reason');
  const g      = i.guildId;
  const pts    = getConfig(g, `inf_pts_${type}`, INF_POINTS[type] ?? 1);
  const caseId = nextCaseId(g);
  const old    = totalPoints(g, target.id);
  const max    = getConfig(g, 'inf_max_pts', 10);
  const appeal = getConfig(g, 'inf_appeal_url', null);
  db.prepare('INSERT INTO infractions(guild_id,case_id,user_id,moderator_id,type,reason,points) VALUES(?,?,?,?,?,?,?)').run(g, caseId, target.id, i.user.id, type, reason, pts);
  const e = infractionEmbed({ caseId, type, member:{ id:target.id, tag:target.tag }, moderator:{ id:i.user.id, tag:i.user.tag }, reason, points:pts, oldPoints:old, maxPoints:max, appealUrl:appeal, guildId:g });
  try { await target.send({ embeds: [e] }); } catch {}
  await i.editReply({ embeds: [e] });
  const logId = getConfig(g, 'log_infractions', null);
  if (logId) { const ch = i.guild.channels.cache.get(logId); if (ch) ch.send({ embeds: [e] }).catch(() => {}); }
  // Auto-actions
  const newTotal = old + pts;
  const actions  = getConfig(g, 'inf_auto_actions', {});
  for (const [threshold, action] of Object.entries(actions)) {
    if (newTotal >= +threshold && old < +threshold) {
      const member = await i.guild.members.fetch(target.id).catch(() => null);
      if (member) {
        if (action === 'ban')    await member.ban({ reason:'Auto-action: threshold reached' }).catch(() => {});
        if (action === 'kick')   await member.kick('Auto-action: threshold reached').catch(() => {});
        if (action === 'mute1h') await member.timeout(3600e3, 'Auto-action').catch(() => {});
        if (action === 'mute1d') await member.timeout(86400e3, 'Auto-action').catch(() => {});
      }
    }
  }
}

async function hInfRemove(i) {
  await i.deferReply();
  const caseId = i.options.getInteger('case_id'); const g = i.guildId;
  const row = db.prepare('SELECT * FROM infractions WHERE guild_id=? AND case_id=?').get(g, caseId);
  if (!row) return i.editReply({ embeds: [err('Not Found', `Case #${caseId} not found.`, g)] });
  db.prepare('UPDATE infractions SET active=0 WHERE guild_id=? AND case_id=?').run(g, caseId);
  return i.editReply({ embeds: [ok('Infraction Removed', `Case #${caseId} has been removed.`, g)] });
}

async function hInfView(i) {
  await i.deferReply({ ephemeral: true });
  const target = i.options.getUser('user'); const g = i.guildId;
  const cases = db.prepare('SELECT * FROM infractions WHERE guild_id=? AND user_id=? ORDER BY created_at DESC LIMIT 20').all(g, target.id);
  if (!cases.length) return i.editReply({ embeds: [ok('No Infractions', `${target.tag} has no infractions.`, g)] });
  const pts = totalPoints(g, target.id); const max = getConfig(g, 'inf_max_pts', 10);
  const desc = cases.map(c => `**Case #${c.case_id}** · \`${c.type}\` · ${c.points}pts · ${rel(c.created_at)}${c.active ? '' : '  ~~(Removed)~~'}\n${trunc(c.reason, 80)}`).join('\n\n');
  return i.editReply({ embeds: [embed({ type:'infractions', title:`📋  Infractions — ${target.tag}`, description: desc,
    thumbnail: target.displayAvatarURL({ dynamic:true }),
    fields:[{ name:'⚡  Total Points', value: progressBar(pts, max), inline:false }], guildId: g })] });
}

async function hInfCase(i) {
  await i.deferReply({ ephemeral: true });
  const caseId = i.options.getInteger('case_id'); const g = i.guildId;
  const row = db.prepare('SELECT * FROM infractions WHERE guild_id=? AND case_id=?').get(g, caseId);
  if (!row) return i.editReply({ embeds: [err('Not Found', `Case #${caseId} not found.`, g)] });
  const [target, mod] = await Promise.all([
    i.client.users.fetch(row.user_id).catch(() => null),
    i.client.users.fetch(row.moderator_id).catch(() => null),
  ]);
  const prev = totalPoints(g, row.user_id) - (row.active ? row.points : 0);
  return i.editReply({ embeds: [infractionEmbed({ caseId, type:row.type, member:target ?? { id:row.user_id, tag:row.user_id }, moderator:mod ?? { id:row.moderator_id, tag:row.moderator_id }, reason:row.reason, points:row.points, oldPoints:prev, maxPoints:getConfig(g,'inf_max_pts',10), appealUrl:getConfig(g,'inf_appeal_url',null), guildId:g, active:row.active===1 })] });
}

async function hInfHistory(i) {
  await i.deferReply({ ephemeral: true });
  const g = i.guildId;
  const cases = db.prepare('SELECT * FROM infractions WHERE guild_id=? ORDER BY created_at DESC LIMIT 20').all(g);
  if (!cases.length) return i.editReply({ embeds: [ok('None', 'No infractions have been issued.', g)] });
  const desc = cases.map(c => `**#${c.case_id}** · <@${c.user_id}> · \`${c.type}\` · ${c.points}pts · ${rel(c.created_at)}`).join('\n');
  return i.editReply({ embeds: [embed({ type:'infractions', title:'📖  Infraction History', description: desc, guildId: g })] });
}

async function hInfConfig(i) {
  await i.deferReply({ ephemeral: true });
  const g = i.guildId; const fields = [];
  const type = i.options.getString('type'); const pts = i.options.getInteger('points');
  const maxPts = i.options.getInteger('max_points'); const appeal = i.options.getString('appeal_url');
  const logCh = i.options.getChannel('log_channel');
  if (type && pts !== null) { setConfig(g, `inf_pts_${type}`, pts); fields.push({ name:`⚡  ${type} Points`, value:`${pts}`, inline:true }); }
  if (maxPts)  { setConfig(g, 'inf_max_pts', maxPts);      fields.push({ name:'📊  Max Points', value:`${maxPts}`, inline:true }); }
  if (appeal)  { setConfig(g, 'inf_appeal_url', appeal);   fields.push({ name:'📝  Appeal URL', value:'Updated', inline:true }); }
  if (logCh)   { setConfig(g, 'log_infractions', logCh.id); fields.push({ name:'📋  Log Channel', value:`${logCh}`, inline:true }); }
  if (!fields.length) return i.editReply({ embeds: [err('Nothing Changed', 'Provide at least one setting.', g)] });
  return i.editReply({ embeds: [embed({ type:'infractions', title:'⚙️  Infraction Config Updated', fields, guildId: g })] });
}

// ── promote / demote ──────────────────────────────────────────────────────────
async function hPromote(i) {
  await i.deferReply();
  const target = i.options.getUser('user'); const rankName = i.options.getString('rank');
  const reason = i.options.getString('reason'); const g = i.guildId;
  const rank = db.prepare('SELECT * FROM ranks WHERE guild_id=? AND LOWER(name)=LOWER(?)').get(g, rankName);
  if (!rank) return i.editReply({ embeds: [err('Rank Not Found', `Rank **${rankName}** does not exist. Create it with \`/staff rank_create\`.`, g)] });
  const member = await i.guild.members.fetch(target.id).catch(() => null);
  if (!member) return i.editReply({ embeds: [err('Not Found', 'User not in server.', g)] });
  const role = i.guild.roles.cache.get(rank.role_id);
  if (!role) return i.editReply({ embeds: [err('Role Missing', 'The linked role no longer exists.', g)] });
  await member.roles.add(role, reason);
  db.prepare('INSERT INTO promotions(guild_id,user_id,moderator_id,action,new_rank,reason) VALUES(?,?,?,?,?,?)').run(g, target.id, i.user.id, 'promote', rank.name, reason);
  const e = embed({ type:'promotions', title:'🎖  Member Promoted',
    thumbnail: target.displayAvatarURL({ dynamic:true }),
    fields:[
      { name:'👤  Member',   value:`<@${target.id}>  \`${target.tag}\``, inline:true },
      { name:'🎖  New Rank', value:`${rank.name}  (${role})`,            inline:true },
      { name:'🔨  By',       value:`<@${i.user.id}>`,                   inline:true },
      { name:'📋  Reason',   value: reason, inline:false },
    ], guildId: g });
  await i.editReply({ embeds: [e] });
  try { await target.send({ embeds: [embed({ type:'promotions', title:'🎖  You Were Promoted!', fields:[
    { name:'🏠  Server', value: i.guild.name, inline:true },
    { name:'🎖  Rank', value: rank.name, inline:true },
    { name:'📋  Reason', value: reason, inline:false },
  ] })] }); } catch {}
  const logId = getConfig(g, 'log_promotions', null);
  if (logId) { const ch = i.guild.channels.cache.get(logId); if (ch) ch.send({ embeds: [e] }).catch(() => {}); }
}

async function hDemote(i) {
  await i.deferReply();
  const target = i.options.getUser('user'); const rankName = i.options.getString('rank');
  const reason = i.options.getString('reason'); const g = i.guildId;
  const rank = db.prepare('SELECT * FROM ranks WHERE guild_id=? AND LOWER(name)=LOWER(?)').get(g, rankName);
  if (!rank) return i.editReply({ embeds: [err('Rank Not Found', `Rank **${rankName}** not found.`, g)] });
  const member = await i.guild.members.fetch(target.id).catch(() => null);
  if (!member) return i.editReply({ embeds: [err('Not Found', 'User not in server.', g)] });
  const role = i.guild.roles.cache.get(rank.role_id);
  if (!role) return i.editReply({ embeds: [err('Role Missing', 'The linked role no longer exists.', g)] });
  if (!member.roles.cache.has(role.id)) return i.editReply({ embeds: [err('Role Not Held', `${target.tag} does not have the **${rank.name}** rank.`, g)] });
  await member.roles.remove(role, reason);
  db.prepare('INSERT INTO promotions(guild_id,user_id,moderator_id,action,old_rank,reason) VALUES(?,?,?,?,?,?)').run(g, target.id, i.user.id, 'demote', rank.name, reason);
  const e = embed({ type:'moderation', title:'📉  Member Demoted',
    thumbnail: target.displayAvatarURL({ dynamic:true }),
    fields:[
      { name:'👤  Member',       value:`<@${target.id}>  \`${target.tag}\``, inline:true },
      { name:'📉  Removed Rank', value:`${rank.name}`, inline:true },
      { name:'🔨  By',           value:`<@${i.user.id}>`, inline:true },
      { name:'📋  Reason',       value: reason, inline:false },
    ], guildId: g });
  await i.editReply({ embeds: [e] });
  try { await target.send({ embeds: [embed({ type:'moderation', title:'📉  You Were Demoted', fields:[
    { name:'🏠  Server', value: i.guild.name, inline:true },
    { name:'📉  Rank', value: rank.name, inline:true },
    { name:'📋  Reason', value: reason, inline:false },
  ] })] }); } catch {}
  const logId = getConfig(g, 'log_promotions', null);
  if (logId) { const ch = i.guild.channels.cache.get(logId); if (ch) ch.send({ embeds: [e] }).catch(() => {}); }
}

// ── ranks ─────────────────────────────────────────────────────────────────────
async function hRankCreate(i) {
  await i.deferReply({ ephemeral: true });
  const name = i.options.getString('name'); const role = i.options.getRole('role');
  const level = i.options.getInteger('level'); const g = i.guildId;
  try { db.prepare('INSERT INTO ranks(guild_id,name,role_id,level) VALUES(?,?,?,?)').run(g, name, role.id, level); }
  catch { return i.editReply({ embeds: [err('Already Exists', `Rank **${name}** already exists.`, g)] }); }
  return i.editReply({ embeds: [ok('Rank Created', `Rank **${name}** (Level ${level}) linked to ${role}.`, g)] });
}

async function hRankDelete(i) {
  await i.deferReply({ ephemeral: true });
  const name = i.options.getString('name'); const g = i.guildId;
  const { changes } = db.prepare('DELETE FROM ranks WHERE guild_id=? AND LOWER(name)=LOWER(?)').run(g, name);
  if (!changes) return i.editReply({ embeds: [err('Not Found', `Rank **${name}** not found.`, g)] });
  return i.editReply({ embeds: [ok('Rank Deleted', `**${name}** has been removed.`, g)] });
}

async function hRankList(i) {
  await i.deferReply({ ephemeral: true });
  const g = i.guildId;
  const ranks = db.prepare('SELECT * FROM ranks WHERE guild_id=? ORDER BY level DESC').all(g);
  if (!ranks.length) return i.editReply({ embeds: [err('No Ranks', 'No ranks have been created yet.', g)] });
  const desc = ranks.map(r => {
    const role = i.guild.roles.cache.get(r.role_id);
    const holders = role ? i.guild.members.cache.filter(m => m.roles.cache.has(role.id)).size : 0;
    return `**Lv.${r.level}  ${r.name}** · ${role ?? '`Missing`'} · ${holders} holder(s)`;
  }).join('\n');
  return i.editReply({ embeds: [embed({ type:'promotions', title:'📊  Rank List', description: desc, guildId: g })] });
}

// ── awards ────────────────────────────────────────────────────────────────────
async function hAwardGive(i) {
  await i.deferReply();
  const target = i.options.getUser('user'); const awardName = i.options.getString('award');
  const reason = i.options.getString('reason') ?? 'No reason provided'; const g = i.guildId;
  const type = db.prepare('SELECT * FROM award_types WHERE guild_id=? AND LOWER(name)=LOWER(?)').get(g, awardName);
  if (!type) return i.editReply({ embeds: [err('Not Found', `Award **${awardName}** does not exist. Create it with \`/staff award_create\`.`, g)] });
  db.prepare('INSERT INTO awards(guild_id,user_id,award_name,given_by,reason) VALUES(?,?,?,?,?)').run(g, target.id, type.name, i.user.id, reason);
  const e = embed({ type:'awards', title:`${type.emoji}  Award Given — ${type.name}`,
    thumbnail: target.displayAvatarURL({ dynamic:true }),
    fields:[
      { name:'👤  Recipient', value:`<@${target.id}>  \`${target.tag}\``, inline:true },
      { name:'🎁  By',        value:`<@${i.user.id}>`, inline:true },
      { name:'📋  Reason',    value: reason, inline:false },
    ], guildId: g });
  await i.editReply({ embeds: [e] });
  try { await target.send({ embeds: [embed({ type:'awards', title:`${type.emoji}  You Received an Award!`, fields:[
    { name:'🏠  Server', value: i.guild.name, inline:true },
    { name:'🏆  Award', value:`${type.emoji}  ${type.name}`, inline:true },
    { name:'📋  Reason', value: reason, inline:false },
  ] })] }); } catch {}
  const logId = getConfig(g, 'log_awards', null);
  if (logId) { const ch = i.guild.channels.cache.get(logId); if (ch) ch.send({ embeds: [e] }).catch(() => {}); }
}

async function hAwardRevoke(i) {
  await i.deferReply({ ephemeral: true });
  const target = i.options.getUser('user'); const awardName = i.options.getString('award'); const g = i.guildId;
  const row = db.prepare('SELECT id FROM awards WHERE guild_id=? AND user_id=? AND LOWER(award_name)=LOWER(?) LIMIT 1').get(g, target.id, awardName);
  if (!row) return i.editReply({ embeds: [err('Not Found', `${target.tag} does not have **${awardName}**.`, g)] });
  db.prepare('DELETE FROM awards WHERE id=?').run(row.id);
  return i.editReply({ embeds: [ok('Award Revoked', `**${awardName}** revoked from <@${target.id}>.`, g)] });
}

async function hAwardCreate(i) {
  await i.deferReply({ ephemeral: true });
  const name = i.options.getString('name'); const emoji = i.options.getString('emoji');
  const desc = i.options.getString('description') ?? null; const g = i.guildId;
  try { db.prepare('INSERT INTO award_types(guild_id,name,emoji,description) VALUES(?,?,?,?)').run(g, name, emoji, desc); }
  catch { return i.editReply({ embeds: [err('Already Exists', `Award **${name}** already exists.`, g)] }); }
  return i.editReply({ embeds: [ok('Award Created', `${emoji}  **${name}** has been created.`, g)] });
}

async function hAwardList(i) {
  await i.deferReply({ ephemeral: true });
  const target = i.options.getUser('user'); const g = i.guildId;
  const list = db.prepare('SELECT a.*, t.emoji FROM awards a LEFT JOIN award_types t ON LOWER(a.award_name)=LOWER(t.name) AND a.guild_id=t.guild_id WHERE a.guild_id=? AND a.user_id=? ORDER BY a.given_at DESC').all(g, target.id);
  if (!list.length) return i.editReply({ embeds: [ok('No Awards', `${target.tag} has no awards.`, g)] });
  const desc = list.map(a => `${a.emoji ?? '🏆'}  **${a.award_name}** · <@${a.given_by}> · ${rel(a.given_at)}`).join('\n');
  return i.editReply({ embeds: [embed({ type:'awards', title:`🏆  Awards — ${target.tag}`, description: desc, thumbnail: target.displayAvatarURL({ dynamic:true }), guildId: g })] });
}
