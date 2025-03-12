// methods/channelState.js - Enhanced for better state recovery

const fs = require('fs');
const path = require('path');
const _ = require('lodash');

// Import the existing collections directly
const { channelOwners } = require('./channelowner');
const { togglePrivate } = require('./private');
const { toggleLock } = require('./locks');
const { waitingRoom } = require('./waitingRoom');

// Import the submods module if it exists
let channelSubmods;
try {
  const submodManager = require('./submodmanager');
  channelSubmods = submodManager.channelSubmods;
} catch (error) {
  // If the module doesn't exist yet, create an empty map
  channelSubmods = new Map();
  console.log('Submods module not found. Creating empty submods collection.');
}

// File path for data persistence
const dataFilePath = path.join(__dirname, '../globalserversettings/channelData.json');
// Backup file path for extra safety
const backupFilePath = path.join(__dirname, '../globalserversettings/channelData.backup.json');

// Create directory if it doesn't exist
const ensureDirExists = () => {
  const dir = path.dirname(dataFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// Save all collections to file with more reliability
const saveChannelData = () => {
  ensureDirExists();
  
  // Convert Set values to arrays for JSON serialization
  const submodsData = {};
  if (channelSubmods) {
    channelSubmods.forEach((submods, channelId) => {
      submodsData[channelId] = Array.from(submods);
    });
  }
  
  const data = {
    timestamp: Date.now(),
    channelOwners: Object.fromEntries(channelOwners),
    togglePrivate: Object.fromEntries(togglePrivate),
    toggleLock: Object.fromEntries(toggleLock),
    waitingRoom: Object.fromEntries(waitingRoom),
    channelSubmods: submodsData
  };
  
  try {
    // First save to a temp file
    const tempFilePath = `${dataFilePath}.temp`;
    fs.writeFileSync(tempFilePath, JSON.stringify(data, null, 2), 'utf8');
    
    // Then replace the main file (atomic operation)
    fs.renameSync(tempFilePath, dataFilePath);
    
    // Make a backup copy every time we save
    fs.copyFileSync(dataFilePath, backupFilePath);
    
    console.log(`Channel data saved to file (${new Date().toISOString()})`);
  } catch (error) {
    console.error('Error saving channel data:', error);
  }
};

// Create a debounced version to avoid excessive writes
const debouncedSave = _.debounce(saveChannelData, 5000, { 'maxWait': 30000 });

// Force immediate save
const forceSave = () => {
  console.log('Forcing immediate save of channel data');
  debouncedSave.cancel(); // Cancel any pending debounced saves
  saveChannelData();
};

// Load data from file with better error handling and backup recovery
const loadChannelData = () => {
  // Try the main file first
  let loadedFile = null;
  let backupUsed = false;
  
  try {
    if (fs.existsSync(dataFilePath)) {
      loadedFile = fs.readFileSync(dataFilePath, 'utf8');
      console.log('Channel data file found, loading...');
    }
  } catch (error) {
    console.error('Error reading main channel data file:', error);
  }
  
  // If main file failed, try the backup
  if (!loadedFile && fs.existsSync(backupFilePath)) {
    try {
      loadedFile = fs.readFileSync(backupFilePath, 'utf8');
      console.log('Using backup channel data file instead');
      backupUsed = true;
    } catch (error) {
      console.error('Error reading backup channel data file:', error);
    }
  }
  
  if (!loadedFile) {
    console.log('No channel data file found, starting with empty collections');
    return;
  }
  
  try {
    const data = JSON.parse(loadedFile);
    
    // Log when this data was saved
    if (data.timestamp) {
      const savedDate = new Date(data.timestamp);
      console.log(`Loading channel data saved at: ${savedDate.toLocaleString()}`);
    }
    
    // Load channel owners
    if (data.channelOwners) {
      Object.entries(data.channelOwners).forEach(([channel, owner]) => {
        channelOwners.set(channel, owner);
      });
      console.log(`Loaded ${Object.keys(data.channelOwners).length} channel owners`);
    }
    
    // Load private status
    if (data.togglePrivate) {
      Object.entries(data.togglePrivate).forEach(([channel, status]) => {
        togglePrivate.set(channel, parseInt(status));
      });
      console.log(`Loaded ${Object.keys(data.togglePrivate).length} private statuses`);
    }

    // Load lock status
    if (data.toggleLock) {
      Object.entries(data.toggleLock).forEach(([channel, status]) => {
        toggleLock.set(channel, parseInt(status));
      });
      console.log(`Loaded ${Object.keys(data.toggleLock).length} lock statuses`);
    }
    
    // Load waiting rooms
    if (data.waitingRoom) {
      Object.entries(data.waitingRoom).forEach(([channel, waitingRoomId]) => {
        waitingRoom.set(channel, waitingRoomId);
      });
      console.log(`Loaded ${Object.keys(data.waitingRoom).length} waiting rooms`);
    }
    
    // Load submods if they exist in the data file
    if (data.channelSubmods && channelSubmods) {
      Object.entries(data.channelSubmods).forEach(([channel, submods]) => {
        channelSubmods.set(channel, new Set(submods));
      });
      console.log(`Loaded ${Object.keys(data.channelSubmods).length} channel submods`);
    }
    
    // If we used the backup, immediately save to the main file
    if (backupUsed) {
      forceSave();
    }
  } catch (error) {
    console.error('Error parsing channel data:', error);
  }
};

// Enhanced method to validate channels (to handle post-reboot recovery better)
const validateChannels = async (client) => {
  let changed = false;
  const validChannelIds = new Set();
  const activeVoiceChannels = new Set();
  
  // First, collect all valid channel IDs
  try {
    const guilds = client.guilds.cache.values();
    for (const guild of guilds) {
      const channels = await guild.channels.fetch();
      channels.forEach(channel => {
        if (channel) {
          validChannelIds.add(channel.id);
          
          // Track voice channels specifically, with users in them
          if (channel.type === 2 && channel.members.size > 0) { // Voice channels with members
            activeVoiceChannels.add(channel.id);
          }
        }
      });
    }
    console.log(`Found ${validChannelIds.size} valid channels, ${activeVoiceChannels.size} active voice channels`);
  } catch (error) {
    console.error('Error fetching channels:', error);
  }
  
  // Check and clean up channel owners (this also affects private/lock/mutes)
  const ownedChannelIds = Array.from(channelOwners.keys());
  for (const channelId of ownedChannelIds) {
    if (!validChannelIds.has(channelId)) {
      console.log(`Channel ${channelId} no longer exists, removing from state`);
      channelOwners.delete(channelId);
      togglePrivate.delete(channelId);
      toggleLock.delete(channelId);
      waitingRoom.delete(channelId);
      
      // Clean up submods data
      if (channelSubmods && channelSubmods.has(channelId)) {
        channelSubmods.delete(channelId);
      }
      
      // Also clean up any mute data for this channel
      const { clearChannelMutes } = require('./channelMutes');
      clearChannelMutes(channelId);
      
      changed = true;
    }
  }
  
  // Check and clean up waiting rooms
  const waitingRoomIds = Array.from(waitingRoom.values());
  for (const [channelId, waitingRoomId] of waitingRoom.entries()) {
    if (!validChannelIds.has(waitingRoomId)) {
      console.log(`Waiting room ${waitingRoomId} no longer exists, removing`);
      waitingRoom.delete(channelId);
      changed = true;
    }
  }
  
  // Save changes if needed
  if (changed) {
    forceSave();
  }
  
  console.log('Channel data validation complete');
};

// Patch the collection methods to automatically save changes
// This is key to avoiding changes in multiple files

// Original set method for channelOwners
const originalOwnerSet = channelOwners.set;
// Override with method that saves after setting
channelOwners.set = function(key, value) {
  console.log(`Setting channel owner: ${key} -> ${value}`);
  const result = originalOwnerSet.call(this, key, value);
  debouncedSave();
  return result;
};

// Original delete method
const originalOwnerDelete = channelOwners.delete;
// Override with method that saves after deleting
channelOwners.delete = function(key) {
  console.log(`Removing channel owner: ${key}`);
  const result = originalOwnerDelete.call(this, key);
  debouncedSave();
  return result;
};

// Do the same for togglePrivate
const originalPrivateSet = togglePrivate.set;
togglePrivate.set = function(key, value) {
  const result = originalPrivateSet.call(this, key, value);
  debouncedSave();
  return result;
};

const originalPrivateDelete = togglePrivate.delete;
togglePrivate.delete = function(key) {
  const result = originalPrivateDelete.call(this, key);
  debouncedSave();
  return result;
};

// Do the same for toggleLock
const originalLockSet = toggleLock.set;
toggleLock.set = function(key, value) {
  const result = originalLockSet.call(this, key, value);
  debouncedSave();
  return result;
};

const originalLockDelete = toggleLock.delete;
toggleLock.delete = function(key) {
  const result = originalLockDelete.call(this, key);
  debouncedSave();
  return result;
};

// Do the same for waitingRoom
const originalWaitingRoomSet = waitingRoom.set;
waitingRoom.set = function(key, value) {
  const result = originalWaitingRoomSet.call(this, key, value);
  debouncedSave();
  return result;
};

const originalWaitingRoomDelete = waitingRoom.delete;
waitingRoom.delete = function(key) {
  const result = originalWaitingRoomDelete.call(this, key);
  debouncedSave();
  return result;
};

// Also patch the submods collection if it exists
if (channelSubmods) {
  const originalSubmodsSet = channelSubmods.set;
  channelSubmods.set = function(key, value) {
    const result = originalSubmodsSet.call(this, key, value);
    debouncedSave();
    return result;
  };

  const originalSubmodsDelete = channelSubmods.delete;
  channelSubmods.delete = function(key) {
    const result = originalSubmodsDelete.call(this, key);
    debouncedSave();
    return result;
  };
}

// Enhanced exit handlers to ensure state is saved
const setupExitHandlers = () => {
  // Save on graceful shutdown (SIGINT - Ctrl+C)
  process.on('SIGINT', () => {
    console.log('Saving channel data before shutdown (SIGINT)...');
    forceSave();
    
    // Give it a moment to complete the save before exiting
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  });
  
  // Save on SIGTERM (typical process termination)
  process.on('SIGTERM', () => {
    console.log('Saving channel data before shutdown (SIGTERM)...');
    forceSave();
    
    // Give it a moment to complete the save before exiting
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  });
  
  // Save on uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    console.log('Saving channel data before possible crash...');
    forceSave();
    
    // Re-throw after a moment to allow the save to complete
    setTimeout(() => {
      throw error;
    }, 1000);
  });
  
  // Save on unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled promise rejection:', reason);
    console.log('Saving channel data before possible crash...');
    forceSave();
  });
  
  // Set up an interval save as a fallback
  const INTERVAL_SAVE_MS = 5 * 60 * 1000; // 5 minutes
  setInterval(() => {
    console.log('Performing scheduled state save...');
    forceSave();
  }, INTERVAL_SAVE_MS);
};

module.exports = {
  loadChannelData,
  validateChannels,
  setupExitHandlers,
  forceSave
};