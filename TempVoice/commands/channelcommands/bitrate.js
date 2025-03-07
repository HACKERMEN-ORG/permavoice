  const { Client, SlashCommandBuilder, PermissionFlagsBits , ChannelType, GuildChannel } = require('discord.js');
  require('dotenv').config();
  const { channelOwners } = require('../../methods/channelowner');
  const { max } = require('lodash');

  module.exports = {
  category: 'channelcommands',
  data: new SlashCommandBuilder()
    .setName('bitrate')
    .setDescription('The bitrate for the channel.')
    .addIntegerOption(option =>
        option.setName('kbps')
            .setDescription('The bitrate for the channel specified in kbps.')
            .setRequired(true)
            .setMinValue(8)
            .setMaxValue(384)),
  async execute(interaction) {
    const guild = interaction.guild
    maxbitrate = guild.maximumBitrate;
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.voice.channel) {
      return interaction.reply({ content: 'You must be in a voice channel to use this command.', ephemeral: true });
  }
    const currentChannel = member.voice.channel.id;
    const kbps = interaction.options.getInteger('kbps')

    //Check if the user is in a voice channel
    if (!channelOwners.has(currentChannel)) {
        return interaction.reply({ content: 'You must be in a temporary channel.', ephemeral: true });
    }

    //Check if the user is the owner of the channel
    if (channelOwners.get(currentChannel) !== member.id) {
        return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    //Method to set the channel bitrate
        try {
          await member.voice.channel.setBitrate(Math.min(kbps * 1000, maxbitrate));
          if ((1000 * kbps) > maxbitrate) { 
              return interaction.reply({ content: `the bitrate requested was over the limit, and therefore adjusted to ${maxbitrate/1000} kbps`, ephemeral: true });
          } else {
              return interaction.reply({ content: `the bitrate was set to ${kbps} kbps`, ephemeral: true });
          }
        } catch (error) {
          await interaction.reply({ content:`There was an error while using the command.`, ephemeral: true });
          console.log(error);
        }
    
  },
  };