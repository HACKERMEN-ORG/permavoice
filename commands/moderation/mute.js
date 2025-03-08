const { SlashCommandBuilder } = require('discord.js');
require('dotenv').config();
const { channelOwners } = require('../../methods/channelowner');
const { addMutedUser, isUserMuted } = require('../../methods/channelMutes');
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
    .setName('mute')
    .setDescription('Server mute a user in your channel (only applies in your channel).')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to mute.')
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

      // Prevent the user from muting themselves
      if (member.id === targetUser.id) {
        return await interaction.editReply({ content: 'You cannot mute yourself.' });
      }

      // Prevent muting the channel owner
      if (channelOwners.get(currentChannel) === targetUser.id) {
        return await interaction.editReply({ content: 'You cannot mute the channel owner.' });
      }

      // Prevent muting another submoderator (only owner can mute submods)
      if (submodManager.isSubmod(currentChannel, targetUser.id) && channelOwners.get(currentChannel) !== member.id) {
        return await interaction.editReply({ content: 'Submoderators cannot mute other submoderators. Only the channel owner can do that.' });
      }

      // Prevent the user from muting the bot
      if (targetUser.id === interaction.client.user.id) {
        return await interaction.editReply({ content: 'You cannot mute the bot.' });
      }

      // Check if the user is already muted in this channel
      if (isUserMuted(currentChannel, targetUser.id)) {
        return await interaction.editReply({ content: `${targetUser.username} is already muted in this channel.` });
      }
      
      // First, update our tracking system to mark this as an explicit mute
      // This is critical so the voice state handler respects this action
      addMutedUser(currentChannel, targetUser.id);
      console.log(`Muting ${targetUser.id} in channel ${currentChannel} (command)`);
      
      try {
        // Fetch the target member
        const targetMember = await guild.members.fetch(targetUser.id);
        
        // If the user is in the voice channel, apply the server mute
        if (targetMember.voice.channel && targetMember.voice.channel.id === currentChannel) {
          try {
            // Mute the user in this channel
            await targetMember.voice.setMute(true, 'Channel moderation muted user');
            console.log(`Successfully muted ${targetUser.id} via command`);
            // Log the mute action
            const targetChannel = guild.channels.cache.get(currentChannel);
            auditLogger.logUserMute(guild.id, targetChannel, targetUser, member.user);
          } catch (muteError) {
            console.error('Error muting user:', muteError);
            // Continue anyway - the user is tracked as muted in our system
          }
        }
        
        return await interaction.editReply({ content: `${targetUser.username} has been muted in this channel.` });
      } catch (memberError) {
        console.error('Error fetching member for mute:', memberError);
        // Continue anyway since we've already updated our tracking system
        return await interaction.editReply({ content: `${targetUser.username} has been muted. They will be muted when they join the channel.` });
      }
    } catch (error) {
      console.error('Error in mute command:', error);
      
      // Check if the interaction can still be replied to
      if (interaction.deferred) {
        await interaction.editReply({ content: 'There was an error while using the command.' }).catch(console.error);
      }
    }
  },
};