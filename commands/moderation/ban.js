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
  console.log('Submod module not available for ban command.');
}

module.exports = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bans a user from the voice channel')
    .addUserOption(option =>
      option
        .setName('target')
        .setDescription('The user to ban.')
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
        return interaction.reply({ content: 'You must be in a owned channel.', ephemeral: true });
    }

    //Check if the user is the owner of the channel or a submoderator
    if (channelOwners.get(currentChannel) !== member.id && !isSubmod(currentChannel, member.id)) {
        return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    //Prevent the user from banning themselves
    if (member.id === target) {
        return interaction.reply({ content: 'You cannot ban yourself.', ephemeral: true });
    }

    //Prevent banning the channel owner
    if (channelOwners.get(currentChannel) === target) {
        return interaction.reply({ content: 'You cannot ban the channel owner.', ephemeral: true });
    }

    //Prevent submoderators from banning other submoderators
    if (isSubmod(currentChannel, target) && channelOwners.get(currentChannel) !== member.id) {
        return interaction.reply({ content: 'Submoderators cannot ban other submoderators. Only the channel owner can do that.', ephemeral: true });
    }

    //Prevent the user from banning this bot from the channel
    if (target === interaction.client.user.id) {
        return interaction.reply({ content: 'You cannot ban me from the channel.', ephemeral: true });
    }

    try {
        //Set the target users PermissionsBitField for the channel
        const targetChannel = guild.channels.cache.get(currentChannel);
        // edits overwrites to allow a user to not connect to the channel
        targetChannel.permissionOverwrites.edit(target, { Connect: false, ViewChannel: false });
        //Check if the target user is in the same voice channel
        if (targetnew.voice.channel && targetnew.voice.channel.id === member.voice.channel.id) {
            targetnew.voice.disconnect();
            await interaction.reply({ content: `<@${target}> has been kicked from the channel.`, ephemeral: true });
            await interaction.followUp({ content: `<@${target}> has been banned from the channel.`, ephemeral: true });
        }
        else{
            await interaction.reply({ content: `<@${target}> has been banned from the channel.`, ephemeral: true });
        }

    } catch (error) {
      await interaction.reply({ content:`There was an error while using the command.`, ephemeral: true });
      console.log(error);
    }
  },
};