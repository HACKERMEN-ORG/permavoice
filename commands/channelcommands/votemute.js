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
      
      // Count users in the voice channel (for determining vote threshold)
      const voiceChannel = guild.channels.cache.get(currentChannel);
      const memberCount = voiceChannel.members.size;
      
      // Need at least 3 people in the channel for a vote
      if (memberCount < 3) {
        return await interaction.editReply({ content: 'There need to be at least 3 people in the channel to start a vote mute.' });
      }
      
      // Calculate required votes (50% of members, excluding the target)
      const requiredVotes = Math.ceil((memberCount - 1) / 2);
      
      // Create vote embed
      const voteEmbed = new EmbedBuilder()
        .setTitle('Vote Mute')
        .setDescription(`Vote to mute ${targetUser.toString()} for 5 minutes.\n\nRequired votes: ${requiredVotes}`)
        .setColor('#FF0000')
        .setFooter({ text: 'React with 👍 to vote.' })
        .setTimestamp();
      
      // Send the vote message
      const voteMessage = await interaction.editReply({ content: '', embeds: [voteEmbed] });
      
      // Add the reaction for voting
      await voteMessage.react('👍');
      
      // Set up a collector for the reactions
      const filter = (reaction, user) => {
        // Only count votes from users in the voice channel, excluding the target
        const votingMember = guild.members.cache.get(user.id);
        return reaction.emoji.name === '👍' && 
               !user.bot && 
               votingMember.voice.channelId === currentChannel &&
               user.id !== targetUser.id;
      };
      
      // The vote will last for 60 seconds or until enough votes are collected
      const collector = voteMessage.createReactionCollector({ filter, time: 60000 });
      
      // Track this vote in the active votes map
      activeVoteMutes.set(voteKey, { 
        initiator: member.id, 
        target: targetUser.id,
        message: voteMessage,
        collector: collector
      });
      
      // When votes are collected
      collector.on('collect', async (reaction, user) => {
        const currentVotes = reaction.count - 1; // Subtract 1 for the bot's reaction
        
        // Update the embed with current vote count
        voteEmbed.setDescription(`Vote to mute ${targetUser.toString()} for 5 minutes.\n\nVotes: ${currentVotes}/${requiredVotes}`);
        await voteMessage.edit({ embeds: [voteEmbed] });
        
        // If we have enough votes, mute the user
        if (currentVotes >= requiredVotes) {
          collector.stop('success');
        }
      });
      
      // When the collection ends
      collector.on('end', async (collected, reason) => {
        // Remove from active votes
        activeVoteMutes.delete(voteKey);
        
        const votes = collected.first()?.count - 1 || 0;
        
        if (reason === 'success') {
          // Vote passed - mute the user
          try {
            // Update embed to show vote passed
            voteEmbed.setDescription(`Vote passed! ${targetUser.toString()} has been muted for 5 minutes.\n\nFinal votes: ${votes}/${requiredVotes}`);
            voteEmbed.setColor('#00FF00');
            await voteMessage.edit({ embeds: [voteEmbed] });
            
            // Apply the mute
            addMutedUser(currentChannel, targetUser.id);
            
            // Mute the user if they're still in the channel
            if (targetMember.voice.channel && targetMember.voice.channel.id === currentChannel) {
              await targetMember.voice.setMute(true, 'Vote mute');
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
          } catch (muteError) {
            console.error('Error applying vote mute:', muteError);
            voteEmbed.setDescription(`Error applying vote mute: ${muteError.message}`);
            voteEmbed.setColor('#FF0000');
            await voteMessage.edit({ embeds: [voteEmbed] });
          }
        } else if (reason === 'time') {
          // Vote failed due to timeout
          voteEmbed.setDescription(`Vote failed! Not enough votes to mute ${targetUser.toString()}.\n\nFinal votes: ${votes}/${requiredVotes}`);
          voteEmbed.setColor('#888888');
          await voteMessage.edit({ embeds: [voteEmbed] });
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
