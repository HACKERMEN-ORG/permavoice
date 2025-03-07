const { SlashCommandBuilder } = require('discord.js');
require('dotenv').config();
const { channelOwners } = require('../../methods/channelowner');
const fs = require('node:fs');
const path = require('node:path');

// Collection to track submoderators for each channel
const channelSubmods = new Map();

// File path for the submods data
const submodsFilePath = path.join(__dirname, '../../globalserversettings/submods', 'channelSubmods.json');

// Ensure the directory exists
function ensureSubmodsDirectoryExists() {
  const dir = path.dirname(submodsFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Load submods data from file
function loadSubmodsData() {
  ensureSubmodsDirectoryExists();
  if (!fs.existsSync(submodsFilePath)) {
    fs.writeFileSync(submodsFilePath, '{}', 'utf8');
    return;
  }

  try {
    const data = JSON.parse(fs.readFileSync(submodsFilePath, 'utf8'));
    
    // Convert the data back to our map format
    Object.keys(data).forEach(channelId => {
      channelSubmods.set(channelId, new Set(data[channelId]));
    });
    
    console.log(`Loaded submods data for ${channelSubmods.size} channels`);
  } catch (error) {
    console.error('Error loading submods data:', error);
  }
}

// Save submods data to file
function saveSubmodsData() {
  ensureSubmodsDirectoryExists();
  
  // Convert the map to a serializable format
  const saveData = {};
  channelSubmods.forEach((userSet, channelId) => {
    saveData[channelId] = Array.from(userSet);
  });
  
  fs.writeFileSync(submodsFilePath, JSON.stringify(saveData, null, 2), 'utf8');
}

// Load data when this module is required
loadSubmodsData();

// Export the functions and map for use in other files
module.exports = {
  channelSubmods,
  loadSubmodsData,
  saveSubmodsData,
  
  // Add a submod to a channel
  addSubmod(channelId, userId) {
    if (!channelSubmods.has(channelId)) {
      channelSubmods.set(channelId, new Set());
    }
    channelSubmods.get(channelId).add(userId);
    saveSubmodsData();
    return true;
  },
  
  // Remove a submod from a channel
  removeSubmod(channelId, userId) {
    if (!channelSubmods.has(channelId)) {
      return false;
    }
    const result = channelSubmods.get(channelId).delete(userId);
    if (channelSubmods.get(channelId).size === 0) {
      channelSubmods.delete(channelId);
    }
    saveSubmodsData();
    return result;
  },
  
  // Check if a user is a submod in a channel
  isSubmod(channelId, userId) {
    // Channel owners are considered "super" admins
    if (channelOwners.has(channelId) && channelOwners.get(channelId) === userId) {
      return true;
    }
    
    return channelSubmods.has(channelId) && channelSubmods.get(channelId).has(userId);
  },
  
  // Get all submods for a channel
  getSubmods(channelId) {
    if (!channelSubmods.has(channelId)) {
      return new Set();
    }
    return new Set(channelSubmods.get(channelId));
  },
  
  // Clear all submods for a channel (used when channel is deleted)
  clearChannelSubmods(channelId) {
    if (channelSubmods.has(channelId)) {
      channelSubmods.delete(channelId);
      saveSubmodsData();
    }
  },
  
  data: new SlashCommandBuilder()
    .setName('submod')
    .setDescription('Add a submoderator to the channel')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to make a submoderator.')
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

      // Prevent the user from adding themselves as a submod
      if (member.id === targetUser.id) {
        return await interaction.editReply({ content: 'You are already the channel owner and do not need to be a submoderator.' });
      }

      // Prevent the user from adding the bot as a submod
      if (targetUser.id === interaction.client.user.id) {
        return await interaction.editReply({ content: 'You cannot add the bot as a submoderator.' });
      }

      // Check if the user is already a submod
      if (module.exports.isSubmod(currentChannel, targetUser.id)) {
        return await interaction.editReply({ content: `${targetUser.username} is already a submoderator in this channel.` });
      }
      
      // Add the user as a submod
      module.exports.addSubmod(currentChannel, targetUser.id);
      
      // Set permissions for the submoderator
      const targetChannel = guild.channels.cache.get(currentChannel);
      targetChannel.permissionOverwrites.edit(targetUser.id, { 
        Connect: true, 
        ViewChannel: true, 
        Speak: true, 
        MuteMembers: true, 
        DeafenMembers: true,
        MoveMembers: true
      });
      
      return await interaction.editReply({ content: `${targetUser.username} has been added as a submoderator in this channel.` });
    } catch (error) {
      console.error('Error in submod command:', error);
      
      if (interaction.deferred) {
        await interaction.editReply({ content: 'There was an error while using the command.' }).catch(console.error);
      }
    }
  },
};