// methods/customChannelNames.js
const fs = require('fs');
const path = require('path');
const Discord = require('discord.js');

/**
 * Collection to store custom channel names for users
 * Format: userId => channelName
 */
const customChannelNames = new Discord.Collection();

/**
 * File path for storing custom channel names
 */
const channelNamesFilePath = path.join(__dirname, '../globalserversettings/channelnames', 'userChannelNames.json');

/**
 * Ensure the directory exists for channel names data
 */
function ensureChannelNamesDirectoryExists() {
  const dir = path.dirname(channelNamesFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Load channel names data from file
 */
function loadChannelNamesData() {
  ensureChannelNamesDirectoryExists();
  if (!fs.existsSync(channelNamesFilePath)) {
    fs.writeFileSync(channelNamesFilePath, '{}', 'utf8');
    return;
  }

  try {
    const data = JSON.parse(fs.readFileSync(channelNamesFilePath, 'utf8'));
    
    // Convert the data back to our map format
    Object.keys(data).forEach(userId => {
      customChannelNames.set(userId, data[userId]);
    });
    
    console.log(`Loaded custom channel names for ${customChannelNames.size} users`);
  } catch (error) {
    console.error('Error loading custom channel names data:', error);
  }
}

/**
 * Save channel names data to file
 */
function saveChannelNamesData() {
  ensureChannelNamesDirectoryExists();
  
  // Convert the map to a serializable format
  const saveData = {};
  customChannelNames.forEach((channelName, userId) => {
    saveData[userId] = channelName;
  });
  
  fs.writeFileSync(channelNamesFilePath, JSON.stringify(saveData, null, 2), 'utf8');
}

// Load data when this module is required
loadChannelNamesData();

module.exports = {
  customChannelNames,
  
  /**
   * Get the custom channel name for a user
   * @param {string} userId - The user ID
   * @returns {string|null} - The custom channel name or null if not set
   */
  getCustomChannelName(userId) {
    if (!customChannelNames.has(userId)) {
      return null;
    }
    return customChannelNames.get(userId);
  },
  
  /**
   * Set the custom channel name for a user
   * @param {string} userId - The user ID
   * @param {string} channelName - The channel name to set
   */
  setCustomChannelName(userId, channelName) {
    customChannelNames.set(userId, channelName);
    saveChannelNamesData();
  },
  
  /**
   * Remove the custom channel name for a user
   * @param {string} userId - The user ID
   * @returns {boolean} - Whether the name was removed
   */
  removeCustomChannelName(userId) {
    const result = customChannelNames.delete(userId);
    if (result) {
      saveChannelNamesData();
    }
    return result;
  },
  
  /**
   * Save data to file
   */
  saveChannelNamesData,
  
  /**
   * Load data from file
   */
  loadChannelNamesData
};