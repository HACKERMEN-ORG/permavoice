const { SlashCommandBuilder } = require('discord.js');
require('dotenv').config();
const { channelOwners } = require('../../methods/channelowner');
const { removeMutedUser, isUserMuted } = require('../../methods/channelMutes');
const auditLogger = require('../../methods/auditLogger');


// Import the submod manager correctly
let submodManager;
try {
  submodManager = require('../../methods/submodmanager');
} catch (error) {
  console.error('Error importing submodmanager:', error);
  // Create a placeholder if module doesn't exist yet
  submodManager = {
    isSubmod: () => false
  };
}

module.exports = {
  category: 'channelcommands',
  data: new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Unmute a user in your channel.')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to unmute.')
        .setRequired(true)),
  async execute(interaction) {
    // Defer reply immediately to prevent timeout
    await interaction.deferReply({ ephemeral: true });
    
    try {
      const guild = interaction.guild;
      const member = await interaction.guild.members.fetch(interaction.user.id);
      
      if (!member.voice.channel) {
        return await interaction.editReply({ content: 'You must be in a voice channel to use this command.' });
      }
      
      const currentChannel = member.voice.channel.id;
      const targetUser = interaction.options.getUser('user');

      // Check if the user is in a temporary channel
      if (!channelOwners.has(currentChannel)) {
        return await interaction.editReply({ content: 'You must be in a temporary channel.' });
      }

      // Check if the user is the owner of the channel or a submoderator
      if (channelOwners.get(currentChannel) !== member.id && !submodManager.isSubmod(currentChannel, member.id)) {
        return await interaction.editReply({ content: 'You do not have permission to use this command.' });
      }

      // Check if the user is actually muted in this channel
      if (!isUserMuted(currentChannel, targetUser.id)) {
        return await interaction.editReply({ content: `${targetUser.username} is not muted in this channel.` });
      }
      
      // First, update our tracking system to mark this as an explicit unmute
      // This is critical so the voice state handler respects this action
      removeMutedUser(currentChannel, targetUser.id);
      console.log(`Unmuting ${targetUser.id} in channel ${currentChannel} (command)`);
      
      // Get the channel for audit logging
      const targetChannel = guild.channels.cache.get(currentChannel);
      
      try {
        // Fetch the target member
        const targetMember = await guild.members.fetch(targetUser.id);
        
        // If the user is in the voice channel, remove the server mute
        if (targetMember.voice.channel && targetMember.voice.channel.id === currentChannel) {
          try {
            // Unmute the user in this channel
            await targetMember.voice.setMute(false, 'Channel moderation unmuted user');
            console.log(`Successfully unmuted ${targetUser.id} via command`);
          } catch (muteError) {
            console.error('Error unmuting user:', muteError);
            // Continue anyway - the user is tracked as unmuted in our system
          }
        }
        
        // Log the unmute action - only log it once here, after we've done everything
        auditLogger.logUserUnmute(guild.id, targetChannel, targetUser, member.user);
        
        return await interaction.editReply({ content: `${targetUser.username} has been unmuted.` });
      } catch (memberError) {
        console.error('Error fetching member for unmute:', memberError);
        // Continue anyway since we've already updated our tracking system
        
        // Log the unmute action here too in case we couldn't fetch the member
        auditLogger.logUserUnmute(guild.id, targetChannel, targetUser, member.user);
        
        return await interaction.editReply({ content: `${targetUser.username} has been unmuted.` });
      }
    } catch (error) {
      console.error('Error in unmute command:', error);
      
      // Check if the interaction can still be replied to
      if (interaction.deferred) {
        await interaction.editReply({ content: 'There was an error while using the command.' }).catch(console.error);
      }
    }
  },
};