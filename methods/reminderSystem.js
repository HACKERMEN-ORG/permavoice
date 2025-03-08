// methods/reminderSystem.js
const { EmbedBuilder } = require('discord.js');
const { channelOwners } = require('./channelowner');
const Settings = require('../Settings');

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
    
    // Timer reference for cleanup
    this.reminderInterval = null;
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
}

module.exports = new ReminderSystem();