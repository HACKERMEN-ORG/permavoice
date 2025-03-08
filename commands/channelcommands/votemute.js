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
      
      console.log(`Starting vote mute: ${requiredVotes} votes required out of ${totalEligibleVoters} eligible voters`);
      
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
      
      // Flag to prevent multiple mutes
      let userMuted = false;
      
      // Create a vote collector
      const collector = voteMessage.createReactionCollector({ 
        time: 20000,  // 20 seconds
        dispose: true // Handle reaction removals
      });
      
      // Add to active votes
      activeVoteMutes.set(voteKey, {
        target: targetUser.id,
        channel: currentChannel,
        message: voteMessage
      });
      
      // Handle new votes
      collector.on('collect', async (reaction, user) => {
        // Ignore reactions other than thumbs up
        if (reaction.emoji.name !== '👍') return;
        
        console.log(`New vote from ${user.tag}`);
        
        try {
          // Get current members in the voice channel to verify they're still there
          const currentChannel = member.voice.channel;
          if (!currentChannel) {
            console.log('Voice channel no longer exists, stopping vote');
            return collector.stop('channelGone');
          }
          
          // Get up-to-date voice channel members
          const voiceMembers = currentChannel.members;
          
          // Get all reactions to this message
          const userReactions = await reaction.users.fetch();
          
          // Filter valid votes: not the bot, not the target, and currently in the voice channel
          const validVotes = userReactions.filter(u => 
            u.id !== interaction.client.user.id && // Not the bot
            u.id !== targetUser.id && // Not the target
            voiceMembers.has(u.id) // Currently in the voice channel
          );
          
          // Get the current number of eligible voters (excluding target)
          const currentEligibleVoters = voiceMembers.filter(m => m.id !== targetUser.id).size;
          
          // Recalculate required votes based on current members
          const currentRequiredVotes = Math.ceil(currentEligibleVoters / 2);
          
          console.log(`Vote progress: ${validVotes.size}/${currentRequiredVotes} votes`);
          
          // Update the embed
          voteEmbed.setDescription(`${validVotes.size}/${currentEligibleVoters} votes to mute ${targetUser.toString()} (need ${currentRequiredVotes})`);
          await voteMessage.edit({ embeds: [voteEmbed] });
          
          // Check if we have enough votes
          if (validVotes.size >= currentRequiredVotes && !userMuted) {
            console.log(`Vote threshold met! Muting ${targetUser.username}`);
            userMuted = true;
            
            // Stop the collector - vote passed
            collector.stop('success');
          }
        } catch (error) {
          console.error('Error processing vote:', error);
        }
      });
      
      // Handle removed votes
      collector.on('remove', async (reaction, user) => {
        // Ignore reactions other than thumbs up
        if (reaction.emoji.name !== '👍') return;
        
        console.log(`Vote removed by ${user.tag}`);
        
        try {
          // Get current members in the voice channel
          const currentChannel = member.voice.channel;
          if (!currentChannel) return;
          
          // Get current voice channel members
          const voiceMembers = currentChannel.members;
          
          // Get all reactions to this message
          const userReactions = await reaction.users.fetch();
          
          // Filter valid votes: not the bot, not the target, and currently in the voice channel
          const validVotes = userReactions.filter(u => 
            u.id !== interaction.client.user.id && // Not the bot
            u.id !== targetUser.id && // Not the target
            voiceMembers.has(u.id) // Currently in the voice channel
          );
          
          // Get the current number of eligible voters (excluding target)
          const currentEligibleVoters = voiceMembers.filter(m => m.id !== targetUser.id).size;
          
          // Update the embed
          voteEmbed.setDescription(`${validVotes.size}/${currentEligibleVoters} votes to mute ${targetUser.toString()} (need ${Math.ceil(currentEligibleVoters / 2)})`);
          await voteMessage.edit({ embeds: [voteEmbed] });
        } catch (error) {
          console.error('Error processing vote removal:', error);
        }
      });
      
      // When the collection ends
      collector.on('end', async (collected, reason) => {
        console.log(`Vote collector ended with reason: ${reason}`);
        
        // Remove from active votes
        activeVoteMutes.delete(voteKey);
        
        // If the vote ended because it was successful, mute the user
        if (reason === 'success' || userMuted) {
          try {
            // Get up-to-date target member
            const freshTarget = await guild.members.fetch(targetUser.id);
            
            // Update the embed to show success
            voteEmbed.setColor('#00FF00');
            voteEmbed.setDescription(`Vote passed! ${targetUser.toString()} has been muted for 5 minutes`);
            await voteMessage.edit({ embeds: [voteEmbed] });
            
            // Add to muted users tracking
            addMutedUser(currentChannel, targetUser.id);
            
            // Mute the user in Discord if they're still in the voice channel
            if (freshTarget.voice.channel && freshTarget.voice.channel.id === currentChannel) {
              await freshTarget.voice.setMute(true, 'Vote mute');
              console.log(`Successfully muted ${targetUser.username} via vote`);
              
              // Send confirmation message to the channel
              await voiceChannel.send(`${targetUser.toString()} has been muted for 5 minutes by vote.`);
              
              // Set timeout to unmute after 5 minutes
              setTimeout(async () => {
                try {
                  // Check if the user is still in the channel and still muted
                  if (isUserMuted(currentChannel, targetUser.id)) {
                    // Remove from our tracking
                    removeMutedUser(currentChannel, targetUser.id);
                    
                    // Get fresh user data
                    const targetToUnmute = await guild.members.fetch(targetUser.id);
                    
                    // If they're still in the same voice channel, unmute them
                    if (targetToUnmute.voice.channel && targetToUnmute.voice.channel.id === currentChannel) {
                      await targetToUnmute.voice.setMute(false, 'Vote mute expired');
                      console.log(`Unmuted ${targetUser.username} after vote mute expired`);
                      
                      // Notify the channel
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
            } else {
              console.log(`Target ${targetUser.username} is no longer in the voice channel, mute will apply when they join`);
            }
          } catch (error) {
            console.error('Error muting user after successful vote:', error);
          }
        } else {
          // Vote failed
          voteEmbed.setColor('#888888');
          voteEmbed.setDescription(`Vote failed! Not enough votes to mute ${targetUser.toString()}`);
          await voteMessage.edit({ embeds: [voteEmbed] });
        }
      });
      
    } catch (error) {
      console.error('Error in vote mute command:', error);
      
      if (interaction.deferred) {
        await interaction.editReply({ content: 'There was an error processing the vote mute command.' }).catch(console.error);
      }
    }
  },
};