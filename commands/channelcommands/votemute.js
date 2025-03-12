const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
require('dotenv').config();
const { channelOwners } = require('../../methods/channelowner');
const { addMutedUser, removeMutedUser, isUserMuted } = require('../../methods/channelMutes');
const auditLogger = require('../../methods/auditLogger');

// Map to track active vote mutes to prevent spam
const activeVoteMutes = new Map();

// Map to track ongoing mute timers so they can be cleared if needed
const muteTimers = new Map();

module.exports = {
  category: 'channelcommands',
  data: new SlashCommandBuilder()
    .setName('votemute')
    .setDescription('Start a vote to mute a user in the channel for a specified time.')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to vote mute.')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('duration')
        .setDescription('Duration of the mute in minutes (1-30, default: 5)')
        .setMinValue(1)
        .setMaxValue(30)
        .setRequired(false)),
  
  async execute(interaction) {
    // Defer reply to prevent timeout
    await interaction.deferReply();
    
    try {
      const guild = interaction.guild;
      const member = await interaction.guild.members.fetch(interaction.user.id);
      
      // Check if the initiator is in a voice channel
      if (!member.voice.channel) {
        return await interaction.editReply({ content: 'You must be in a voice channel to use this command.' });
      }
      
      const currentChannel = member.voice.channel.id;
      const targetUser = interaction.options.getUser('user');
      
      // Get duration from options or use default (5 minutes)
      const muteDuration = interaction.options.getInteger('duration') || 5;
      
      // Check if the channel is a temporary channel
      if (!channelOwners.has(currentChannel)) {
        return await interaction.editReply({ content: 'You must be in a temporary channel to use this command.' });
      }

      // Prevent starting a vote against the channel owner
      if (channelOwners.get(currentChannel) === targetUser.id) {
        return await interaction.editReply({ content: 'You cannot vote to mute the channel owner.' });
      }

      // Prevent starting a vote against the bot
      if (targetUser.id === interaction.client.user.id) {
        return await interaction.editReply({ content: 'You cannot vote to mute the bot.' });
      }

      // Prevent voting against yourself
      if (member.id === targetUser.id) {
        return await interaction.editReply({ content: 'You cannot vote to mute yourself.' });
      }
      
      // Check if the target user is in the voice channel
      const targetMember = await guild.members.fetch(targetUser.id);
      if (!targetMember.voice.channel || targetMember.voice.channel.id !== currentChannel) {
        return await interaction.editReply({ content: `${targetUser.username} is not in your voice channel.` });
      }
      
      // Check if there's already an active vote for this user in this channel
      const voteKey = `${currentChannel}-${targetUser.id}`;
      if (activeVoteMutes.has(voteKey)) {
        return await interaction.editReply({ content: `There is already an active vote to mute ${targetUser.username}.` });
      }
      
      // Check if the user is already muted
      if (isUserMuted(currentChannel, targetUser.id)) {
        return await interaction.editReply({ content: `${targetUser.username} is already muted in this channel.` });
      }
      
      // Get all members in the voice channel
      const voiceChannel = guild.channels.cache.get(currentChannel);
      
      // Need at least 2 people in the channel (including target)
      if (voiceChannel.members.size < 2) {
        return await interaction.editReply({ content: 'There need to be at least 2 people in the channel to start a vote mute.' });
      }
      
      // ===== CALCULATE VOTE REQUIREMENTS =====
      // Get all eligible voters (everyone except the target) at the START
      const initialEligibleVoters = voiceChannel.members.filter(m => m.id !== targetUser.id);
      const initialEligibleVoterCount = initialEligibleVoters.size;
      
      // Store the IDs of eligible voters at the start of the vote
      // This ensures that only people present at the beginning can vote
      const initialEligibleVoterIds = new Set(
        initialEligibleVoters.map(m => m.id)
      );
      
      // Calculate required votes based on the number of eligible voters
      // For groups of 1 eligible voter, require 1 vote
      // For groups of 2-4 eligible voters, require 2 votes (more strict threshold)
      // For 5+ eligible voters, require majority (ceil of half)
      let requiredVotes;
      
      if (initialEligibleVoterCount == 1) {
        requiredVotes = 1; // Solo voter (2 people in room) only needs 1 vote
      } else if (initialEligibleVoterCount <= 4) {
        requiredVotes = 2; // Small groups (3-5 people in room) need 2 votes
      } else {
        requiredVotes = Math.ceil(initialEligibleVoterCount / 2); // Large groups need majority
      }
      
      // For display purposes in the embed
      const displayRequiredVotes = requiredVotes;
      
      console.log(`[START] Vote mute against ${targetUser.tag} in channel ${currentChannel} for ${muteDuration} minutes`);
      console.log(`[INITIAL] ${initialEligibleVoterCount} eligible voters, ${requiredVotes} votes required`);
      console.log(`[ELIGIBLE VOTERS] ${Array.from(initialEligibleVoterIds).join(', ')}`);
      
      // Explicitly track vote status
      let voteStatus = {
        completed: false,
        muted: false,
        startTime: Date.now(),
        initialRequiredVotes: requiredVotes, // Store the initial required votes
        initialEligibleVoterIds: initialEligibleVoterIds, // Store who can vote
        initialEligibleVoterCount: initialEligibleVoterCount, // Store how many can vote
        muteDuration: muteDuration // Store the mute duration
      };
      
      // Register in active votes map
      activeVoteMutes.set(voteKey, voteStatus);
      
      // Create vote embed with the display vote count
      const voteEmbed = new EmbedBuilder()
        .setTitle('Vote Mute')
        .setDescription(`${displayRequiredVotes + 1} 👍 required to mute ${targetUser.toString()} for ${muteDuration} minute${muteDuration !== 1 ? 's' : ''}\nVote ends in 20 seconds`)
        .setColor('#FF0000')
        .setFooter({ text: 'React with 👍 to vote' })
        .setTimestamp();
      
      // Send the vote message
      const voteMessage = await interaction.editReply({ embeds: [voteEmbed] });
      
      // Add the initial thumbs up reaction
      await voteMessage.react('👍');
      
      // ===== SIMPLIFIED MUTE EXECUTION FUNCTION =====
      // This is the critical function that actually performs the mute
      async function muteTarget() {
        // Ensure we only mute once
        if (voteStatus.muted) {
          console.log('[DUPLICATE] User already muted, skipping');
          return;
        }
        
        // Set muted flag immediately to prevent race conditions
        voteStatus.muted = true;
        voteStatus.completed = true;
        
        console.log(`[MUTE EXECUTION] Muting ${targetUser.tag} for ${muteDuration} minutes`);
        
        try {
          // Add to our mute tracking right away
          addMutedUser(currentChannel, targetUser.id);
          
          // Immediately apply the mute - run this first to reduce perceived lag
          try {
            // Do this first and don't await it yet - we can do other things in parallel
            const mutePromise = guild.members.fetch(targetUser.id)
              .then(freshTarget => {
                if (freshTarget.voice.channel && freshTarget.voice.channel.id === currentChannel) {
                  return freshTarget.voice.setMute(true, 'Vote mute');
                }
              })
              .catch(muteError => {
                console.error('[MUTE ERROR] Failed to apply server mute:', muteError);
              });
            
            // Start UI updates in parallel
            // 1. Update the embed to show success
            const successEmbed = new EmbedBuilder()
              .setTitle('Vote Mute')
              .setDescription(`Vote passed! ${targetUser.toString()} has been muted for ${muteDuration} minute${muteDuration !== 1 ? 's' : ''}`)
              .setColor('#00FF00')
              .setTimestamp();
            
            const uiPromise = interaction.editReply({ embeds: [successEmbed] });
            
            // Wait for the mute to complete before continuing
            await mutePromise;
            console.log(`[MUTE SUCCESS] Server mute applied to ${targetUser.tag}`);
            
            // Wait for UI update to complete
            await uiPromise;
            
            // Announce successful mute
            voiceChannel.send(`${targetUser.toString()} has been muted for ${muteDuration} minute${muteDuration !== 1 ? 's' : ''} by vote.`)
              .catch(e => console.error('Error sending mute notification:', e));
            
            // Get vote count for audit log (do this after the mute is applied)
            const message = await interaction.fetchReply();
            const thumbsUp = message.reactions.cache.get('👍');
            let validVoters = { size: 0 };
            
            if (thumbsUp) {
              const users = await thumbsUp.users.fetch();
              validVoters = users.filter(u => 
                u.id !== interaction.client.user.id && // Not the bot
                u.id !== targetUser.id && // Not the target
                voteStatus.initialEligibleVoterIds.has(u.id) // Was an eligible voter at start
              );
            }
            
            // Log the vote mute (non-blocking)
            auditLogger.logVoteMute(guild.id, voiceChannel, targetUser, interaction.user, true, validVoters.size)
              .catch(e => console.error('Error logging vote mute:', e));
          } catch (muteError) {
            console.error('[MUTE ERROR] Failed to apply server mute:', muteError);
            // Even if server mute fails, the user is still tracked as muted in our system
          }
          
          // Clean up
          activeVoteMutes.delete(voteKey);
          
          // 5. Set unmute timer - converted to milliseconds
          const muteDurationMs = muteDuration * 60 * 1000;
          
          // Create a timer and store it so it can be cancelled if needed
          const timerRef = setTimeout(async () => {
            try {
              // Check if still muted
              if (isUserMuted(currentChannel, targetUser.id)) {
                console.log(`[UNMUTE] Auto-unmuting ${targetUser.tag} after ${muteDuration} minutes`);
                
                // Remove from tracking
                removeMutedUser(currentChannel, targetUser.id);
                
                // Try to unmute if still in channel
                try {
                  const unmuteTarget = await guild.members.fetch(targetUser.id);
                  if (unmuteTarget.voice.channel && unmuteTarget.voice.channel.id === currentChannel) {
                    await unmuteTarget.voice.setMute(false, 'Vote mute expired');
                    
                    // Notify channel
                    await voiceChannel.send(`The vote mute for ${targetUser.toString()} has expired.`);
                  }
                } catch (unmute_error) {
                  console.error('[UNMUTE ERROR]', unmute_error);
                }
              }
              
              // Clean up timer reference
              muteTimers.delete(`${currentChannel}-${targetUser.id}`);
            } catch (error) {
              console.error('[UNMUTE TIMER ERROR]', error);
            }
          }, muteDurationMs);
          
          // Store the timer reference
          muteTimers.set(`${currentChannel}-${targetUser.id}`, timerRef);
        } catch (error) {
          console.error('[CRITICAL ERROR] Mute execution failed:', error);
        }
      }
      
      // ===== VOTE FAILURE FUNCTION =====
      async function failVote() {
        // Only fail if not already completed
        if (voteStatus.completed) {
          console.log('[DUPLICATE] Vote already completed, not showing failure');
          return;
        }
        
        // Mark as completed
        voteStatus.completed = true;
        
        console.log(`[VOTE FAILED] Not enough votes to mute ${targetUser.tag}`);
        
        try {
          // Update embed to show failure
          const failEmbed = new EmbedBuilder()
            .setTitle('Vote Mute')
            .setDescription(`Vote failed! Not enough votes to mute ${targetUser.toString()}`)
            .setColor('#888888')
            .setTimestamp();
          
          await interaction.editReply({ embeds: [failEmbed] });
          
          // Clean up
          activeVoteMutes.delete(voteKey);
        } catch (error) {
          console.error('[FAIL VOTE ERROR]', error);
        }
      }
      
      // ===== VOTE CHECKER FUNCTION =====
      // This is the core function that checks if we have enough votes
      async function checkVotes() {
        // Skip if already completed
        if (voteStatus.completed) return false;
        
        try {
          // Get fresh message data
          const message = await interaction.fetchReply();
          const thumbsUp = message.reactions.cache.get('👍');
          
          if (!thumbsUp) {
            console.log('[CHECK VOTES] No reactions found');
            return false;
          }
          
          // Get users who reacted
          const users = await thumbsUp.users.fetch();
          
          // Get current channel members
          const currentVoiceChannel = guild.channels.cache.get(currentChannel);
          if (!currentVoiceChannel) {
            console.log('[CHECK VOTES] Channel no longer exists');
            return false;
          }
          
          // Filter valid votes - IMPORTANT: Only count votes from users who:
          // 1. Were in the voice channel at the start (eligible voters)
          // 2. Are not the bot or the target user
          const validVoters = users.filter(u => {
            // Skip the bot and the target user
            if (u.id === interaction.client.user.id || u.id === targetUser.id) {
              return false;
            }
            
            // Check if they were in the channel when the vote started
            if (!voteStatus.initialEligibleVoterIds.has(u.id)) {
              return false;
            }
            
            // Get the guild member for this user
            const guildMember = currentVoiceChannel.members.get(u.id);
            
            // Only count the vote if they are still in this specific voice channel
            return guildMember && guildMember.voice.channelId === currentChannel;
          });
          
          // Log vote status
          const voterNames = validVoters.map(u => u.username).join(', ');
          console.log(`[VOTE STATUS] ${validVoters.size}/${voteStatus.initialRequiredVotes} votes`);
          console.log(`[VOTERS] ${voterNames || 'None'}`);
          
          // IMPORTANT: Compare against the INITIAL required votes
          // This ensures that people leaving doesn't change the vote requirement
          return validVoters.size >= voteStatus.initialRequiredVotes;
        } catch (error) {
          console.error('[CHECK VOTES ERROR]', error);
          return false;
        }
      }
      
      // ===== COUNTDOWN TIMER SETUP =====
      // Update the embed at specific intervals
      const countdownTimes = [15, 10, 5, 4, 3, 2, 1];
      
      // Schedule the countdown updates
      for (const seconds of countdownTimes) {
        setTimeout(async () => {
          // Skip if vote already done
          if (voteStatus.completed) return;
          
          try {
            const updatedEmbed = new EmbedBuilder()
              .setTitle('Vote Mute')
              .setDescription(`${displayRequiredVotes + 1} 👍 required to mute ${targetUser.toString()} for ${muteDuration} minute${muteDuration !== 1 ? 's' : ''}\nVote ends in ${seconds} seconds`)
              .setColor('#FF0000')
              .setFooter({ text: 'React with 👍 to vote' })
              .setTimestamp();
            
            await interaction.editReply({ embeds: [updatedEmbed] });
          } catch (error) {
            console.error(`[COUNTDOWN ERROR] at ${seconds}s:`, error);
          }
        }, (20 - seconds) * 1000);
      }
      
      // ===== VOTE CHECK LOOP =====
      // Check for votes every 250ms
      const voteCheckInterval = setInterval(async () => {
        // Stop checking if vote completed
        if (voteStatus.completed) {
          clearInterval(voteCheckInterval);
          return;
        }
        
        // Check if we have enough votes
        const shouldMute = await checkVotes();
        
        // If we should mute, do it immediately
        if (shouldMute) {
          console.log('[VOTES RECEIVED] Vote threshold met! Executing mute immediately');
          
          // Stop checking
          clearInterval(voteCheckInterval);
          
          // Execute the mute right away
          await muteTarget();
        }
      }, 2000);
      
      // ===== MAIN VOTE TIMER =====
      // This ensures the vote always ends after 20 seconds
      setTimeout(async () => {
        // Stop checking for votes
        clearInterval(voteCheckInterval);
        
        // Only proceed if not already completed
        if (!voteStatus.completed) {
          console.log('[TIMER EXPIRED] 20 seconds elapsed, finalizing vote');
          
          // Check one last time
          const finalCheck = await checkVotes();
          
          // Decision time
          if (finalCheck) {
            console.log('[FINAL CHECK] Vote passed on final check');
            await muteTarget();
          } else {
            console.log('[FINAL CHECK] Vote failed on final check');
            await failVote();
          }
        }
      }, 20000);
      
      // ===== FAILSAFE =====
      // Ultimate backup in case something goes wrong
      setTimeout(() => {
        if (!voteStatus.completed) {
          console.log('[FAILSAFE TRIGGERED] Force ending vote after 21 seconds');
          failVote().catch(e => console.error('[FAILSAFE ERROR]', e));
        }
      }, 21000);
      
    } catch (error) {
      console.error('[COMMAND ERROR] Vote mute execution failed:', error);
      
      if (interaction.deferred) {
        await interaction.editReply({ content: 'There was an error while processing the vote mute command.' }).catch(console.error);
      }
    }
  },
};