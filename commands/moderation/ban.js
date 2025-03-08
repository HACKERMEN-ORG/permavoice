const { Client, SlashCommandBuilder, PermissionsBitField, ChannelType, GuildChannel } = require('discord.js');
require('dotenv').config();
const { channelOwners } = require('../../methods/channelowner');
const auditLogger = require('../../methods/auditLogger');


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

    //Check if the user is the owner of the channel - SUBMODS CANNOT BAN
    if (channelOwners.get(currentChannel) !== member.id) {
        return interaction.reply({ content: 'You do not have permission to use this command. Only channel owners can ban users.', ephemeral: true });
    }

    //Prevent the user from banning themselves
    if (member.id === target) {
        return interaction.reply({ content: 'You cannot ban yourself.', ephemeral: true });
    }

    //Prevent banning the channel owner
    if (channelOwners.get(currentChannel) === target) {
        return interaction.reply({ content: 'You cannot ban the channel owner.', ephemeral: true });
    }

    //Prevent submoderators from banning other submoderators - no longer needed since submods can't ban
    
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
            // Log the ban action
            auditLogger.logUserBan(guild.id, targetChannel, targetnew.user, member.user);
        }
        else{
            await interaction.reply({ content: `<@${target}> has been banned from the channel.`, ephemeral: true });
            // Log the ban action
            auditLogger.logUserBan(guild.id, targetChannel, targetnew.user, member.user);
        }

    } catch (error) {
      await interaction.reply({ content:`There was an error while using the command.`, ephemeral: true });
      console.log(error);
    }
  },
};