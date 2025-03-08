const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
require('dotenv').config();

module.exports = {
    category: 'moderatoronly',
    data: new SlashCommandBuilder()
        .setName('announce')
        .setDescription('Create and send an announcement in the current channel')
        .addStringOption(option =>
            option.setName('title')
                .setDescription('The title of the announcement')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('description')
                .setDescription('The content of the announcement')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('color')
                .setDescription('The color of the announcement embed (hex code or color name)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('image')
                .setDescription('Optional URL of an image to include in the announcement')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('footer')
                .setDescription('Optional footer text for the announcement')
                .setRequired(false))
        .addBooleanOption(option => 
            option.setName('anonymous')
                .setDescription('Whether to hide who posted the announcement (default: false)')
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
            // Get the current channel
            const channel = interaction.channel;
            
            // Get announcement details
            const title = interaction.options.getString('title');
            const description = interaction.options.getString('description');
            const color = interaction.options.getString('color') || '#FF5500'; // Default color
            const imageUrl = interaction.options.getString('image');
            const footer = interaction.options.getString('footer');
            const anonymous = interaction.options.getBoolean('anonymous') || false;
            
            // Create the embed
            const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(description)
                .setColor(color)
                .setTimestamp();
            
            // Add optional image if provided
            if (imageUrl) {
                embed.setImage(imageUrl);
            }
            
            // Add optional footer if provided
            if (footer) {
                embed.setFooter({ text: footer });
            }
            
            // Add author information only if not anonymous
            if (!anonymous) {
                embed.setAuthor({
                    name: interaction.user.username,
                    iconURL: interaction.user.displayAvatarURL({ dynamic: true })
                });
            }
            
            // Send the announcement
            await channel.send({ embeds: [embed] });
            
            return interaction.editReply({
                content: `Announcement successfully sent${anonymous ? ' anonymously' : ''}.`,
            });
        } catch (error) {
            console.error('Error sending announcement:', error);
            return interaction.editReply({
                content: 'Failed to send the announcement. Please check if the bot has permission to send messages in this channel.',
            });
        }
    },
};