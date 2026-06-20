const fs   = require('fs');
const path = require('path');

function loadCommands(client) {
  const base = path.join(__dirname, '..', 'commands');
  let slash = 0, prefix = 0;

  for (const cat of fs.readdirSync(base)) {
    const catPath = path.join(base, cat);
    if (!fs.statSync(catPath).isDirectory()) continue;

    for (const file of fs.readdirSync(catPath).filter(f => f.endsWith('.js'))) {
      const fp = path.join(catPath, file);
      try {
        delete require.cache[require.resolve(fp)];
        const cmd = require(fp);

        if (cmd.data && typeof cmd.execute === 'function') {
          client.commands.set(cmd.data.name, cmd);
          slash++;
          if (cmd.prefix) {
            const aliases = Array.isArray(cmd.prefix) ? cmd.prefix : [cmd.prefix];
            for (const a of aliases) client.prefixCmds.set(a.toLowerCase(), cmd);
            prefix += aliases.length;
          }
        }

        if (cmd.buttons)     for (const [id, fn] of Object.entries(cmd.buttons))     client.buttons.set(id, fn);
        if (cmd.selectMenus) for (const [id, fn] of Object.entries(cmd.selectMenus)) client.selectMenus.set(id, fn);
        if (cmd.modals)      for (const [id, fn] of Object.entries(cmd.modals))      client.modals.set(id, fn);
      } catch (e) {
        console.error(`❌  Failed to load ${file}:`, e);
      }
    }
  }

  console.log(`✅  Commands: ${slash} slash, ${prefix} prefix aliases`);
}

module.exports = { loadCommands };
