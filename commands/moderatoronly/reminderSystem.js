// commands/moderatoronly/reminders.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
require('dotenv').config();
const reminderSystem = require('../../methods/reminderSystem');

module.exports = {
  category: 'moderatoronly',
  data: new SlashCommandBuilder()
    .setName('reminders')
    .setDescription('Manage the voice channel reminder system')
    .addSubcommand(subcommand =>
      subcommand
        .setName('send')
        .setDescription('Send a reminder to all active voice channels immediately'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('config')
        .setDescription('Configure reminder frequency')
        .addIntegerOption(option =>
          option.setName('min')
            .setDescription('Minimum time between reminders (minutes)')
            .setRequired(true)
            .setMinValue(5)
            .setMaxValue(1440))
        .addIntegerOption(option =>
          option.setName('max')
            .setDescription('Maximum time between reminders (minutes)')
            .setRequired(true)
            .setMinValue(5)
            .setMaxValue(1440)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Check the status of the reminder system'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  
  async execute(interaction) {
    // Check if the user has the necessary permissions
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ 
        content: 'You do not have permission to use this command. It requires the Manage Server permission.', 
        ephemeral: true 
      });
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      switch (subcommand) {
        case 'send':
          await interaction.deferReply({ ephemeral: true });
          
          // Manually trigger a reminder
          await reminderSystem.sendReminders(interaction.client);
          
          return interaction.editReply({ 
            content: 'Reminders have been sent to all active voice channels with multiple members.',
            ephemeral: true 
          });
          
        case 'config':
          await interaction.deferReply({ ephemeral: true });
          
          const minMinutes = interaction.options.getInteger('min');
          const maxMinutes = interaction.options.getInteger('max');
          
          // Validate that min is less than max
          if (minMinutes >= maxMinutes) {
            return interaction.editReply({
              content: 'The minimum time must be less than the maximum time.',
              ephemeral: true
            });
          }
          
          // Restart the reminder system with new settings
          reminderSystem.stopReminders();
          reminderSystem.startReminders(interaction.client, minMinutes, maxMinutes);
          
          return interaction.editReply({
            content: `Reminder system reconfigured. Reminders will now appear every ${minMinutes}-${maxMinutes} minutes.`,
            ephemeral: true
          });
          
        case 'status':
          return interaction.reply({
            content: 'The reminder system is active. Use `/reminders send` to trigger an immediate reminder or `/reminders config` to adjust timing.',
            ephemeral: true
          });
          
        default:
          return interaction.reply({
            content: 'Unknown subcommand. Please use one of the available options.',
            ephemeral: true
          });
      }
    } catch (error) {
      console.error('Error executing reminders command:', error);
      
      if (interaction.deferred) {
        return interaction.editReply({ 
          content: 'There was an error while executing the command.', 
          ephemeral: true 
        });
      } else {
        return interaction.reply({ 
          content: 'There was an error while executing the command.', 
          ephemeral: true 
        });
      }
    }
  },
};