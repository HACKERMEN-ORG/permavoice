const { Client, SlashCommandBuilder, PermissionFlagsBits , ChannelType, GuildChannel } = require('discord.js');
require('dotenv').config();
const { channelOwners } = require('../../methods/channelowner');

module.exports = {
  category: 'channelcommands',
  data: new SlashCommandBuilder()
    .setName('region')
    .setDescription('The region for the channel.')
    .addStringOption(option =>
			option.setName('region')
				.setDescription('The region for the channel. Leave Empty for default.')
				.setRequired(false)
				.addChoices(
					{ name: 'Brazil', value: 'brazil' },
          { name: 'Hong Kong', value: 'hongkong' },
          { name: 'India', value: 'india' },
          { name: 'Japan', value: 'japan' },
          { name: 'Rotterdam', value: 'rotterdam' },
          { name: 'Russia', value: 'russia' },
          { name: 'Singapore', value: 'singapore' },
          { name: 'South Africa', value: 'south-africa' },
          { name: 'Sydney', value: 'sydney' },
          { name: 'US Central', value: 'us-central' },
          { name: 'US East', value: 'us-east' },
          { name: 'US South', value: 'us-south' },
          { name: 'US West', value: 'us-west' },
				)),
async execute(interaction) {
    const guild = interaction.guild
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const voiceregion = interaction.options.getString('region');
    if (!member.voice.channel) {
      return interaction.reply({ content: 'You must be in a voice channel to use this command.', ephemeral: true });
  }
    const currentChannel = member.voice.channel.id;
    const targetChannel = guild.channels.cache.get(currentChannel);

    //Check if the user is in a voice channel
    if (!channelOwners.has(currentChannel)) {
        return interaction.reply({ content: 'You must be in a temporary channel.', ephemeral: true });
    }

    //Check if the user is the owner of the channel
    if (channelOwners.get(currentChannel) !== member.id) {
        return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    //Method to set the channel permanet status toggles
        try {
            try {
                await targetChannel.setRTCRegion(voiceregion);
                console.log(voiceregion);
                if (voiceregion === null) {
                  await interaction.reply({ content: `The region for the channel has been set to Automatic.`, ephemeral: true });
                } else {
                  await interaction.reply({ content: `The region for the channel has been set to ${voiceregion}.`, ephemeral: true });
                }
            } catch (error) {
              await targetChannel.setRTCRegion(null);
                await interaction.reply({ content:`The region for the channel has been set to Automatic.`, ephemeral: true });
            }
            
        } catch (error) {
          await interaction.reply({ content:`There was an error while using the command.`, ephemeral: true });
          console.log(error);
        }
    
  },
};