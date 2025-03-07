const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
require('dotenv').config();


module.exports = {
    category: 'utility',
    data: new SlashCommandBuilder()
        .setName('adminhelp')
        .setDescription('Help with various commands.')
        .addStringOption(option =>
            option.setName('command')
                .setDescription('The command you need help with.')
                .setRequired(false)
                .addChoices(
                    { name: '/help', value: 'help' },
                    { name: 'permvoice', value: 'permvoice' },
                    { name: 'setup', value: 'setup' }
        ))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    async execute(interaction) {
        const command = interaction.options.getString("command");

        try {
            if (command == "help" || command == null) {
                return interaction.reply({ content: 'The help command allows you to get help with various admin commands. You can use the /help command followed by the command you need help with.', ephemeral: true });
            }

            if (command == "permvoice") {
                return interaction.reply({ content: 'The permvoice command allows you to make other channels permanent in the eyes of the bot, or prevent them from being deleted by being in the same category.', ephemeral: true });
            }

            if (command == "setup") {
                return interaction.reply({ content: 'The setup command allows you to setup the bot in your server. If a voice or category is not specified, the bot will handle it automatically', ephemeral: true });
            }

        } catch (error) {
          await interaction.reply({ content:`There was an error while using the command.`, ephemeral: true });
          console.log(error);
        }
    },
};