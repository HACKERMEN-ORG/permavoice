// methods/submodmanager.js
const { channelOwners } = require('./channelowner');
const fs = require('node:fs');
const path = require('node:path');
const Discord = require('discord.js');

/**
 * Collection to track submoderators for each channel
 * Format: channelId => Set of user IDs
 */
const channelSubmods = new Discord.Collection();

/**
 * File path for the submods data
 */
const submodsFilePath = path.join(__dirname, '../globalserversettings/submods', 'channelSubmods.json');

/**
 * Ensure the directory exists for submods data
 */
function ensureSubmodsDirectoryExists() {
  const dir = path.dirname(submodsFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Load submods data from file
 */
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

/**
 * Save submods data to file
 */
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

module.exports = {
  channelSubmods,
  
  /**
   * Add a submoderator to a channel
   * @param {string} channelId - The channel ID
   * @param {string} userId - The user ID to add as submod
   * @returns {boolean} - Whether the operation was successful
   */
  addSubmod(channelId, userId) {
    if (!channelSubmods.has(channelId)) {
      channelSubmods.set(channelId, new Set());
    }
    channelSubmods.get(channelId).add(userId);
    saveSubmodsData();
    return true;
  },
  
  /**
   * Remove a submoderator from a channel
   * @param {string} channelId - The channel ID
   * @param {string} userId - The user ID to remove as submod
   * @returns {boolean} - Whether the user was removed
   */
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
  
  /**
   * Check if a user is a submoderator in a channel
   * @param {string} channelId - The channel ID
   * @param {string} userId - The user ID to check
   * @returns {boolean} - Whether the user is a submod or channel owner
   */
  isSubmod(channelId, userId) {
    // Channel owners are considered "super" admins
    if (channelOwners.has(channelId) && channelOwners.get(channelId) === userId) {
      return true;
    }
    
    return channelSubmods.has(channelId) && channelSubmods.get(channelId).has(userId);
  },
  
  /**
   * Get all submods for a channel
   * @param {string} channelId - The channel ID
   * @returns {Set<string>} - Set of user IDs who are submods
   */
  getSubmods(channelId) {
    if (!channelSubmods.has(channelId)) {
      return new Set();
    }
    return new Set(channelSubmods.get(channelId));
  },
  
  /**
   * Clear all submods for a channel (used when channel is deleted)
   * @param {string} channelId - The channel ID
   */
  clearChannelSubmods(channelId) {
    if (channelSubmods.has(channelId)) {
      channelSubmods.delete(channelId);
      saveSubmodsData();
    }
  },
  
  /**
   * Save data to file
   */
  saveSubmodsData,
  
  /**
   * Load data from file
   */
  loadSubmodsData
};