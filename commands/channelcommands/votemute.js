
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
    const requestedTimeout = interaction.options.getInteger('duration') || 5;

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
     
      const displayedRequiredVotes = requiredVotes + 1;
      // Create vote embed
      const voteEmbed = new EmbedBuilder()
        .setTitle('Vote Mute')
        .setDescription(`${displayedRequiredVotes} votes required to mute ${targetUser.toString()}\nVote ends in 20 seconds`)
        .setColor('#FF0000')
        .setFooter({ text: 'React with 👍 to vote' })
        .setTimestamp();
      
      // Send the vote message
      const voteMessage = await interaction.editReply({ embeds: [voteEmbed] });
      
      // Add the reaction for voting
      await voteMessage.react('👍');
      
      // Fetch the message to ensure we have access to the reaction
      const fetchedMessage = await interaction.fetchReply();
      
      // The vote will last for 20 seconds or until enough votes are collected
      const collector = fetchedMessage.createReactionCollector({
        time: 20000, // 20 seconds
        dispose: true // Make sure we handle reaction removals
      });

      // Track this vote in the active votes map
      activeVoteMutes.set(voteKey, { 
        initiator: member.id, 
        target: targetUser.id,
        message: fetchedMessage,
        collector: collector
      });

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
        
        return validVotes.size;
      }
      
      // Function to update the embed with current vote count
      async function updateEmbed(validVotes) {
        // Get fresh data about who's in the voice channel
        const freshVoiceChannel = guild.channels.cache.get(currentChannel);
        if (!freshVoiceChannel) return;
        
        const currentVoiceMembers = freshVoiceChannel.members;
        const currentEligibleVoters = currentVoiceMembers.filter(m => m.id !== targetUser.id).size;
        
        // Recalculate required votes if people left
        const currentRequiredVotes = Math.ceil(currentEligibleVoters / 2);
        
        // Update the embed with current vote count
        voteEmbed.setDescription(`${validVotes}/${currentEligibleVoters}:thumbsup: to mute ${targetUser.toString()} (need ${currentRequiredVotes})`);
        await fetchedMessage.edit({ embeds: [voteEmbed] });
        
        console.log(`Updated embed - Votes: ${validVotes}/${currentRequiredVotes}`);
        
        // Return the current required votes for reference
        return currentRequiredVotes;
      }

      // When reactions are collected
      collector.on('collect', async (reaction, user) => {
        if (reaction.emoji.name === '👍') {
          try {
            console.log(`Vote collected from ${user.username}`);
            
            // Count valid votes
            const validVotes = await countValidVotes(reaction);
            
            // Update the embed and get current required votes
            const currentRequiredVotes = await updateEmbed(validVotes);
            
            // If we have enough votes, end the vote immediately
            if (validVotes >= currentRequiredVotes) {
              console.log(`Required votes met: ${validVotes}/${currentRequiredVotes}. Stopping collector.`);
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
            // Count valid votes
            const validVotes = await countValidVotes(reaction);
            
            // Update the embed
            await updateEmbed(validVotes);
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
        
        // Get one last count of votes for decision making
        let finalVotes = 0;
        let finalRequiredVotes = 0;
        let voteSucceeded = false;
        
        try {
          // Get fresh data
          const finalMessage = await interaction.fetchReply();
          const thumbsUpReaction = finalMessage.reactions.cache.get('👍');
          
          if (thumbsUpReaction) {
            // Count valid votes one last time
            finalVotes = await countValidVotes(thumbsUpReaction);
            
            // Get fresh voice channel data
            const freshVoiceChannel = guild.channels.cache.get(currentChannel);
            if (freshVoiceChannel) {
              const currentVoiceMembers = freshVoiceChannel.members;
              const finalEligibleVoters = currentVoiceMembers.filter(m => m.id !== targetUser.id).size;
              finalRequiredVotes = Math.ceil(finalEligibleVoters / 2);
              
              // Check if threshold is met
              voteSucceeded = finalVotes >= finalRequiredVotes;
            }
          }
        } catch (error) {
          console.error('Error getting final vote count:', error);
        }
        
        // Handle the outcome of the vote
        if (reason === 'success' || voteSucceeded) {
          // Vote passed - mute the user
          try {
            // Update embed to show vote passed
            voteEmbed.setDescription(`Vote passed! ${targetUser.toString()} has been muted for 5 minutes`);
            voteEmbed.setColor('#00FF00');
            await fetchedMessage.edit({ embeds: [voteEmbed] });
            
            // Apply the mute
            addMutedUser(currentChannel, targetUser.id);
            
            // Mute the user if they're still in the channel
            try {
              const freshTargetMember = await guild.members.fetch(targetUser.id);
              if (freshTargetMember.voice.channel && freshTargetMember.voice.channel.id === currentChannel) {
                await freshTargetMember.voice.setMute(true, 'Vote mute');
                console.log(`User ${targetUser.id} muted by vote`);
              }
            } catch (muteError) {
              console.error('Error muting user:', muteError);
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
            }, requestedTimeout * 60 * 1000); // 5 minutes
          } catch (muteError) {
            console.error('Error applying vote mute:', muteError);
            voteEmbed.setDescription(`Error applying vote mute: ${muteError.message}`);
            voteEmbed.setColor('#FF0000');
            await fetchedMessage.edit({ embeds: [voteEmbed] });
          }
        } else {
          // Vote failed due to timeout or not enough votes
          voteEmbed.setDescription(`Vote failed! Not enough votes to mute ${targetUser.toString()}`);
          voteEmbed.setColor('#888888');
          await fetchedMessage.edit({ embeds: [voteEmbed] });
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


