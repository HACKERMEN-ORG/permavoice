// Invoke necessary modules for the bot to run

const { Client, Collection, Events, ActivityType, GatewayIntentBits, GuildPresences, ChannelType, EmbedBuilder, PermissionFlagsBits, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle,  } = require('discord.js');
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { channelOwners } = require('./methods/channelowner');
const { togglePrivate } = require('./methods/private');
const { toggleLock } = require('./methods/locks');
const { channel } = require('node:diagnostics_channel');
const { waitingRoom } = require('./methods/waitingRoom');
const Settings  = require('./Settings');
const channelState = require('./methods/channelState');
const { isUserMuted, clearChannelMutes, hasExplicitAction, getExplicitAction } = require('./methods/channelMutes');

// Load the submods module
let channelSubmods, isSubmod, clearChannelSubmods;
try {
  const submodModule = require('./commands/channelcommands/submod');
  channelSubmods = submodModule.channelSubmods;
  isSubmod = submodModule.isSubmod;
  clearChannelSubmods = submodModule.clearChannelSubmods;
} catch (error) {
  // Create a placeholder if module doesn't exist yet
  channelSubmods = new Map();
  isSubmod = () => false;
  clearChannelSubmods = () => {};
  console.log('Submods module not found. Creating placeholder.');
}

const token = process.env.DISCORD_TOKEN;
const serverID = process.env.SERVERID;

const FIELD_CATERGORYID_NAME = "CATEGORYID";
const FIELD_VOICECREATECHANNELID_NAME = "VOICECREATECHANNELID";

/* function  getValueFromField(fieldName, line)
*
* description: Gets the value assigned to a field.  Assumes one line in the format: <fieldName> = "<value>"
*
* parameters: string fieldName: name of the field to get
*             string line: line to get the field from
*
* Returns: Null if the field cannot be found or the file otherwise does not match.  <value> if a match is found
*/
function getValueFromField(fieldName, line) {
	re = RegExp('^' + fieldName + '\\s*=\\s*\"(.*)\"');
	matches = re.exec(line);

	if(matches == null) {
		return null; // Group 1
	} else {
		return matches[1]; // Group 1
	}
}

/* function readSettingsFile()
 *
 * description: Reads settings.cfg into a structure of the form {category, voiceChannelId}
 *
 * parameters: None
 *
 * Returns: A structure with the parameters category and voiceChannelId
 */
function readSettingsFile() {
    // Use the server ID from environment variables
    const guildId = serverID;

    if (!guildId) {
        console.error("SERVERID not found in environment variables");
        return { category: null, voiceChannelId: null };
    }

    const settingsPath = `./globalserversettings/setupsettings/${guildId}/settings.cfg`;
    const settingsFile = { category: null, voiceChannelId: null };

    // Check if the file exists
    if (!fs.existsSync(settingsPath)) {
        console.error(`Settings file for guild ${guildId} not found at ${settingsPath}`);
        // Create directory structure if it doesn't exist
        try {
            fs.mkdirSync(`./globalserversettings/setupsettings/${guildId}`, { recursive: true });
            // Create a default settings file
            const defaultSettings = `${FIELD_CATERGORYID_NAME} = ""\n${FIELD_VOICECREATECHANNELID_NAME} = ""`;
            fs.writeFileSync(settingsPath, defaultSettings, 'utf8');
            console.log(`Created default settings file for guild ${guildId}`);
        } catch (err) {
            console.error(`Failed to create settings file for guild ${guildId}:`, err);
        }
        return settingsFile;
    }

    try {
        const fileContents = fs.readFileSync(settingsPath, 'utf8');
        const lines = fileContents.split('\n');

        for (const line of lines) {
            if (line.startsWith(FIELD_CATERGORYID_NAME)) {
                settingsFile.category = getValueFromField(FIELD_CATERGORYID_NAME, line);

                if (settingsFile.category === null) {
                    console.error(`Could not find the field ${FIELD_CATERGORYID_NAME}`);
                }
            } else if (line.startsWith(FIELD_VOICECREATECHANNELID_NAME)) {
                settingsFile.voiceChannelId = getValueFromField(FIELD_VOICECREATECHANNELID_NAME, line);

                if (settingsFile.voiceChannelId === null) {
                    console.error(`Could not find the field ${FIELD_VOICECREATECHANNELID_NAME}`);
                }
            }
        }
    } catch (err) {
        console.error(`Error reading settings file for guild ${guildId}:`, err);
    }

    return settingsFile;
}

/**
 * Retrieves the key from a Map object based on the provided search value.
 *
 * @param {Map} map - The Map object to search in.
 * @param {*} searchValue - The value to search for in the Map object.
 * @returns {*} The key associated with the provided search value, or undefined if not found.
 */
function getByValue(map, searchValue) {
	for (let [key, value] of map.entries()) {
		if (value === searchValue)
			return key;
	}
}


const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildVoiceStates] });

client.cooldowns = new Collection();
client.commands = new Collection();

const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		if ('data' in command && 'execute' in command) {
			client.commands.set(command.data.name, command);
		} else {
			console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}


// Then modify the client.once(Events.ClientReady) event to load data:
client.once(Events.ClientReady, async readyClient => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);

  // Load and validate channel data
  channelState.loadChannelData();
  await channelState.validateChannels(readyClient);

  // Setup process exit handlers
  channelState.setupExitHandlers();
});


client.on('voiceStateUpdate', (oldState, newState) => {
    // Get bot's guild from server ID
    const guild = client.guilds.cache.get(serverID);

    if (!guild) {
        console.error(`Guild with ID ${serverID} not found. Check your .env SERVERID.`);
        return;
    }

    // Check if the settings file exists before trying to read it
    const settingsPath = `./globalserversettings/setupsettings/${serverID}/settings.cfg`;
    if (!fs.existsSync(settingsPath)) {
        console.log(`No settings file found for guild ${serverID}. Skipping voice state update.`);
        return;
    }

    // Now safely read settings since we've verified the file exists
    const settings = readSettingsFile();

    // Handling mute status when joining a channel
    if (newState.channelId) {
        const userId = newState.member.id;
        const channelId = newState.channelId;

        // Skip all mute processing for channel owners and submods
        if ((channelOwners.has(channelId) && channelOwners.get(channelId) === userId) || 
            isSubmod(channelId, userId)) {
            // This is the channel owner or a submod - ensure they're always unmuted in their channel
            if (newState.member.voice.serverMute) {
                console.log(`Channel owner/submod ${userId} is muted in their channel ${channelId}, unmuting`);
                try {
                    newState.member.voice.setMute(false, 'Channel owner/submod unmute')
                        .catch(error => console.error('Error unmuting channel owner/submod:', error));
                } catch (error) {
                    console.error('Error in channel owner/submod unmute:', error);
                }
            }
            return;
        }

        // Check if user is in a temporary channel they should be muted in
        const shouldBeMuted = isUserMuted(channelId, userId);

        // Apply correct mute state
        if (shouldBeMuted && !newState.member.voice.serverMute) {
            // Should be muted but isn't
            console.log(`User ${userId} should be muted in channel ${channelId}, applying mute`);
            try {
                newState.member.voice.setMute(true, 'Channel mute applied')
                    .catch(error => console.error('Error applying channel mute:', error));
            } catch (error) {
                console.error('Error applying mute:', error);
            }
        } else if (!shouldBeMuted && newState.member.voice.serverMute) {
            // Shouldn't be muted but is - this handles users moving between channels
            console.log(`User ${userId} is incorrectly muted in channel ${channelId}, unmuting`);
            try {
                newState.member.voice.setMute(false, 'Removing incorrect mute')
                    .catch(error => console.error('Error removing incorrect mute:', error));
            } catch (error) {
                console.error('Error removing incorrect mute:', error);
            }
        }
    }

    // When a user leaves a channel
    if (oldState.channelId && (!newState.channelId || oldState.channelId !== newState.channelId)) {
        const userId = oldState.member.id;
        const oldChannelId = oldState.channelId;

        // Check if the user was muted in the channel they just left
        if (isUserMuted(oldChannelId, userId) && oldState.member.voice.serverMute) {
            // If they're disconnecting entirely or moving to a channel where they shouldn't be muted
            if (!newState.channelId || !isUserMuted(newState.channelId, userId)) {
                console.log(`User ${userId} left muted channel ${oldChannelId}, removing mute`);
                try {
                    // Important: we need to ensure they're not muted when they join another channel
                    newState.member.voice.setMute(false, 'Left muted channel')
                        .catch(error => {
                            // They may have disconnected entirely, which is fine
                            if (!error.message.includes('not connected to voice')) {
                                console.error('Error removing mute on leave:', error);
                            }
                        });
                } catch (error) {
                    // Only log real errors, not disconnection issues
                    if (error.message && !error.message.includes('not connected to voice')) {
                        console.error('Error in mute removal:', error);
                    }
                }
            }
        }
    }

    // Handle joining the waiting room
    if (newState.channelId && Array.from(waitingRoom.values()).includes(newState.channelId)) {
        try {
            // Find the channel id that the waiting room belongs to
            const ownerChannelId = getByValue(waitingRoom, newState.channelId);
            if (!ownerChannelId) {
                console.error(`Owner channel not found for waiting room ${newState.channelId}`);
                return;
            }

            // Try to get the owner channel
            const ownerChannel = guild.channels.cache.get(ownerChannelId);
            if (!ownerChannel) {
                console.error(`Owner channel ${ownerChannelId} not found in cache`);
                return;
            }

            // Get the owner of the channel
            const ownerId = channelOwners.get(ownerChannelId);
            if (!ownerId) {
                console.error(`Owner not found for channel ${ownerChannelId}`);
                return;
            }

            // If the owner is the one who joined the waiting room, ignore it
            if (newState.member.id === ownerId) {
                return;
            }

            // Send a message in the main temp channel and notify the owner by id
            ownerChannel.send(`<@${ownerId}>: **${newState.member.user.username}** has joined the waiting room. You may **/trust** them to join the channel.`);
        } catch (error) {
            console.error("Error handling waiting room join:", error);
        }
        return;
    }


// Handle joining the create channel
if (newState.channelId && newState.channelId === settings.voiceChannelId) {
    try {
        const category = guild.channels.cache.get(settings.category);
        if (category && category.type === ChannelType.GuildCategory) {
            guild.channels.create({
                name: `${newState.member.user.username}'s Channel`,
                type: ChannelType.GuildVoice,
                parent: category.id,
                permissionOverwrites: [
                    {
                        id: newState.member.id,
                        allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels],
                    },
                ],
            })
            .then(channel => {
                // Move the user to the new channel
                newState.member.voice.setChannel(channel)
                    .then(() => {
                        // Explicitly ensure the user is unmuted in their new channel
                        setTimeout(() => {
                            try {
                                if (newState.member.voice.channel && newState.member.voice.channel.id === channel.id) {
                                    newState.member.voice.setMute(false, 'New channel owner unmute')
                                        .catch(error => console.error('Error unmuting channel owner:', error));
                                }
                            } catch (error) {
                                console.error('Error in delayed owner unmute:', error);
                            }
                        }, 1000);
                    })
                    .catch(error => console.error('Error moving user to new channel:', error));

                console.log(`Created voice channel: ${channel.name}`);

                // Set the owner of the channel to the user who created the channel
                channelOwners.set(channel.id, newState.member.id);

                // Set the channel's private state to false, this can be adjusted by the user toggling the channel's visibility via /private
                togglePrivate.set(channel.id, 0);

                // Set the channel's lock state to false, this can be adjusted by the user toggling the channel's lock state via /lock
                toggleLock.set(channel.id, 0);

                const embed = new EmbedBuilder()
                    .setTitle("✏️ **Controls**")
                    .setDescription("**Moderator Commands**\n/mute - Mute a user in your channel\n/unmute - Unmute a user in your channel\n /kick - Kick a user from the channel\n /ban- Ban a user from your channel\n /unban - Unban a user from your channel\n /listmuted - View all muted users\n/listbanned - View all banned users\n/submod - Add a submoderator to the channel\n/unsubmod - Remove a submoderator from the channel\n/listsubmods - View all submoderators\n\n**Community Commands**\n/votemute - Anyone can call a vote to mute a disruptive member")
                    .setColor("#f5cc00")
                    .setTimestamp();

                const actionRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('button_id')
                            .setLabel('Click Me')
                            .setStyle(ButtonStyle.Primary)
                    );
                channel.send({ content: '', embeds: [embed] });
            })
            .catch(error => {
                console.error('Error creating voice channel:', error);
            });
        }
    } catch (error) {
        console.error("Error handling create channel join:", error);
    }
    return;
}

    // Handle the channel deletion if the channel is empty
    if (oldState.channelId) {
        try {
            // First verify the channel still exists using cache
            const oldChannel = guild.channels.cache.get(oldState.channelId);
            if (!oldChannel) {
                // Channel already doesn't exist, nothing to do
                return;
            }

            // Check if this is a waiting room
            if (Array.from(waitingRoom.values()).includes(oldChannel.id)) {
                return;
            }

            // Check if this channel has a waiting room
            if (waitingRoom.has(oldChannel.id)) {
                // Check the parent channel conditions
                if (oldChannel.parentId === settings.category &&
                    oldChannel.members.size === 0 &&
                    oldChannel.id !== settings.voiceChannelId) {

                    // Get the associated waiting room
                    const waitingRoomId = waitingRoom.get(oldChannel.id);
                    if (waitingRoomId) {
                        const waitingRoomChannel = guild.channels.cache.get(waitingRoomId);
                        if (waitingRoomChannel) {
                            waitingRoomChannel.delete()
                                .catch(error => console.error('Error deleting waiting room channel:', error));
                        }
                    }

                    // Clean up
                    waitingRoom.delete(oldChannel.id);
                    channelOwners.delete(oldChannel.id);
                    clearChannelMutes(oldChannel.id);
                    
                    // Clear submods data
                    if (clearChannelSubmods) {
                        clearChannelSubmods(oldChannel.id);
                    }

                    // Delete the channel
                    oldChannel.delete()
                        .catch(error => console.error('Error deleting main channel with waiting room:', error));
                }
                return;
            }

            // If the channel is a perm channel, ignore it
            if (Settings.doesChannelHavePermVoice(serverID, oldChannel.id)) {
                return;
            }

            // If a voice channel is in our category, is empty, and isn't the create channel, delete it
            if (oldChannel.parentId === settings.category &&
                oldChannel.members.size === 0 &&
                oldChannel.id !== settings.voiceChannelId) {

                // Clean up
                channelOwners.delete(oldChannel.id);
                clearChannelMutes(oldChannel.id);
                
                // Clear submods data
                if (clearChannelSubmods) {
                    clearChannelSubmods(oldChannel.id);
                }

                // Delete the channel
                oldChannel.delete()
                    .then(() => console.log(`Deleted empty channel: ${oldChannel.name}`))
                    .catch(error => console.warn('Error deleting main channel:', error));
            }
        } catch (error) {
            console.error("Error handling channel deletion:", error);
        }
    }
});

client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;
	const command = client.commands.get(interaction.commandName);


	if (!command) {
		console.error(`No command matching ${interaction.commandName} was found.`);
		return;
	}

	const { cooldowns } = interaction.client;

	if (!cooldowns.has(command.data.name)) {
		cooldowns.set(command.data.name, new Collection());
	}

	const now = Date.now();
	const timestamps = cooldowns.get(command.data.name);
	const defaultCooldownDuration = 3;
	const cooldownAmount = (command.cooldown ?? defaultCooldownDuration) * 1000;

	if (timestamps.has(interaction.user.id)) {
		const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;

		if (now < expirationTime) {
			const expiredTimestamp = Math.round(expirationTime / 1000);
			return interaction.reply({ content: `Please wait, you are on a cooldown for \`${command.data.name}\`. You can use it again <t:${expiredTimestamp}:R>.`, ephemeral: true });
		}
	}

	timestamps.set(interaction.user.id, now);
	setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

	try {
		await command.execute(interaction);
	} catch (error) {
		console.error(error);
		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
		} else {
			await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
		}
	}
});

client.login(token);