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
      
      console.log(`Starting vote mute in channel ${currentChannel}`);
      console.log(`Total eligible voters: ${totalEligibleVoters}, Required votes: ${requiredVotes}`);
      
      // Create vote embed
      const voteEmbed = new EmbedBuilder()
        .setTitle('Vote Mute')
        .setDescription(`${requiredVotes} votes required to mute ${targetUser.toString()}\nVote ends in 20 seconds`)
        .setColor('#FF0000')
        .setFooter({ text: 'React with 👍 to vote' })
        .setTimestamp();
      
      // Send the vote message
      const voteMessage = await interaction.editReply({ embeds: [voteEmbed] });
      
      // Add the reaction for voting
      await voteMessage.react('👍');
      
      // Register this as an active vote
      activeVoteMutes.set(voteKey, true);
      
      // Track if we've already muted the user to prevent duplicate mutes
      let hasBeenMuted = false;
      
      // Function to perform the actual muting
      async function muteTargetUser() {
        if (hasBeenMuted) return; // Prevent duplicate muting
        hasBeenMuted = true;
        
        try {
          console.log(`Muting ${targetUser.tag} in channel ${currentChannel}`);
          
          // Update embed to show vote passed
          voteEmbed.setDescription(`Vote passed! ${targetUser.toString()} has been muted for 5 minutes`);
          voteEmbed.setColor('#00FF00');
          await interaction.editReply({ embeds: [voteEmbed] });
          
          // Add to muted users tracking
          addMutedUser(currentChannel, targetUser.id);
          
          // Get fresh target user data
          const freshTarget = await guild.members.fetch(targetUser.id);
          
          // Apply the mute if they're still in the voice channel
          if (freshTarget.voice.channel && freshTarget.voice.channel.id === currentChannel) {
            await freshTarget.voice.setMute(true, 'Vote mute');
            console.log(`Successfully muted ${targetUser.tag} via vote`);
            
            // Send confirmation message to the channel
            await voiceChannel.send(`${targetUser.toString()} has been muted for 5 minutes by vote.`);
          }
          
          // Set timeout to unmute after 5 minutes
          setTimeout(async () => {
            try {
              // Only proceed if the user is still tracked as muted
              if (isUserMuted(currentChannel, targetUser.id)) {
                console.log(`Unmuting ${targetUser.tag} after 5 minutes`);
                
                // Remove from muted tracking
                removeMutedUser(currentChannel, targetUser.id);
                
                // Get fresh user data
                const targetToUnmute = await guild.members.fetch(targetUser.id);
                
                // If they're still in the channel, unmute them
                if (targetToUnmute.voice.channel && targetToUnmute.voice.channel.id === currentChannel) {
                  await targetToUnmute.voice.setMute(false, 'Vote mute expired');
                  
                  // Notify the channel that the mute expired
                  const channel = guild.channels.cache.get(currentChannel);
                  if (channel) {
                    await channel.send(`The vote mute for ${targetUser.toString()} has expired.`);
                  }
                }
              }
            } catch (error) {
              console.error('Error unmuting user after timeout:', error);
            }
          }, 5 * 60 * 1000); // 5 minutes
        } catch (error) {
          console.error('Error applying vote mute:', error);
        }
      }
      
      // Set a timeout to end the vote after 20 seconds
      const voteTimeout = setTimeout(() => {
        handleVoteEnd('timeout');
      }, 20000);
      
      // Function to handle vote end regardless of how it ends
      async function handleVoteEnd(reason) {
        // Clear timeout to prevent duplicate endings
        clearTimeout(voteTimeout);
        
        // Remove from active votes
        activeVoteMutes.delete(voteKey);
        
        console.log(`Vote ended with reason: ${reason}`);
        
        // If the vote ended successfully, user is already muted
        if (reason === 'success' || hasBeenMuted) {
          return;
        }
        
        // If we're here, the vote must have failed
        try {
          voteEmbed.setDescription(`Vote failed! Not enough votes to mute ${targetUser.toString()}`);
          voteEmbed.setColor('#888888');
          await interaction.editReply({ embeds: [voteEmbed] });
        } catch (error) {
          console.error('Error updating failed vote embed:', error);
        }
      }
      
      // Set up a collector to watch for votes
      const filter = (reaction, user) => {
        return reaction.emoji.name === '👍' && user.id !== interaction.client.user.id;
      };
      
      const collector = voteMessage.createReactionCollector({ filter, time: 20000, dispose: true });
      
      // Handle vote collection
      collector.on('collect', async (reaction, user) => {
        console.log(`Received vote from ${user.tag}`);
        
        // We need to re-check who's in the voice channel to ensure votes are only from current members
        const voiceChannel = guild.channels.cache.get(currentChannel);
        if (!voiceChannel) {
          console.log('Voice channel no longer exists, ending vote');
          collector.stop('channelGone');
          return;
        }
        
        // Get reactions but exclude the bot
        let votes = await reaction.users.fetch();
        
        // Filter votes to only include users currently in the voice channel (and not the target)
        const validVotes = votes.filter(u => 
          u.id !== interaction.client.user.id && // Not the bot
          u.id !== targetUser.id && // Not the target
          voiceChannel.members.has(u.id) // Currently in the voice channel
        );
        
        // Get current count of eligible voters (it may have changed)
        const currentEligibleVoters = voiceChannel.members.filter(m => m.id !== targetUser.id).size;
        const currentRequiredVotes = Math.ceil(currentEligibleVoters / 2);
        
        console.log(`Vote progress: ${validVotes.size}/${currentRequiredVotes} (from ${currentEligibleVoters} eligible voters)`);
        
        // Update the embed with current vote count
        voteEmbed.setDescription(`${validVotes.size}/${currentEligibleVoters} votes to mute ${targetUser.toString()} (need ${currentRequiredVotes})`);
        await interaction.editReply({ embeds: [voteEmbed] });
        
        // Check if the vote threshold has been met
        if (validVotes.size >= currentRequiredVotes) {
          console.log(`Vote threshold met: ${validVotes.size}/${currentRequiredVotes}`);
          collector.stop('success');
          await muteTargetUser();
        }
      });
      
      // Handle vote removal
      collector.on('remove', async (reaction, user) => {
        console.log(`Vote removed by ${user.tag}`);
        
        // We need to re-check who's in the voice channel to ensure votes are only from current members
        const voiceChannel = guild.channels.cache.get(currentChannel);
        if (!voiceChannel) return;
        
        // Get reactions but exclude the bot
        let votes = await reaction.users.fetch();
        
        // Filter votes to only include users currently in the voice channel (and not the target)
        const validVotes = votes.filter(u => 
          u.id !== interaction.client.user.id && // Not the bot
          u.id !== targetUser.id && // Not the target
          voiceChannel.members.has(u.id) // Currently in the voice channel
        );
        
        // Get current count of eligible voters (it may have changed)
        const currentEligibleVoters = voiceChannel.members.filter(m => m.id !== targetUser.id).size;
        const currentRequiredVotes = Math.ceil(currentEligibleVoters / 2);
        
        console.log(`Vote progress after removal: ${validVotes.size}/${currentRequiredVotes}`);
        
        // Update the embed with current vote count
        voteEmbed.setDescription(`${validVotes.size}/${currentEligibleVoters} votes to mute ${targetUser.toString()} (need ${currentRequiredVotes})`);
        await interaction.editReply({ embeds: [voteEmbed] });
      });
      
      // Handle end of collection period
      collector.on('end', async (collected, reason) => {
        // Get final vote count for log
        console.log(`Collector ended with reason: ${reason}, final reaction count: ${collected.size}`);
        
        // Handle the end of voting
        if (reason === 'success') {
          // Already handled in the collect event
          await handleVoteEnd('success');
        } else {
          // If we got here by timeout, do one last check in case we missed votes
          if (reason === 'time' && !hasBeenMuted) {
            // Get the latest reaction data
            const message = await interaction.fetchReply();
            const reaction = message.reactions.cache.get('👍');
            
            if (reaction) {
              // Get reactions but exclude the bot
              let votes = await reaction.users.fetch();
              
              // Get the voice channel again
              const voiceChannel = guild.channels.cache.get(currentChannel);
              if (voiceChannel) {
                // Filter votes to only include users currently in the voice channel (and not the target)
                const validVotes = votes.filter(u => 
                  u.id !== interaction.client.user.id && // Not the bot
                  u.id !== targetUser.id && // Not the target
                  voiceChannel.members.has(u.id) // Currently in the voice channel
                );
                
                // Get current count of eligible voters (it may have changed)
                const currentEligibleVoters = voiceChannel.members.filter(m => m.id !== targetUser.id).size;
                const currentRequiredVotes = Math.ceil(currentEligibleVoters / 2);
                
                console.log(`Final vote check: ${validVotes.size}/${currentRequiredVotes}`);
                
                // Check if the vote threshold has been met
                if (validVotes.size >= currentRequiredVotes) {
                  console.log(`Vote threshold met in final check: ${validVotes.size}/${currentRequiredVotes}`);
                  await muteTargetUser();
                  return;
                }
              }
            }
          }
          
          // If we got here, the vote failed
          await handleVoteEnd('failed');
        }
      });
      
    } catch (error) {
      console.error('Error in vote mute command:', error);
      
      if (interaction.deferred) {
        await interaction.editReply({ content: 'There was an error while processing the vote mute command.' }).catch(console.error);
      }
    }
  },
};