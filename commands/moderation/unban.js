const { Client, SlashCommandBuilder, PermissionsBitField, ChannelType, GuildChannel } = require('discord.js');
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
  console.log('Submod module not available for unban command.');
}

module.exports = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unbans a user from the voice channel')
    .addUserOption(option =>
      option
        .setName('target')
        .setDescription('The user to unban.')
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

    //Check if the user is in a voice channel
    if (!channelOwners.has(currentChannel)) {
        return interaction.reply({ content: 'You must be in a temporary channel.', ephemeral: true });
    }

    //Check if the user is the owner of the channel or a submoderator
    if (channelOwners.get(currentChannel) !== member.id && !isSubmod(currentChannel, member.id)) {
        return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    //Prevent the user from unbanning themselves
    if (member.id === target) {
        return interaction.reply({ content: 'You cannot unban yourself.', ephemeral: true });
    }

    //Prevent the user from unbanning the bot from the channel
    if (target === interaction.client.user.id) {
        return interaction.reply({ content: 'I cannot be banned from the channel.', ephemeral: true });
    }

    try {
        //Set the target users PermissionsBitField for the channel
        const targetChannel = guild.channels.cache.get(currentChannel);
        // delete overwrites to allow a user to connect to the channel
        targetChannel.permissionOverwrites.delete(target);

        await interaction.reply({ content: `<@${target}> has been unbanned from the channel.`, ephemeral: true });
        

    } catch (error) {
      await interaction.reply({ content:`There was an error while using the command.`, ephemeral: true });
      console.log(error);
    }
  },
};