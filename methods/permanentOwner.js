// methods/permanentOwner.js
const Discord = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Collection to track owners of permanent channels who also have a temporary channel
 * This limits permanent room owners to only one temporary room at a time
 * Format: userId => tempChannelId
 */
const permanentOwnerTempChannels = new Discord.Collection();

/**
 * File path for storing permanent owner temp channel mappings
 */
const dataFilePath = path.join(__dirname, '../globalserversettings/permuserchannels', 'permownertempchannels.json');

/**
 * Ensure the directory exists for data storage
 */
function ensureDirectoryExists() {
  const dir = path.dirname(dataFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Load permanent owner temporary channel mappings from file
 */
function loadData() {
  ensureDirectoryExists();
  if (!fs.existsSync(dataFilePath)) {
    fs.writeFileSync(dataFilePath, '{}', 'utf8');
    return;
  }

  try {
    const data = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
    
    // Convert the data back to our collection format
    Object.entries(data).forEach(([userId, channelId]) => {
      permanentOwnerTempChannels.set(userId, channelId);
    });
    
    console.log(`Loaded permanent owner temp channel data for ${permanentOwnerTempChannels.size} users`);
  } catch (error) {
    console.error('Error loading permanent owner temp channel data:', error);
  }
}

/**
 * Save permanent owner temporary channel mappings to file
 */
function saveData() {
  ensureDirectoryExists();
  
  // Convert the collection to a serializable format
  const saveData = {};
  permanentOwnerTempChannels.forEach((channelId, userId) => {
    saveData[userId] = channelId;
  });
  
  fs.writeFileSync(dataFilePath, JSON.stringify(saveData, null, 2), 'utf8');
}

// Load data when this module is required
loadData();

module.exports = {
  permanentOwnerTempChannels,
  
  /**
   * Check if a user already has a temporary channel despite owning a permanent channel
   * @param {string} userId - The user ID to check
   * @returns {string|null} - The channel ID of their temporary channel, or null if none
   */
  getTempChannelForPermanentOwner(userId) {
    if (!permanentOwnerTempChannels.has(userId)) {
      return null;
    }
    return permanentOwnerTempChannels.get(userId);
  },
  
  /**
   * Set a temporary channel for a permanent room owner
   * @param {string} userId - The user ID
   * @param {string} channelId - The temporary channel ID
   */
  setTempChannelForPermanentOwner(userId, channelId) {
    permanentOwnerTempChannels.set(userId, channelId);
    saveData();
  },
  
  /**
   * Remove a temporary channel mapping for a permanent room owner
   * @param {string} userId - The user ID
   * @returns {boolean} - Whether the mapping was removed
   */
  removeTempChannelForPermanentOwner(userId) {
    const result = permanentOwnerTempChannels.delete(userId);
    if (result) {
      saveData();
    }
    return result;
  },
  
  /**
   * Check if a channel is a temporary channel owned by a permanent room owner
   * @param {string} channelId - The channel ID to check
   * @returns {string|null} - The owner's user ID, or null if not found
   */
  getPermanentOwnerForTempChannel(channelId) {
    for (const [userId, tempChannelId] of permanentOwnerTempChannels.entries()) {
      if (tempChannelId === channelId) {
        return userId;
      }
    }
    return null;
  },
  
  /**
   * Save data to file
   */
  saveData,
  
  /**
   * Load data from file
   */
  loadData
};