const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
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
        .addStringOption(option =>
            option.setName('channel')
                .setDescription('Channel to send the message to (defaults to current channel)')
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
            const channelOption = interaction.options.getString('channel');
            
            // Determine which channel to send to
            let targetChannel = interaction.channel;
            
            // If a specific channel is mentioned, try to find it
            if (channelOption) {
                // Extract channel ID from mention format like <#123456789>
                const channelId = channelOption.replace(/[<#>]/g, '');
                const foundChannel = interaction.guild.channels.cache.get(channelId);
                
                if (foundChannel) {
                    targetChannel = foundChannel;
                } else {
                    return interaction.editReply({
                        content: 'I could not find the specified channel. Please use a valid channel mention.',
                    });
                }
            }
            
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