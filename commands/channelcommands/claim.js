// const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, GuildChannel } = require('discord.js');
// require('dotenv').config();
// const fs = require('node:fs');
// const wait = require('node:timers/promises').setTimeout;
// const { channelOwners } = require('../../methods/channelowner');
//
// module.exports = {
//   category: 'moderation',
//   data: new SlashCommandBuilder()
//     .setName('claim')
//     .setDescription('Transfer the ownership of a channel without an owner to yourself'),
//   async execute(interaction) {
//     const guild = interaction.guild
//     const member = await interaction.guild.members.fetch(interaction.user.id);
//     const memberid = interaction.user.id;
//     if (!member.voice.channel) {
//       return interaction.reply({ content: 'You must be in a voice channel to use this command.', ephemeral: true });
//   }
//     const currentChannel = member.voice.channel.id;
//     const targetChannel = guild.channels.cache.get(currentChannel);
//
//     //Check if the user is in a voice channel
//     if (!channelOwners.has(currentChannel)) {
//         return interaction.reply({ content: 'You must be in a temporary channel.', ephemeral: true });
//     }
//
//     //Check if the user is the owner of the channel
//     if (channelOwners.get(currentChannel) == member.id) {
//         return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
//     }
//
//     //Check if the channel original channel owner is still in the channel
//     if (targetChannel.members.has(channelOwners.get(currentChannel))) {
//         return interaction.reply({ content: 'The original channel owner is still in the channel.', ephemeral: true });
//     }
//
//     // Transfer the ownership of the channel to the target user
//
//     try {
//         targetChannel.permissionOverwrites.delete(interaction.user);
//         channelOwners.set(currentChannel, memberid);
//         targetChannel.permissionOverwrites.edit(member, { Connect: true, ViewChannel: true, Speak: true, ManageChannels: true });
//         await interaction.reply({ content:`Channel ownership has been transferred to you.`, ephemeral: true });
//       
//     } catch (error) {
//       await interaction.reply({ content:`There was an error while using the command.`, ephemeral: true });
//       console.log(error);
//     }
//   },
// };
