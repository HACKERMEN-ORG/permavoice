const Discord = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Collection to track muted users in each channel
 * Format: channelId => Set of user IDs
 */
const channelMutes = new Discord.Collection();

/**
 * Collection to track explicit mute/unmute actions
 * This prevents race conditions with voice state updates
 * Format: userId => { action: 'mute'|'unmute', timestamp: Date, channelId: string }
 */
const explicitActions = new Discord.Collection();

/**
 * Add a user to the muted list for a channel
 * @param {string} channelId - The channel ID
 * @param {string} userId - The user ID to mute
 */
function addMutedUser(channelId, userId) {
    if (!channelMutes.has(channelId)) {
        channelMutes.set(channelId, new Set());
    }
    channelMutes.get(channelId).add(userId);
    
    // Record explicit mute action to prevent race conditions
    explicitActions.set(userId, {
        action: 'mute',
        timestamp: Date.now(),
        channelId: channelId
    });
    
    // Clear the action after 10 seconds
    setTimeout(() => {
        if (explicitActions.has(userId) && 
            explicitActions.get(userId).action === 'mute' &&
            explicitActions.get(userId).channelId === channelId) {
            explicitActions.delete(userId);
        }
    }, 10000);
    
    saveMuteData();
}

/**
 * Remove a user from the muted list for a channel
 * @param {string} channelId - The channel ID
 * @param {string} userId - The user ID to unmute
 * @returns {boolean} - Whether the user was muted and has been unmuted
 */
function removeMutedUser(channelId, userId) {
    if (!channelMutes.has(channelId)) {
        return false;
    }
    
    const result = channelMutes.get(channelId).delete(userId);
    
    // Record explicit unmute action to prevent race conditions
    explicitActions.set(userId, {
        action: 'unmute',
        timestamp: Date.now(),
        channelId: channelId
    });
    
    // Clear the action after 10 seconds
    setTimeout(() => {
        if (explicitActions.has(userId) && 
            explicitActions.get(userId).action === 'unmute' &&
            explicitActions.get(userId).channelId === channelId) {
            explicitActions.delete(userId);
        }
    }, 10000);
    
    // If the set is now empty, remove the channel entry
    if (channelMutes.get(channelId).size === 0) {
        channelMutes.delete(channelId);
    }
    
    saveMuteData();
    return result;
}

/**
 * Check if a user is muted in a channel
 * @param {string} channelId - The channel ID
 * @param {string} userId - The user ID to check
 * @returns {boolean} - Whether the user is muted in the channel
 */
function isUserMuted(channelId, userId) {
    // If there's an explicit unmute action, user is considered unmuted
    if (explicitActions.has(userId) && 
        explicitActions.get(userId).action === 'unmute' &&
        explicitActions.get(userId).channelId === channelId) {
        return false;
    }
    
    if (!channelMutes.has(channelId)) {
        return false;
    }
    return channelMutes.get(channelId).has(userId);
}

/**
 * Check if there's an explicit mute/unmute action for a user
 * @param {string} userId - The user ID to check
 * @param {string} action - The action type ('mute' or 'unmute')
 * @returns {boolean} - Whether there's an explicit action
 */
function hasExplicitAction(userId, action = null) {
    if (!explicitActions.has(userId)) {
        return false;
    }
    
    if (action === null) {
        return true;
    }
    
    return explicitActions.get(userId).action === action;
}

/**
 * Get the explicit action details for a user
 * @param {string} userId - The user ID to check
 * @returns {object|null} - The action details or null if none exists
 */
function getExplicitAction(userId) {
    if (!explicitActions.has(userId)) {
        return null;
    }
    return explicitActions.get(userId);
}

/**
 * Get all muted users for a channel
 * @param {string} channelId - The channel ID
 * @returns {Set<string>} - Set of user IDs muted in the channel
 */
function getMutedUsers(channelId) {
    if (!channelMutes.has(channelId)) {
        return new Set();
    }
    return new Set([...channelMutes.get(channelId)].filter(userId => 
        !(explicitActions.has(userId) && 
          explicitActions.get(userId).action === 'unmute' &&
          explicitActions.get(userId).channelId === channelId)
    ));
}

/**
 * Remove all muted users for a channel (used when channel is deleted)
 * @param {string} channelId - The channel ID
 */
function clearChannelMutes(channelId) {
    channelMutes.delete(channelId);
    saveMuteData();
}

/**
 * Save the mute data to a JSON file
 */
function saveMuteData() {
    // Convert the collection to a serializable format
    const saveData = {};
    channelMutes.forEach((userSet, channelId) => {
        saveData[channelId] = Array.from(userSet);
    });
    
    // Ensure directory exists
    const dirPath = path.join(__dirname, '..', 'globalserversettings', 'mutes');
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
    
    // Save to file
    const filePath = path.join(dirPath, 'channelMutes.json');
    fs.writeFileSync(filePath, JSON.stringify(saveData, null, 2), 'utf8');
}

/**
 * Load the mute data from a JSON file
 */
function loadMuteData() {
    const filePath = path.join(__dirname, '..', 'globalserversettings', 'mutes', 'channelMutes.json');
    
    // If file doesn't exist, there's nothing to load
    if (!fs.existsSync(filePath)) {
        return;
    }
    
    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        // Convert the data back to our collection format
        Object.keys(data).forEach(channelId => {
            channelMutes.set(channelId, new Set(data[channelId]));
        });
        
        console.log(`Loaded mute data for ${channelMutes.size} channels`);
    } catch (error) {
        console.error('Error loading mute data:', error);
    }
}

// Load data when this module is required
loadMuteData();

module.exports = {
    channelMutes,
    addMutedUser,
    removeMutedUser,
    isUserMuted,
    getMutedUsers,
    clearChannelMutes,
    saveMuteData,
    loadMuteData,
    hasExplicitAction,
    getExplicitAction
};
