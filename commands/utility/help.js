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
                    { name: '/bitrate', value: 'bitrate' },
                    { name: '/help', value: 'help' },
                    { name: '/lock', value: 'lock' },
                    { name: '/waitingroom', value: 'waitingroom' },
                    { name: '/trust', value: 'trust' },
                    { name: '/untrust', value: 'untrust' },
                    { name: '/region', value: 'region' },
                    { name: '/limit', value: 'limit' },
                    { name: '/private', value: 'private' },
                    { name: '/rename', value: 'rename' },
                    { name: '/ban', value: 'ban' },
                    { name: '/unban', value: 'unban' },
                    { name: '/kick', value: 'kick' },
                    { name: '/transferownership', value: 'transferownership' },
        )),
    async execute(interaction) {
        const command = interaction.options.getString("command");

        try {
            if (command == "bitrate") {
                return interaction.reply({ content: 'The bitrate command allows you to change the bitrate of the voice channel. The bitrate can be set anywhere from 8 to 384 kbps, though depends on your server boost level.', ephemeral: true });
            }

            if (command == "help" || command == null) {
                return interaction.reply({ content: 'The help command allows you to get help with various commands. You can use the /help command followed by the command you need help with.', ephemeral: true });
            }

            if (command == "lock") {
                return interaction.reply({ content: 'The lock command allows you to lock the voice channel, preventing anyone from joining the channel.', ephemeral: true });
            }

            if (command == "waitingroom") {
                return interaction.reply({ content: 'The waitingroom command allows you to toggle a waiting room for the channel.', ephemeral: true });
            }

            if (command == "trust") {
                return interaction.reply({ content: 'The trust command allows you to trust a user to join the channel if a waiting room is present.', ephemeral: true });
            }

            if (command == "untrust") {
                return interaction.reply({ content: 'The untrust command allows you to untrust a user to join the channel if a waiting room is present.', ephemeral: true });
            }

            if (command == "region") {
                return interaction.reply({ content: 'The region command allows you to change the region of the voice channel.', ephemeral: true });
            }

            if (command == "limit") {
                return interaction.reply({ content: 'The limit command allows you to set a user limit for the voice channel.', ephemeral: true });
            }

            if (command == "private") {
                return interaction.reply({ content: 'The private command allows you to toggle the privacy of the voice channel.', ephemeral: true });
            }

            if (command == "rename") {
                return interaction.reply({ content: 'The rename command allows you to rename the voice channel.', ephemeral: true });
            }

            if (command == "ban") {
                return interaction.reply({ content: 'The ban command allows you to ban a user from the voice channel.', ephemeral: true });
            }

            if (command == "unban") {
                return interaction.reply({ content: 'The unban command allows you to unban a user from the voice channel.', ephemeral: true });
            }

            if (command == "kick") {
                return interaction.reply({ content: 'The kick command allows you to kick a user from the voice channel.', ephemeral: true });
            }

            if (command == "transferownership") {
                return interaction.reply({ content: 'The transferownership command allows you to transfer ownership of the voice channel to another user.', ephemeral: true });
            }
    
        } catch (error) {
          await interaction.reply({ content:`There was an error while using the command.`, ephemeral: true });
          console.log(error);
        }
    },
};