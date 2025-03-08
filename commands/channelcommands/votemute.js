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
      
      // Get all voice members and exclude the target
      const eligibleVoters = voiceChannel.members.filter(m => m.id !== targetUser.id);
      const totalEligibleVoters = eligibleVoters.size;
      
      // Need at least 3 people in the channel for a vote (including target)
      if (voiceChannel.members.size < 3) {
        return await interaction.editReply({ content: 'There need to be at least 3 people in the channel to start a vote mute.' });
      }
      
      // Calculate required votes - 50% of eligible voters required (rounded up)
      const requiredVotes = Math.ceil(totalEligibleVoters / 2);
      
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
      
      // Fetch the message to ensure we have access to the reaction
      const fetchedMessage = await interaction.fetchReply();
      
      // Function to actually mute the user (extracted to avoid code duplication)
      async function muteUser() {
        try {
          console.log(`Muting user ${targetUser.id} in channel ${currentChannel}`);
          
          // Update embed to show vote passed
          voteEmbed.setDescription(`Vote passed! ${targetUser.toString()} has been muted for 5 minutes`);
          voteEmbed.setColor('#00FF00');
          await fetchedMessage.edit({ embeds: [voteEmbed] });
          
          // Apply the mute in our tracking system
          addMutedUser(currentChannel, targetUser.id);
          
          // Actually mute the user in Discord
          const freshTargetMember = await guild.members.fetch(targetUser.id);
          if (freshTargetMember.voice.channel && freshTargetMember.voice.channel.id === currentChannel) {
            await freshTargetMember.voice.setMute(true, 'Vote mute');
            console.log(`User ${targetUser.id} successfully muted by vote`);
            
            // Announce the mute in the channel
            await voiceChannel.send(`${targetUser.toString()} has been muted for 5 minutes by vote.`);
          }
          
          // Set a timeout to unmute after 5 minutes
          setTimeout(async () => {
            // Check if the user is still muted before attempting to unmute
            if (isUserMuted(currentChannel, targetUser.id)) {
              removeMutedUser(currentChannel, targetUser.id);
              
              // Try to unmute if they're still in the channel
              try {
                const updatedMember = await guild.members.fetch(targetUser.id);
                if (updatedMember.voice.channel && updatedMember.voice.channel.id === currentChannel) {
                  await updatedMember.voice.setMute(false, 'Vote mute expired');
                  console.log(`User ${targetUser.id} unmuted after vote mute expired`);
                }
              } catch (error) {
                console.error('Error unmuting user after timeout:', error);
              }
              
              // Notify the channel that the mute has expired
              try {
                const channel = guild.channels.cache.get(currentChannel);
                if (channel) {
                  await channel.send(`The vote mute for ${targetUser.toString()} has expired.`);
                }
              } catch (notifyError) {
                console.error('Error notifying about expired mute:', notifyError);
              }
            }
          }, 5 * 60 * 1000); // 5 minutes
          
          return true;
        } catch (error) {
          console.error('Error in muteUser function:', error);
          return false;
        }
      }
      
      // Track if we've already muted - to prevent double-muting
      let hasMuted = false;
      
      // Function to count valid votes
      async function countValidVotes(reaction) {
        // Get fresh data about who's in the voice channel
        const freshVoiceChannel = guild.channels.cache.get(currentChannel);
        if (!freshVoiceChannel) return 0;
        
        const currentVoiceMembers = freshVoiceChannel.members;
        
        // Fetch all users who reacted
        const reactedUsers = await reaction.users.fetch();
        
        // Filter valid votes: not the bot, not the target, and currently in the voice channel
        const validVotes = reactedUsers.filter(user => 
          user.id !== interaction.client.user.id && // Not the bot
          user.id !== targetUser.id && // Not the target
          currentVoiceMembers.has(user.id) // Currently in the voice channel
        );
        
        // Log the votes being counted
        console.log(`Valid votes: ${validVotes.size}, Required: ${requiredVotes}`);
        
        // Get currently eligible voters (for threshold calculation)
        const currentEligibleVoters = currentVoiceMembers.filter(m => m.id !== targetUser.id).size;
        const currentRequiredVotes = Math.ceil(currentEligibleVoters / 2);
        
        // Update the embed with current vote count
        voteEmbed.setDescription(`${validVotes.size}/${currentEligibleVoters} votes to mute ${targetUser.toString()} (need ${currentRequiredVotes})`);
        await fetchedMessage.edit({ embeds: [voteEmbed] });
        
        // Check if we've met the threshold and should mute
        if (validVotes.size >= currentRequiredVotes && !hasMuted) {
          console.log(`Vote threshold met! Muting user ${targetUser.id}`);
          // Set flag first to prevent race conditions
          hasMuted = true;
          
          // Mute the user
          await muteUser();
          
          // Stop the collector
          return true;
        }
        
        return false;
      }
      
      // The vote will last for 20 seconds or until enough votes are collected
      const collector = fetchedMessage.createReactionCollector({
        time: 20000, // 20 seconds
        dispose: true // Handle reaction removals
      });
      
      // Track this vote in the active votes map
      activeVoteMutes.set(voteKey, { 
        initiator: member.id, 
        target: targetUser.id,
        message: fetchedMessage,
        collector: collector
      });
      
      // When reactions are collected
      collector.on('collect', async (reaction, user) => {
        if (reaction.emoji.name === '👍') {
          try {
            console.log(`Vote collected from ${user.username}`);
            
            // Process votes and check if threshold met
            const thresholdMet = await countValidVotes(reaction);
            
            // If threshold met, stop the collector
            if (thresholdMet) {
              console.log('Vote threshold met, stopping collector');
              collector.stop('success');
            }
          } catch (error) {
            console.error('Error processing vote:', error);
          }
        }
      });
      
      // When reactions are removed
      collector.on('remove', async (reaction, user) => {
        if (reaction.emoji.name === '👍') {
          try {
            // Just recount votes, don't need to check threshold on removal
            await countValidVotes(reaction);
          } catch (error) {
            console.error('Error processing vote removal:', error);
          }
        }
      });
      
      // When the collection ends
      collector.on('end', async (collected, reason) => {
        console.log(`Vote collector ended with reason: ${reason}`);
        
        // Remove from active votes
        activeVoteMutes.delete(voteKey);
        
        // If we're ending because the vote passed, the user is already muted
        if (reason === 'success' || hasMuted) {
          console.log('Vote ended successfully, user should be muted');
          return;
        }
        
        // If we're here, the vote timed out - do one final check
        try {
          const thumbsUpReaction = fetchedMessage.reactions.cache.get('👍');
          if (thumbsUpReaction) {
            // Do one final check to see if threshold was met
            const shouldMute = await countValidVotes(thumbsUpReaction);
            
            // If final check says we should mute and we haven't already, do it
            if (shouldMute && !hasMuted) {
              await muteUser();
              return;
            }
          }
          
          // If we get here, vote failed
          voteEmbed.setDescription(`Vote failed! Not enough votes to mute ${targetUser.toString()}`);
          voteEmbed.setColor('#888888');
          await fetchedMessage.edit({ embeds: [voteEmbed] });
          
        } catch (error) {
          console.error('Error in final vote check:', error);
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