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
      
      // Calculate required votes - 50% of eligible voters required (rounded up)
      const requiredVotes = Math.ceil(totalEligibleVoters / 2);
      
      console.log(`Starting vote mute against ${targetUser.tag} in channel ${currentChannel}`);
      console.log(`Required votes: ${requiredVotes} out of ${totalEligibleVoters} eligible voters`);
      
      // Create vote embed
      const voteEmbed = new EmbedBuilder()
        .setTitle('Vote Mute')
        .setDescription(`${requiredVotes} votes required to mute ${targetUser.toString()}\nVote ends in 20 seconds`)
        .setColor('#FF0000')
        .setFooter({ text: 'React with 👍 to vote' })
        .setTimestamp();
      
      // Send the vote message
      const voteMessage = await interaction.editReply({ embeds: [voteEmbed] });
      
      // Add the initial thumbs up reaction
      await voteMessage.react('👍');
      
      // Mark this as an active vote
      activeVoteMutes.set(voteKey, {
        inProgress: true
      });
      
      // ----------------------
      // MANUAL REACTION CHECK
      // ----------------------
      
      // This is the key to fixing the issue - we'll manually poll for reactions
      // instead of relying on the collector events

      // Set up a variable to track if mute has been executed
      let muteExecuted = false;
      
      // Function to execute the mute
      async function executeMute() {
        // Prevent double execution
        if (muteExecuted) return;
        muteExecuted = true;
        
        console.log(`EXECUTING MUTE for ${targetUser.tag}`);
        
        try {
          // Update the embed to show vote passed
          const successEmbed = new EmbedBuilder()
            .setTitle('Vote Mute')
            .setDescription(`Vote passed! ${targetUser.toString()} has been muted for 5 minutes`)
            .setColor('#00FF00')
            .setTimestamp();
          
          await interaction.editReply({ embeds: [successEmbed] });
          
          // Remove from active votes
          activeVoteMutes.delete(voteKey);
          
          // Add to muted users
          addMutedUser(currentChannel, targetUser.id);
          
          // Get fresh target user data
          const freshTarget = await guild.members.fetch(targetUser.id);
          
          // Apply the server mute if they're still in the channel
          if (freshTarget.voice.channel && freshTarget.voice.channel.id === currentChannel) {
            await freshTarget.voice.setMute(true, 'Vote mute');
            console.log(`Successfully muted ${targetUser.tag}`);
            
            // Announce in the channel
            await voiceChannel.send(`${targetUser.toString()} has been muted for 5 minutes by vote.`);
          }
          
          // Set timeout to unmute after 5 minutes
          setTimeout(async () => {
            try {
              // Check if the user is still marked as muted
              if (isUserMuted(currentChannel, targetUser.id)) {
                // Remove mute tracking
                removeMutedUser(currentChannel, targetUser.id);
                
                // Get fresh user data
                try {
                  const unmuteTarget = await guild.members.fetch(targetUser.id);
                  
                  // If they're still in the channel, unmute them
                  if (unmuteTarget.voice.channel && unmuteTarget.voice.channel.id === currentChannel) {
                    await unmuteTarget.voice.setMute(false, 'Vote mute expired');
                    
                    // Notify channel
                    await voiceChannel.send(`The vote mute for ${targetUser.toString()} has expired.`);
                  }
                } catch (error) {
                  console.error('Error unmuting user:', error);
                }
              }
            } catch (error) {
              console.error('Error in unmute timeout:', error);
            }
          }, 5 * 60 * 1000); // 5 minutes
        } catch (error) {
          console.error('Error executing mute:', error);
        }
      }
      
      // Function to end with failed vote
      async function endWithFailedVote() {
        // Only run if mute wasn't already executed
        if (muteExecuted) return;
        
        console.log(`Vote failed for ${targetUser.tag}`);
        
        try {
          // Update embed to show failure
          const failEmbed = new EmbedBuilder()
            .setTitle('Vote Mute')
            .setDescription(`Vote failed! Not enough votes to mute ${targetUser.toString()}`)
            .setColor('#888888')
            .setTimestamp();
          
          await interaction.editReply({ embeds: [failEmbed] });
          
          // Remove from active votes
          activeVoteMutes.delete(voteKey);
        } catch (error) {
          console.error('Error ending with failed vote:', error);
        }
      }
      
      // MANUAL REACTION CHECKING LOOP
      // This is the key change - we'll check reactions on a regular interval
      // rather than relying on events which might be delayed or unreliable
      
      // Store the interval ID so we can clear it
      let checkInterval = null;
      
      // Set up a manual check of reactions every 500ms
      checkInterval = setInterval(async () => {
        try {
          // Skip if mute already executed
          if (muteExecuted) {
            clearInterval(checkInterval);
            return;
          }
          
          // Get the latest message with reactions
          const latestMessage = await interaction.fetchReply();
          const thumbsUpReaction = latestMessage.reactions.cache.get('👍');
          
          if (!thumbsUpReaction) {
            console.log('No thumbs up reaction found');
            return;
          }
          
          // Get all users who reacted
          const users = await thumbsUpReaction.users.fetch();
          
          // Get the current voice channel members
          const currentVoiceChannel = guild.channels.cache.get(currentChannel);
          if (!currentVoiceChannel) {
            console.log('Voice channel no longer exists');
            clearInterval(checkInterval);
            return endWithFailedVote();
          }
          
          // Filter to valid voters
          const validVoters = users.filter(u => 
            u.id !== interaction.client.user.id && // Not the bot
            u.id !== targetUser.id && // Not the target
            currentVoiceChannel.members.has(u.id) // In the voice channel
          );
          
          // Calculate current requirements
          const currentEligibleVoters = currentVoiceChannel.members.filter(m => m.id !== targetUser.id).size;
          const currentRequiredVotes = Math.ceil(currentEligibleVoters / 2);
          
          console.log(`Current vote count: ${validVoters.size}/${currentRequiredVotes} [Required: ${currentRequiredVotes}]`);
          
          // Update the embed with current vote count
          if (!muteExecuted) {
            const updatedEmbed = new EmbedBuilder()
              .setTitle('Vote Mute')
              .setDescription(`${validVoters.size}/${currentEligibleVoters} votes to mute ${targetUser.toString()} (need ${currentRequiredVotes})`)
              .setColor('#FF0000')
              .setFooter({ text: 'React with 👍 to vote' })
              .setTimestamp();
            
            await interaction.editReply({ embeds: [updatedEmbed] });
          }
          
          // CHECK IF THRESHOLD MET - THIS IS THE CRITICAL PART
          if (validVoters.size >= currentRequiredVotes) {
            console.log(`THRESHOLD MET! ${validVoters.size}/${currentRequiredVotes} - Executing mute immediately`);
            
            // Stop checking
            clearInterval(checkInterval);
            
            // Execute the mute
            await executeMute();
          }
        } catch (error) {
          console.error('Error in reaction check interval:', error);
        }
      }, 500); // Check every 500ms
      
      // Set timeout to end the vote after 20 seconds
      setTimeout(() => {
        // Clear the checking interval
        if (checkInterval) clearInterval(checkInterval);
        
        // If mute wasn't already executed, do one final check
        if (!muteExecuted) {
          (async () => {
            try {
              // Get the latest message with reactions
              const finalMessage = await interaction.fetchReply();
              const finalReaction = finalMessage.reactions.cache.get('👍');
              
              if (!finalReaction) {
                return endWithFailedVote();
              }
              
              // Get all users who reacted
              const finalUsers = await finalReaction.users.fetch();
              
              // Get the current voice channel members
              const finalVoiceChannel = guild.channels.cache.get(currentChannel);
              if (!finalVoiceChannel) {
                return endWithFailedVote();
              }
              
              // Filter to valid voters
              const finalValidVoters = finalUsers.filter(u => 
                u.id !== interaction.client.user.id && // Not the bot
                u.id !== targetUser.id && // Not the target
                finalVoiceChannel.members.has(u.id) // In the voice channel
              );
              
              // Calculate final requirements
              const finalEligibleVoters = finalVoiceChannel.members.filter(m => m.id !== targetUser.id).size;
              const finalRequiredVotes = Math.ceil(finalEligibleVoters / 2);
              
              console.log(`FINAL vote count: ${finalValidVoters.size}/${finalRequiredVotes}`);
              
              // Final threshold check
              if (finalValidVoters.size >= finalRequiredVotes) {
                console.log('Threshold met in final check!');
                await executeMute();
              } else {
                console.log('Vote failed in final check');
                await endWithFailedVote();
              }
            } catch (error) {
              console.error('Error in final vote check:', error);
              await endWithFailedVote();
            }
          })();
        }
      }, 20000); // 20 seconds
      
    } catch (error) {
      console.error('Error in vote mute command:', error);
      
      if (interaction.deferred) {
        await interaction.editReply({ content: 'There was an error while processing the vote mute command.' }).catch(console.error);
      }
    }
  },
};