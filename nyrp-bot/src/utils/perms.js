const { PermissionFlagsBits } = require('discord.js');
const { getConfig, db }       = require('../database/db');
const { err }                 = require('./embed');

/**
 * Level hierarchy: owner > discordAdmin > botAdmin > staff > everyone
 * Category defaults map to required level.
 */
const CATEGORY_LEVEL = {
  management:  'admin',
  staff:       'admin',
  moderation:  'staff',
  tickets:     'staff',
  infractions: 'staff',
  promotions:  'staff',
  awards:      'staff',
  community:   'everyone',
  config:      'admin',
};

async function checkPerm(interaction, category = 'community', cmdName = null) {
  const { member, guildId, guild } = interaction;
  if (!member) return { ok: false, reason: 'Must be used in a server.' };

  // Owner always passes
  if (guild?.ownerId === member.id) return { ok: true };

  // Discord Administrator always passes
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return { ok: true };

  // Per-command DB override
  if (cmdName) {
    const row = db.prepare('SELECT role_id, disabled FROM cmd_permissions WHERE guild_id=? AND command_name=?').get(guildId, cmdName);
    if (row?.disabled) return { ok: false, reason: 'This command is currently disabled.' };
    if (row?.role_id) {
      return member.roles?.cache?.has(row.role_id)
        ? { ok: true }
        : { ok: false, reason: `You need <@&${row.role_id}> to use this command.` };
    }
  }

  const level = CATEGORY_LEVEL[category] ?? 'everyone';
  if (level === 'everyone') return { ok: true };

  const levels = level === 'admin' ? ['admin'] : ['staff', 'admin'];
  for (const l of levels) {
    const roleId = getConfig(guildId, `role_${l}`, null);
    if (roleId && member.roles?.cache?.has(roleId)) return { ok: true };
  }

  // Fallback: ManageGuild counts as staff
  if (levels.includes('staff') && member.permissions?.has(PermissionFlagsBits.ManageGuild)) return { ok: true };

  return { ok: false, reason: `You need the **${level}** role to use this command.` };
}

async function requirePerm(interaction, category, cmdName = null) {
  const { ok: allowed, reason } = await checkPerm(interaction, category, cmdName);
  if (!allowed) {
    const e = err('No Permission', reason, interaction.guildId);
    try {
      if (interaction.deferred || interaction.replied) await interaction.editReply({ embeds: [e], ephemeral: true });
      else await interaction.reply({ embeds: [e], ephemeral: true });
    } catch {}
    return false;
  }
  return true;
}

module.exports = { checkPerm, requirePerm };
