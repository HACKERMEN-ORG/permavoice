const { Client, SlashCommandBuilder, PermissionFlagsBits , ChannelType, GuildChannel, PermissionsBitField } = require('discord.js');
require('dotenv').config();
const fs = require('node:fs');
const wait = require('node:timers/promises').setTimeout;
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
    .setName('untrust')
    .setDescription('Untrusts a user to a channel.')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('The user to untrust.')
            .setRequired(true)),
async execute(interaction) {
    const guild = interaction.guild
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.voice.channel) {
        return interaction.reply({ content: 'You must be in a voice channel to use this command.', ephemeral: true });
    }
    const currentChannel = member.voice.channel.id;
    const targetChannel = guild.channels.cache.get(currentChannel);
    const target = interaction.options.getUser('user').id;
    targetuser = guild.members.cache.get(target);
    settings = readSettingsFile(guild.id)
    targetPerms = targetChannel.permissionsFor(targetuser).bitfield
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
        //Untrust the user
        targetChannel.permissionOverwrites.delete(targetuser);
        await interaction.reply({ content: `User has been untrusted.`, ephemeral: true });
    } catch (error) {
    await interaction.reply({ content:`There was an error while using the command.`, ephemeral: true });
    console.log(error);
    }
},
};