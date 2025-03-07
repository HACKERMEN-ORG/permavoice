const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, GuildChannel } = require('discord.js');
require('dotenv').config();
const { channelOwners } = require('../../methods/channelowner');

// Import the submod functions if they exist
let isSubmod;
try {
  const submodModule = require('../channelcommands/submod');
  isSubmod = submodModule.isSubmod;
} catch (error) {
  // Create placeholder function
  isSubmod = () => false;
  console.log('Submod module not available for kick command.');
}

module.exports = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kicks a user from the voice channel')
    .addUserOption(option =>
      option
        .setName('target')
        .setDescription('The user to kick.')
        .setRequired(true)),
  async execute(interaction) {
    const guild = interaction.guild
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.voice.channel) {
      return interaction.reply({ content: 'You must be in a voice channel to use this command.', ephemeral: true });
    }
    
    const currentChannel = member.voice.channel.id;
    const target = interaction.options.getUser('target').id;
    const targetnew = guild.members.cache.get(target);

    //Check if the user is in the voice channel
    if (!channelOwners.has(currentChannel)) {
        return interaction.reply({ content: 'You must be in a temporary channel.', ephemeral: true });
    }

    //Check if the user is the owner of the channel or a submoderator
    if (channelOwners.get(currentChannel) !== member.id && !isSubmod(currentChannel, member.id)) {
        return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    //Prevent the user from kicking themselves
    if (member.id === target) {
        return interaction.reply({ content: 'You cannot kick yourself.', ephemeral: true });
    }

    //Prevent kicking the channel owner
    if (channelOwners.get(currentChannel) === target) {
        return interaction.reply({ content: 'You cannot kick the channel owner.', ephemeral: true });
    }

    //Prevent submoderators from kicking other submoderators
    if (isSubmod(currentChannel, target) && channelOwners.get(currentChannel) !== member.id) {
        return interaction.reply({ content: 'Submoderators cannot kick other submoderators. Only the channel owner can do that.', ephemeral: true });
    }

    try {
        //Check if the target user is in the same voice channel
        if (!targetnew.voice.channel || targetnew.voice.channel.id !== member.voice.channel.id) {
            return interaction.reply({ content: `<@${target}> is not in the voice channel.`, ephemeral: true });
        }
        else {
            targetnew.voice.disconnect();
            await interaction.reply({ content: `<@${target}> has been kicked from the channel.`, ephemeral: true });
        }

    } catch (error) {
      await interaction.reply({ content:`There was an error while using the command.`, ephemeral: true });
      console.log(error);
    }
  },
};