const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, GuildChannel } = require('discord.js');
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

    //Check if the user is the owner of the channel - SUBMODS CANNOT KICK
    if (channelOwners.get(currentChannel) !== member.id) {
        return interaction.reply({ content: 'You do not have permission to use this command. Only channel owners can kick users.', ephemeral: true });
    }

    //Prevent the user from kicking themselves
    if (member.id === target) {
        return interaction.reply({ content: 'You cannot kick yourself.', ephemeral: true });
    }

    //Prevent kicking the channel owner
    if (channelOwners.get(currentChannel) === target) {
        return interaction.reply({ content: 'You cannot kick the channel owner.', ephemeral: true });
    }

    //Submoderators check removed since submods can't kick

    try {
        //Check if the target user is in the same voice channel
        if (!targetnew.voice.channel || targetnew.voice.channel.id !== member.voice.channel.id) {
            return interaction.reply({ content: `<@${target}> is not in the voice channel.`, ephemeral: true });
        }
        else {
            targetnew.voice.disconnect();
            await interaction.reply({ content: `<@${target}> has been kicked from the channel.`, ephemeral: true });
                          // Log the kick action
              const targetChannel = guild.channels.cache.get(currentChannel);
              auditLogger.logUserKick(guild.id, targetChannel, targetnew.user, member.user);
        }

    } catch (error) {
      await interaction.reply({ content:`There was an error while using the command.`, ephemeral: true });
      console.log(error);
    }
  },
};