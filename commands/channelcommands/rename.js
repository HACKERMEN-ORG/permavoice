// commands/channelcommands/rename.js
const { SlashCommandBuilder } = require('discord.js');
require('dotenv').config();
const { channelOwners } = require('../../methods/channelowner');
const Settings = require('../../Settings.js');

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
    .setName('rename')
    .setDescription('Rename your temporary voice channel')
    .addStringOption(option =>
      option.setName('name')
        .setDescription('The new name for your channel')
        .setRequired(true)
        .setMaxLength(100)),
  async execute(interaction) {
    // Defer reply to prevent timeout
    await interaction.deferReply({ ephemeral: true });
    
    try {
      const guild = interaction.guild;
      const member = await interaction.guild.members.fetch(interaction.user.id);
      
      if (!member.voice.channel) {
        return await interaction.editReply({ content: 'You must be in a voice channel to use this command.' });
      }
      
      const currentChannel = member.voice.channel.id;
      const newName = interaction.options.getString('name');
      
      // Check if the user is in a temporary channel
      if (!channelOwners.has(currentChannel)) {
        return await interaction.editReply({ content: 'You must be in a temporary channel to use this command.' });
      }

      // Check if the channel is a permanent voice channel
      if (Settings.doesChannelHavePermVoice(guild.id, currentChannel)) {
        return await interaction.editReply({ content: 'This channel is marked as permanent and cannot be renamed using this command.' });
      }

      // Check if the user is the owner of the channel or a submoderator
      if (channelOwners.get(currentChannel) !== member.id && !submodManager.isSubmod(currentChannel, member.id)) {
        return await interaction.editReply({ content: 'You do not have permission to rename this channel.' });
      }

      // Validate the new name
      if (!newName || newName.trim() === '') {
        return await interaction.editReply({ content: 'Please provide a valid channel name.' });
      }

      // Check for inappropriate content or Discord's channel name requirements
      // This is a basic filter, you might want to enhance it
      if (newName.includes('@everyone') || newName.includes('@here') || /[^\w\s\-]/g.test(newName)) {
        return await interaction.editReply({ 
          content: 'The channel name contains invalid characters or restricted terms. Please use only letters, numbers, spaces, and hyphens.' 
        });
      }

      // Get the channel and rename it
      const channel = guild.channels.cache.get(currentChannel);
      if (!channel) {
        return await interaction.editReply({ content: 'Channel not found. Please try again.' });
      }

      // Add the original owner's name to keep track
      const ownerMember = await interaction.guild.members.fetch(channelOwners.get(currentChannel));
      const finalName = `${newName} (${ownerMember.user.username})`;
      
      await channel.setName(finalName);
      
      return await interaction.editReply({ 
        content: `Channel has been renamed to "${newName}".` 
      });
      
    } catch (error) {
      console.error('Error in rename command:', error);
      
      if (interaction.deferred) {
        await interaction.editReply({ content: 'There was an error while renaming the channel.' }).catch(console.error);
      }
    }
  },
};