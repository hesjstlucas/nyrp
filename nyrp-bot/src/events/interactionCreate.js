const { err } = require('../utils/embed');
const { db }  = require('../database/db');

module.exports = {
  name: 'interactionCreate',
  once: false,
  async execute(client, interaction) {

    // ── Slash commands ────────────────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (!cmd) return;

      // Disabled check
      if (interaction.guildId) {
        const row = db.prepare('SELECT disabled FROM cmd_permissions WHERE guild_id=? AND command_name=?')
          .get(interaction.guildId, interaction.commandName);
        if (row?.disabled) return interaction.reply({ embeds: [err('Disabled', 'This command is disabled here.', interaction.guildId)], ephemeral: true });
      }

      // Cooldown
      if (cmd.cooldown) {
        const key = `${cmd.data.name}:${interaction.user.id}`;
        const exp = (client.cooldowns.get(key) ?? 0) + cmd.cooldown * 1000;
        if (Date.now() < exp) {
          const s = ((exp - Date.now()) / 1000).toFixed(1);
          return interaction.reply({ embeds: [err('Cooldown', `Wait **${s}s** before using this again.`, interaction.guildId)], ephemeral: true });
        }
        client.cooldowns.set(key, Date.now());
      }

      try {
        await cmd.execute(interaction, client);
      } catch (e) {
        console.error(`Slash error [${interaction.commandName}]:`, e);
        const e2 = err('Error', 'An unexpected error occurred.', interaction.guildId);
        try {
          interaction.deferred || interaction.replied
            ? await interaction.editReply({ embeds: [e2] })
            : await interaction.reply({ embeds: [e2], ephemeral: true });
        } catch {}
      }
      return;
    }

    // ── Buttons ───────────────────────────────────────────────────────────────
    if (interaction.isButton()) {
      const id = interaction.customId;
      const handler = client.buttons.get(id)
        ?? client.buttons.get(id.split('_').slice(0, 2).join('_'))
        ?? client.buttons.get(id.split('_')[0]);
      if (handler) { try { await handler(interaction, client); } catch (e) { console.error('Button error:', e); } }
      return;
    }

    // ── Select menus ──────────────────────────────────────────────────────────
    if (interaction.isStringSelectMenu()) {
      const id = interaction.customId;
      const handler = client.selectMenus.get(id) ?? client.selectMenus.get(id.split('_')[0]);
      if (handler) { try { await handler(interaction, client); } catch (e) { console.error('Select error:', e); } }
      return;
    }

    // ── Modals ────────────────────────────────────────────────────────────────
    if (interaction.isModalSubmit()) {
      const id = interaction.customId;
      const handler = client.modals.get(id)
        ?? client.modals.get(id.split('_').slice(0, 2).join('_'))
        ?? client.modals.get(id.split('_')[0]);
      if (handler) { try { await handler(interaction, client); } catch (e) { console.error('Modal error:', e); } }
      return;
    }

    // ── Autocomplete ──────────────────────────────────────────────────────────
    if (interaction.isAutocomplete()) {
      const cmd = client.commands.get(interaction.commandName);
      if (cmd?.autocomplete) { try { await cmd.autocomplete(interaction, client); } catch {} }
    }
  },
};
