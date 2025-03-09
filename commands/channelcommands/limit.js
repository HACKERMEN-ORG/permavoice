const { SlashCommandBuilder } = require('discord.js');
require('dotenv').config();
const { channelOwners } = require('../../methods/channelowner');
const Settings = require('../../Settings.js');
const auditLogger = require('../../methods/auditLogger');

module.exports = {
  category: 'channelcommands',
  data: new SlashCommandBuilder()
    .setName('limit')
    .setDescription('Set a user limit for your temporary voice channel')
    .addIntegerOption(option =>
      option.setName('count')
        .setDescription('The maximum number of users (0-99, 0 = unlimited)')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(99)),
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
      const userLimit = interaction.options.getInteger('count');
      
      // Check if the channel is a temporary channel
      if (!channelOwners.has(currentChannel)) {
        return interaction.editReply({ content: 'You must be in a temporary channel to use this command.', ephemeral: true });
      }
      
      // Check if the channel is a permanent voice channel
      if (Settings.doesChannelHavePermVoice(guild.id, currentChannel)) {
        return interaction.editReply({ content: 'This is a permanent voice channel and cannot be modified with this command.', ephemeral: true });
      }
      
      // Check if the user is the owner of the channel
      if (channelOwners.get(currentChannel) !== member.id) {
        return interaction.editReply({ content: 'Only the channel owner can change the user limit.', ephemeral: true });
      }
      
      // Get the channel and update the user limit
      const channel = guild.channels.cache.get(currentChannel);
      
      // Validate the limit value (Discord allows 0-99)
      if (userLimit < 0 || userLimit > 99) {
        return interaction.editReply({ content: 'User limit must be between 0 and 99 (0 = unlimited).', ephemeral: true });
      }
      
      // Update the channel user limit
      await channel.setUserLimit(userLimit);
      
      // Log the change
      auditLogger.log(guild.id, `Channel user limit updated to ${userLimit === 0 ? 'unlimited' : userLimit} users`, {
        color: '#3498db', // Blue
        title: 'Channel Limit Changed',
        user: member.user,
        fields: [
          { name: 'Channel', value: `<#${currentChannel}>`, inline: true },
          { name: 'New Limit', value: userLimit === 0 ? 'Unlimited' : `${userLimit} users`, inline: true }
        ]
      });
      
      // Create success message
      let successMessage;
      if (userLimit === 0) {
        successMessage = 'Channel user limit has been removed (unlimited users can join).';
      } else if (userLimit === 1) {
        successMessage = `Channel user limit has been set to ${userLimit} user.`;
      } else {
        successMessage = `Channel user limit has been set to ${userLimit} users.`;
      }
      
      return interaction.editReply({ content: successMessage, ephemeral: true });
      
    } catch (error) {
      console.error('Error in limit command:', error);
      
      if (interaction.deferred) {
        await interaction.editReply({ content: 'There was an error while executing the command.', ephemeral: true });
      }
    }
  },
};