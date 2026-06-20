const {
  SlashCommandBuilder, PermissionFlagsBits, ChannelType,
  ActionRowBuilder, StringSelectMenuBuilder,
  ButtonBuilder, ButtonStyle, AttachmentBuilder,
} = require('discord.js');
const { db, getConfig, setConfig } = require('../../database/db');
const { embed, ok, err }           = require('../../utils/embed');
const { requirePerm }              = require('../../utils/perms');
const { rel, trunc }               = require('../../utils/time');

const TYPES = [
  { value:'general',      label:'General Support',  emoji:'💬', description:'Questions and general help' },
  { value:'staff_report', label:'Staff Report',      emoji:'📢', description:'Report a staff member' },
  { value:'ban_appeal',   label:'Ban Appeal',        emoji:'⚖️', description:'Appeal a ban or punishment' },
  { value:'partnership',  label:'Partnership',       emoji:'🤝', description:'Partnership inquiries' },
  { value:'other',        label:'Other',             emoji:'❓', description:'Anything else' },
];

const TYPE_CHOICES = TYPES.map(t => ({ name: t.label, value: t.value }));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ticket system')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand(s => s.setName('setup').setDescription('Configure ticket system')
      .addChannelOption(o => o.setName('log_channel').setDescription('Log channel').addChannelTypes(ChannelType.GuildText))
      .addStringOption(o => o.setName('banner').setDescription('Panel banner URL'))
      .addStringOption(o => o.setName('description').setDescription('Panel description'))
      .addStringOption(o => o.setName('color').setDescription('Embed color hex')))
    .addSubcommand(s => s.setName('panel').setDescription('Send the ticket panel to a channel')
      .addChannelOption(o => o.setName('channel').setDescription('Target channel').addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand(s => s.setName('close').setDescription('Close this ticket')
      .addStringOption(o => o.setName('reason').setDescription('Reason')))
    .addSubcommand(s => s.setName('add').setDescription('Add a user to this ticket')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)))
    .addSubcommand(s => s.setName('remove').setDescription('Remove a user from this ticket')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)))
    .addSubcommand(s => s.setName('rename').setDescription('Rename this ticket channel')
      .addStringOption(o => o.setName('name').setDescription('New name').setRequired(true)))
    .addSubcommand(s => s.setName('claim').setDescription('Claim this ticket'))
    .addSubcommand(s => s.setName('unclaim').setDescription('Unclaim this ticket'))
    .addSubcommand(s => s.setName('transcript').setDescription('Generate HTML transcript'))
    .addSubcommand(s => s.setName('setcategory').setDescription('Set Discord category for a ticket type')
      .addStringOption(o => o.setName('type').setDescription('Type').setRequired(true).addChoices(...TYPE_CHOICES))
      .addChannelOption(o => o.setName('category').setDescription('Category').addChannelTypes(ChannelType.GuildCategory).setRequired(true)))
    .addSubcommand(s => s.setName('setrole').setDescription('Set staff role for a ticket type')
      .addStringOption(o => o.setName('type').setDescription('Type').setRequired(true).addChoices(...TYPE_CHOICES))
      .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true)))
    .addSubcommand(s => s.setName('stats').setDescription('Ticket statistics'))
    .addSubcommand(s => s.setName('reopen').setDescription('Reopen a closed ticket'))
    .addSubcommand(s => s.setName('setmaxopen').setDescription('Max open tickets per user')
      .addIntegerOption(o => o.setName('max').setDescription('Max tickets (1-5)').setMinValue(1).setMaxValue(5).setRequired(true)))
    .addSubcommand(s => s.setName('list').setDescription('List all open tickets'))
    .addSubcommand(s => s.setName('forceclose').setDescription('Force-close all tickets for a user')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))),

  category: 'tickets',

  async execute(interaction, client) {
    if (!(await requirePerm(interaction, 'tickets', `ticket.${interaction.options.getSubcommand()}`))) return;
    const sub = interaction.options.getSubcommand();
    const map = {
      setup: hSetup, panel: hPanel, close: hClose, add: hAdd, remove: hRemove,
      rename: hRename, claim: hClaim, unclaim: hUnclaim, transcript: hTranscript,
      setcategory: hSetCategory, setrole: hSetRole, stats: hStats,
      reopen: hReopen, setmaxopen: hSetMaxOpen, list: hList, forceclose: hForceClose,
    };
    return map[sub]?.(interaction, client);
  },

  selectMenus: { ticket_open: handleTicketOpen },
  buttons: {
    ticket_close:  btnClose,
    ticket_claim:  btnClaim,
    ticket_trans:  btnTranscript,
  },
};

// ── setup ─────────────────────────────────────────────────────────────────────
async function hSetup(i) {
  await i.deferReply({ ephemeral: true });
  const g = i.guildId;
  const fields = [];
  const log = i.options.getChannel('log_channel');
  const banner = i.options.getString('banner');
  const desc   = i.options.getString('description');
  const color  = i.options.getString('color');
  if (log)    { setConfig(g, 'ticket_log_channel', log.id);         fields.push({ name:'📋  Log Channel', value:`${log}`, inline:true }); }
  if (banner) { setConfig(g, 'banner_tickets', banner);             fields.push({ name:'🖼  Banner', value:'Updated', inline:true }); }
  if (desc)   { setConfig(g, 'ticket_panel_desc', desc);            fields.push({ name:'📝  Description', value:'Updated', inline:true }); }
  if (color)  { setConfig(g, 'color_tickets', color);               fields.push({ name:'🎨  Color', value:color, inline:true }); }
  if (!fields.length) return i.editReply({ embeds: [err('Nothing Changed', 'Provide at least one option.', g)] });
  return i.editReply({ embeds: [embed({ type:'tickets', title:'🎫  Ticket System Configured', fields, guildId: g })] });
}

// ── panel ─────────────────────────────────────────────────────────────────────
async function hPanel(i, client) {
  await i.deferReply({ ephemeral: true });
  const ch = i.options.getChannel('channel');
  await sendPanel(ch, i.guildId, client);
  return i.editReply({ embeds: [ok('Panel Sent', `Ticket panel sent to ${ch}.`, i.guildId)] });
}

async function sendPanel(channel, guildId, client) {
  const desc   = getConfig(guildId, 'ticket_panel_desc', 'Select a category below to open a support ticket.');
  const banner = getConfig(guildId, 'banner_tickets', null);
  const typeList = TYPES.map(t => `${t.emoji}  **${t.label}**\n${t.description}`).join('\n\n');

  const e = embed({ type:'tickets', title:'🎫  Support Center',
    description: `${desc}\n\n${typeList}`, banner, guildId });

  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket_open')
    .setPlaceholder('📂  Select a ticket category…')
    .addOptions(TYPES.map(t => ({ label: t.label, description: t.description, value: t.value, emoji: t.emoji })));

  return channel.send({ embeds: [e], components: [new ActionRowBuilder().addComponents(menu)] });
}

// ── open (select menu handler) ────────────────────────────────────────────────
async function handleTicketOpen(interaction, client) {
  const guildId = interaction.guildId;
  const type    = interaction.values[0];
  const info    = TYPES.find(t => t.value === type);
  await interaction.deferReply({ ephemeral: true });

  const maxOpen  = getConfig(guildId, 'ticket_max_open', 1);
  const existing = db.prepare("SELECT * FROM tickets WHERE guild_id=? AND user_id=? AND status='open'").all(guildId, interaction.user.id);
  if (existing.length >= maxOpen) {
    return interaction.editReply({ embeds: [err('Already Open', `You already have ${existing.length} open ticket(s). Close them before opening another.`, guildId)] });
  }

  const catId     = getConfig(guildId, `ticket_cat_${type}`, null) ?? getConfig(guildId, 'ticket_cat_default', null);
  const staffRoleId = getConfig(guildId, `ticket_role_${type}`, null) ?? getConfig(guildId, 'role_staff', null);
  const chanName  = `ticket-${interaction.user.username.replace(/[^a-z0-9]/gi,'').toLowerCase().slice(0,12)}-${type.replace('_','-')}`.slice(0,100);

  const overwrites = [
    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id,  allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: client.user.id,       allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
  ];
  if (staffRoleId) overwrites.push({ id: staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] });

  const chan = await interaction.guild.channels.create({ name: chanName, type: 0, parent: catId ?? undefined, permissionOverwrites: overwrites, topic: `Ticket | ${interaction.user.tag} | ${info?.label}` }).catch(e => null);
  if (!chan) return interaction.editReply({ embeds: [err('Failed', 'Could not create ticket channel. Check bot permissions.', guildId)] });

  const res     = db.prepare('INSERT INTO tickets(guild_id,channel_id,user_id,ticket_type) VALUES(?,?,?,?)').run(guildId, chan.id, interaction.user.id, type);
  const ticketId = res.lastInsertRowid;

  const banner = getConfig(guildId, 'banner_tickets', null);
  const e = embed({ type:'tickets', title:`${info?.emoji ?? '🎫'}  ${info?.label} — #${ticketId}`,
    description: `Welcome <@${interaction.user.id}>! A staff member will be with you shortly.\n**Describe your issue below.**`,
    thumbnail: interaction.user.displayAvatarURL({ dynamic:true }), banner,
    fields:[
      { name:'👤  Opened By', value:`<@${interaction.user.id}>`, inline:true },
      { name:'📋  Type',      value: info?.label ?? type,         inline:true },
      { name:'🆔  Ticket',    value:`#${ticketId}`,               inline:true },
    ], guildId });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket_close_${ticketId}`).setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
    new ButtonBuilder().setCustomId(`ticket_claim_${ticketId}`).setLabel('Claim').setStyle(ButtonStyle.Primary).setEmoji('🎯'),
    new ButtonBuilder().setCustomId(`ticket_trans_${ticketId}`).setLabel('Transcript').setStyle(ButtonStyle.Secondary).setEmoji('📜'),
  );

  await chan.send({ content: `<@${interaction.user.id}>${staffRoleId ? `  <@&${staffRoleId}>` : ''}`, embeds: [e], components: [row] });
  return interaction.editReply({ embeds: [ok('Ticket Created', `Your ticket: ${chan}`, guildId)] });
}

// ── close ─────────────────────────────────────────────────────────────────────
async function hClose(i) {
  await i.deferReply();
  const g = i.guildId;
  const ticket = db.prepare("SELECT * FROM tickets WHERE channel_id=? AND status='open'").get(i.channelId);
  if (!ticket) return i.editReply({ embeds: [err('Not a Ticket', 'This is not an open ticket channel.', g)] });
  const reason = i.options.getString('reason') ?? 'No reason provided';
  const ts = Math.floor(Date.now() / 1000);
  db.prepare("UPDATE tickets SET status='closed',closed_at=?,closed_by=?,close_reason=? WHERE id=?").run(ts, i.user.id, reason, ticket.id);
  const logId = getConfig(g, 'ticket_log_channel', null);
  if (logId) {
    const lch = i.guild.channels.cache.get(logId);
    if (lch) lch.send({ embeds: [embed({ type:'tickets', title:'🔒  Ticket Closed',
      fields:[
        { name:'🎫  Ticket', value:`#${ticket.id}  (${i.channel})`, inline:true },
        { name:'👤  By',    value:`<@${i.user.id}>`, inline:true },
        { name:'📋  Reason', value: reason, inline:false },
      ], guildId: g })] }).catch(() => {});
  }
  await i.editReply({ embeds: [embed({ type:'tickets', title:'🔒  Ticket Closed',
    description:`Closed by <@${i.user.id}>. Channel deletes in 5 seconds.\n**Reason:** ${reason}`, guildId: g })] });
  setTimeout(() => i.channel.delete('Ticket closed').catch(() => {}), 5000);
}

async function btnClose(i, client) {
  const g = i.guildId;
  const ticket = db.prepare("SELECT * FROM tickets WHERE channel_id=? AND status='open'").get(i.channelId);
  if (!ticket) return i.reply({ embeds: [err('Not Open', 'Ticket already closed.', g)], ephemeral: true });
  const ts = Math.floor(Date.now() / 1000);
  db.prepare("UPDATE tickets SET status='closed',closed_at=?,closed_by=?,close_reason=? WHERE id=?").run(ts, i.user.id, 'Closed via button', ticket.id);
  await i.reply({ embeds: [embed({ type:'tickets', title:'🔒  Ticket Closed', description:`Closed by <@${i.user.id}>. Deletes in 5s.`, guildId: g })] });
  setTimeout(() => i.channel.delete().catch(() => {}), 5000);
}

async function btnClaim(i) {
  const g = i.guildId;
  const ticket = db.prepare("SELECT * FROM tickets WHERE channel_id=? AND status='open'").get(i.channelId);
  if (!ticket) return i.reply({ embeds: [err('Not Open', 'No open ticket here.', g)], ephemeral: true });
  if (ticket.claimed_by) return i.reply({ embeds: [err('Already Claimed', `Claimed by <@${ticket.claimed_by}>.`, g)], ephemeral: true });
  db.prepare('UPDATE tickets SET claimed_by=? WHERE id=?').run(i.user.id, ticket.id);
  await i.reply({ embeds: [embed({ type:'tickets', title:'🎯  Ticket Claimed', description:`<@${i.user.id}> is now handling this ticket.`, guildId: g })] });
}

async function btnTranscript(i, client) {
  const g = i.guildId;
  const ticket = db.prepare('SELECT * FROM tickets WHERE channel_id=?').get(i.channelId);
  if (!ticket) return i.reply({ embeds: [err('Not Found', 'No ticket for this channel.', g)], ephemeral: true });
  await i.deferReply({ ephemeral: true });
  const msgs = [...(await i.channel.messages.fetch({ limit: 100 })).values()].reverse();
  const html = buildHtml(ticket, msgs, i.guild);
  const file = new AttachmentBuilder(Buffer.from(html), { name: `transcript-${ticket.id}.html` });
  const logId = getConfig(g, 'ticket_log_channel', null);
  if (logId) {
    const lch = i.guild.channels.cache.get(logId);
    if (lch) await lch.send({ embeds: [embed({ type:'tickets', title:'📜  Transcript', fields:[{ name:'Ticket', value:`#${ticket.id}`, inline:true }], guildId: g })], files: [new AttachmentBuilder(Buffer.from(html), { name:`transcript-${ticket.id}.html` })] }).catch(() => {});
  }
  return i.editReply({ embeds: [ok('Transcript Ready', 'Attached below.', g)], files: [file] });
}

// ── add / remove / rename / claim / unclaim / transcript ──────────────────────
async function hAdd(i) {
  await i.deferReply({ ephemeral: true });
  const user = i.options.getUser('user'); const g = i.guildId;
  const ticket = db.prepare("SELECT * FROM tickets WHERE channel_id=? AND status='open'").get(i.channelId);
  if (!ticket) return i.editReply({ embeds: [err('Not a Ticket', 'Not an open ticket.', g)] });
  await i.channel.permissionOverwrites.create(user, { ViewChannel:true, SendMessages:true, ReadMessageHistory:true });
  return i.editReply({ embeds: [ok('User Added', `${user} added to the ticket.`, g)] });
}

async function hRemove(i) {
  await i.deferReply({ ephemeral: true });
  const user = i.options.getUser('user'); const g = i.guildId;
  const ticket = db.prepare("SELECT * FROM tickets WHERE channel_id=? AND status='open'").get(i.channelId);
  if (!ticket) return i.editReply({ embeds: [err('Not a Ticket', 'Not an open ticket.', g)] });
  if (user.id === ticket.user_id) return i.editReply({ embeds: [err('Cannot Remove', 'Cannot remove the ticket creator.', g)] });
  await i.channel.permissionOverwrites.delete(user);
  return i.editReply({ embeds: [ok('User Removed', `${user} removed from the ticket.`, g)] });
}

async function hRename(i) {
  await i.deferReply({ ephemeral: true });
  const name = i.options.getString('name').toLowerCase().replace(/[^a-z0-9-]/g,'-').slice(0,90);
  const ticket = db.prepare("SELECT * FROM tickets WHERE channel_id=? AND status='open'").get(i.channelId);
  if (!ticket) return i.editReply({ embeds: [err('Not a Ticket', 'Not an open ticket.', i.guildId)] });
  await i.channel.setName(`ticket-${name}`);
  return i.editReply({ embeds: [ok('Renamed', `Channel renamed to \`ticket-${name}\`.`, i.guildId)] });
}

async function hClaim(i) {
  await i.deferReply();
  const g = i.guildId;
  const ticket = db.prepare("SELECT * FROM tickets WHERE channel_id=? AND status='open'").get(i.channelId);
  if (!ticket) return i.editReply({ embeds: [err('Not a Ticket', 'Not an open ticket.', g)] });
  if (ticket.claimed_by) return i.editReply({ embeds: [err('Already Claimed', `Claimed by <@${ticket.claimed_by}>.`, g)] });
  db.prepare('UPDATE tickets SET claimed_by=? WHERE id=?').run(i.user.id, ticket.id);
  return i.editReply({ embeds: [embed({ type:'tickets', title:'🎯  Ticket Claimed', description:`<@${i.user.id}> is now handling this ticket.`, guildId: g })] });
}

async function hUnclaim(i) {
  await i.deferReply();
  const g = i.guildId;
  const ticket = db.prepare("SELECT * FROM tickets WHERE channel_id=? AND status='open'").get(i.channelId);
  if (!ticket?.claimed_by) return i.editReply({ embeds: [err('Not Claimed', 'This ticket is not claimed.', g)] });
  db.prepare('UPDATE tickets SET claimed_by=NULL WHERE id=?').run(ticket.id);
  return i.editReply({ embeds: [embed({ type:'tickets', title:'🔓  Ticket Unclaimed', description:`<@${i.user.id}> unclaimed this ticket.`, guildId: g })] });
}

async function hTranscript(i, client) {
  await i.deferReply({ ephemeral: true });
  const g = i.guildId;
  const ticket = db.prepare('SELECT * FROM tickets WHERE channel_id=?').get(i.channelId);
  if (!ticket) return i.editReply({ embeds: [err('Not Found', 'No ticket found for this channel.', g)] });
  const msgs = [...(await i.channel.messages.fetch({ limit: 100 })).values()].reverse();
  const html = buildHtml(ticket, msgs, i.guild);
  const file = new AttachmentBuilder(Buffer.from(html), { name: `transcript-${ticket.id}.html` });
  const logId = getConfig(g, 'ticket_log_channel', null);
  if (logId) {
    const lch = i.guild.channels.cache.get(logId);
    if (lch) lch.send({ embeds: [embed({ type:'tickets', title:'📜  Transcript Generated', fields:[{ name:'Ticket', value:`#${ticket.id}`, inline:true }], guildId: g })], files: [new AttachmentBuilder(Buffer.from(html), { name:`transcript-${ticket.id}.html` })] }).catch(() => {});
  }
  return i.editReply({ embeds: [ok('Transcript Ready', 'Sent to logs and attached.', g)], files: [file] });
}

// ── setcategory / setrole / stats / reopen / setmaxopen / list / forceclose ───
async function hSetCategory(i) {
  await i.deferReply({ ephemeral: true });
  const type = i.options.getString('type'); const cat = i.options.getChannel('category');
  setConfig(i.guildId, `ticket_cat_${type}`, cat.id);
  return i.editReply({ embeds: [ok('Category Set', `**${type}** tickets → **${cat.name}**.`, i.guildId)] });
}

async function hSetRole(i) {
  await i.deferReply({ ephemeral: true });
  const type = i.options.getString('type'); const role = i.options.getRole('role');
  setConfig(i.guildId, `ticket_role_${type}`, role.id);
  return i.editReply({ embeds: [ok('Role Set', `**${type}** tickets viewable by ${role}.`, i.guildId)] });
}

async function hStats(i) {
  await i.deferReply({ ephemeral: true });
  const g = i.guildId;
  const total   = db.prepare("SELECT COUNT(*) as c FROM tickets WHERE guild_id=?").get(g).c;
  const open    = db.prepare("SELECT COUNT(*) as c FROM tickets WHERE guild_id=? AND status='open'").get(g).c;
  const closed  = db.prepare("SELECT COUNT(*) as c FROM tickets WHERE guild_id=? AND status='closed'").get(g).c;
  const claimed = db.prepare("SELECT COUNT(*) as c FROM tickets WHERE guild_id=? AND status='open' AND claimed_by IS NOT NULL").get(g).c;
  const byType  = db.prepare("SELECT ticket_type, COUNT(*) as c FROM tickets WHERE guild_id=? GROUP BY ticket_type").all(g);
  return i.editReply({ embeds: [embed({ type:'tickets', title:'📊  Ticket Statistics',
    fields:[
      { name:'📬  Total',   value:`${total}`,  inline:true },
      { name:'🟢  Open',    value:`${open}`,   inline:true },
      { name:'🔴  Closed',  value:`${closed}`, inline:true },
      { name:'🎯  Claimed', value:`${claimed}`, inline:true },
      { name:'📋  By Type', value: byType.map(r=>`**${r.ticket_type}**: ${r.c}`).join('\n') || 'None', inline:false },
    ], guildId: g })] });
}

async function hReopen(i) {
  await i.deferReply();
  const g = i.guildId;
  const ticket = db.prepare("SELECT * FROM tickets WHERE channel_id=? AND status='closed'").get(i.channelId);
  if (!ticket) return i.editReply({ embeds: [err('Not Found', 'No closed ticket in this channel.', g)] });
  db.prepare("UPDATE tickets SET status='open', closed_at=NULL, closed_by=NULL WHERE id=?").run(ticket.id);
  const uid = ticket.user_id;
  await i.channel.permissionOverwrites.create(uid, { ViewChannel:true, SendMessages:true });
  return i.editReply({ embeds: [ok('Ticket Reopened', `Ticket #${ticket.id} has been reopened.`, g)] });
}

async function hSetMaxOpen(i) {
  await i.deferReply({ ephemeral: true });
  const max = i.options.getInteger('max');
  setConfig(i.guildId, 'ticket_max_open', max);
  return i.editReply({ embeds: [ok('Max Set', `Users can now have up to **${max}** open ticket(s).`, i.guildId)] });
}

async function hList(i) {
  await i.deferReply({ ephemeral: true });
  const g = i.guildId;
  const tickets = db.prepare("SELECT * FROM tickets WHERE guild_id=? AND status='open' ORDER BY created_at DESC LIMIT 20").all(g);
  if (!tickets.length) return i.editReply({ embeds: [ok('No Open Tickets', 'There are no open tickets.', g)] });
  const desc = tickets.map(t => `**#${t.id}** · <@${t.user_id}> · \`${t.ticket_type}\` · <#${t.channel_id}>${t.claimed_by ? `  (🎯 <@${t.claimed_by}>)` : ''}`).join('\n');
  return i.editReply({ embeds: [embed({ type:'tickets', title:`🎫  Open Tickets (${tickets.length})`, description: desc, guildId: g })] });
}

async function hForceClose(i) {
  await i.deferReply({ ephemeral: true });
  const user = i.options.getUser('user'); const g = i.guildId;
  const tickets = db.prepare("SELECT * FROM tickets WHERE guild_id=? AND user_id=? AND status='open'").all(g, user.id);
  if (!tickets.length) return i.editReply({ embeds: [ok('None Open', `${user.tag} has no open tickets.`, g)] });
  const ts = Math.floor(Date.now() / 1000);
  for (const t of tickets) {
    db.prepare("UPDATE tickets SET status='closed',closed_at=?,closed_by=?,close_reason=? WHERE id=?").run(ts, i.user.id, 'Force closed by staff', t.id);
    const ch = i.guild.channels.cache.get(t.channel_id);
    if (ch) ch.delete().catch(() => {});
  }
  return i.editReply({ embeds: [ok('Force Closed', `Closed **${tickets.length}** ticket(s) for ${user.tag}.`, g)] });
}

// ── HTML transcript ───────────────────────────────────────────────────────────
function buildHtml(ticket, messages, guild) {
  const rows = messages.map(m => {
    const c = (m.content || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const a = m.attachments.map(att => `<a href="${att.url}">${att.name}</a>`).join(' ');
    return `<div class="m"><img class="av" src="${m.author.displayAvatarURL({size:32})}"/><div class="b"><span class="u">${m.author.tag}</span><span class="t">${m.createdAt.toUTCString()}</span><div class="c">${c}${a ? `<br>${a}` : ''}</div></div></div>`;
  }).join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Transcript #${ticket.id}</title><style>body{background:#1e1f22;color:#dcddde;font-family:sans-serif;padding:20px}h1{color:#5DADE2}.m{display:flex;gap:10px;margin:8px 0}.av{border-radius:50%;width:36px;height:36px}.b{flex:1}.u{font-weight:700;color:#fff;margin-right:8px}.t{color:#72767d;font-size:.75em}.c{margin-top:3px}a{color:#5DADE2}hr{border-color:#5DADE2}</style></head><body><h1>🎫 Ticket #${ticket.id}</h1><p><b>Server:</b> ${guild?.name} | <b>Type:</b> ${ticket.ticket_type} | <b>Status:</b> ${ticket.status} | <b>Created:</b> ${new Date(ticket.created_at*1000).toUTCString()}</p><hr>${rows}</body></html>`;
}
