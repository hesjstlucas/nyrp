const fs   = require('fs');
const path = require('path');

function loadEvents(client) {
  const dir = path.join(__dirname, '..', 'events');
  let n = 0;
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
    try {
      delete require.cache[require.resolve(path.join(dir, file))];
      const ev = require(path.join(dir, file));
      if (!ev.name || !ev.execute) continue;
      ev.once
        ? client.once(ev.name, (...a) => ev.execute(client, ...a))
        : client.on(ev.name,   (...a) => ev.execute(client, ...a));
      n++;
    } catch (e) { console.error(`❌  Event ${file}:`, e); }
  }
  console.log(`✅  Events: ${n}`);
}

module.exports = { loadEvents };
