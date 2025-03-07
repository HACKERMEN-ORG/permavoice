// methods/auditLogger.js
const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

/**
 * Audit logger utility for tracking and logging important events.
 */
class AuditLogger {
  constructor() {
    // Will be initialized when needed
    this.client = null;
    this.auditLogChannelCache = new Map();
  }

  /**
   * Initialize the logger with the Discord client
   * @param {Client} client - The Discord.js client
   */
  init(client) {
    this.client = client;
  }

  /**
   * Get the audit log channel ID for a specific guild
   * @param {string} guildId - Guild ID to get audit log channel for 
   * @returns {string|null} - Channel ID or null if not configured
   */
  getAuditLogChannelId(guildId) {
    // First check the cache
    if (this.auditLogChannelCache.has(guildId)) {
      return this.auditLogChannelCache.get(guildId);
    }

    // Read from settings if not in cache
    try {
      const settingsPath = `./globalserversettings/setupsettings/${guildId}/settings.cfg`;
      if (!fs.existsSync(settingsPath)) {
        return null;
      }

      const fileContents = fs.readFileSync(settingsPath, 'utf8');
      const lines = fileContents.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('AUDITLOGCHANNELID')) {
          // Use the same pattern as in setup.js for extracting values
          const re = RegExp('^AUDITLOGCHANNELID\\s*=\\s*\"(.*)\"');
          const matches = re.exec(line);
          
          if (matches && matches[1] && matches[1].trim() !== '') {
            const channelId = matches[1];
            this.auditLogChannelCache.set(guildId, channelId);
            return channelId;
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error reading audit log channel ID:', error);
      return null;
    }
  }

  /**
   * Send a log message to the audit log channel for a guild
   * @param {string} guildId - The guild ID
   * @param {string} message - The message to log
   * @param {Object} options - Additional options for the log
   * @param {string} options.color - The color for the embed (defaults to blue)
   * @param {string} options.title - The title for the embed
   * @param {Object} options.fields - Fields to add to the embed
   * @param {Object} options.user - User object to include in the embed
   */
  async log(guildId, message, options = {}) {
    if (!this.client) {
      console.error('Audit logger not initialized with client');
      return;
    }

    const channelId = this.getAuditLogChannelId(guildId);
    if (!channelId) {
      // Silently return if no audit log is configured
      return;
    }

    try {
      // Get the channel
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        console.error(`Guild ${guildId} not found for audit logging`);
        return;
      }

      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel) {
        console.error(`Audit log channel ${channelId} not found in guild ${guildId}`);
        return;
      }

      // Default options
      const color = options.color || '#3498db'; // Default blue color
      const title = options.title || 'Audit Log';
      
      // Create embed
      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(message)
        .setTimestamp();

      // Add user info if provided
      if (options.user) {
        embed.setAuthor({
          name: options.user.tag || options.user.username || 'Unknown User',
          iconURL: options.user.displayAvatarURL ? options.user.displayAvatarURL() : null
        });
      }

      // Add additional fields if provided
      if (options.fields && Array.isArray(options.fields)) {
        options.fields.forEach(field => {
          if (field.name && field.value) {
            embed.addFields({ name: field.name, value: field.value, inline: field.inline || false });
          }
        });
      }

      // Send the embed to the channel
      await channel.send({ embeds: [embed] });
    } catch (error) {
      console.error('Error sending audit log:', error);
    }
  }

  /**
   * Log a channel creation event
   * @param {string} guildId - Guild ID
   * @param {Object} channel - The created channel
   * @param {Object} owner - Owner of the channel
   */
  async logChannelCreation(guildId, channel, owner) {
    await this.log(guildId, `Voice channel created: ${channel.name}`, {
      color: '#2ecc71', // Green
      title: 'Channel Created',
      user: owner,
      fields: [
        { name: 'Channel', value: `<#${channel.id}>`, inline: true },
        { name: 'Owner', value: `<@${owner.id}>`, inline: true }
      ]
    });
  }

  /**
   * Log a channel deletion event
   * @param {string} guildId - Guild ID
   * @param {Object} channel - The deleted channel
   */
  async logChannelDeletion(guildId, channel) {
    await this.log(guildId, `Voice channel deleted: ${channel.name}`, {
      color: '#e74c3c', // Red
      title: 'Channel Deleted',
      fields: [
        { name: 'Channel Name', value: channel.name, inline: true }
      ]
    });
  }

  /**
   * Log a user ban event
   * @param {string} guildId - Guild ID
   * @param {Object} channel - The channel
   * @param {Object} target - The banned user
   * @param {Object} moderator - The user who performed the ban
   */
  async logUserBan(guildId, channel, target, moderator) {
    await this.log(guildId, `User banned from voice channel`, {
      color: '#e74c3c', // Red
      title: 'User Banned',
      user: moderator,
      fields: [
        { name: 'Channel', value: `<#${channel.id}>`, inline: true },
        { name: 'Banned User', value: `<@${target.id}>`, inline: true },
        { name: 'Moderator', value: `<@${moderator.id}>`, inline: true }
      ]
    });
  }

  /**
   * Log a user unban event
   * @param {string} guildId - Guild ID
   * @param {Object} channel - The channel
   * @param {Object} target - The unbanned user
   * @param {Object} moderator - The user who performed the unban
   */
  async logUserUnban(guildId, channel, target, moderator) {
    await this.log(guildId, `User unbanned from voice channel`, {
      color: '#3498db', // Blue
      title: 'User Unbanned',
      user: moderator,
      fields: [
        { name: 'Channel', value: `<#${channel.id}>`, inline: true },
        { name: 'Unbanned User', value: `<@${target.id}>`, inline: true },
        { name: 'Moderator', value: `<@${moderator.id}>`, inline: true }
      ]
    });
  }

  /**
   * Log a user kick event
   * @param {string} guildId - Guild ID
   * @param {Object} channel - The channel
   * @param {Object} target - The kicked user
   * @param {Object} moderator - The user who performed the kick
   */
  async logUserKick(guildId, channel, target, moderator) {
    await this.log(guildId, `User kicked from voice channel`, {
      color: '#e67e22', // Orange
      title: 'User Kicked',
      user: moderator,
      fields: [
        { name: 'Channel', value: `<#${channel.id}>`, inline: true },
        { name: 'Kicked User', value: `<@${target.id}>`, inline: true },
        { name: 'Moderator', value: `<@${moderator.id}>`, inline: true }
      ]
    });
  }

  /**
   * Log a user mute event
   * @param {string} guildId - Guild ID
   * @param {Object} channel - The channel
   * @param {Object} target - The muted user
   * @param {Object} moderator - The user who performed the mute
   */
  async logUserMute(guildId, channel, target, moderator) {
    await this.log(guildId, `User muted in voice channel`, {
      color: '#f1c40f', // Yellow
      title: 'User Muted',
      user: moderator,
      fields: [
        { name: 'Channel', value: `<#${channel.id}>`, inline: true },
        { name: 'Muted User', value: `<@${target.id}>`, inline: true },
        { name: 'Moderator', value: `<@${moderator.id}>`, inline: true }
      ]
    });
  }

  /**
   * Log a user unmute event
   * @param {string} guildId - Guild ID
   * @param {Object} channel - The channel
   * @param {Object} target - The unmuted user
   * @param {Object} moderator - The user who performed the unmute
   */
  async logUserUnmute(guildId, channel, target, moderator) {
    await this.log(guildId, `User unmuted in voice channel`, {
      color: '#3498db', // Blue
      title: 'User Unmuted',
      user: moderator,
      fields: [
        { name: 'Channel', value: `<#${channel.id}>`, inline: true },
        { name: 'Unmuted User', value: `<@${target.id}>`, inline: true },
        { name: 'Moderator', value: `<@${moderator.id}>`, inline: true }
      ]
    });
  }

  /**
   * Log a vote mute event
   * @param {string} guildId - Guild ID
   * @param {Object} channel - The channel
   * @param {Object} target - The target of the vote mute
   * @param {Object} initiator - The user who initiated the vote
   * @param {boolean} success - Whether the vote was successful
   * @param {number} voteCount - Number of votes received
   */
  async logVoteMute(guildId, channel, target, initiator, success, voteCount) {
    await this.log(guildId, `Vote mute ${success ? 'passed' : 'failed'} for user in voice channel`, {
      color: success ? '#f1c40f' : '#95a5a6', // Yellow if passed, gray if failed
      title: `Vote Mute ${success ? 'Passed' : 'Failed'}`,
      user: initiator,
      fields: [
        { name: 'Channel', value: `<#${channel.id}>`, inline: true },
        { name: 'Target User', value: `<@${target.id}>`, inline: true },
        { name: 'Initiator', value: `<@${initiator.id}>`, inline: true },
        { name: 'Vote Count', value: `${voteCount}`, inline: true }
      ]
    });
  }

  /**
   * Log an ownership transfer event
   * @param {string} guildId - Guild ID
   * @param {Object} channel - The channel
   * @param {Object} oldOwner - The previous owner
   * @param {Object} newOwner - The new owner
   */
  async logOwnershipTransfer(guildId, channel, oldOwner, newOwner) {
    await this.log(guildId, `Channel ownership transferred`, {
      color: '#9b59b6', // Purple
      title: 'Ownership Transferred',
      fields: [
        { name: 'Channel', value: `<#${channel.id}>`, inline: true },
        { name: 'Previous Owner', value: `<@${oldOwner.id}>`, inline: true },
        { name: 'New Owner', value: `<@${newOwner.id}>`, inline: true }
      ]
    });
  }
}

// Export a singleton instance
module.exports = new AuditLogger();