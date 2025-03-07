// methods/channelState.js - Updated to include submods tracking

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
  const submodModule = require('../commands/channelcommands/submod');
  channelSubmods = submodModule.channelSubmods;
} catch (error) {
  // If the module doesn't exist yet, create an empty map
  channelSubmods = new Map();
  console.log('Submods module not found. Creating empty submods collection.');
}

// File path for data persistence
const dataFilePath = path.join(__dirname, '../globalserversettings/channelData.json');

// Create directory if it doesn't exist
const ensureDirExists = () => {
  const dir = path.dirname(dataFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// Save all collections to file
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
    channelOwners: Object.fromEntries(channelOwners),
    togglePrivate: Object.fromEntries(togglePrivate),
    toggleLock: Object.fromEntries(toggleLock),
    waitingRoom: Object.fromEntries(waitingRoom),
    channelSubmods: submodsData
  };
  
  fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), 'utf8');
  console.log('Channel data saved to file');
};

// Create a debounced version to avoid excessive writes
const debouncedSave = _.debounce(saveChannelData, 5000, { 'maxWait': 30000 });

// Load data from file
const loadChannelData = () => {
  if (!fs.existsSync(dataFilePath)) {
    console.log('No channel data file found, starting with empty collections');
    return;
  }
  
  try {
    const data = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
    
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
  } catch (error) {
    console.error('Error loading channel data:', error);
  }
};

// Method to validate channels (removing ones that no longer exist)
const validateChannels = async (client) => {
  let changed = false;
  const validChannelIds = new Set();
  
  // First, collect all valid channel IDs
  try {
    const guilds = client.guilds.cache.values();
    for (const guild of guilds) {
      const channels = await guild.channels.fetch();
      channels.forEach(channel => {
        if (channel && channel.type === 2) { // Voice channels
          validChannelIds.add(channel.id);
        }
      });
    }
    console.log(`Found ${validChannelIds.size} valid voice channels`);
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
    saveChannelData();
  }
  
  console.log('Channel data validation complete');
};

// Monkey patch the collection methods to automatically save changes
// This is key to avoiding changes in multiple files

// Original set method
const originalOwnerSet = channelOwners.set;
// Override with method that saves after setting
channelOwners.set = function(key, value) {
  const result = originalOwnerSet.call(this, key, value);
  debouncedSave();
  return result;
};

// Original delete method
const originalOwnerDelete = channelOwners.delete;
// Override with method that saves after deleting
channelOwners.delete = function(key) {
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

// Patch process exit handlers to save data
const setupExitHandlers = () => {
  process.on('SIGINT', () => {
    console.log('Saving channel data before shutdown...');
    saveChannelData();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('Saving channel data before shutdown...');
    saveChannelData();
    process.exit(0);
  });
};

module.exports = {
  loadChannelData,
  validateChannels,
  setupExitHandlers
};