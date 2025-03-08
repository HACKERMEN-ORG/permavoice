const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
require('dotenv').config();
const { channelOwners } = require('../../methods/channelowner');
const { addMutedUser, removeMutedUser, isUserMuted } = require('../../methods/channelMutes');

// Map to track active vote mutes to prevent spam
const activeVoteMutes = new Map();

module.exports = {
  category: 'channelcommands',
  data: new SlashCommandBuilder()
    .setName('votemute')
    .setDescription('Start a vote to mute a user in the channel for 5 minutes.')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to vote mute.')
        .setRequired(true)),
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
      
      // Need at least 3 people in the channel for a vote (including target)
      if (voiceChannel.members.size < 3) {
        return await interaction.editReply({ content: 'There need to be at least 3 people in the channel to start a vote mute.' });
      }
      
      // Get all eligible voters (everyone except the target)
      const eligibleVoters = voiceChannel.members.filter(m => m.id !== targetUser.id);
      const totalEligibleVoters = eligibleVoters.size;
      
      // Calculate required votes - MAJORITY of eligible voters
      const actualRequiredVotes = Math.ceil(totalEligibleVoters / 2);
      
      // For display purposes, if there are only 2 eligible voters (3 people total including target),
      // we want the embed to say 3 votes are required (as requested by user)
      const displayRequiredVotes = totalEligibleVoters === 2 ? 3 : actualRequiredVotes + 1;
      
      console.log(`Starting vote mute against ${targetUser.tag} in channel ${currentChannel}`);
      console.log(`Total eligible voters: ${totalEligibleVoters}, Required votes: ${actualRequiredVotes}`);
      console.log(`Display required votes: ${displayRequiredVotes}`);
      
      // Explicitly track vote status
      let voteStatus = {
        completed: false,
        muted: false,
        startTime: Date.now()
      };
      
      // Register in active votes map
      activeVoteMutes.set(voteKey, voteStatus);
      
      // Create vote embed with the display vote count
      const voteEmbed = new EmbedBuilder()
        .setTitle('Vote Mute')
        .setDescription(`${displayRequiredVotes} votes required to mute ${targetUser.toString()}\nVote ends in 20 seconds`)
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
          console.log('User already muted, skipping duplicate mute');
          return;
        }
        
        // Set muted flag immediately to prevent race conditions
        voteStatus.muted = true;
        voteStatus.completed = true;
        
        console.log(`[MUTE EXECUTION] Muting ${targetUser.tag}`);
        
        try {
          // 1. Update the embed to show success
          const successEmbed = new EmbedBuilder()
            .setTitle('Vote Mute')
            .setDescription(`Vote passed! ${targetUser.toString()} has been muted for 5 minutes`)
            .setColor('#00FF00')
            .setTimestamp();
          
          await interaction.editReply({ embeds: [successEmbed] });
          
          // 2. Add to our mute tracking
          addMutedUser(currentChannel, targetUser.id);
          
          // 3. Actually mute the user
          try {
            const freshTarget = await guild.members.fetch(targetUser.id);
            if (freshTarget.voice.channel && freshTarget.voice.channel.id === currentChannel) {
              await freshTarget.voice.setMute(true, 'Vote mute');
              console.log(`[MUTE SUCCESS] Server mute applied to ${targetUser.tag}`);
              
              // Announce successful mute
              await voiceChannel.send(`${targetUser.toString()} has been muted for 5 minutes by vote.`);
            }
          } catch (muteError) {
            console.error('[MUTE ERROR] Failed to apply server mute:', muteError);
            // Even if server mute fails, the user is still tracked as muted in our system
          }
          
          // 4. Clean up
          activeVoteMutes.delete(voteKey);
          
          // 5. Set unmute timer
          setTimeout(async () => {
            try {
              // Check if still muted
              if (isUserMuted(currentChannel, targetUser.id)) {
                console.log(`[UNMUTE] Auto-unmuting ${targetUser.tag} after 5 minutes`);
                
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
            } catch (error) {
              console.error('[UNMUTE TIMER ERROR]', error);
            }
          }, 5 * 60 * 1000); // 5 minutes
        } catch (error) {
          console.error('[CRITICAL ERROR] Mute execution failed:', error);
        }
      }
      
      // ===== VOTE FAILURE FUNCTION =====
      async function failVote() {
        // Only fail if not already completed
        if (voteStatus.completed) {
          console.log('Vote already completed, not displaying failure message');
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
          
          // Filter valid votes
          const validVoters = users.filter(u => 
            u.id !== interaction.client.user.id && // Not the bot
            u.id !== targetUser.id && // Not the target
            currentVoiceChannel.members.has(u.id) // In the channel
          );
          
          // Get current required votes based on who's in the channel now
          const currentEligibleVoters = currentVoiceChannel.members.filter(m => m.id !== targetUser.id).size;
          const currentRequiredVotes = Math.ceil(currentEligibleVoters / 2);
          
          // Log vote status
          const voterNames = validVoters.map(u => u.username).join(', ');
          console.log(`[VOTE STATUS] ${validVoters.size}/${currentRequiredVotes} votes`);
          console.log(`[VOTERS] ${voterNames || 'None'}`);
          
          // Return if threshold is met
          return validVoters.size >= currentRequiredVotes;
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
              .setDescription(`${displayRequiredVotes} votes required to mute ${targetUser.toString()}\nVote ends in ${seconds} seconds`)
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
      }, 250);
      
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