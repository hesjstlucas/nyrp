# 🗽 New York RP — Discord Bot

A fully-featured, fully-customizable ERLC community Discord bot built with Discord.js v14 and SQLite. Every color, banner, footer, role, and behavior is configurable directly from Discord slash commands. No editing config files.

---

## ✨ Command Sections

| Section | Slash Command | Subcommands |
|---|---|---|
| 🔨 Moderation | `/mod` | ban, unban, kick, mute, unmute, warn, warnings, delwarn, clearwarnings, purge, slowmode, lock, unlock, modlog, note, notes, setsoftban, setlogchannel |
| 🎫 Tickets | `/ticket` | setup, panel, close, add, remove, rename, claim, unclaim, transcript, setcategory, setrole, stats, reopen, setmaxopen, list, forceclose |
| 👮 Staff | `/staff` | infraction, infraction_remove, infraction_view, infraction_case, infraction_history, infraction_config, promote, demote, rank_create, rank_delete, rank_list, award_give, award_revoke, award_create, award_list |
| 🏠 Management | `/manage` | announce, embed, say, editmsg, setlog, setrole, setstatus, setprefix, setcolor, setbanner, setfooter, serverinfo, userinfo, roleinfo, configview, configexport, welcome, cmdpermission |
| 🎮 Sessions | `/session` | start, end, update, lock, unlock, status, setchannel, setping, setbanner, setlink, setmaxplayers, setdescription |
| 💰 Community | `/community` | balance, pay, daily, weekly, work, leaderboard, gamble, rob, shop, buy, inventory, suggest, reminder, additem, removeitem, editbalance, setcurrency |

---

## 🚀 Local Setup

### 1. Prerequisites
- Node.js v18+
- A Discord bot with **Server Members**, **Message Content**, and **Presence** intents enabled

### 2. Install
```bash
cd nyrp-bot
npm install
```

### 3. Configure `.env`
```bash
copy .env.example .env
```
Edit `.env`:
```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_application_client_id
GUILD_ID=your_server_id   # remove for global deploy
```

### 4. Deploy slash commands
```bash
npm run deploy
```

### 5. Start
```bash
npm start
```

---

## ☁️ Fly.io Deploy

### 1. Install Fly CLI
```bash
# Windows (PowerShell)
iwr https://fly.io/install.ps1 -useb | iex
```

### 2. Login & create app
```bash
fly auth login
fly launch --no-deploy --name nyrp-bot
```

### 3. Create persistent volume (SQLite lives here)
```bash
fly volumes create nyrp_data --region iad --size 1
```

### 4. Set secrets
```bash
fly secrets set DISCORD_TOKEN="your_token_here"
fly secrets set CLIENT_ID="your_client_id"
```

### 5. Deploy
```bash
fly deploy
```

### 6. View logs
```bash
fly logs
```

> The SQLite database is stored at `/data/nyrp.db` on the persistent volume and survives restarts and redeployments.

---

## ⚙️ First-Time Discord Config

Run these commands after the bot is in your server:

```
/manage setrole name:staff role:@YourStaffRole
/manage setrole name:admin role:@YourAdminRole
/manage setlog type:mod channel:#mod-logs
/manage setlog type:tickets channel:#ticket-logs
/manage setlog type:infractions channel:#infraction-logs
/manage setlog type:promotions channel:#promotion-logs
/manage setlog type:awards channel:#award-logs
/manage setprefix prefix:!
/manage setfooter text:New York RP
/manage setstatus type:Watching text:New York RP

/ticket setup log_channel:#ticket-logs
/ticket setcategory type:general category:#Tickets
/ticket panel channel:#open-a-ticket

/session setchannel channel:#sessions
/session setlink url:https://policeroleplay.community/join/YOURCODE
```

---

## 🎨 Customization

### Colors (per section)
```
/manage setcolor section:tickets color:#5DADE2
/manage setcolor section:moderation color:#E67E22
/manage setcolor section:staff color:#8E44AD
/manage setcolor section:management color:#1B2B4B
/manage setcolor section:community color:#27AE60
```

### Banners (per section)
```
/manage setbanner section:tickets url:https://your-cdn.com/tickets-banner.png
/manage setbanner section:default url:https://your-cdn.com/default-banner.png
```

### Welcome messages
```
/manage welcome enabled:true channel:#welcome message:Welcome to New York RP, {user}! You are member #{count}. join_role:@Member
```

---

## 🔑 Permission System

| Level | Who |
|---|---|
| **Server Owner** | Always full access |
| **Discord Administrator** | Always full access |
| **Bot Admin** (`role_admin`) | Full bot access |
| **Staff** (`role_staff`) | Moderation, tickets, infractions, promotions, awards |
| **Everyone** | Community/economy commands |

Lock any command to a specific role:
```
/manage cmdpermission command:mod.ban role:@SeniorMod
/manage cmdpermission command:staff.infraction disable:true
```

---

## 📁 File Structure

```
nyrp-bot/
├── src/
│   ├── commands/
│   │   ├── moderation/moderation.js   — 18 subcommands
│   │   ├── tickets/tickets.js         — 16 subcommands
│   │   ├── staff/staff.js             — 15 subcommands
│   │   ├── management/management.js   — 18 subcommands
│   │   ├── management/sessions.js     — 12 subcommands
│   │   └── community/community.js     — 17 subcommands
│   ├── database/db.js                 — SQLite + all helpers
│   ├── events/                        — ready, interactionCreate, messageCreate, guildMemberAdd
│   ├── handlers/                      — commandHandler, eventHandler, deploy
│   └── utils/
│       ├── embed.js                   — Central embed builder (auto guild config)
│       ├── perms.js                   — Permission checker
│       └── time.js                    — Duration parser, formatters
├── data/                              — SQLite DB (auto-created, Fly.io: /data)
├── Dockerfile                         — Production Docker build
├── fly.toml                           — Fly.io config with persistent volume
├── .env.example
└── index.js
```

---

## 🛠 Tech Stack
- **Discord.js v14**
- **better-sqlite3** — Fast, synchronous SQLite
- **dotenv**
- **Fly.io** — Free tier hosting with persistent volumes
