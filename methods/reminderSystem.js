// Replace the existing sendTempChannelOwnerReminders method in methods/reminderSystem.js

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
            
            // Create the embed
            const reminderEmbed = new EmbedBuilder()
              .setTitle("📢 Channel Information")
              .setColor(hasOwner ? '#00AAFF' : '#FFA500')
              .setTimestamp();
            
            if (hasOwner) {
              // Get the owner's ID and try to fetch their username
              const ownerId = channelOwners.get(channelId);
              let ownerName = 'Unknown User';
              
              try {
                const owner = await guild.members.fetch(ownerId);
                ownerName = owner.user.username;
                
                // Add owner's avatar if available
                if (owner.user.displayAvatarURL()) {
                  reminderEmbed.setThumbnail(owner.user.displayAvatarURL());
                }
              } catch (error) {
                console.error(`Could not fetch owner ${ownerId} for channel ${channelId}`, error);
              }
              
              reminderEmbed
                .setDescription(`This voice channel is owned by <@${ownerId}> (${ownerName})`)
                .addFields(
                  { name: 'Owner Permissions', value: 'The channel owner can use commands like `/kick`, `/ban`, and `/mute` to moderate this channel.' },
                  { name: 'Owner Commands', value: 'Additional commands include `/rename`, `/limit`, `/submod`, and more.' }
                );
            } else {
              // No owner assigned - this could be a recovered channel after bot restart
              reminderEmbed
                .setDescription('This voice channel currently has no assigned owner.')
                .addFields(
                  { name: 'Claim Ownership', value: 'Use the `/claim` command to become the channel owner and gain moderation privileges.' }
                );
            }
            
            // Send the reminder
            await channel.send({ embeds: [reminderEmbed] });
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