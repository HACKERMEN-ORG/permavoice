// methods/channelVerification.js
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { channelOwners } = require('./channelowner');
const Settings = require('../Settings');

/**
 * Smart channel verification that works even after bot reboots
 * @param {string} guildId - The guild ID
 * @param {string} channelId - The channel ID to check
 * @param {string} userId - The user ID claiming ownership
 * @param {object} guild - Discord guild object for permission checks
 * @returns {object} - Result with isOwner and channel type info
 */
async function verifyChannelOwnership(guildId, channelId, userId, guild) {
  try {
    // Case 1: Bot knows this is a temp channel with a recorded owner
    if (channelOwners.has(channelId)) {
      return {
        isTemp: true,
        isPermanent: Settings.doesChannelHavePermVoice(guildId, channelId),
        isOwner: channelOwners.get(channelId) === userId,
        knownChannel: true
      };
    }

    // Try to fetch the channel
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      return { isTemp: false, isPermanent: false, isOwner: false, knownChannel: false };
    }
    
    // Check if it's a permanent voice channel
    const isPermanent = Settings.doesChannelHavePermVoice(guildId, channelId);
    
    // Case 2: It's a permanent voice channel
    if (isPermanent) {
      // Check permissions to see if this user might be the owner
      const userPerms = channel.permissionOverwrites.cache.get(userId);
      const isLikelyOwner = userPerms && 
                          userPerms.allow.has(PermissionFlagsBits.Connect) &&
                          userPerms.allow.has(PermissionFlagsBits.Speak);
      
      return { isTemp: false, isPermanent: true, isOwner: isLikelyOwner, knownChannel: true };
    }
    
    // Case 3: It's a voice channel in our category but we've lost track of it
    const settingsPath = `./globalserversettings/setupsettings/${guildId}/settings.cfg`;
    let categoryId = null;
    
    try {
      const fs = require('fs');
      if (fs.existsSync(settingsPath)) {
        const fileContents = fs.readFileSync(settingsPath, 'utf8');
        const categoryMatch = fileContents.match(/CATEGORYID\s*=\s*"(.*)"/);
        if (categoryMatch && categoryMatch[1]) {
          categoryId = categoryMatch[1];
        }
      }
    } catch (error) {
      console.error('Error reading category from settings:', error);
    }
    
    // If the channel is in our temp category, it's probably a temp channel
    // In this case, treat the first user who tries to use owner commands as the owner
    if (categoryId && channel.parentId === categoryId) {
      // Recover the channel ownership by checking who's in the channel
      const members = channel.members;
      
      // If the user is alone in channel, they're likely the owner
      const isAlone = members.size === 1 && members.has(userId);
      
      // If user has been in the channel longest, they might be the owner
      // We can't reliably check this after a reboot, but we can make our best guess
      
      // For now, we'll register this user as the owner since they're trying to use owner commands
      if (!channelOwners.has(channelId)) {
        console.log(`Restoring ownership: ${userId} for channel ${channelId} (post-reboot recovery)`);
        channelOwners.set(channelId, userId);
      }
      
      return { 
        isTemp: true, 
        isPermanent: false, 
        isOwner: true, 
        knownChannel: false,
        recoveredChannel: true 
      };
    }
    
    // Case 4: It's just a regular voice channel
    return { isTemp: false, isPermanent: false, isOwner: false, knownChannel: true };
    
  } catch (error) {
    console.error('Error in channel verification:', error);
    return { isTemp: false, isPermanent: false, isOwner: false, error: true };
  }
}

module.exports = {
  verifyChannelOwnership
};