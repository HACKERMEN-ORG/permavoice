const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
require('dotenv').config();
const { channelOwners } = require('../../methods/channelowner');
const Settings = require('../../Settings.js');
const auditLogger = require('../../methods/auditLogger');

module.exports = {
  category: 'channelcommands',
  data: new SlashCommandBuilder()
    .setName('claim')
    .setDescription('Claim ownership of the current voice channel if the owner has left'),
  async execute(interaction) {
    // Defer reply to prevent timeout
    await interaction.deferReply({ ephemeral: true });
    
    try {
      const guild = interaction.guild;
      const member = await guild.members.fetch(interaction.user.id);
      
      // Check if the user is in a voice channel
      if (!member.voice.channel) {
        return interaction.editReply({ content: 'You must be in a voice channel to use this command.', ephemeral: true });
      }
      
      const currentChannel = member.voice.channel.id;
      
      // Check if the channel is a permanent voice channel
      if (Settings.doesChannelHavePermVoice(guild.id, currentChannel)) {
        // Only administrators can claim permanent voice channels
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.editReply({ 
            content: 'This is a permanent voice channel and can only be claimed by administrators.', 
            ephemeral: true 
          });
        }
        
        // For administrators, we'll have a different flow to claim permanent channels
        // This could involve setting permissions directly instead of using channelOwners
        const channel = guild.channels.cache.get(currentChannel);
        
        // Set permissions for the admin as owner
        await channel.permissionOverwrites.edit(member.id, { 
          Connect: true, 
          ViewChannel: true, 
          Speak: true,
          MuteMembers: true,
          DeafenMembers: true,
          MoveMembers: true
        });
        
        // Log the permanent channel claim
        auditLogger.log(guild.id, `Permanent voice channel claimed by administrator`, {
          color: '#9b59b6', // Purple
          title: 'Permanent Channel Claimed',
          user: member.user,
          fields: [
            { name: 'Channel', value: `${channel.name} (<#${currentChannel}>)`, inline: true },
            { name: 'Administrator', value: `<@${member.id}>`, inline: true }
          ]
        });
        
        return interaction.editReply({ 
          content: 'You have successfully claimed ownership of this permanent voice channel.', 
          ephemeral: true 
        });
      }
      
      // Regular flow for temporary channels below this point
      // Check if the channel is a temporary channel
      if (!channelOwners.has(currentChannel)) {
        return interaction.editReply({ content: 'You must be in a temporary channel to use this command.', ephemeral: true });
      }
      
      // Get the current owner
      const currentOwnerId = channelOwners.get(currentChannel);
      
      // Check if the user is already the owner
      if (currentOwnerId === member.id) {
        return interaction.editReply({ content: 'You are already the owner of this channel.', ephemeral: true });
      }
      
      // Try to fetch the current owner to check if they're still in the server/channel
      try {
        const currentOwner = await guild.members.fetch(currentOwnerId);
        
        // Check if the current owner is still in the voice channel
        if (currentOwner.voice.channel && currentOwner.voice.channel.id === currentChannel) {
          return interaction.editReply({ 
            content: 'The current owner is still in this channel and must transfer ownership to you.', 
            ephemeral: true 
          });
        }
      } catch (error) {
        // Owner may have left the server, proceed with claim
        console.log(`Owner ${currentOwnerId} not found in server, allowing claim`);
      }
      
      // Update the channel owner
      const oldOwnerId = channelOwners.get(currentChannel);
      channelOwners.set(currentChannel, member.id);
      
      // Set permissions for the new owner
      const channel = guild.channels.cache.get(currentChannel);
      await channel.permissionOverwrites.edit(member.id, { 
        Connect: true, 
        ViewChannel: true, 
        Speak: true
      });
      
      // Log the ownership change
      console.log(`Ownership of channel ${currentChannel} transferred from ${oldOwnerId} to ${member.id} via claim command`);
      
      // Audit log
      try {
        // We may not have the old owner as a user object anymore, so we'll just use their ID
        const oldOwnerUser = { id: oldOwnerId, username: `Former Owner (${oldOwnerId})` };
        auditLogger.logOwnershipTransfer(guild.id, channel, oldOwnerUser, member.user);
      } catch (error) {
        console.error('Error logging ownership transfer:', error);
      }
      
      return interaction.editReply({ 
        content: 'You have successfully claimed ownership of this channel.', 
        ephemeral: true 
      });
      
    } catch (error) {
      console.error('Error in claim command:', error);
      
      if (interaction.deferred) {
        await interaction.editReply({ content: 'There was an error while executing the command.', ephemeral: true });
      }
    }
  },
};