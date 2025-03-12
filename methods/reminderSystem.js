// methods/reminderSystem.js
const { EmbedBuilder } = require('discord.js');
const { channelOwners } = require('./channelowner');
const Settings = require('../Settings');
const { createWelcomeEmbed } = require('./welcomeMessage');

/**
 * Manages periodic reminders in voice channels
 */
class ReminderSystem {
  constructor() {
    this.reminderMessages = [
      "🔊 REMINDER: If someone is being disruptive in voice chat, use the `/votemute` command to start a vote to mute them for 5 minutes!",
      "🔊 TIP: Create your own custom voice room anytime by joining the '+ CREATE' channel!",
      "🔊 VOICE TIP: Dealing with a disruptive member? The `/votemute` command lets everyone vote to temporarily mute them.",
      "🔊 SERVER TIP: Need your own voice space? Join the '+ CREATE' channel to instantly get your own customizable room!",
      "🔊 REMINDER: Create your own voice channel with your own rules by joining the '+ CREATE' channel at any time!",
      "🔊 MODERATION TIP: The `/votemute` command is available to EVERYONE - use it when someone is being disruptive in voice chat.",
      "🔊 DID YOU KNOW? You can make your own voice room by joining the '+ CREATE' channel, and manage it with commands like `/ban`, `/kick`, and `/mute`!"
    ];
    
    // Timer references for cleanup
    this.reminderInterval = null;
    this.permWelcomeInterval = null;
    this.tempOwnerReminderInterval = null;
  }

  /**
   * Start sending periodic reminders
   * @param {Client} client - Discord.js client instance
   * @param {number} minInterval - Minimum interval in minutes
   * @param {number} maxInterval - Maximum interval in minutes
   */
  startReminders(client, minInterval = 30, maxInterval = 120) {
    // Convert minutes to milliseconds
    const minMs = minInterval * 60 * 1000;
    const maxMs = maxInterval * 60 * 1000;
    
    console.log(`Starting reminder system. Reminders will appear every ${minInterval}-${maxInterval} minutes`);
    
    // Clear any existing interval to prevent duplicates
    if (this.reminderInterval) {
      clearInterval(this.reminderInterval);
    }
    
    // Function to schedule the next reminder
    const scheduleNext = () => {
      // Calculate a random delay within the specified range
      const nextDelay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
      
      console.log(`Next reminder scheduled in ${Math.round(nextDelay / 60000)} minutes`);
      
      // Schedule the next reminder
      setTimeout(() => {
        this.sendReminders(client);
        scheduleNext(); // Schedule the next one after sending
      }, nextDelay);
    };
    
    // Schedule the first reminder
    scheduleNext();
    
    // Also send one immediately to confirm the system is working
    // But with a short delay to ensure client is fully ready
    setTimeout(() => {
      this.sendReminders(client);
    }, 10000);
    
    // Start the permanent voice channel welcome messages (every 12 hours)
    this.startPermanentWelcomeMessages(client);
    
    // Start the temporary channel owner reminders (every 30 minutes)
    this.startTempChannelOwnerReminders(client);
  }
  
  /**
   * Start sending welcome messages to permanent voice channels every 12 hours
   * @param {Client} client - Discord.js client instance
   */
  startPermanentWelcomeMessages(client) {
    console.log('Starting welcome messages for permanent voice channels (every 12 hours)');
    
    // Clear any existing interval to prevent duplicates
    if (this.permWelcomeInterval) {
      clearInterval(this.permWelcomeInterval);
    }
    
    // 12 hours in milliseconds
    const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
    
    // Set up interval to run every 12 hours
    this.permWelcomeInterval = setInterval(() => {
      this.sendWelcomeToPermVoiceChannels(client);
    }, TWELVE_HOURS_MS);
    
    // Don't send an immediate welcome message on startup
    // Only use the scheduled 12-hour interval
  }
  
  /**
   * Stop sending reminders
   */
  stopReminders() {
    if (this.reminderInterval) {
      clearInterval(this.reminderInterval);
      this.reminderInterval = null;
      console.log('Reminder system stopped');
    }
    
    if (this.permWelcomeInterval) {
      clearInterval(this.permWelcomeInterval);
      this.permWelcomeInterval = null;
      console.log('Permanent voice channel welcome messages stopped');
    }
    
    if (this.tempOwnerReminderInterval) {
      clearInterval(this.tempOwnerReminderInterval);
      this.tempOwnerReminderInterval = null;
      console.log('Temporary channel owner reminders stopped');
    }
  }
  
  /**
   * Send welcome messages to all permanent voice channels
   * @param {Client} client - Discord.js client
   */
  async sendWelcomeToPermVoiceChannels(client) {
    // Skip if the client isn't ready
    if (!client || !client.isReady()) {
      console.log('Client not ready, skipping permanent voice channel welcome messages');
      return;
    }
    
    console.log('Sending welcome messages to permanent voice channels');
    
    // Find all guilds
    for (const guild of client.guilds.cache.values()) {
      try {
        // Get all permanent voice channels with active members
        const permanentChannels = [];
        
        for (const channel of guild.channels.cache.values()) {
          // Check if it's a voice channel and marked as permanent
          if (channel.type === 2 && // VoiceChannel
              Settings.doesChannelHavePermVoice(guild.id, channel.id) &&
              channel.members.size > 0) {
            permanentChannels.push(channel);
          }
        }
        
        if (permanentChannels.length === 0) {
          console.log(`No active permanent voice channels found in guild ${guild.name}`);
          continue;
        }
        
        console.log(`Sending welcome messages to ${permanentChannels.length} permanent voice channels in guild ${guild.name}`);
        
        // Create the welcome embed
        const welcomeEmbed = createWelcomeEmbed();
        
        // Send to each permanent channel
        for (const channel of permanentChannels) {
          try {
            await channel.send({ 
              content: `📢 **Reminder of Available Commands**`,
              embeds: [welcomeEmbed] 
            });
            console.log(`Sent welcome message to permanent channel: ${channel.name} (${channel.id})`);
            
            // Add a small delay between messages to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (error) {
            console.error(`Error sending welcome message to permanent channel ${channel.id}:`, error);
          }
        }
      } catch (error) {
        console.error(`Error processing guild ${guild.id} for permanent welcome messages:`, error);
      }
    }
  }
  
  /**
   * Send reminders to all active voice channels
   * @param {Client} client - Discord.js client
   */
  async sendReminders(client) {
    // Skip if the client isn't ready
    if (!client || !client.isReady()) {
      console.log('Client not ready, skipping reminder');
      return;
    }
    
    // Get all active temporary voice channels
    const activeChannels = [];
    
    // Filter for channels that:
    // 1. Are in the channelOwners map (i.e., are temporary channels)
    // 2. Have at least 2 members (no point sending reminders to solo channels)
    for (const [channelId, ownerId] of channelOwners.entries()) {
      try {
        // Skip if it's a permanent voice channel
        if (Settings.doesChannelHavePermVoice(client.guilds.cache.first()?.id, channelId)) {
          continue;
        }
        
        // Find the channel
        const channel = await client.channels.fetch(channelId).catch(() => null);
        
        // Only send to valid voice channels with at least 2 members
        if (channel && channel.members && channel.members.size >= 2) {
          activeChannels.push(channel);
        }
      } catch (error) {
        console.error(`Error checking channel ${channelId} for reminders:`, error);
      }
    }
    
    // If there are no suitable channels, skip
    if (activeChannels.length === 0) {
      console.log('No active voice channels with multiple users found, skipping reminder');
      return;
    }
    
    console.log(`Sending reminders to ${activeChannels.length} active voice channels`);
    
    // Select a random message to send
    const message = this.reminderMessages[Math.floor(Math.random() * this.reminderMessages.length)];
    
    // Create the embed
    const reminderEmbed = new EmbedBuilder()
      .setTitle('🎙️ Voice Chat Tips')
      .setDescription(message)
      .setColor('#FF5500')
      .setFooter({ text: 'TempVoice Bot | Type /help for commands' })
      .setTimestamp();
    
    // Send the message to each active channel
    for (const channel of activeChannels) {
      try {
        await channel.send({ embeds: [reminderEmbed] });
        console.log(`Sent reminder to channel: ${channel.name} (${channel.id})`);
        
        // Add a small delay between messages to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Error sending reminder to channel ${channel.id}:`, error);
      }
    }
  }
  
  /**
   * Start sending owner reminders to temporary voice channels every 30 minutes
   * @param {Client} client - Discord.js client instance
   */
  startTempChannelOwnerReminders(client) {
    console.log('Starting temporary channel owner reminders (every 30 minutes)');
    
    // Clear any existing interval to prevent duplicates
    if (this.tempOwnerReminderInterval) {
      clearInterval(this.tempOwnerReminderInterval);
    }
    
    // 30 minutes in milliseconds
    const THIRTY_MINUTES_MS = 30 * 60 * 1000;
    
    // Set up interval to run every 30 minutes
    this.tempOwnerReminderInterval = setInterval(() => {
      this.sendTempChannelOwnerReminders(client);
    }, THIRTY_MINUTES_MS);
  }
  
  /**
   * Send owner reminders to all temporary voice channels
   * @param {Client} client - Discord.js client
   */
  async sendTempChannelOwnerReminders(client) {
    // Skip if the client isn't ready
    if (!client || !client.isReady()) {
      console.log('Client not ready, skipping temporary channel owner reminders');
      return;
    }
    
    // Process each guild
    for (const guild of client.guilds.cache.values()) {
      try {
        // Get all voice channels
        const voiceChannels = guild.channels.cache.filter(channel => 
          channel.type === 2 // VoiceChannel
        );
        
        // Process each voice channel
        for (const [channelId, channel] of voiceChannels) {
          try {
            // Skip if it's a permanent voice channel or has no members
            if (Settings.doesChannelHavePermVoice(guild.id, channelId) || channel.members.size === 0) {
              continue;
            }
            
            // Check if it's in our temporary channels system
            const hasOwner = channelOwners.has(channelId);
            let message = '';
            
            if (hasOwner) {
              // Get the owner's ID and try to fetch their username
              const ownerId = channelOwners.get(channelId);
              let ownerName = 'Unknown User';
              
              try {
                const owner = await guild.members.fetch(ownerId);
                ownerName = owner.user.username;
              } catch (error) {
                console.error(`Could not fetch owner ${ownerId} for channel ${channelId}`, error);
              }
              
              message = `📢 **Channel Reminder:** This voice channel is owned by <@${ownerId}> (${ownerName}). They have moderation privileges including /kick, /ban, and /mute commands.`;
            } else {
              // No owner assigned - this could be a recovered channel after bot restart
              message = `📢 **Channel Reminder:** This voice channel currently has no assigned owner. Use the \`/claim\` command to become the channel owner and gain moderation privileges.`;
            }
            
            // Send the reminder
            await channel.send({ content: message });
            console.log(`Sent owner reminder to temporary channel: ${channel.name} (${channel.id})`);
            
          } catch (error) {
            console.error(`Error sending owner reminder to channel ${channelId}:`, error);
          }
          
          // Add a small delay between messages to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.error(`Error processing guild ${guild.id} for temp channel owner reminders:`, error);
      }
    }
  }
}

module.exports = new ReminderSystem();