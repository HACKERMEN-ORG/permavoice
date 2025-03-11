const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
require('dotenv').config();
const { channelOwners } = require('../../methods/channelowner');
const Settings = require('../../Settings.js');

// Import the submod manager
let submodManager;
try {
  submodManager = require('../../methods/submodmanager');
} catch (error) {
  console.error('Error importing submodmanager:', error);
  // Create a placeholder if module doesn't exist yet
  submodManager = {
    getSubmods: () => new Set(),
    isSubmod: () => false
  };
}

module.exports = {
  category: 'moderatoronly',
  data: new SlashCommandBuilder()
    .setName('owners')
    .setDescription('List all permanent and temporary voice channels with their owners and submoderators.')
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
      
      // Create two embeds for permanent and temporary channels
      const permEmbed = new EmbedBuilder()
        .setTitle('Permanent Voice Channels')
        .setColor('#00AAFF')
        .setDescription('List of all permanent voice channels with their owners and submoderators.')
        .setTimestamp();
      
      const tempEmbed = new EmbedBuilder()
        .setTitle('Temporary Voice Channels')
        .setColor('#FF5500')
        .setDescription('List of all temporary voice channels with their owners and submoderators.')
        .setTimestamp();
      
      // Track channel counts
      let permChannelCount = 0;
      let tempChannelCount = 0;
      
      // Get all voice channels in the guild
      const voiceChannels = guild.channels.cache.filter(channel => 
        channel.type === 2 // GuildVoice type
      );
      
      // Process all permanent voice channels
      let permDescription = '';
      
      for (const [channelId, channel] of voiceChannels) {
        // Check if it's a permanent channel
        if (Settings.doesChannelHavePermVoice(guild.id, channelId)) {
          permChannelCount++;
          
          // Find the owner by checking permission overwrites
          // We're looking for members who have Connect and Speak permissions specifically set
          let ownerInfo = 'No specific owner';
          const ownerOverwrites = channel.permissionOverwrites.cache
            .filter(overwrite => 
              overwrite.type === 1 && // User type
              overwrite.allow.has(PermissionFlagsBits.Connect) && 
              overwrite.allow.has(PermissionFlagsBits.Speak)
            );
          
          if (ownerOverwrites.size === 1) {
            // One clear owner
            const ownerId = ownerOverwrites.first().id;
            try {
              const owner = await guild.members.fetch(ownerId);
              ownerInfo = `${owner.user.username} (<@${ownerId}>)`;
            } catch {
              ownerInfo = `Unknown User (<@${ownerId}>)`;
            }
          } else if (ownerOverwrites.size > 1) {
            // Multiple possible owners
            const ownerIds = Array.from(ownerOverwrites.keys());
            ownerInfo = `Multiple possible owners: ${ownerIds.map(id => `<@${id}>`).join(', ')}`;
          }
          
          permDescription += `**${channel.name}** (<#${channelId}>)\n`;
          permDescription += `• Owner: ${ownerInfo}\n`;
          permDescription += `• Members: ${channel.members.size}\n\n`;
        }
      }
      
      // Set permanent channel description
      if (permDescription) {
        permEmbed.setDescription(permDescription);
      } else {
        permEmbed.setDescription('No permanent voice channels found.');
      }
      
      // Process all temporary voice channels
      let tempDescription = '';
      
      for (const [channelId, ownerId] of channelOwners.entries()) {
        // Skip if it's a permanent channel
        if (Settings.doesChannelHavePermVoice(guild.id, channelId)) {
          continue;
        }
        
        try {
          // Try to fetch the channel to ensure it exists
          const channel = await guild.channels.fetch(channelId).catch(() => null);
          
          if (!channel) {
            continue; // Skip if channel no longer exists
          }
          
          tempChannelCount++;
          
          // Get owner info
          let ownerInfo = 'Unknown User';
          try {
            const owner = await guild.members.fetch(ownerId);
            ownerInfo = `${owner.user.username} (<@${ownerId}>)`;
          } catch {
            ownerInfo = `Unknown User (<@${ownerId}>)`;
          }
          
          // Get submoderators for this channel
          const submods = submodManager.getSubmods(channelId);
          let submodsInfo = 'None';
          
          if (submods.size > 0) {
            const submodList = [];
            for (const submodId of submods) {
              try {
                const submod = await guild.members.fetch(submodId);
                submodList.push(`${submod.user.username} (<@${submodId}>)`);
              } catch {
                submodList.push(`Unknown User (<@${submodId}>)`);
              }
            }
            submodsInfo = submodList.join(', ');
          }
          
          tempDescription += `**${channel.name}** (<#${channelId}>)\n`;
          tempDescription += `• Owner: ${ownerInfo}\n`;
          tempDescription += `• Submods: ${submodsInfo}\n`;
          tempDescription += `• Members: ${channel.members.size}\n\n`;
        } catch (error) {
          console.error(`Error processing channel ${channelId}:`, error);
        }
      }
      
      // Set temporary channel description
      if (tempDescription) {
        tempEmbed.setDescription(tempDescription);
      } else {
        tempEmbed.setDescription('No temporary voice channels found.');
      }
      
      // Add footer with counts
      permEmbed.setFooter({ text: `Found ${permChannelCount} permanent voice channels` });
      tempEmbed.setFooter({ text: `Found ${tempChannelCount} temporary voice channels` });
      
      // Send both embeds
      await interaction.editReply({ 
        content: 'Voice channel ownership information:',
        embeds: [permEmbed, tempEmbed],
        ephemeral: true 
      });
      
    } catch (error) {
      console.error('Error executing owners command:', error);
      if (interaction.deferred) {
        await interaction.editReply({ 
          content: 'There was an error while retrieving the owners information.', 
          ephemeral: true 
        });
      } else {
        await interaction.reply({ 
          content: 'There was an error while retrieving the owners information.', 
          ephemeral: true 
        });
      }
    }
  },
};