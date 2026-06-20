const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { db, getConfig, setConfig, getEconomy }    = require('../../database/db');
const { embed, ok, err }  = require('../../utils/embed');
const { requirePerm }     = require('../../utils/perms');
const { fmtNum, now }     = require('../../utils/time');

const JOBS = [
  'You drove a taxi and earned {n} {c}!',
  'You patrolled as a police officer and earned {n} {c}!',
  'You responded as a paramedic and earned {n} {c}!',
  'You delivered packages and earned {n} {c}!',
  'You worked a shift at the fire station and earned {n} {c}!',
  'You fixed cars at the garage and earned {n} {c}!',
  'You served tables at a restaurant and earned {n} {c}!',
  'You coded an app and earned {n} {c}!',
  'You drove a truck across the state and earned {n} {c}!',
  'You trained new recruits and earned {n} {c}!',
];

const cur   = g => getConfig(g, 'currency_name',  'NYRP Credits');
const emoji = g => getConfig(g, 'currency_emoji', '💰');
const fmt   = (n, g) => `${emoji(g)} **${fmtNum(n)}** ${cur(g)}`;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('community')
    .setDescription('Community and economy commands')
    .addSubcommand(s => s.setName('balance').setDescription('Check balance')
      .addUserOption(o => o.setName('user').setDescription('User (defaults to you)')))
    .addSubcommand(s => s.setName('pay').setDescription('Pay another user')
      .addUserOption(o => o.setName('user').setDescription('Recipient').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setDescription('Amount').setMinValue(1).setRequired(true)))
    .addSubcommand(s => s.setName('daily').setDescription('Claim your daily reward'))
    .addSubcommand(s => s.setName('weekly').setDescription('Claim your weekly reward'))
    .addSubcommand(s => s.setName('work').setDescription('Work for credits (1h cooldown)'))
    .addSubcommand(s => s.setName('leaderboard').setDescription('Economy leaderboard'))
    .addSubcommand(s => s.setName('gamble').setDescription('Gamble credits')
      .addIntegerOption(o => o.setName('amount').setDescription('Amount to bet').setMinValue(1).setRequired(true)))
    .addSubcommand(s => s.setName('rob').setDescription('Attempt to rob another user')
      .addUserOption(o => o.setName('user').setDescription('Target').setRequired(true)))
    .addSubcommand(s => s.setName('shop').setDescription('Browse the shop'))
    .addSubcommand(s => s.setName('buy').setDescription('Buy an item from the shop')
      .addStringOption(o => o.setName('item').setDescription('Item name').setRequired(true)))
    .addSubcommand(s => s.setName('inventory').setDescription('View inventory')
      .addUserOption(o => o.setName('user').setDescription('User (defaults to you)')))
    .addSubcommand(s => s.setName('suggest').setDescription('Submit a suggestion')
      .addStringOption(o => o.setName('suggestion').setDescription('Your suggestion').setRequired(true)))
    .addSubcommand(s => s.setName('reminder').setDescription('Set a reminder')
      .addStringOption(o => o.setName('time').setDescription('Duration e.g. 1h, 30m').setRequired(true))
      .addStringOption(o => o.setName('message').setDescription('Reminder message').setRequired(true)))
    // Admin-only economy tools
    .addSubcommand(s => s.setName('additem').setDescription('[Admin] Add a shop item')
      .addStringOption(o => o.setName('name').setDescription('Item name').setRequired(true))
      .addIntegerOption(o => o.setName('price').setDescription('Price').setMinValue(1).setRequired(true))
      .addStringOption(o => o.setName('description').setDescription('Description')))
    .addSubcommand(s => s.setName('removeitem').setDescription('[Admin] Remove a shop item')
      .addStringOption(o => o.setName('name').setDescription('Item name').setRequired(true)))
    .addSubcommand(s => s.setName('editbalance').setDescription('[Admin] Adjust a user\'s balance')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
      .addStringOption(o => o.setName('action').setDescription('Action').setRequired(true).addChoices({ name:'Add', value:'add' },{ name:'Remove', value:'remove' },{ name:'Set', value:'set' }))
      .addIntegerOption(o => o.setName('amount').setDescription('Amount').setMinValue(0).setRequired(true)))
    .addSubcommand(s => s.setName('setcurrency').setDescription('[Admin] Set currency name and emoji')
      .addStringOption(o => o.setName('name').setDescription('Currency name').setRequired(true))
      .addStringOption(o => o.setName('emoji').setDescription('Currency emoji').setRequired(true))),

  category: 'community',
  cooldown: 2,

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const adminSubs = ['additem','removeitem','editbalance','setcurrency'];
    if (adminSubs.includes(sub)) {
      if (!(await requirePerm(interaction, 'management', `community.${sub}`))) return;
    }
    const map = {
      balance: hBalance, pay: hPay, daily: hDaily, weekly: hWeekly, work: hWork,
      leaderboard: hLeaderboard, gamble: hGamble, rob: hRob,
      shop: hShop, buy: hBuy, inventory: hInventory,
      suggest: hSuggest, reminder: hReminder,
      additem: hAddItem, removeitem: hRemoveItem, editbalance: hEditBalance, setcurrency: hSetCurrency,
    };
    return map[sub]?.(interaction);
  },
};

async function hBalance(i) {
  await i.deferReply();
  const target = i.options.getUser('user') ?? i.user; const g = i.guildId;
  const eco = getEconomy(g, target.id);
  return i.editReply({ embeds: [embed({ type:'community', title:`${emoji(g)}  Balance — ${target.tag}`,
    description: fmt(eco.balance, g), thumbnail: target.displayAvatarURL({ dynamic:true }), guildId: g })] });
}

async function hPay(i) {
  await i.deferReply(); const g = i.guildId;
  const target = i.options.getUser('user'); const amount = i.options.getInteger('amount');
  if (target.id === i.user.id) return i.editReply({ embeds: [err('Invalid', 'You cannot pay yourself.', g)] });
  if (target.bot)              return i.editReply({ embeds: [err('Invalid', 'You cannot pay bots.', g)] });
  const eco = getEconomy(g, i.user.id);
  if (eco.balance < amount) return i.editReply({ embeds: [err('Insufficient', `You only have ${fmt(eco.balance, g)}.`, g)] });
  db.prepare('UPDATE economy SET balance=balance-? WHERE guild_id=? AND user_id=?').run(amount, g, i.user.id);
  db.prepare('INSERT OR IGNORE INTO economy(guild_id,user_id) VALUES(?,?)').run(g, target.id);
  db.prepare('UPDATE economy SET balance=balance+? WHERE guild_id=? AND user_id=?').run(amount, g, target.id);
  return i.editReply({ embeds: [ok('Payment Sent', `You sent ${fmt(amount, g)} to <@${target.id}>.`, g)] });
}

async function hDaily(i) {
  await i.deferReply(); const g = i.guildId; const uid = i.user.id; const n = now();
  const eco = getEconomy(g, uid); const cd = 86400;
  if (eco.last_daily && n - eco.last_daily < cd) {
    const left = cd - (n - eco.last_daily); const h = Math.floor(left/3600); const m = Math.floor(left%3600/60);
    return i.editReply({ embeds: [err('Cooldown', `Come back in **${h}h ${m}m**.`, g)] });
  }
  const reward = getConfig(g, 'daily_reward', 200);
  db.prepare('UPDATE economy SET balance=balance+?,last_daily=? WHERE guild_id=? AND user_id=?').run(reward, n, g, uid);
  return i.editReply({ embeds: [ok('Daily Claimed!', `You received ${fmt(reward, g)}!`, g)] });
}

async function hWeekly(i) {
  await i.deferReply(); const g = i.guildId; const uid = i.user.id; const n = now();
  const eco = getEconomy(g, uid); const cd = 604800;
  if (eco.last_weekly && n - eco.last_weekly < cd) {
    const left = cd - (n - eco.last_weekly); const d = Math.floor(left/86400); const h = Math.floor(left%86400/3600);
    return i.editReply({ embeds: [err('Cooldown', `Come back in **${d}d ${h}h**.`, g)] });
  }
  const reward = getConfig(g, 'weekly_reward', 1000);
  db.prepare('UPDATE economy SET balance=balance+?,last_weekly=? WHERE guild_id=? AND user_id=?').run(reward, n, g, uid);
  return i.editReply({ embeds: [ok('Weekly Claimed!', `You received ${fmt(reward, g)}!`, g)] });
}

async function hWork(i) {
  await i.deferReply(); const g = i.guildId; const uid = i.user.id; const n = now();
  const eco = getEconomy(g, uid); const cd = 3600;
  if (eco.last_work && n - eco.last_work < cd) {
    const left = cd - (n - eco.last_work); const m = Math.floor(left/60);
    return i.editReply({ embeds: [err('Cooldown', `You need a break. Come back in **${m}m**.`, g)] });
  }
  const min = getConfig(g, 'work_min', 50); const max = getConfig(g, 'work_max', 300);
  const amount = Math.floor(Math.random() * (max - min + 1)) + min;
  const job = JOBS[Math.floor(Math.random() * JOBS.length)].replace('{n}', fmtNum(amount)).replace('{c}', cur(g));
  db.prepare('UPDATE economy SET balance=balance+?,last_work=? WHERE guild_id=? AND user_id=?').run(amount, n, g, uid);
  return i.editReply({ embeds: [embed({ type:'community', title:'💼  Work', description: job, guildId: g })] });
}

async function hLeaderboard(i) {
  await i.deferReply(); const g = i.guildId;
  const rows = db.prepare('SELECT user_id,balance FROM economy WHERE guild_id=? ORDER BY balance DESC LIMIT 10').all(g);
  if (!rows.length) return i.editReply({ embeds: [err('Empty', 'No economy data yet.', g)] });
  const desc = rows.map((r,idx) => `**#${idx+1}**  <@${r.user_id}> — ${fmt(r.balance, g)}`).join('\n');
  return i.editReply({ embeds: [embed({ type:'community', title:`${emoji(g)}  Economy Leaderboard`, description: desc, guildId: g })] });
}

async function hGamble(i) {
  await i.deferReply(); const g = i.guildId; const uid = i.user.id; const n = now();
  const amount = i.options.getInteger('amount');
  const eco = getEconomy(g, uid);
  if (eco.last_gamble && n - eco.last_gamble < 30) return i.editReply({ embeds: [err('Cooldown', 'Wait 30 seconds before gambling again.', g)] });
  if (eco.balance < amount) return i.editReply({ embeds: [err('Insufficient', `You only have ${fmt(eco.balance, g)}.`, g)] });
  const win = Math.random() < 0.45;
  db.prepare('UPDATE economy SET balance=balance+?,last_gamble=? WHERE guild_id=? AND user_id=?').run(win ? amount : -amount, n, g, uid);
  const newBal = eco.balance + (win ? amount : -amount);
  return i.editReply({ embeds: [embed({ type: win ? 'success' : 'error', title: win ? '🎰  You Won!' : '🎰  You Lost!',
    description: win ? `You bet ${fmt(amount,g)} and **won**!\nNew balance: ${fmt(newBal,g)}`
                     : `You bet ${fmt(amount,g)} and **lost**.\nNew balance: ${fmt(newBal,g)}`, guildId: g })] });
}

async function hRob(i) {
  await i.deferReply(); const g = i.guildId; const uid = i.user.id; const n = now();
  const target = i.options.getUser('user');
  if (target.id === uid) return i.editReply({ embeds: [err('Invalid', 'Cannot rob yourself.', g)] });
  if (target.bot)        return i.editReply({ embeds: [err('Invalid', 'Cannot rob bots.', g)] });
  const robber = getEconomy(g, uid);
  if (robber.last_rob && n - robber.last_rob < 3600) {
    const m = Math.floor((3600 - (n - robber.last_rob)) / 60);
    return i.editReply({ embeds: [err('Cooldown', `Try again in **${m}m**.`, g)] });
  }
  const victim = getEconomy(g, target.id);
  if (victim.balance < 100) return i.editReply({ embeds: [err('Broke', `${target.tag} doesn't have enough to rob.`, g)] });
  db.prepare('UPDATE economy SET last_rob=? WHERE guild_id=? AND user_id=?').run(n, g, uid);
  if (Math.random() < 0.40) {
    const stolen = Math.floor(victim.balance * (Math.random() * 0.25 + 0.05));
    db.prepare('UPDATE economy SET balance=balance-? WHERE guild_id=? AND user_id=?').run(stolen, g, target.id);
    db.prepare('UPDATE economy SET balance=balance+? WHERE guild_id=? AND user_id=?').run(stolen, g, uid);
    return i.editReply({ embeds: [ok('Rob Successful!', `You stole ${fmt(stolen,g)} from <@${target.id}>!`, g)] });
  } else {
    const fine = Math.min(Math.floor(robber.balance * 0.1), 500);
    db.prepare('UPDATE economy SET balance=MAX(0,balance-?) WHERE guild_id=? AND user_id=?').run(fine, g, uid);
    return i.editReply({ embeds: [err('Rob Failed!', `You were caught and fined ${fmt(fine,g)}!`, g)] });
  }
}

async function hShop(i) {
  await i.deferReply(); const g = i.guildId;
  const items = db.prepare('SELECT * FROM shop_items WHERE guild_id=? ORDER BY price ASC').all(g);
  if (!items.length) return i.editReply({ embeds: [err('Empty Shop', 'No items in the shop yet.', g)] });
  const desc = items.map((it,idx) => `**${idx+1}. ${it.name}** — ${fmt(it.price,g)}\n${it.description ?? 'No description'}`).join('\n\n');
  return i.editReply({ embeds: [embed({ type:'community', title:`${emoji(g)}  Shop`, description: desc, guildId: g })] });
}

async function hBuy(i) {
  await i.deferReply(); const g = i.guildId; const uid = i.user.id;
  const name = i.options.getString('item');
  const item = db.prepare('SELECT * FROM shop_items WHERE guild_id=? AND LOWER(name)=LOWER(?)').get(g, name);
  if (!item) return i.editReply({ embeds: [err('Not Found', `**${name}** is not in the shop.`, g)] });
  const eco = getEconomy(g, uid);
  if (eco.balance < item.price) return i.editReply({ embeds: [err('Insufficient', `You need ${fmt(item.price,g)} but have ${fmt(eco.balance,g)}.`, g)] });
  db.prepare('UPDATE economy SET balance=balance-? WHERE guild_id=? AND user_id=?').run(item.price, g, uid);
  const ex = db.prepare('SELECT * FROM inventory WHERE guild_id=? AND user_id=? AND item_name=?').get(g, uid, item.name);
  if (ex) db.prepare('UPDATE inventory SET quantity=quantity+1 WHERE id=?').run(ex.id);
  else    db.prepare('INSERT INTO inventory(guild_id,user_id,item_name,quantity) VALUES(?,?,?,1)').run(g, uid, item.name);
  return i.editReply({ embeds: [ok('Purchased!', `You bought **${item.name}** for ${fmt(item.price,g)}.`, g)] });
}

async function hInventory(i) {
  await i.deferReply(); const g = i.guildId;
  const target = i.options.getUser('user') ?? i.user;
  const items  = db.prepare('SELECT * FROM inventory WHERE guild_id=? AND user_id=?').all(g, target.id);
  if (!items.length) return i.editReply({ embeds: [err('Empty', `${target.tag} has no items.`, g)] });
  const desc = items.map(it => `**${it.item_name}** × ${it.quantity}`).join('\n');
  return i.editReply({ embeds: [embed({ type:'community', title:`🎒  Inventory — ${target.tag}`, description: desc, thumbnail: target.displayAvatarURL({ dynamic:true }), guildId: g })] });
}

async function hSuggest(i) {
  await i.deferReply({ ephemeral: true }); const g = i.guildId;
  const content = i.options.getString('suggestion');
  const chId    = getConfig(g, 'suggestion_channel', null);
  if (!chId) return i.editReply({ embeds: [err('Not Configured', 'No suggestion channel set. Ask an admin to use `/manage setlog`.', g)] });
  const ch = i.guild.channels.cache.get(chId);
  if (!ch) return i.editReply({ embeds: [err('Channel Missing', 'Suggestion channel not found.', g)] });
  const e = embed({ type:'community', title:'💡  New Suggestion',
    description: content, thumbnail: i.user.displayAvatarURL({ dynamic:true }),
    authorName: i.user.tag, authorIcon: i.user.displayAvatarURL({ dynamic:true }),
    fields:[{ name:'📅  Submitted', value:`<t:${now()}:F>`, inline:true }], guildId: g });
  const msg = await ch.send({ embeds: [e] });
  try { await msg.react('✅'); await msg.react('❌'); } catch {}
  const res = db.prepare('INSERT INTO suggestions(guild_id,user_id,content,message_id,channel_id) VALUES(?,?,?,?,?)').run(g, i.user.id, content, msg.id, ch.id);
  return i.editReply({ embeds: [ok('Suggestion Submitted', `Your suggestion (#${res.lastInsertRowid}) has been posted!`, g)] });
}

async function hReminder(i) {
  await i.deferReply({ ephemeral: true }); const g = i.guildId;
  const { parseDuration } = require('../../utils/time');
  const timeStr = i.options.getString('time'); const msg = i.options.getString('message');
  const ms = parseDuration(timeStr);
  if (!ms) return i.editReply({ embeds: [err('Bad Duration', 'Use formats like `30m`, `1h`, `2d`.', g)] });
  const fireAt = now() + Math.floor(ms / 1000);
  db.prepare('INSERT INTO reminders(guild_id,user_id,channel_id,message,fire_at) VALUES(?,?,?,?,?)').run(g, i.user.id, i.channelId, msg, fireAt);
  return i.editReply({ embeds: [ok('Reminder Set', `I'll remind you: **${msg}**\nFiring: <t:${fireAt}:R>`, g)] });
}

async function hAddItem(i) {
  await i.deferReply({ ephemeral: true }); const g = i.guildId;
  const name = i.options.getString('name'); const price = i.options.getInteger('price'); const desc = i.options.getString('description') ?? null;
  try { db.prepare('INSERT INTO shop_items(guild_id,name,price,description) VALUES(?,?,?,?)').run(g, name, price, desc); }
  catch { return i.editReply({ embeds: [err('Already Exists', `**${name}** is already in the shop.`, g)] }); }
  return i.editReply({ embeds: [ok('Item Added', `**${name}** added for ${fmt(price,g)}.`, g)] });
}

async function hRemoveItem(i) {
  await i.deferReply({ ephemeral: true }); const g = i.guildId;
  const name = i.options.getString('name');
  const { changes } = db.prepare('DELETE FROM shop_items WHERE guild_id=? AND LOWER(name)=LOWER(?)').run(g, name);
  if (!changes) return i.editReply({ embeds: [err('Not Found', `**${name}** not in shop.`, g)] });
  return i.editReply({ embeds: [ok('Item Removed', `**${name}** removed from shop.`, g)] });
}

async function hEditBalance(i) {
  await i.deferReply({ ephemeral: true }); const g = i.guildId;
  const target = i.options.getUser('user'); const action = i.options.getString('action'); const amount = i.options.getInteger('amount');
  getEconomy(g, target.id);
  if (action === 'add')    db.prepare('UPDATE economy SET balance=balance+? WHERE guild_id=? AND user_id=?').run(amount, g, target.id);
  if (action === 'remove') db.prepare('UPDATE economy SET balance=MAX(0,balance-?) WHERE guild_id=? AND user_id=?').run(amount, g, target.id);
  if (action === 'set')    db.prepare('UPDATE economy SET balance=? WHERE guild_id=? AND user_id=?').run(amount, g, target.id);
  const updated = getEconomy(g, target.id);
  return i.editReply({ embeds: [ok('Balance Updated', `<@${target.id}>'s balance is now ${fmt(updated.balance, g)}.`, g)] });
}

async function hSetCurrency(i) {
  await i.deferReply({ ephemeral: true }); const g = i.guildId;
  const name = i.options.getString('name'); const em = i.options.getString('emoji');
  setConfig(g, 'currency_name', name); setConfig(g, 'currency_emoji', em);
  return i.editReply({ embeds: [ok('Currency Updated', `Currency: ${em} **${name}**`, g)] });
}
