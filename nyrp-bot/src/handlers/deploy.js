require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { REST, Routes } = require('discord.js');
const fs   = require('fs');
const path = require('path');

const commands = [];

function collect(dir) {
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) { collect(full); continue; }
    if (!item.endsWith('.js')) continue;
    try {
      const cmd = require(full);
      if (cmd.data) { commands.push(cmd.data.toJSON()); console.log(`  ✔  ${cmd.data.name}`); }
    } catch (e) { console.error(`  ✘  ${item}:`, e.message); }
  }
}

collect(path.join(__dirname, '..', 'commands'));
console.log(`\n📡  Deploying ${commands.length} commands…\n`);

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    if (process.env.GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
      console.log(`✅  Guild deploy → ${process.env.GUILD_ID}`);
    } else {
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
      console.log('✅  Global deploy complete');
    }
  } catch (e) { console.error('❌  Deploy failed:', e); process.exit(1); }
})();
