require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const { initDatabase } = require('./src/database/db');
const { loadCommands } = require('./src/handlers/commandHandler');
const { loadEvents } = require('./src/handlers/eventHandler');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildPresences,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember],
});

// Command & interaction collections
client.commands    = new Collection();
client.prefixCmds  = new Collection();
client.cooldowns   = new Collection();
client.buttons     = new Collection();
client.selectMenus = new Collection();
client.modals      = new Collection();

// Boot sequence
initDatabase();
loadCommands(client);
loadEvents(client);

client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('❌  Login failed:', err.message);
  process.exit(1);
});

process.on('unhandledRejection', err => console.error('Unhandled rejection:', err));
process.on('uncaughtException',  err => console.error('Uncaught exception:', err));

module.exports = client;
