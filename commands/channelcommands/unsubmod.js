const { SlashCommandBuilder } = require('discord.js');
require('dotenv').config();
const { channelOwners } = require('../../methods/channelowner');
const { removeSubmod, isSubmod } = require('./submod');

module.exports = {
  category: 'channelcommands',
  data: new SlashCommandBuilder()
    .setName('unsubmod')
    .setDescription('Remove a submoderator from the channel')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to remove as a submoderator.')
        .setRequired(true)),
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
      const targetUser = interaction.options.getUser('user');
      
      // Check if the user is in a temporary channel
      if (!channelOwners.has(currentChannel)) {
        return await interaction.editReply({ content: 'You must be in a temporary channel.' });
      }

      // Check if the user is the owner of the channel
      if (channelOwners.get(currentChannel) !== member.id) {
        return await interaction.editReply({ content: 'You do not have permission to use this command.' });
      }

      // Check if the user is actually a submod
      if (!isSubmod(currentChannel, targetUser.id)) {
        return await interaction.editReply({ content: `${targetUser.username} is not a submoderator in this channel.` });
      }
      
      // Remove the user as a submod
      removeSubmod(currentChannel, targetUser.id);
      
      // Reset permissions for the user (remove elevated permissions)
      const targetChannel = guild.channels.cache.get(currentChannel);
      targetChannel.permissionOverwrites.delete(targetUser.id);
      
      return await interaction.editReply({ content: `${targetUser.username} has been removed as a submoderator from this channel.` });
    } catch (error) {
      console.error('Error in unsubmod command:', error);
      
      if (interaction.deferred) {
        await interaction.editReply({ content: 'There was an error while using the command.' }).catch(console.error);
      }
    }
  },
};