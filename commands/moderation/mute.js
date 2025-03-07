const { Client, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
require('dotenv').config();
const { channelOwners } = require('../../methods/channelowner');

module.exports = {
  category: 'channelcommands',
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Mute or unmute a user in your channel (does not affect server-wide mute status).')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to mute/unmute.')
        .setRequired(true)),
  async execute(interaction) {
    const guild = interaction.guild;
    const member = await interaction.guild.members.fetch(interaction.user.id);
    
    if (!member.voice.channel) {
      return interaction.reply({ content: 'You must be in a voice channel to use this command.', ephemeral: true });
    }
    
    const currentChannel = member.voice.channel.id;
    const targetChannel = guild.channels.cache.get(currentChannel);
    const targetUser = interaction.options.getUser('user');
    const targetMember = await guild.members.fetch(targetUser.id);

    // Check if the user is in a temporary channel
    if (!channelOwners.has(currentChannel)) {
      return interaction.reply({ content: 'You must be in a temporary channel.', ephemeral: true });
    }

    // Check if the user is the owner of the channel
    if (channelOwners.get(currentChannel) !== member.id) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    // Prevent the user from muting themselves
    if (member.id === targetUser.id) {
      return interaction.reply({ content: 'You cannot mute yourself.', ephemeral: true });
    }

    // Prevent the user from muting the bot
    if (targetUser.id === interaction.client.user.id) {
      return interaction.reply({ content: 'You cannot mute the bot.', ephemeral: true });
    }

    try {
      // Check if the target user is in the channel
      if (!targetMember.voice.channel || targetMember.voice.channel.id !== currentChannel) {
        return interaction.reply({ content: `${targetUser.username} is not in your voice channel.`, ephemeral: true });
      }

      // Get the current permission overwrite for the user
      const currentPermissions = targetChannel.permissionOverwrites.cache.get(targetUser.id);
      const isMuted = currentPermissions && currentPermissions.deny.has(PermissionFlagsBits.Speak);

      // If user is already muted, inform the user
      if (isMuted) {
        return interaction.reply({ content: `${targetUser.username} is already muted in this channel. Use /roomunmute to unmute them.`, ephemeral: true });
      } 
      
      // Mute the user in this channel
      await targetChannel.permissionOverwrites.edit(targetUser, { Speak: false });
      return interaction.reply({ content: `${targetUser.username} has been muted in this channel.`, ephemeral: true });
    } catch (error) {
      console.error('Error muting/unmuting user:', error);
      await interaction.reply({ content: 'There was an error while using the command.', ephemeral: true });
    }
  },
};

