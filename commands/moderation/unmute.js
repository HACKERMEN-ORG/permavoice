const { Client, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
require('dotenv').config();
const { channelOwners } = require('../../methods/channelowner');

module.exports = {
  category: 'channelcommands',
  data: new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Unmute a user in your channel (room-specific unmute).')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to unmute.')
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

    try {
      // Get the current permission overwrite for the user
      const currentPermissions = targetChannel.permissionOverwrites.cache.get(targetUser.id);
      
      // Check if the user is currently muted
      if (!currentPermissions || !currentPermissions.deny.has(PermissionFlagsBits.Speak)) {
        return interaction.reply({ content: `${targetUser.username} is not muted in this channel.`, ephemeral: true });
      }
      
      // Remove the Speak denial from permissions (unmute)
      // We use null to reset the permission to default
      await targetChannel.permissionOverwrites.edit(targetUser, { Speak: null });
      
      // If no other permissions are being applied to this user, clean up by removing the override
      const updatedPermissions = targetChannel.permissionOverwrites.cache.get(targetUser.id);
      if (updatedPermissions && updatedPermissions.deny.bitfield === 0n && updatedPermissions.allow.bitfield === 0n) {
        await targetChannel.permissionOverwrites.delete(targetUser);
      }
      
      return interaction.reply({ content: `${targetUser.username} has been unmuted in this channel.`, ephemeral: true });
    } catch (error) {
      console.error('Error unmuting user:', error);
      await interaction.reply({ content: 'There was an error while using the command.', ephemeral: true });
    }
  },
};

