const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
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
    getSubmods: () => new Set(),
    isSubmod: () => false
  };
}

module.exports = {
  category: 'channelcommands',
  data: new SlashCommandBuilder()
    .setName('listsubmods')
    .setDescription('List all submoderators in your channel.'),
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

    // Check if the user is the owner of the channel or a submoderator
    if (channelOwners.get(currentChannel) !== member.id && !submodManager.isSubmod(currentChannel, member.id)) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    try {
      // Get all submods for this channel
      const submods = submodManager.getSubmods(currentChannel);
      
      if (submods.size === 0) {
        return interaction.reply({ content: 'No submoderators have been added to this channel.', ephemeral: true });
      }
      
      // Create an embed to display the submods
      const embed = new EmbedBuilder()
        .setTitle('Channel Submoderators')
        .setColor('#00FF00')
        .setDescription('The following users are submoderators in this channel:')
        .setTimestamp();
      
      // Add fields for each submod
      const promises = Array.from(submods).map(async userId => {
        try {
          const user = await guild.members.fetch(userId);
          return `<@${userId}> (${user.user.tag})`;
        } catch (err) {
          return `<@${userId}> (User left server)`;
        }
      });
      
      const userMentions = await Promise.all(promises);
      embed.addFields({ name: 'Submoderators', value: userMentions.join('\n') });
      
      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      console.error('Error listing submoderators:', error);
      await interaction.reply({ content: 'There was an error while using the command.', ephemeral: true });
    }
  },
};