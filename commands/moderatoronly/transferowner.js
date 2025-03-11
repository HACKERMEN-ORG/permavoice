// Updated transferownership command to check for permissions and prevent transferring permanent rooms
const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, GuildChannel } = require('discord.js');
require('dotenv').config();
const { channelOwners } = require('../../methods/channelowner');
const Settings = require('../../Settings.js'); // Added to check for permanent rooms

module.exports = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('transferownership')
    .setDescription('Transfer the ownership of the temp channel to a new owner.')
    .addUserOption(option =>
      option
        .setName('target')
        .setDescription('The user to transfer the ownership to.')
        .setRequired(true)),
  async execute(interaction) {
    const guild = interaction.guild;
    const member = await interaction.guild.members.fetch(interaction.user.id);
    
    // Check if user is in a voice channel
    if (!member.voice.channel) {
      return interaction.reply({ content: 'You must be in a voice channel to use this command.', ephemeral: true });
    }
    
    const currentChannel = member.voice.channel.id;
    const targetChannel = guild.channels.cache.get(currentChannel);
    const target = interaction.options.getUser('target').id;
    const targetnew = guild.members.cache.get(target);

    // Check if the user is trying to transfer ownership to themselves
    if (interaction.user.id === target) {
      return interaction.reply({ content: 'You cannot transfer ownership to yourself.', ephemeral: true });
    }

    // Check if the channel is a temporary channel
    if (!channelOwners.has(currentChannel)) {
      return interaction.reply({ content: 'You must be in a temporary channel to use this command.', ephemeral: true });
    }

    // Check if the channel is a permanent voice channel
    if (Settings.doesChannelHavePermVoice(guild.id, currentChannel)) {
      return interaction.reply({ content: 'This is a permanent voice channel. Ownership cannot be transferred.', ephemeral: true });
    }

    // Check if the user is the owner of the channel
    if (channelOwners.get(currentChannel) !== member.id) {
      // If user is not the owner and doesn't have ManageChannels permission, deny
      if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.reply({ 
          content: 'You are not the owner of this channel. Only channel owners or server moderators with Manage Channels permission can transfer ownership.', 
          ephemeral: true 
        });
      }
      // If we reached here, user has ManageChannels permission
    }

    try {
      // Remove any permissions for the previous owner
      targetChannel.permissionOverwrites.delete(channelOwners.get(currentChannel));
      
      // Update the channel owner
      channelOwners.set(currentChannel, target);
      
      // Set permissions for the new owner
      targetChannel.permissionOverwrites.edit(targetnew, { 
        Connect: true, 
        ViewChannel: true, 
        Speak: true 
      });
      
      // Also update the permanent owner tracking if necessary
      const permanentOwnerManager = require('../../methods/permanentOwner');
      const oldOwnerId = interaction.user.id;
      const isPermanentOwner = permanentOwnerManager.getTempChannelForPermanentOwner(oldOwnerId) === currentChannel;
      
      if (isPermanentOwner) {
        // Remove the mapping for the old owner
        permanentOwnerManager.removeTempChannelForPermanentOwner(oldOwnerId);
        
        // Check if the new owner also has permanent rooms
        const ownedPermRooms = findUserOwnedPermanentRooms(guild, target);
        if (ownedPermRooms.length > 0) {
          // Add tracking for the new owner
          permanentOwnerManager.setTempChannelForPermanentOwner(target, currentChannel);
        }
      }
      
      await interaction.reply({ content: `Channel ownership has been transferred to <@${target}>.`, ephemeral: true });
    } catch (error) {
      console.error('Error transferring ownership:', error);
      await interaction.reply({ content: `There was an error while using the command.`, ephemeral: true });
    }
  },
};