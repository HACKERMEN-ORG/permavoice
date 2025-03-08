const { SlashCommandBuilder } = require('discord.js');
require('dotenv').config();
const { channelOwners } = require('../../methods/channelowner');

// Import the submod manager
let submodManager;
try {
  submodManager = require('../../methods/submodmanager');
} catch (error) {
  console.error('Error importing submodmanager:', error);
  // Create a placeholder if module doesn't exist yet
  submodManager = {
    addSubmod: () => true,
    isSubmod: () => false
  };
}

module.exports = {
  category: 'channelcommands',
  data: new SlashCommandBuilder()
    .setName('submod')
    .setDescription('Add a submoderator to the channel')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to make a submoderator.')
        .setRequired(true)),
  async execute(interaction) {
    // Defer reply to prevent timeout
    await interaction.deferReply({ ephemeral: true });
    
    try {
      const guild = interaction.guild;
      const member = await interaction.guild.members.fetch(interaction.user.id);
      
      if (!member.voice.channel) {
        return await interaction.editReply({ content: 'You must be in a voice channel to use this command.' });
      }
      
      const currentChannel = member.voice.channel.id;
      const targetUser = interaction.options.getUser('user');
      
      // Check if the user is in a temporary channel
      if (!channelOwners.has(currentChannel)) {
        return await interaction.editReply({ content: 'You must be in a temporary channel.' });
      }

      // Check if the user is the owner of the channel
      if (channelOwners.get(currentChannel) !== member.id) {
        return await interaction.editReply({ content: 'You do not have permission to use this command.' });
      }

      // Prevent the user from adding themselves as a submod
      if (member.id === targetUser.id) {
        return await interaction.editReply({ content: 'You are already the channel owner and do not need to be a submoderator.' });
      }

      // Prevent the user from adding the bot as a submod
      if (targetUser.id === interaction.client.user.id) {
        return await interaction.editReply({ content: 'You cannot add the bot as a submoderator.' });
      }

      // Check if the user is already a submod
      if (submodManager.isSubmod(currentChannel, targetUser.id)) {
        return await interaction.editReply({ content: `${targetUser.username} is already a submoderator in this channel.` });
      }
      
      // Add the user as a submod
      submodManager.addSubmod(currentChannel, targetUser.id);
      
      // Set permissions for the submoderator - removing elevated permissions
      const targetChannel = guild.channels.cache.get(currentChannel);
      await targetChannel.permissionOverwrites.edit(targetUser.id, { 
        Connect: true, 
        ViewChannel: true, 
        Speak: true
        // Removed: MuteMembers, DeafenMembers, MoveMembers permissions
      });
      
      console.log(`Added ${targetUser.id} as submod to channel ${currentChannel}`);
      return await interaction.editReply({ content: `${targetUser.username} has been added as a submoderator in this channel.` });
    } catch (error) {
      console.error('Error in submod command:', error);
      
      if (interaction.deferred) {
        await interaction.editReply({ content: 'There was an error while using the command.' }).catch(console.error);
      }
    }
  },
};