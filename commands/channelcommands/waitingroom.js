const { Client, SlashCommandBuilder, PermissionFlagsBits , ChannelType, GuildChannel } = require('discord.js');
require('dotenv').config();
const fs = require('node:fs');
const { channelOwners } = require('../../methods/channelowner');
const { waitingRoom } = require('../../methods/waitingRoom');
const FIELD_CATERGORYID_NAME = "CATEGORYID"
const FIELD_VOICECREATECHANNELID_NAME = "VOICECREATECHANNELID"

/* function  readSettingsFile()
 * 
 * description: Reads settings.cfg into a structure of the form {category, voiceChannelId}
 * 
 * parameters: None
 * 
 * Returns: A structure with the parameters category and voiceChannelId
 */
function readSettingsFile(guild)
{
    fileContents = fs.readFileSync(`./globalserversettings/setupsettings/${guild}/settings.cfg`, 'utf8')
    const lines = fileContents.split('\n')
    settingsFile = {}
    for (const line of lines)
    {
	if(line.startsWith(FIELD_CATERGORYID_NAME))
	{
	    settingsFile.category = getValueFromField(FIELD_CATERGORYID_NAME, line)
            
            if(!settingsFile.category)
                console.error(`Could not find the field ${FIELD_CATERGORYID_NAME}`)
	}
	else if(line.startsWith(FIELD_VOICECREATECHANNELID_NAME))
	{
	    settingsFile.voiceChannelId = getValueFromField(FIELD_VOICECREATECHANNELID_NAME, line)
            if(!settingsFile.voiceChannelId)
                console.error(`Could not find the field ${FIELD_VOICECREATECHANNELID_NAME}`)
	}
    }
    return settingsFile
}

/* function  getValueFromField(fieldName, line)
 * 
 * description: Gets the value assigned to a field.  Assumes one line in the format: <fieldName> = "<value>"
 * 
 * parameters: string fieldName: name of the field to get
 *             string line: line to get the field from
 * 
 * Returns: Null if the field cannot be found or the file otherwise does not match.  <value> if a match is found
 */
function getValueFromField(fieldName, line)
{
    re = RegExp('^' + fieldName + '\\s*=\\s*\"(.*)\"')
    matches = re.exec(line)
    
    if(matches == null)
    {
	return null // Group 1
    }
    else
    {
	return matches[1] // Group 1
    }
}

module.exports = {
  category: 'channelcommands',
  data: new SlashCommandBuilder()
    .setName('waitingroom')
    .setDescription('Toggle a waitng Room for the channel.')
    .addBooleanOption(option =>
        option.setName('toggle')
            .setDescription('Toggle the waiting room.')
            .setRequired(true)),
async execute(interaction) {
    const guild = interaction.guild
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.voice.channel) {
      return interaction.reply({ content: 'You must be in a voice channel to use this command.', ephemeral: true });
  }
    const currentChannel = member.voice.channel.id;
    const targetChannel = guild.channels.cache.get(currentChannel);
    const target = interaction.options.getBoolean('toggle');
    settings = readSettingsFile(guild.id)

    //Check if the user is in a voice channel
    if (!channelOwners.has(currentChannel)) {
        return interaction.reply({ content: 'You must be in a temporary channel.', ephemeral: true });
    }

    //Check if the user is the owner of the channel
    if (channelOwners.get(currentChannel) !== member.id) {
        return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    //Method to toggle the channel waiting room
    try {
      //If the waiting room toggle is set to true
      if (target) {
        // Grab position of the main channel and store it in a variable
        const positionMain = member.voice.channel.rawPosition;
        guild.channels.create( {
          name: `${member.user.username}'s Waiting Room`,
          type: ChannelType.GuildVoice,
          parent: settings.category,
          position: positionMain - 1,
        })
          .then(channel => {
            //Bind the waiting room to the channel
            waitingRoom.set(currentChannel, channel.id);
            interaction.reply({ content:`The waiting room has been created.`, ephemeral: true });

            // Set the channel permissions for @everyone 
            targetChannel.permissionOverwrites.edit(guild.roles.everyone, { Connect: false });

            // Add the User to the channel
            targetChannel.permissionOverwrites.edit(member, { Connect: true });

            // Add the Bot to the channel
            targetChannel.permissionOverwrites.edit(interaction.client.user, { Connect: true, ViewChannel: true });

          })
          .catch(error => {
            console.error('Error creating voice channel:', error);
          });
      } else {
        //If the waiting room toggle is set to false

        //Get the waiting room channel id from the collection
        const channelid = waitingRoom.get(currentChannel);
        
        //Get the channel object from the channel id
        const channel = guild.channels.cache.get(channelid);

        //Delete the waiting channel
        channel.delete();

        //Remove the waiting room from the waiting room collection
        waitingRoom.delete(currentChannel);
        interaction.reply({ content:`The waiting room has been deleted.`, ephemeral: true });

        // Remove the channel permissions for @everyone
        targetChannel.permissionOverwrites.delete(guild.roles.everyone);

        // Add the User to the channel
        targetChannel.permissionOverwrites.edit(member, { ViewChannel: true });

        // Add the Bot to the channel
        targetChannel.permissionOverwrites.edit(interaction.client.user, { Connect: true, ViewChannel: true, Speak: true });
      
      }


    } catch (error) {
      await interaction.reply({ content:`There was an error while using the command.`, ephemeral: true });
      console.log(error);
    }
  },
};