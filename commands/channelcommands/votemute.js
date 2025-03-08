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
      
      // Add reaction for voting
      await voteMessage.react('👍');
      
      // Set up flags and timeouts
      let voteComplete = false;
      let collectTimeout = null;
      activeVoteMutes.set(voteKey, true);

      // Function to execute mute
      async function executeVoteMute() {
        if (voteComplete) return; // Prevent double execution
        voteComplete = true;
        
        console.log(`EXECUTING VOTE MUTE for ${targetUser.tag}`);
        
        // Clear any pending timeouts
        if (collectTimeout) clearTimeout(collectTimeout);
        
        try {
          // Update embed to show success
          voteEmbed.setDescription(`Vote passed! ${targetUser.toString()} has been muted for 5 minutes`);
          voteEmbed.setColor('#00FF00');
          await interaction.editReply({ embeds: [voteEmbed] });
          
          // Register the mute in our tracking system
          addMutedUser(currentChannel, targetUser.id);
          
          // Get fresh user data
          const freshTargetMember = await guild.members.fetch(targetUser.id);
          
          // Apply the mute if they're still in the channel
          if (freshTargetMember.voice.channel && freshTargetMember.voice.channel.id === currentChannel) {
            await freshTargetMember.voice.setMute(true, 'Vote mute');
            console.log(`Successfully applied server mute to ${targetUser.tag}`);
            
            // Send confirmation to the channel
            await voiceChannel.send(`${targetUser.toString()} has been muted for 5 minutes by vote.`);
          }
          
          // Set timeout to automatically unmute after 5 minutes
          setTimeout(async () => {
            try {
              // Only proceed if the user is still marked as muted
              if (isUserMuted(currentChannel, targetUser.id)) {
                console.log(`Unmuting ${targetUser.tag} after timeout`);
                
                // Remove from mute tracking
                removeMutedUser(currentChannel, targetUser.id);
                
                // Get fresh user data
                const userToUnmute = await guild.members.fetch(targetUser.id);
                
                // Unmute if still in the channel
                if (userToUnmute.voice.channel && userToUnmute.voice.channel.id === currentChannel) {
                  await userToUnmute.voice.setMute(false, 'Vote mute expired');
                  
                  // Notify the channel
                  await voiceChannel.send(`The vote mute for ${targetUser.toString()} has expired.`);
                }
              }
            } catch (error) {
              console.error('Error unmuting user after timeout:', error);
            }
          }, 5 * 60 * 1000); // 5 minutes
        } catch (error) {
          console.error('Error executing vote mute:', error);
        }
        
        // Clean up
        activeVoteMutes.delete(voteKey);
      }
      
      // Function to end with failed vote
      async function endWithFailedVote() {
        if (voteComplete) return; // Don't do anything if vote already completed
        voteComplete = true;
        
        console.log(`Vote failed for ${targetUser.tag}`);
        
        try {
          // Update embed to show failure
          voteEmbed.setDescription(`Vote failed! Not enough votes to mute ${targetUser.toString()}`);
          voteEmbed.setColor('#888888');
          await interaction.editReply({ embeds: [voteEmbed] });
        } catch (error) {
          console.error('Error updating failed vote embed:', error);
        }
        
        // Clean up
        activeVoteMutes.delete(voteKey);
      }
      
      // Direct vote check function
      async function checkVotes() {
        // If vote already completed, do nothing
        if (voteComplete) return;
        
        try {
          // Get fresh message with reactions
          const message = await interaction.fetchReply();
          const reaction = message.reactions.cache.get('👍');
          
          if (!reaction) {
            console.log('No reactions found on vote message');
            return;
          }
          
          // Get users who reacted
          const users = await reaction.users.fetch();
          
          // Get fresh voice channel members
          const voiceChannel = guild.channels.cache.get(currentChannel);
          if (!voiceChannel) {
            console.log('Voice channel no longer exists');
            return endWithFailedVote();
          }
          
          // Filter to get only valid votes
          const validVoters = users.filter(user => 
            user.id !== interaction.client.user.id && // Not the bot
            user.id !== targetUser.id && // Not the target
            voiceChannel.members.has(user.id) // Currently in the voice channel
          );
          
          // Calculate current requirements
          const currentMembers = voiceChannel.members.filter(m => m.id !== targetUser.id);
          const currentRequired = Math.ceil(currentMembers.size / 2);
          
          console.log(`Current vote count: ${validVoters.size}/${currentRequired}`);
          
          // Update the embed with current counts
          if (!voteComplete) {
            voteEmbed.setDescription(`${validVoters.size}/${currentMembers.size} votes to mute ${targetUser.toString()} (need ${currentRequired})`);
            await interaction.editReply({ embeds: [voteEmbed] });
          }
          
          // Check if vote passes
          if (validVoters.size >= currentRequired) {
            console.log('VOTE THRESHOLD MET - Executing mute immediately');
            await executeVoteMute();
          }
        } catch (error) {
          console.error('Error checking votes:', error);
        }
      }

      // Set vote end timeout (20 seconds)
      collectTimeout = setTimeout(async () => {
        console.log('Vote time expired (20 seconds)');
        
        // Do one final vote check
        try {
          // Get fresh message with reactions
          const message = await interaction.fetchReply();
          const reaction = message.reactions.cache.get('👍');
          
          if (!reaction) {
            return endWithFailedVote();
          }
          
          // Get users who reacted
          const users = await reaction.users.fetch();
          
          // Get fresh voice channel members
          const voiceChannel = guild.channels.cache.get(currentChannel);
          if (!voiceChannel) {
            return endWithFailedVote();
          }
          
          // Filter to get only valid votes
          const validVoters = users.filter(user => 
            user.id !== interaction.client.user.id && // Not the bot
            user.id !== targetUser.id && // Not the target
            voiceChannel.members.has(user.id) // Currently in the voice channel
          );
          
          // Calculate current requirements
          const currentMembers = voiceChannel.members.filter(m => m.id !== targetUser.id);
          const currentRequired = Math.ceil(currentMembers.size / 2);
          
          console.log(`Final vote count: ${validVoters.size}/${currentRequired}`);
          
          // Check if vote passes
          if (validVoters.size >= currentRequired) {
            await executeVoteMute();
          } else {
            await endWithFailedVote();
          }
        } catch (error) {
          console.error('Error in final vote check:', error);
          await endWithFailedVote();
        }
      }, 20000);
      
      // Set up a collector to watch for reaction changes
      const filter = (reaction, user) => reaction.emoji.name === '👍';
      const collector = voteMessage.createReactionCollector({ filter, time: 20000 });
      
      // When a new reaction is added
      collector.on('collect', async (reaction, user) => {
        console.log(`Vote received from ${user.tag}`);
        
        // Don't process if vote already completed
        if (voteComplete) return;
        
        // Check if this vote makes us reach the threshold
        await checkVotes();
      });
      
      // When a reaction is removed
      collector.on('remove', async (reaction, user) => {
        console.log(`Vote removed by ${user.tag}`);
        
        // Don't process if vote already completed
        if (voteComplete) return;
        
        // Update vote count
        await checkVotes();
      });
      
      // Initial vote count - Count the initiator's vote too
      setTimeout(() => checkVotes(), 1000);
      
    } catch (error) {
      console.error('Error in vote mute command:', error);
      
      if (interaction.deferred) {
        await interaction.editReply({ content: 'There was an error while processing the vote mute command.' }).catch(console.error);
      }
    }
  },
};