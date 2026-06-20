const { embed }     = require('../utils/embed');
const { getConfig } = require('../database/db');

module.exports = {
  name: 'guildMemberAdd',
  once: false,
  async execute(client, member) {
    const guildId = member.guild.id;
    if (!getConfig(guildId, 'welcome_enabled', false)) return;

    const chId = getConfig(guildId, 'welcome_channel', null);
    if (!chId) return;
    const ch = member.guild.channels.cache.get(chId);
    if (!ch) return;

    const msg = (getConfig(guildId, 'welcome_message',
      `Welcome to **{server}**, {user}! You are member **#{count}**.`
    ))
      .replace('{user}', `<@${member.id}>`)
      .replace('{server}', member.guild.name)
      .replace('{count}', member.guild.memberCount.toLocaleString());

    const e = embed({
      type: 'brand',
      title: getConfig(guildId, 'welcome_title', '👋  Welcome!'),
      description: msg,
      thumbnail: member.user.displayAvatarURL({ dynamic: true }),
      banner: getConfig(guildId, 'welcome_banner', null),
      fields: [
        { name: '👤  Member',        value: `${member}`, inline: true },
        { name: '🔢  Member Count',  value: `#${member.guild.memberCount.toLocaleString()}`, inline: true },
        { name: '📅  Account Age',   value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
      ],
      guildId,
    });

    ch.send({ embeds: [e] }).catch(() => {});

    // Auto join-role
    const jr = getConfig(guildId, 'join_role', null);
    if (jr) member.roles.add(jr).catch(() => {});
  },
};
