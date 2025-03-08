const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, GuildChannel } = require('discord.js');
require('dotenv').config();
const fs = require('node:fs');

const FIELD_CATERGORYID_NAME = "CATEGORYID"
const FIELD_VOICECREATECHANNELID_NAME = "VOICECREATECHANNELID"
const FIELD_AUDITLOGCHANNELID_NAME = "AUDITLOGCHANNELID"
const FIELD_ANNOUNCEMENTCHANNELID_NAME = "ANNOUNCEMENTCHANNELID"

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

/* function  readSettingsFile()
 * 
 * description: Reads settings.cfg into a structure of the form {category, voiceChannelId}
 * 
 * parameters: None
 * 
 * Returns: A structure with the parameters category and voiceChannelId
 */
function readSettingsFile(guildId)
{
    fileContents = fs.readFileSync(`./globalserversettings/setupsettings/${guildId}/settings.cfg`, 'utf8')
    const lines = fileContents.split('\n')
    settingsFile = {}
    for (const line of lines)
    {
        if(line.startsWith(FIELD_CATERGORYID_NAME))
        {
            settingsFile.category = getValueFromField(FIELD_CATERGORYID_NAME, line)
                
            if(settingsFile.category === null)
                console.error(`Could not find the field ${FIELD_CATERGORYID_NAME}`)
        }
        else if(line.startsWith(FIELD_VOICECREATECHANNELID_NAME))
        {
            settingsFile.voiceChannelId = getValueFromField(FIELD_VOICECREATECHANNELID_NAME, line)
            if(settingsFile.voiceChannelId === null)
                console.error(`Could not find the field ${FIELD_VOICECREATECHANNELID_NAME}`)
        }
        else if(line.startsWith(FIELD_AUDITLOGCHANNELID_NAME))
        {
            settingsFile.auditLogChannelId = getValueFromField(FIELD_AUDITLOGCHANNELID_NAME, line)
            if(settingsFile.auditLogChannelId === null)
                console.error(`Could not find the field ${FIELD_AUDITLOGCHANNELID_NAME}`)
        }
        else if(line.startsWith(FIELD_ANNOUNCEMENTCHANNELID_NAME))
        {
            settingsFile.announcementChannelId = getValueFromField(FIELD_ANNOUNCEMENTCHANNELID_NAME, line)
            if(settingsFile.announcementChannelId === null)
                console.error(`Could not find the field ${FIELD_ANNOUNCEMENTCHANNELID_NAME}`)
        }
    }
    
    return settingsFile
}

/* function  writeValueToField(fieldName, value)
 * 
 * description: Writes a field name and value pair into the form: <fieldName> = "<value>"
 * 
 * parameters: string fieldName: name of the field to write
 *             string value: Value to set
 * 
 * Returns: <fieldName> = "" if the value is null or undefined, otherwise returns <fieldName> = "<value>"
 */
function writeValueToField(fieldName, value)
{
    fileData = `${fieldName} = `
    if(typeof value === 'undefined' || value === null)
    {
	fileData = fileData + '""\n'
    }
    else
    {
	fileData = fileData + `\"${value}\"\n`
    }
    
    return fileData
}

/* function  writeSettingsFile(settingsFile)
 * 
 * description: Writes settings.cfg into a structure of the form {category, voiceChannelId}
 * 
 * parameters: structure settingsFile: the structure to write to disk
 * 
 * Returns: void
 */
function writeSettingsFile(settings, guildID)
{
    fileData = ""
    
    fileData = fileData + writeValueToField(FIELD_CATERGORYID_NAME, settings.category)
    fileData = fileData + writeValueToField(FIELD_VOICECREATECHANNELID_NAME, settings.voiceChannelId)
    fileData = fileData + writeValueToField(FIELD_AUDITLOGCHANNELID_NAME, settings.auditLogChannelId)
    fileData = fileData + writeValueToField(FIELD_ANNOUNCEMENTCHANNELID_NAME, settings.announcementChannelId)
    
    fs.writeFileSync(`./globalserversettings/setupsettings/${guildID}/settings.cfg`, fileData, 'utf8')
}


function createSettingsFile(guildId) {
  const directoryPath = `./globalserversettings/setupsettings/${guildId}`;
  const filePath = `${directoryPath}/settings.cfg`;
  const fileContents = `${FIELD_CATERGORYID_NAME} = ""\n${FIELD_VOICECREATECHANNELID_NAME} = ""\n${FIELD_AUDITLOGCHANNELID_NAME} = ""\n${FIELD_ANNOUNCEMENTCHANNELID_NAME} = ""`;

  try {
    fs.mkdirSync(directoryPath, { recursive: true });
    fs.writeFileSync(filePath, fileContents, 'utf8');
    console.log('Settings file created successfully');
  } catch (error) {
    console.error('Error creating settings file:', error);
  }
}

module.exports = {
  category: 'utility',
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Setup the temp channel.')
    .addChannelOption(option =>
      option
        .setName('category')
        .setDescription('The category id to use')
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(false))
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('The create voice channel id to use.')
        .addChannelTypes(ChannelType.GuildVoice)
        .setRequired(false))
    .addChannelOption(option =>
      option
        .setName('auditlog')
        .setDescription('Channel for logging moderation actions')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false))
    .addChannelOption(option =>
      option
        .setName('announcement')
        .setDescription('Channel for server announcements')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(interaction) {
    let settings = {}
    try {
      varTargetedCategory = interaction.options.getChannel('category').id;
      settings.category = varTargetedCategory;
    } catch (error) {
      varTargetedCategory = "";
    }

    try {
      varTargetedVoiceCreate = interaction.options.getChannel('channel').id;
      settings.voiceChannelId = varTargetedVoiceCreate;
    } catch (error) {
      varTargetedVoiceCreate = "";
    }

    try {
      varTargetedAuditLog = interaction.options.getChannel('auditlog').id;
      settings.auditLogChannelId = varTargetedAuditLog;
    } catch (error) {
      varTargetedAuditLog = "";
    }

    try {
      varTargetedAnnouncement = interaction.options.getChannel('announcement').id;
      settings.announcementChannelId = varTargetedAnnouncement;
    } catch (error) {
      varTargetedAnnouncement = "";
    }

    const guild = interaction.guild

    let thecategoryId;
    let thevoiceChannelId;
    let auditLogChannelId;
    let announcementChannelId;

    if (!fs.existsSync(`./globalserversettings/setupsettings/${guild.id}/settings.cfg`)) {
      console.log("Settings file does not exist. Creating settings file.");
      createSettingsFile(guild.id);
    }

    try {
        // Load existing settings if available
        let existingSettings = {};
        try {
          existingSettings = readSettingsFile(guild.id);
        } catch (error) {
          console.log("Could not read existing settings, using defaults");
        }

        // Only create category if not specified and not already set
        if (!settings.category && !existingSettings.category) {
          let category = await guild.channels.create({name: 'Temporary Voice Create', type: ChannelType.GuildCategory});
          thecategoryId = category.id;
          console.log("Category created with ID:", thecategoryId);
          settings.category = thecategoryId;
        } else if (!settings.category && existingSettings.category) {
          settings.category = existingSettings.category;
        }
        
        // Only create voice channel if not specified and not already set
        if (!settings.voiceChannelId && !existingSettings.voiceChannelId) {
          let voice = await guild.channels.create({ name: 'Temporary Voice Create', type: ChannelType.GuildVoice });
          thevoiceChannelId = voice.id;
          console.log("Voice created with ID:", thevoiceChannelId);
          settings.voiceChannelId = thevoiceChannelId;
        } else if (!settings.voiceChannelId && existingSettings.voiceChannelId) {
          settings.voiceChannelId = existingSettings.voiceChannelId;
        }

        // Preserve audit log channel if not specified but already set
        if (!settings.auditLogChannelId && existingSettings.auditLogChannelId) {
          settings.auditLogChannelId = existingSettings.auditLogChannelId;
        }

        // Preserve announcement channel if not specified but already set
        if (!settings.announcementChannelId && existingSettings.announcementChannelId) {
          settings.announcementChannelId = existingSettings.announcementChannelId;
        }

        // Write all settings back to file
        writeSettingsFile(settings, guild.id);

        // Try to move the voice channel to the category if both exist
        try {
          const voice = await guild.channels.fetch(settings.voiceChannelId);
          const catvoice = await guild.channels.fetch(settings.category);

          if (!(voice instanceof GuildChannel) || !(catvoice instanceof GuildChannel)) {
            throw new Error('Voice channel or category not found');
          }

          await voice.setParent(catvoice, { lockPermissions: false });
          console.log('Voice channel moved to category');
          
          let responseMessage = 'Setup complete. Voice channel moved to category.';
          
          // Add info about audit log in response message
          if (settings.auditLogChannelId) {
            const auditChannel = await guild.channels.fetch(settings.auditLogChannelId);
            if (auditChannel) {
              responseMessage += `\nAudit logs will be sent to <#${settings.auditLogChannelId}>.`;
            }
          }

          // Add info about announcement channel in response message
          if (settings.announcementChannelId) {
            const announcementChannel = await guild.channels.fetch(settings.announcementChannelId);
            if (announcementChannel) {
              responseMessage += `\nAnnouncements will be sent to <#${settings.announcementChannelId}>.`;
            }
          }
          
          await interaction.reply({ content: responseMessage, ephemeral: true });
        } catch (error) {
          console.log(error);
          console.error('Error moving voice channel to category:');
          
          // Still provide a response about what was configured
          let responseMessage = 'Setup partially complete.';
          if (settings.category) {
            responseMessage += `\nCategory ID: ${settings.category}`;
          }
          if (settings.voiceChannelId) {
            responseMessage += `\nVoice channel ID: ${settings.voiceChannelId}`;
          }
          if (settings.auditLogChannelId) {
            responseMessage += `\nAudit log channel ID: ${settings.auditLogChannelId}`;
          }
          if (settings.announcementChannelId) {
            responseMessage += `\nAnnouncement channel ID: ${settings.announcementChannelId}`;
          }
          await interaction.reply({ content: responseMessage, ephemeral: true });
        }

    } catch (error) {
      console.log(error);
      await interaction.reply({ content:`There was an error while using the command.`, ephemeral: true });
    }
  },
};