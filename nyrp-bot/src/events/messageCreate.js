const { getConfig } = require('../database/db');
const { err }       = require('../utils/embed');

module.exports = {
  name: 'messageCreate',
  once: false,
  async execute(client, message) {
    if (message.author.bot || !message.guild) return;

    const prefix = getConfig(message.guild.id, 'prefix', '!');
    if (!message.content.startsWith(prefix)) return;

    const args    = message.content.slice(prefix.length).trim().split(/\s+/);
    const cmdName = args.shift().toLowerCase();
    const cmd     = client.prefixCmds.get(cmdName);
    if (!cmd) return;

    try {
      if (typeof cmd.executePrefix === 'function') {
        await cmd.executePrefix(message, args, client);
      } else {
        await message.reply({ embeds: [err('Use Slash', `Please use \`/${cmd.data.name}\` instead.`, message.guild.id)] });
      }
    } catch (e) {
      console.error(`Prefix error [${cmdName}]:`, e);
      message.reply({ embeds: [err('Error', 'Something went wrong.', message.guild.id)] }).catch(() => {});
    }
  },
};
