const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
require('dotenv').config();
const { channelOwners } = require('../../methods/channelowner');

module.exports = {
  category: 'moderatoronly',
  data: new SlashCommandBuilder()
    .setName('listrooms')
    .setDescription('Lists all temporary voice channels and their owners.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(interaction) {
    // Check if the user has the necessary permissions
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ 
        content: 'You do not have permission to use this command. It requires the Manage Channels permission.', 
        ephemeral: true 
      });
    }

    const guild = interaction.guild;
    
    try {
      // Defer reply since this might take a moment
      await interaction.deferReply({ ephemeral: true });
      
      // If there are no channels with owners
      if (channelOwners.size === 0) {
        return interaction.editReply({
          content: 'There are currently no active temporary voice channels.',
          ephemeral: true
        });
      }
      
      // Create embed
      const embed = new EmbedBuilder()
        .setTitle('Temporary Voice Channels')
        .setColor('#00AAFF')
        .setDescription('List of all current temporary voice channels and their owners.')
        .setTimestamp();
      
      // Track which channels exist vs which might be stale in the channelOwners collection
      let activeChannels = 0;
      let staleEntries = 0;
      
      // Process channel entries
      const entries = [];
      
      for (const [channelId, ownerId] of channelOwners.entries()) {
        try {
          // Try to fetch the channel to ensure it exists
          const voiceChannel = await guild.channels.fetch(channelId).catch(() => null);
          
          if (!voiceChannel) {
            staleEntries++;
            continue; // Skip this channel as it no longer exists
          }
          
          // Try to fetch the owner to get their username
          const owner = await guild.members.fetch(ownerId).catch(() => null);
          const ownerName = owner ? `${owner.user.username}` : `Unknown User (ID: ${ownerId})`;
          
          // Add channel info to entries array
          entries.push({
            channelName: voiceChannel.name,
            channelId: channelId,
            ownerName: ownerName,
            ownerId: ownerId,
            memberCount: voiceChannel.members.size
          });
          
          activeChannels++;
        } catch (error) {
          console.error(`Error processing channel ${channelId}:`, error);
          staleEntries++;
        }
      }
      
      // Sort entries by channel name
      entries.sort((a, b) => a.channelName.localeCompare(b.channelName));
      
      // Add entries to embed
      if (entries.length > 0) {
        let description = '';
        
        entries.forEach((entry, index) => {
          description += `**${index + 1}. ${entry.channelName}**\n`;
          description += `• Channel: <#${entry.channelId}>\n`;
          description += `• Owner: ${entry.ownerName} (<@${entry.ownerId}>)\n`;
          description += `• Members: ${entry.memberCount}\n\n`;
        });
        
        embed.setDescription(description);
      } else {
        embed.setDescription('No active temporary voice channels found.');
      }
      
      // Add stats to the footer
      embed.setFooter({ 
        text: `Found ${activeChannels} active channels` + 
              (staleEntries > 0 ? ` • ${staleEntries} stale entries detected` : '')
      });
      
      await interaction.editReply({ embeds: [embed], ephemeral: true });
      
    } catch (error) {
      console.error('Error executing listrooms command:', error);
      if (interaction.deferred) {
        await interaction.editReply({ 
          content: 'There was an error while trying to list the rooms.', 
          ephemeral: true 
        });
      } else {
        await interaction.reply({ 
          content: 'There was an error while trying to list the rooms.', 
          ephemeral: true 
        });
      }
    }
  },
};
