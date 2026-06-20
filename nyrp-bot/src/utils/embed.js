const { EmbedBuilder } = require('discord.js');
const { getConfig }    = require('../database/db');

// ─── Palette ──────────────────────────────────────────────────────────────────

const PALETTE = {
  default:     0x2B2D31,
  brand:       0x1B2B4B,   // NYRP deep navy
  success:     0x2ECC71,
  error:       0xE74C3C,
  warning:     0xF39C12,
  info:        0x3498DB,
  tickets:     0x5DADE2,
  moderation:  0xE67E22,
  staff:       0x8E44AD,
  management:  0x1B2B4B,
  community:   0x27AE60,
  infractions: 0xC0392B,
  promotions:  0x2ECC71,
  awards:      0xF1C40F,
};

const INFRACTION_COLORS = {
  Warning:     0xF39C12,
  Strike:      0xE67E22,
  Suspension:  0xE74C3C,
  Termination: 0x7B241C,
};

const INFRACTION_EMOJIS = {
  Warning:     '⚠️',
  Strike:      '⚡',
  Suspension:  '🔴',
  Termination: '💀',
};

// ─── Core builder ─────────────────────────────────────────────────────────────

/**
 * Build a clean embed with automatic guild-config injection.
 *
 * @param {object} opts
 * @param {string}  [opts.type='default']
 * @param {string}  [opts.title]
 * @param {string}  [opts.description]
 * @param {Array}   [opts.fields]
 * @param {string}  [opts.footer]        overrides auto footer
 * @param {string}  [opts.footerIcon]
 * @param {string}  [opts.banner]        image at bottom
 * @param {string}  [opts.thumbnail]
 * @param {string|number} [opts.color]
 * @param {string}  [opts.guildId]
 * @param {boolean} [opts.timestamp=true]
 * @param {string}  [opts.authorName]
 * @param {string}  [opts.authorIcon]
 * @param {string}  [opts.url]
 */
function embed(opts = {}) {
  const {
    type        = 'default',
    title, description, fields = [],
    footer: customFooter, footerIcon,
    banner: customBanner, thumbnail: customThumbnail,
    color: customColor,
    guildId,
    timestamp   = true,
    authorName, authorIcon, url,
  } = opts;

  // Resolve color
  let color = customColor
    ?? (guildId ? getConfig(guildId, `color_${type}`) : null)
    ?? (guildId ? getConfig(guildId, 'color_default') : null)
    ?? PALETTE[type]
    ?? PALETTE.default;
  if (typeof color === 'string') color = parseInt(color.replace(/^#/, ''), 16);

  // Resolve banner
  const banner = customBanner
    ?? (guildId ? getConfig(guildId, `banner_${type}`) : null)
    ?? (guildId ? getConfig(guildId, 'banner_default') : null)
    ?? null;

  // Resolve thumbnail
  const thumbnail = customThumbnail
    ?? (guildId ? getConfig(guildId, `thumbnail_${type}`) : null)
    ?? null;

  // Resolve footer
  const serverName = guildId ? (getConfig(guildId, 'footer_text') ?? 'New York RP') : 'New York RP';
  const section    = SECTION_LABELS[type] ?? 'New York RP';
  const footerText = customFooter
    ?? (guildId ? getConfig(guildId, `footer_${type}`) : null)
    ?? `${serverName}  ·  ${section}`;

  const e = new EmbedBuilder().setColor(color);
  if (title)       e.setTitle(title);
  if (description) e.setDescription(description);
  if (url)         e.setURL(url);
  if (authorName)  e.setAuthor({ name: authorName, iconURL: authorIcon ?? undefined });
  if (thumbnail)   e.setThumbnail(thumbnail);
  if (banner)      e.setImage(banner);
  if (timestamp)   e.setTimestamp();
  e.setFooter({ text: footerText, iconURL: footerIcon ?? undefined });
  if (fields.length) e.addFields(fields.map(f => ({
    name: f.name, value: f.value, inline: f.inline ?? false,
  })));

  return e;
}

// ─── Shorthand helpers ────────────────────────────────────────────────────────

const ok  = (t, d, g) => embed({ type: 'success',  title: `✅  ${t}`, description: d, guildId: g });
const err = (t, d, g) => embed({ type: 'error',    title: `✖  ${t}`,  description: d, guildId: g });
const inf = (t, d, g) => embed({ type: 'info',     title: `ℹ  ${t}`,  description: d, guildId: g });
const wrn = (t, d, g) => embed({ type: 'warning',  title: `⚠  ${t}`,  description: d, guildId: g });

// ─── Infraction case embed ────────────────────────────────────────────────────

function infractionEmbed(opts = {}) {
  const {
    caseId, type = 'Strike', member, moderator,
    reason, points, oldPoints = 0, maxPoints = 10,
    appealUrl, guildId, active = true,
  } = opts;

  const emoji    = INFRACTION_EMOJIS[type] ?? '⚡';
  const color    = INFRACTION_COLORS[type] ?? PALETTE.infractions;
  const { progressBar } = require('../database/db');
  const total    = oldPoints + points;

  const fields = [
    { name: '👤  Member',    value: member    ? `<@${member.id}>  \`${member.tag}\``    : 'Unknown', inline: true },
    { name: '🔨  Issued By', value: moderator ? `<@${moderator.id}>  \`${moderator.tag}\`` : 'Unknown', inline: true },
    { name: '📋  Type',      value: `${emoji}  \`${type}\``,  inline: true },
    { name: LINE, value: ' ', inline: false },
    { name: '📌  Reason', value: reason ?? 'No reason provided', inline: false },
    { name: `⚡  Points  (${oldPoints} → ${total})`, value: progressBar(total, maxPoints), inline: false },
  ];

  if (appealUrl) fields.push({ name: '📝  Appeal', value: `[Submit an appeal](${appealUrl})`, inline: false });
  if (!active)   fields.push({ name: '🗑  Status',  value: '`Removed`', inline: true });

  return embed({
    type: 'infractions', color,
    title: `${emoji}  ${type}  ·  Case #${caseId}`,
    fields,
    footerIcon: undefined,
    guildId,
  });
}

// ─── Divider constant ─────────────────────────────────────────────────────────

const LINE = '\u2015'.repeat(34);

const SECTION_LABELS = {
  default:     'New York RP',
  brand:       'New York RP',
  success:     'System',
  error:       'System',
  warning:     'System',
  info:        'System',
  tickets:     'Ticket System',
  moderation:  'Moderation',
  staff:       'Staff',
  management:  'Management',
  community:   'Community',
  infractions: 'Infraction System',
  promotions:  'Promotions',
  awards:      'Awards',
};

module.exports = { embed, ok, err, inf, wrn, infractionEmbed, LINE, PALETTE, INFRACTION_COLORS, INFRACTION_EMOJIS };
