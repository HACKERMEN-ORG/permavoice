const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
require('dotenv').config();
const { channelOwners } = require('../../methods/channelowner');

// Import the submod manager correctly
let submodManager;
try {
  submodManager = require('../../methods/submodmanager');
} catch (error) {
  console.error('Error importing submodmanager:', error);
  // Create a placeholder if module doesn't exist yet
  submodManager = {
    isSubmod: () => false
  };
}

module.exports = {
  category: 'channelcommands',
  data: new SlashCommandBuilder()
    .setName('listbanned')
    .setDescription('Lists all users banned from the channel.'),
  async execute(interaction) {
    const guild = interaction.guild;
    const member = await interaction.guild.members.fetch(interaction.user.id);
    
    if (!member.voice.channel) {
      return interaction.reply({ content: 'You must be in a voice channel to use this command.', ephemeral: true });
    }
    
    const currentChannel = member.voice.channel.id;
    const targetChannel = guild.channels.cache.get(currentChannel);

    // Check if the user is in a temporary channel
    if (!channelOwners.has(currentChannel)) {
      return interaction.reply({ content: 'You must be in a temporary channel.', ephemeral: true });
    }

    // Check if the user is the owner of the channel or a submoderator
    if (channelOwners.get(currentChannel) !== member.id && !submodManager.isSubmod(currentChannel, member.id)) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    try {
      // Get all permission overwrites for the channel
      const permissionOverwrites = targetChannel.permissionOverwrites.cache;
      
      // Filter overwrites to only include banned users (users with Connect permission set to false)
      const bannedUsers = [];
      
      for (const [id, overwrite] of permissionOverwrites) {
        // Skip the @everyone role and the bot itself
        if (id === guild.roles.everyone.id || id === interaction.client.user.id) continue;
        
        // Check if the overwrite denies Connect permission
        if (overwrite.deny.has('Connect')) {
          try {
            // Try to fetch the user
            const user = await guild.members.fetch(id);
            bannedUsers.push(`<@${id}> (${user.user.tag})`);
          } catch (error) {
            // If user can't be fetched, just add the ID
            bannedUsers.push(`<@${id}> (User left server)`);
          }
        }
      }

      // Create an embed to display the banned users
      const embed = new EmbedBuilder()
        .setTitle('Banned Users')
        .setColor('#FF0000')
        .setDescription(bannedUsers.length > 0 
          ? bannedUsers.join('\n') 
          : 'No users are banned from this channel.')
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      console.error('Error listing banned users:', error);
      await interaction.reply({ content: 'There was an error while using the command.', ephemeral: true });
    }
  },
};