// Updated transferownership command to allow administrators to transfer permanent rooms
const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, GuildChannel } = require('discord.js');
require('dotenv').config();
const { channelOwners } = require('../../methods/channelowner');
const Settings = require('../../Settings.js');
const auditLogger = require('../../methods/auditLogger');

module.exports = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('transferownership')
    .setDescription('Transfer the ownership of a voice channel to a new owner.')
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
    const targetMember = guild.members.cache.get(target);

    // Check if the user is trying to transfer ownership to themselves
    if (interaction.user.id === target) {
      return interaction.reply({ content: 'You cannot transfer ownership to yourself.', ephemeral: true });
    }

    // Check if the target user is in the server
    if (!targetMember) {
      return interaction.reply({ content: 'The specified user could not be found in this server.', ephemeral: true });
    }

    // Determine if the channel is a permanent voice channel
    const isPermanentChannel = Settings.doesChannelHavePermVoice(guild.id, currentChannel);
    console.log(`Channel ${currentChannel} isPermanent: ${isPermanentChannel}`);
    
    // Determine if the user is an administrator
    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
    console.log(`User ${member.id} isAdmin: ${isAdmin}`);
    
    // Check permissions based on channel type and user role
    if (isPermanentChannel) {
      // For permanent channels, only administrators can transfer ownership
      if (!isAdmin) {
        return interaction.reply({ 
          content: 'This is a permanent voice channel. Only administrators can transfer ownership of permanent channels.', 
          ephemeral: true 
        });
      }
      // Administrators can proceed with transferring permanent rooms
      console.log(`Admin ${member.id} transferring permanent room ${currentChannel} to ${target}`);
    } else {
      // For temporary channels, check if the user is the owner
      if (!channelOwners.has(currentChannel)) {
        return interaction.reply({ content: 'This channel does not appear to be a temporary channel.', ephemeral: true });
      }
      
      // Check if the user is the owner of the channel or has admin permissions
      if (channelOwners.get(currentChannel) !== member.id && !isAdmin) {
        return interaction.reply({ 
          content: 'You are not the owner of this channel. Only channel owners or administrators can transfer ownership.', 
          ephemeral: true 
        });
      }
    }

    try {
      // For permanent rooms with admin transferring ownership
      if (isPermanentChannel && isAdmin) {
        // Update the permission overwrites for the permanent room
        await targetChannel.permissionOverwrites.edit(targetMember, { 
          Connect: true, 
          ViewChannel: true, 
          Speak: true 
        });
        
        // Remove any special permissions from previous owner if needed
        // This is only if we can identify the previous owner
        const previousOwnerOverwrites = targetChannel.permissionOverwrites.cache
          .filter(overwrite => 
            overwrite.type === 1 && // User type
            overwrite.id !== target && // Not the new owner
            overwrite.id !== guild.id && // Not @everyone
            overwrite.allow.has(PermissionFlagsBits.Connect) && 
            overwrite.allow.has(PermissionFlagsBits.Speak)
          );
        
        // If there's a clear previous owner, remove their permissions
        if (previousOwnerOverwrites.size === 1) {
          const previousOwner = previousOwnerOverwrites.first();
          await targetChannel.permissionOverwrites.delete(previousOwner.id);
          console.log(`Removed permissions for previous owner ${previousOwner.id}`);
        }
        
        await interaction.reply({ 
          content: `Permanent channel ownership has been transferred to <@${target}>.`, 
          ephemeral: true 
        });
        
        // Log the permanent room transfer
        auditLogger.log(guild.id, `Permanent voice channel ownership transferred`, {
          color: '#9b59b6', // Purple
          title: 'Permanent Channel Ownership Transferred',
          user: member.user,
          fields: [
            { name: 'Channel', value: `${targetChannel.name} (<#${currentChannel}>)`, inline: true },
            { name: 'New Owner', value: `<@${target}>`, inline: true },
            { name: 'Transferred By', value: `<@${member.id}>`, inline: true }
          ]
        });
        
        return;
      }
      
      // For temporary channels - this is the existing logic
      console.log(`Transferring temporary channel ${currentChannel} from ${channelOwners.get(currentChannel)} to ${target}`);
      
      // Remove any permissions for the previous owner
      targetChannel.permissionOverwrites.delete(channelOwners.get(currentChannel));
      
      // Update the channel owner in our tracking system
      const oldOwnerId = channelOwners.get(currentChannel);
      channelOwners.set(currentChannel, target);
      
      // Set permissions for the new owner
      targetChannel.permissionOverwrites.edit(targetMember, { 
        Connect: true, 
        ViewChannel: true, 
        Speak: true 
      });
      
      // Also update the permanent owner tracking if necessary
      const permanentOwnerManager = require('../../methods/permanentOwner');
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
      
      // Log the ownership transfer
      auditLogger.logOwnershipTransfer(guild.id, targetChannel, { id: oldOwnerId }, targetMember.user);
      
    } catch (error) {
      console.error('Error transferring ownership:', error);
      await interaction.reply({ content: `There was an error while using the command.`, ephemeral: true });
    }
  },
};