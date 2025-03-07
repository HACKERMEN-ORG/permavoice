const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
require('dotenv').config();
const { channelOwners } = require('../../methods/channelowner');
const { getMutedUsers } = require('../../methods/channelMutes');

module.exports = {
  category: 'channelcommands',
  data: new SlashCommandBuilder()
    .setName('listmuted')
    .setDescription('List all users muted in your channel.'),
  async execute(interaction) {
    const guild = interaction.guild;
    const member = await interaction.guild.members.fetch(interaction.user.id);
    
    if (!member.voice.channel) {
      return interaction.reply({ content: 'You must be in a voice channel to use this command.', ephemeral: true });
    }
    
    const currentChannel = member.voice.channel.id;

    // Check if the user is in a temporary channel
    if (!channelOwners.has(currentChannel)) {
      return interaction.reply({ content: 'You must be in a temporary channel.', ephemeral: true });
    }

    // Check if the user is the owner of the channel
    if (channelOwners.get(currentChannel) !== member.id) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    try {
      // Get all muted users for this channel
      const mutedUsers = getMutedUsers(currentChannel);
      
      if (mutedUsers.size === 0) {
        return interaction.reply({ content: 'No users are currently muted in this channel.', ephemeral: true });
      }
      
      // Create an embed to display the muted users
      const embed = new EmbedBuilder()
        .setTitle('Muted Users')
        .setColor('#FF0000')
        .setDescription('The following users are muted in this channel:')
        .setTimestamp();
      
      // Add fields for each muted user
      const promises = Array.from(mutedUsers).map(async userId => {
        try {
          const user = await guild.members.fetch(userId);
          return `<@${userId}> (${user.user.tag})`;
        } catch (err) {
          return `<@${userId}> (User left server)`;
        }
      });
      
      const userMentions = await Promise.all(promises);
      embed.addFields({ name: 'Users', value: userMentions.join('\n') });
      
      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      console.error('Error listing muted users:', error);
      await interaction.reply({ content: 'There was an error while using the command.', ephemeral: true });
    }
  },
};
