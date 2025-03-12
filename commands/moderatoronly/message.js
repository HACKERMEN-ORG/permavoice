const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
require('dotenv').config();

module.exports = {
    category: 'moderatoronly',
    data: new SlashCommandBuilder()
        .setName('message')
        .setDescription('Send a regular text message in the current channel')
        .addStringOption(option =>
            option.setName('content')
                .setDescription('The message content to send')
                .setRequired(true))
        .addBooleanOption(option => 
            option.setName('anonymous')
                .setDescription('Whether to hide who posted the message (default: false)')
                .setRequired(false))
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel to send the message to (defaults to current channel)')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        // Check if the user has Administrator permissions
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: 'You need Administrator permissions to use this command.',
                ephemeral: true
            });
        }
        
        // Defer the reply to handle potentially longer processing time
        await interaction.deferReply({ ephemeral: true });
        
        try {
            // Get message details
            const content = interaction.options.getString('content');
            const anonymous = interaction.options.getBoolean('anonymous') || false;
            const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
            
            // Format the message with author prefix if not anonymous
            let messageToSend = content;
            if (!anonymous) {
                messageToSend = `**Message from ${interaction.user.username}**: ${content}`;
            }
            
            // Send the message
            await targetChannel.send(messageToSend);
            
            return interaction.editReply({
                content: `Message successfully sent to ${targetChannel}${anonymous ? ' anonymously' : ''}.`,
            });
        } catch (error) {
            console.error('Error sending message:', error);
            return interaction.editReply({
                content: 'Failed to send the message. Please check if the bot has permission to send messages in this channel.',
            });
        }
    },
};