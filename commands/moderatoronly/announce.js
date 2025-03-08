const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');

// Constant for the settings file
const FIELD_ANNOUNCEMENTCHANNEL_NAME = "ANNOUNCEMENTCHANNELID";

/**
 * Reads the settings file for a specific guild
 * @param {string} guildId - The ID of the guild to read settings for
 * @returns {object} The settings object with announcement channel info
 */
function readAnnouncementSettings(guildId) {
    const settingsPath = `./globalserversettings/setupsettings/${guildId}/settings.cfg`;
    
    if (!fs.existsSync(settingsPath)) {
        return { announcementChannelId: null };
    }
    
    try {
        const fileContents = fs.readFileSync(settingsPath, 'utf8');
        const lines = fileContents.split('\n');
        const settings = {};
        
        for (const line of lines) {
            if (line.startsWith(FIELD_ANNOUNCEMENTCHANNEL_NAME)) {
                const re = RegExp('^' + FIELD_ANNOUNCEMENTCHANNEL_NAME + '\\s*=\\s*\"(.*)\"');
                const matches = re.exec(line);
                
                if (matches && matches[1]) {
                    settings.announcementChannelId = matches[1];
                }
            }
        }
        
        return settings;
    } catch (error) {
        console.error(`Error reading announcement settings for guild ${guildId}:`, error);
        return { announcementChannelId: null };
    }
}

/**
 * Updates the settings file with the new announcement channel ID
 * @param {string} guildId - The ID of the guild to update settings for
 * @param {string} channelId - The ID of the announcement channel
 */
function updateAnnouncementChannel(guildId, channelId) {
    const settingsPath = `./globalserversettings/setupsettings/${guildId}/settings.cfg`;
    
    // Check if directory exists, and create it if it doesn't
    const dirPath = path.dirname(settingsPath);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
    
    let fileContent = '';
    
    // Read existing file if it exists
    if (fs.existsSync(settingsPath)) {
        fileContent = fs.readFileSync(settingsPath, 'utf8');
        
        // Check if the field already exists in the file
        const lines = fileContent.split('\n');
        let found = false;
        
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith(FIELD_ANNOUNCEMENTCHANNEL_NAME)) {
                lines[i] = `${FIELD_ANNOUNCEMENTCHANNEL_NAME} = "${channelId}"`;
                found = true;
                break;
            }
        }
        
        if (found) {
            // Rewrite the file with the updated field
            fileContent = lines.join('\n');
        } else {
            // Append the field to the file
            fileContent += `\n${FIELD_ANNOUNCEMENTCHANNEL_NAME} = "${channelId}"`;
        }
    } else {
        // Create a new file with the field
        fileContent = `${FIELD_ANNOUNCEMENTCHANNEL_NAME} = "${channelId}"\n`;
    }
    
    // Write the updated content back to the file
    fs.writeFileSync(settingsPath, fileContent, 'utf8');
}

module.exports = {
    category: 'moderatoronly',
    data: new SlashCommandBuilder()
        .setName('announce')
        .setDescription('Create and send an announcement to the server\'s announcement channel')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set the announcement channel for the server')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('The channel to send announcements to')
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('send')
                .setDescription('Send an announcement to the configured channel')
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
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Check the current announcement channel configuration'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        // Check if the user has Administrator permissions
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: 'You need Administrator permissions to use this command.',
                ephemeral: true
            });
        }
        
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'set') {
            // Set the announcement channel
            const channel = interaction.options.getChannel('channel');
            
            // Update the settings with the new channel ID
            updateAnnouncementChannel(interaction.guild.id, channel.id);
            
            return interaction.reply({
                content: `Announcements will now be sent to ${channel}. Use \`/announce send\` to create an announcement.`,
                ephemeral: true
            });
        } 
        else if (subcommand === 'status') {
            // Check current announcement channel
            const settings = readAnnouncementSettings(interaction.guild.id);
            
            if (!settings.announcementChannelId) {
                return interaction.reply({
                    content: 'No announcement channel has been set up yet. Use `/announce set` to configure one.',
                    ephemeral: true
                });
            }
            
            try {
                const channel = await interaction.guild.channels.fetch(settings.announcementChannelId);
                return interaction.reply({
                    content: `The current announcement channel is ${channel}.`,
                    ephemeral: true
                });
            } catch (error) {
                return interaction.reply({
                    content: 'The configured announcement channel no longer exists. Please use `/announce set` to set a new one.',
                    ephemeral: true
                });
            }
        }
        else if (subcommand === 'send') {
            // Defer the reply to handle potentially longer processing time
            await interaction.deferReply({ ephemeral: true });
            
            // Read settings to get the announcement channel
            const settings = readAnnouncementSettings(interaction.guild.id);
            
            if (!settings.announcementChannelId) {
                return interaction.editReply({
                    content: 'No announcement channel has been set up yet. Use `/announce set` to configure one first.',
                });
            }
            
            // Get the announcement channel
            try {
                const channel = await interaction.guild.channels.fetch(settings.announcementChannelId);
                
                // Get announcement details
                const title = interaction.options.getString('title');
                const description = interaction.options.getString('description');
                const color = interaction.options.getString('color') || '#FF5500'; // Default color is the same as other bot embeds
                const imageUrl = interaction.options.getString('image');
                const footer = interaction.options.getString('footer');
                
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
                
                // Add author information
                embed.setAuthor({
                    name: interaction.user.username,
                    iconURL: interaction.user.displayAvatarURL({ dynamic: true })
                });
                
                // Send the announcement
                await channel.send({ embeds: [embed] });
                
                return interaction.editReply({
                    content: `Announcement successfully sent to ${channel}.`,
                });
            } catch (error) {
                console.error('Error sending announcement:', error);
                return interaction.editReply({
                    content: 'Failed to send the announcement. Please check if the configured channel still exists and the bot has permission to send messages there.',
                });
            }
        }
    },
};