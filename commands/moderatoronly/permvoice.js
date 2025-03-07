const { Client, SlashCommandBuilder, PermissionFlagsBits , ChannelType, GuildChannel } = require('discord.js');
require('dotenv').config();
const fs = require('node:fs');
const Settings = require('../../Settings.js');

module.exports = {
  category: 'permanentvoice',
  data: new SlashCommandBuilder()
    .setName('permvoice')
    .setDescription('Change the user limit.')
    .addChannelOption(option =>
        option
          .setName('channel')
          .setDescription('The create voice channel id to use.')
          .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice, ChannelType.GuildText, ChannelType.GuildForum, ChannelType.GuildMedia, ChannelType.GuildAnnouncement)
          .setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(interaction) {
    const guild = interaction.guild
    const target = interaction.options.getChannel('channel');

    //Method to set the channel permanent status toggles
        try {
            Settings.togglePermVoiceChannel(guild.id, target);
            await interaction.reply({ content:`The channel ${target} has been toggled.`, ephemeral: true });
            
        } catch (error) {
          await interaction.reply({ content:`There was an error while using the command.`, ephemeral: true });
          console.log(error);
        }
    
  },
};