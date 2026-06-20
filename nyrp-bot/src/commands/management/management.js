const {
  SlashCommandBuilder, PermissionFlagsBits, ChannelType,
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
  ActivityType, AttachmentBuilder,
} = require('discord.js');
const { db, getConfig, setConfig, delConfig, getAllConfig } = require('../../database/db');
const { embed, ok, err }  = require('../../utils/embed');
const { requirePerm }     = require('../../utils/perms');
const { isHex, fmtNum, rel } = require('../../utils/time');

const SECTIONS = ['default','tickets','moderation','staff','management','community','infractions','promotions','awards'];
const LOG_TYPES = ['mod','infractions','promotions','awards','tickets'];
const ACT_TYPES = ['Playing','Watching','Listening','Competing','Streaming'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('manage')
    .setDescription('Server management and configuration')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName('announce').setDescription('Send an announcement embed')
      .addChannelOption(o => o.setName('channel').setDescription('Target channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addStringOption(o => o.setName('message').setDescription('Announcement content').setRequired(true))
      .addRoleOption(o => o.setName('ping').setDescription('Role to ping'))
      .addStringOption(o => o.setName('title').setDescription('Custom title')))
    .addSubcommand(s => s.setName('embed').setDescription('Interactive embed builder')
      .addChannelOption(o => o.setName('channel').setDescription('Channel to post in').addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand(s => s.setName('say').setDescription('Send a plain message as the bot')
      .addChannelOption(o => o.setName('channel').setDescription('Target channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addStringOption(o => o.setName('message').setDescription('Message content').setRequired(true)))
    .addSubcommand(s => s.setName('editmsg').setDescription('Edit one of my messages')
      .addStringOption(o => o.setName('message_id').setDescription('Message ID').setRequired(true))
      .addChannelOption(o => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addStringOption(o => o.setName('content').setDescription('New content').setRequired(true)))
    .addSubcommand(s => s.setName('setlog').setDescription('Set a log channel')
      .addStringOption(o => o.setName('type').setDescription('Log type').setRequired(true).addChoices(...LOG_TYPES.map(t=>({name:t,value:t}))))
      .addChannelOption(o => o.setName('channel').setDescription('Log channel').addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand(s => s.setName('setrole').setDescription('Configure a named bot role (staff, admin, etc.)')
      .addStringOption(o => o.setName('name').setDescription('Role key e.g. staff, admin').setRequired(true))
      .addRoleOption(o => o.setName('role').setDescription('Discord role').setRequired(true)))
    .addSubcommand(s => s.setName('setstatus').setDescription('Set the bot activity status')
      .addStringOption(o => o.setName('type').setDescription('Activity type').setRequired(true).addChoices(...ACT_TYPES.map(t=>({name:t,value:t}))))
      .addStringOption(o => o.setName('text').setDescription('Status text').setRequired(true)))
    .addSubcommand(s => s.setName('setprefix').setDescription('Set the bot prefix for legacy commands')
      .addStringOption(o => o.setName('prefix').setDescription('New prefix (max 5 chars)').setRequired(true)))
    .addSubcommand(s => s.setName('setcolor').setDescription('Set embed color for a section')
      .addStringOption(o => o.setName('section').setDescription('Section').setRequired(true).addChoices(...SECTIONS.map(s=>({name:s,value:s}))))
      .addStringOption(o => o.setName('color').setDescription('Hex color e.g. #4FC3F7').setRequired(true)))
    .addSubcommand(s => s.setName('setbanner').setDescription('Set banner URL for a section')
      .addStringOption(o => o.setName('section').setDescription('Section').setRequired(true).addChoices(...SECTIONS.map(s=>({name:s,value:s}))))
      .addStringOption(o => o.setName('url').setDescription('Image URL').setRequired(true)))
    .addSubcommand(s => s.setName('setfooter').setDescription('Set footer text (server name)')
      .addStringOption(o => o.setName('text').setDescription('Footer text').setRequired(true)))
    .addSubcommand(s => s.setName('serverinfo').setDescription('View server information'))
    .addSubcommand(s => s.setName('userinfo').setDescription('View user information')
      .addUserOption(o => o.setName('user').setDescription('User (defaults to you)')))
    .addSubcommand(s => s.setName('roleinfo').setDescription('View role information')
      .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true)))
    .addSubcommand(s => s.setName('configview').setDescription('View current bot configuration')
      .addStringOption(o => o.setName('section').setDescription('Filter by section').addChoices(...SECTIONS.map(s=>({name:s,value:s})))))
    .addSubcommand(s => s.setName('configexport').setDescription('Export config as JSON'))
    .addSubcommand(s => s.setName('welcome').setDescription('Configure welcome messages')
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable welcome messages').setRequired(true))
      .addChannelOption(o => o.setName('channel').setDescription('Welcome channel').addChannelTypes(ChannelType.GuildText))
      .addStringOption(o => o.setName('message').setDescription('Message ({user} {server} {count})'))
      .addRoleOption(o => o.setName('join_role').setDescription('Role to assign on join')))
    .addSubcommand(s => s.setName('cmdpermission').setDescription('Lock a command to a role or disable it')
      .addStringOption(o => o.setName('command').setDescription('Command name').setRequired(true))
      .addRoleOption(o => o.setName('role').setDescription('Required role (leave blank to disable)'))
      .addBooleanOption(o => o.setName('disable').setDescription('Disable this command?'))),

  category: 'management',

  async execute(interaction, client) {
    if (!(await requirePerm(interaction, 'management'))) return;
    const sub = interaction.options.getSubcommand();
    const map = {
      announce: hAnnounce, embed: hEmbed, say: hSay, editmsg: hEdit,
      setlog: hSetLog, setrole: hSetRole, setstatus: hSetStatus, setprefix: hSetPrefix,
      setcolor: hSetColor, setbanner: hSetBanner, setfooter: hSetFooter,
      serverinfo: hServerInfo, userinfo: hUserInfo, roleinfo: hRoleInfo,
      configview: hConfigView, configexport: hConfigExport, welcome: hWelcome, cmdpermission: hCmdPerm,
    };
    return map[sub]?.(interaction, client);
  },

  modals: {
    manage_embed: async (interaction) => {
      const channelId = interaction.customId.split('_')[2];
      const ch = interaction.guild.channels.cache.get(channelId);
      const g  = interaction.guildId;
      if (!ch) return interaction.reply({ embeds: [err('Channel Gone', 'Channel no longer exists.', g)], ephemeral: true });
      const title = interaction.fields.getTextInputValue('e_title');
      const desc  = interaction.fields.getTextInputValue('e_desc');
      const color = interaction.fields.getTextInputValue('e_color') || null;
      const img   = interaction.fields.getTextInputValue('e_img')   || null;
      const e = embed({ type:'brand', title: title||undefined, description: desc||undefined, color: color||undefined, banner: img||undefined, guildId: g });
      await ch.send({ embeds: [e] });
      await interaction.reply({ embeds: [ok('Embed Sent', `Embed posted in ${ch}.`, g)], ephemeral: true });
    },
  },
};

async function hAnnounce(i) {
  await i.deferReply({ ephemeral: true });
  const ch = i.options.getChannel('channel'); const msg = i.options.getString('message');
  const ping = i.options.getRole('ping'); const title = i.options.getString('title') ?? '📢  Announcement';
  const g = i.guildId;
  const e = embed({ type:'brand', title, description: msg, authorName: i.guild.name, authorIcon: i.guild.iconURL({ dynamic:true }) ?? undefined, guildId: g });
  await ch.send({ content: ping ? `<@&${ping.id}>` : undefined, embeds: [e] });
  return i.editReply({ embeds: [ok('Sent', `Announcement posted in ${ch}.`, g)] });
}

async function hEmbed(i) {
  const ch = i.options.getChannel('channel');
  const modal = new ModalBuilder().setCustomId(`manage_embed_${ch.id}`).setTitle('Embed Builder');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('e_title').setLabel('Title').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(256)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('e_desc').setLabel('Description').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(4000)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('e_color').setLabel('Color (hex)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(7)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('e_img').setLabel('Banner/Image URL').setStyle(TextInputStyle.Short).setRequired(false)),
  );
  return i.showModal(modal);
}

async function hSay(i) {
  await i.deferReply({ ephemeral: true });
  const ch = i.options.getChannel('channel'); const msg = i.options.getString('message');
  await ch.send(msg);
  return i.editReply({ embeds: [ok('Sent', `Message posted in ${ch}.`, i.guildId)] });
}

async function hEdit(i) {
  await i.deferReply({ ephemeral: true });
  const msgId = i.options.getString('message_id'); const ch = i.options.getChannel('channel');
  const content = i.options.getString('content'); const g = i.guildId;
  const msg = await ch.messages.fetch(msgId).catch(() => null);
  if (!msg) return i.editReply({ embeds: [err('Not Found', 'Message not found.', g)] });
  if (msg.author.id !== i.client.user.id) return i.editReply({ embeds: [err('Not Mine', 'I can only edit my own messages.', g)] });
  await msg.edit(content);
  return i.editReply({ embeds: [ok('Edited', 'Message updated.', g)] });
}

async function hSetLog(i) {
  await i.deferReply({ ephemeral: true });
  const type = i.options.getString('type'); const ch = i.options.getChannel('channel');
  setConfig(i.guildId, `log_${type}`, ch.id);
  return i.editReply({ embeds: [ok('Log Set', `**${type}** logs → ${ch}.`, i.guildId)] });
}

async function hSetRole(i) {
  await i.deferReply({ ephemeral: true });
  const name = i.options.getString('name').toLowerCase(); const role = i.options.getRole('role');
  setConfig(i.guildId, `role_${name}`, role.id);
  return i.editReply({ embeds: [ok('Role Set', `**${name}** role → ${role}.`, i.guildId)] });
}

async function hSetStatus(i, client) {
  await i.deferReply({ ephemeral: true });
  const type = i.options.getString('type'); const text = i.options.getString('text');
  setConfig(i.guildId, 'status_type', type); setConfig(i.guildId, 'status_text', text);
  const map = { Playing: ActivityType.Playing, Watching: ActivityType.Watching, Listening: ActivityType.Listening, Competing: ActivityType.Competing, Streaming: ActivityType.Streaming };
  client.user.setPresence({ activities: [{ name: text, type: map[type] }], status: 'online' });
  return i.editReply({ embeds: [ok('Status Set', `Bot now shows **${type} ${text}**.`, i.guildId)] });
}

async function hSetPrefix(i) {
  await i.deferReply({ ephemeral: true });
  const prefix = i.options.getString('prefix').slice(0, 5);
  setConfig(i.guildId, 'prefix', prefix);
  return i.editReply({ embeds: [ok('Prefix Set', `Prefix updated to \`${prefix}\`.`, i.guildId)] });
}

async function hSetColor(i) {
  await i.deferReply({ ephemeral: true });
  const section = i.options.getString('section'); const color = i.options.getString('color');
  if (!isHex(color)) return i.editReply({ embeds: [err('Bad Color', 'Use a valid hex like `#4FC3F7`.', i.guildId)] });
  setConfig(i.guildId, `color_${section}`, color);
  return i.editReply({ embeds: [ok('Color Set', `**${section}** embeds → \`${color}\`.`, i.guildId)] });
}

async function hSetBanner(i) {
  await i.deferReply({ ephemeral: true });
  const section = i.options.getString('section'); const url = i.options.getString('url');
  setConfig(i.guildId, `banner_${section}`, url);
  return i.editReply({ embeds: [ok('Banner Set', `**${section}** banner updated.`, i.guildId)] });
}

async function hSetFooter(i) {
  await i.deferReply({ ephemeral: true });
  const text = i.options.getString('text');
  setConfig(i.guildId, 'footer_text', text);
  return i.editReply({ embeds: [ok('Footer Set', `Server name in footers set to **${text}**.`, i.guildId)] });
}

async function hServerInfo(i) {
  await i.deferReply(); const g = i.guildId; await i.guild.fetch();
  const { guild } = i;
  const text = guild.channels.cache.filter(c => c.type === 0).size;
  const voice = guild.channels.cache.filter(c => c.type === 2).size;
  return i.editReply({ embeds: [embed({ type:'management', title:`🏠  ${guild.name}`,
    thumbnail: guild.iconURL({ dynamic:true }) ?? undefined,
    fields:[
      { name:'🆔  ID',           value: guild.id, inline:true },
      { name:'👑  Owner',        value:`<@${guild.ownerId}>`, inline:true },
      { name:'👥  Members',      value: fmtNum(guild.memberCount), inline:true },
      { name:'💬  Text Channels', value:`${text}`, inline:true },
      { name:'🔊  Voice Channels', value:`${voice}`, inline:true },
      { name:'🎭  Roles',        value:`${guild.roles.cache.size}`, inline:true },
      { name:'😀  Emojis',       value:`${guild.emojis.cache.size}`, inline:true },
      { name:'🚀  Boosts',       value:`Level ${guild.premiumTier} (${guild.premiumSubscriptionCount})`, inline:true },
      { name:'📅  Created',      value:`<t:${Math.floor(guild.createdTimestamp/1000)}:F>`, inline:false },
    ], guildId: g })] });
}

async function hUserInfo(i) {
  await i.deferReply(); const g = i.guildId;
  const target = i.options.getUser('user') ?? i.user;
  const member = await i.guild.members.fetch(target.id).catch(() => null);
  const roles  = member ? [...member.roles.cache.values()].filter(r=>r.id!==g).sort((a,b)=>b.position-a.position).slice(0,8).map(r=>`${r}`).join(' ') : 'N/A';
  return i.editReply({ embeds: [embed({ type:'management', title:`👤  ${target.tag}`,
    thumbnail: target.displayAvatarURL({ dynamic:true, size:256 }),
    fields:[
      { name:'🆔  ID',          value: target.id, inline:true },
      { name:'🤖  Bot',         value: target.bot ? 'Yes' : 'No', inline:true },
      { name:'📅  Account Created', value:`<t:${Math.floor(target.createdTimestamp/1000)}:F>`, inline:false },
      ...(member ? [
        { name:'📅  Joined', value:`<t:${Math.floor(member.joinedTimestamp/1000)}:F>`, inline:false },
        { name:'🏷  Nickname', value: member.nickname ?? 'None', inline:true },
        { name:'🎭  Top Role', value:`${member.roles.highest}`, inline:true },
        { name:'⏸  Timed Out', value: member.isCommunicationDisabled() ? 'Yes' : 'No', inline:true },
        { name:`🎭  Roles [${member.roles.cache.size-1}]`, value: roles || 'None', inline:false },
      ] : []),
    ], guildId: g })] });
}

async function hRoleInfo(i) {
  await i.deferReply(); const g = i.guildId;
  const role = i.options.getRole('role');
  const members = i.guild.members.cache.filter(m=>m.roles.cache.has(role.id)).size;
  return i.editReply({ embeds: [embed({ type:'management', title:`🎭  Role — ${role.name}`,
    fields:[
      { name:'🆔  ID',         value: role.id, inline:true },
      { name:'🎨  Color',      value:`\`#${role.color.toString(16).padStart(6,'0').toUpperCase()}\``, inline:true },
      { name:'📊  Position',   value:`${role.position}`, inline:true },
      { name:'👥  Members',    value:`${members}`, inline:true },
      { name:'📌  Mentionable', value: role.mentionable ? 'Yes' : 'No', inline:true },
      { name:'📌  Hoisted',    value: role.hoist ? 'Yes' : 'No', inline:true },
      { name:'📅  Created',    value:`<t:${Math.floor(role.createdTimestamp/1000)}:F>`, inline:false },
    ], guildId: g })] });
}

async function hConfigView(i) {
  await i.deferReply({ ephemeral: true }); const g = i.guildId;
  const section = i.options.getString('section');
  const all = getAllConfig(g);
  const filtered = section ? Object.fromEntries(Object.entries(all).filter(([k])=>k.includes(section))) : all;
  const entries = Object.entries(filtered).slice(0, 20);
  if (!entries.length) return i.editReply({ embeds: [err('Empty', 'No config set yet.', g)] });
  const fields = entries.map(([k,v]) => ({ name:`\`${k}\``, value: String(v).slice(0,100)||'null', inline:true }));
  return i.editReply({ embeds: [embed({ type:'management', title:`⚙️  Config${section?` — ${section}`:''}`, fields, guildId: g })] });
}

async function hConfigExport(i) {
  await i.deferReply({ ephemeral: true }); const g = i.guildId;
  const config = getAllConfig(g);
  const json   = JSON.stringify({ guild_id: g, exported_at: new Date().toISOString(), config }, null, 2);
  const file   = new AttachmentBuilder(Buffer.from(json), { name:`nyrp-config-${g}.json` });
  return i.editReply({ embeds: [ok('Exported', 'Configuration exported below.', g)], files: [file] });
}

async function hWelcome(i) {
  await i.deferReply({ ephemeral: true }); const g = i.guildId;
  const enabled = i.options.getBoolean('enabled');
  const ch      = i.options.getChannel('channel');
  const msg     = i.options.getString('message');
  const role    = i.options.getRole('join_role');
  setConfig(g, 'welcome_enabled', enabled);
  if (ch)   setConfig(g, 'welcome_channel', ch.id);
  if (msg)  setConfig(g, 'welcome_message', msg);
  if (role) setConfig(g, 'join_role', role.id);
  const fields = [
    { name:'✅  Enabled', value: enabled ? 'Yes' : 'No', inline:true },
    ...(ch   ? [{ name:'📢  Channel',  value:`${ch}`, inline:true }] : []),
    ...(role ? [{ name:'🎭  Join Role', value:`${role}`, inline:true }] : []),
  ];
  return i.editReply({ embeds: [embed({ type:'management', title:'👋  Welcome Config Updated', fields, guildId: g })] });
}

async function hCmdPerm(i) {
  await i.deferReply({ ephemeral: true }); const g = i.guildId;
  const cmd     = i.options.getString('command').toLowerCase();
  const role    = i.options.getRole('role');
  const disable = i.options.getBoolean('disable') ?? false;
  db.prepare(`INSERT INTO cmd_permissions(guild_id,command_name,role_id,disabled) VALUES(?,?,?,?) ON CONFLICT(guild_id,command_name) DO UPDATE SET role_id=excluded.role_id,disabled=excluded.disabled`).run(g, cmd, role?.id ?? null, disable ? 1 : 0);
  const msg = disable ? `**${cmd}** has been disabled.` : role ? `**${cmd}** now requires ${role}.` : `**${cmd}** permissions cleared.`;
  return i.editReply({ embeds: [ok('Permission Updated', msg, g)] });
}
