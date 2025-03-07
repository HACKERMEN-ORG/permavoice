const { SlashCommandBuilder } = require('discord.js');
require('dotenv').config();


module.exports = {
    category: 'utility',
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Help with various commands.')
        .addStringOption(option =>
            option.setName('command')
                .setDescription('The command you need help with.')
                .setRequired(false)
                .addChoices(
                    { name: '/mute', value: 'mute' },
                    { name: '/unmute', value: 'unmute' },
                    { name: '/listmuted', value: 'listmuted' },
                    { name: '/ban', value: 'ban' },
                    { name: '/unban', value: 'unban' },
                    { name: '/listbanned', value: 'listbanned' },
                    { name: '/submod', value: 'submod' },
                    { name: '/unsubmod', value: 'unsubmod' },
                    { name: '/listsubmods', value: 'listsubmods' },
                    { name: '/votemute', value: 'votemute' },
                    { name: '/help', value: 'help' },
                    
        )),
    async execute(interaction) {
        const command = interaction.options.getString("command");

    try {    
            if (command == "mute") {
                return interaction.reply({ content: 'The mute command allows the channel owner to mute a user from the voice channel.', ephemeral: true });
            }

            if (command == "unmute") {
                return interaction.reply({ content: 'The unmute command allows the channel owner to unmute a user from the voice channel.', ephemeral: true });
            }

            if (command == "listmuted") {
                return interaction.reply({ content: 'The listmuted command shows the channel owner a list of current muted members.', ephemeral: true });
            }

            if (command == "ban") {
                return interaction.reply({ content: 'The ban command allows the channel owner to remove a user from the channel.', ephemeral: true });
            }

            if (command == "unban") {
                return interaction.reply({ content:  'The unban command allows the channel owner to remove the ban from a previously banned user.', ephemeral: true });
            }

            if (command == "listbanned") {
                return interaction.reply({ content: 'The listbanned command shows the channel owner a list of current banned members.', ephemeral: true });
            }

            if (command == "submod") {
                return interaction.reply({ content:  'The submod command allows the channel owner to promote a user to a sub-moderator to the channel.', ephemeral: true });
            }

            if (command == "unsubmod") {
                return interaction.reply({ content: 'The unsubmod command allows the channel owner to remove a submod.', ephemeral: true });
            }

            if (command == "listsubmods") {
                return interaction.reply({ content: 'The listsubmods command shows the channel owner a list of current submods.', ephemeral: true });
            }

            if (command == "votemute") {
                return interaction.reply({ content: 'The votemute command allows users to vote to mute a user for 5 minutes.', ephemeral: true });
            }

            if (command == "help" || command == null) {
                return interaction.reply({ content: 'The help command allows you to get help with various commands. You can use the /help command followed by the command you need help with.', ephemeral: true });
            }
        } catch (error) {
          await interaction.reply({ content:`There was an error while using the command.`, ephemeral: true });
          console.log(error);
        }
    },
};
