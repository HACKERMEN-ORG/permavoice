// Invoke necessary modules for the bot to run

const { Client, Collection, Events, ActivityType, GatewayIntentBits, GuildPresences, ChannelType, EmbedBuilder, PermissionFlagsBits, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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
const { isUserMuted, clearChannelMutes, hasExplicitAction, getExplicitAction, addMutedUser, removeMutedUser } = require('./methods/channelMutes');
const reminderSystem = require('./methods/reminderSystem');
const channelNameManager = require('./methods/customChannelNames');
const auditLogger = require('./methods/auditLogger');
const permanentOwnerManager = require('./methods/permanentOwner');
const { createWelcomeEmbed } = require('./methods/welcomeMessage');


// Import the submod manager
let submodManager;
try {
  submodManager = require('./methods/submodmanager');
} catch (error) {
  console.error('Error loading submod manager, creating placeholder:', error);
  // Create a placeholder if the module doesn't exist yet
  submodManager = {
    channelSubmods: new Map(),
    isSubmod: () => false,
    addSubmod: () => true,
    removeSubmod: () => true,
    getSubmods: () => new Set(),
    clearChannelSubmods: () => {},
    saveSubmodsData: () => {},
    loadSubmodsData: () => {}
  };
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
 * Find permanent voice channels owned by a user
 * @param {Guild} guild - The Discord guild
 * @param {string} userId - The user ID to check
 * @returns {Array} - Array of channel IDs owned by this user
 */
function findUserOwnedPermanentRooms(guild, userId) {
    const ownedPermRooms = [];
    
    // Iterate through all voice channels in the guild
    guild.channels.cache.forEach(channel => {
        // Check if it's a voice channel and is marked as permanent
        if (channel.type === ChannelType.GuildVoice && 
            Settings.doesChannelHavePermVoice(guild.id, channel.id)) {
            
            // Check if this user has owner-level permissions for this channel
            const userOverwrites = channel.permissionOverwrites.cache.get(userId);
            if (userOverwrites && 
                userOverwrites.allow.has(PermissionFlagsBits.Connect) &&
                userOverwrites.allow.has(PermissionFlagsBits.Speak)) {
                
                console.log(`Found permanent voice channel ${channel.id} owned by ${userId}`);
                ownedPermRooms.push(channel.id);
            }
        }
    });
    
    return ownedPermRooms;
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

  auditLogger.init(readyClient);
  console.log('Audit logger initialized');

  // Try to load submods data if the module exists
  if (submodManager && typeof submodManager.loadSubmodsData === 'function') {
    try {
      submodManager.loadSubmodsData();
    } catch (error) {
      console.error('Error loading submods data:', error);
    }
  }

  // Load custom channel names data
  try {
    channelNameManager.loadChannelNamesData();
  } catch (error) {
    console.error('Error loading custom channel names data:', error);
  }
  
  // Load permanent owner temp channel data
  try {
    permanentOwnerManager.loadData();
    console.log('Permanent owner temp channel data loaded');
  } catch (error) {
    console.error('Error loading permanent owner data:', error);
  }

  // Load and validate channel data
  channelState.loadChannelData();
  await channelState.validateChannels(readyClient);

  // Setup process exit handlers
  channelState.setupExitHandlers();
  
  // Start the reminder system with random intervals between 30-120 minutes
  reminderSystem.startReminders(readyClient, 30, 120);
  console.log('Reminder system initialized');
});


// Fixed and unified voiceStateUpdate event handler
client.on('voiceStateUpdate', async (oldState, newState) => {
  // Get bot's guild from server ID
  const guild = client.guilds.cache.get(serverID);

  if (!guild) {
    console.error(`Guild with ID ${serverID} not found. Check your .env SERVERID.`);
    return;
  }

  // Check if the settings file exists before trying to read it
  const settingsPath = `./globalserversettings/setupsettings/${serverID}/settings.cfg`;
  let settings = { category: null, voiceChannelId: null };
  
  try {
    if (fs.existsSync(settingsPath)) {
      settings = readSettingsFile();
    }
  } catch (error) {
    console.error('Error reading settings file:', error);
  }

  // Post-reboot recovery: Check for voice channels that should be in our system
  // This runs when a user does something in a voice channel (join/leave/move)
  if ((oldState.channelId || newState.channelId) && settings.category) {
    const channelId = newState.channelId || oldState.channelId;
    if (channelId) {
      try {
        const channel = await guild.channels.fetch(channelId).catch(() => null);
        
        // If this is a voice channel in our temp category but not in our records
        if (channel && 
            channel.type === ChannelType.GuildVoice && 
            channel.parentId === settings.category && 
            !channelOwners.has(channelId) && 
            channelId !== settings.voiceChannelId && 
            channel.createdTimestamp < (Date.now() - 30000)) { // Only recover channels older than 30 seconds
            
            // This channel may have been created before a reboot
            console.log(`Found untracked voice channel ${channelId} in temp category - post-reboot recovery`);
            
            // Check if it has members
            if (channel.members.size > 0) {
              const firstMember = channel.members.first();
              console.log(`Recovering ownership: Setting ${firstMember.id} as owner of ${channelId}`);
              
              // Assign the first member as the owner (best guess)
              channelOwners.set(channelId, firstMember.id);
              togglePrivate.set(channelId, 0);
              toggleLock.set(channelId, 0);
              
              // Announce recovery in the channel
              channel.send("⚠️ The bot has been restarted. Channel ownership has been restored to the first member. If this is incorrect, any member can use the `/claim` command to take ownership.").catch(console.error);
              
              // Force save the recovered state
              channelState.forceSave();
            }
        }
      } catch (error) {
        console.error(`Error in post-reboot channel recovery for ${channelId}:`, error);
      }
    }
  }

  // ===== MUTE HANDLING SECTION =====
  // Handling mute status changes
  const userId = newState.member?.id;
  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;
  
  // Skip processing if user ID is missing
  if (!userId) return;

  // CASE 1: User was server muted (either by right-click or command)
  const wasJustMuted = oldState.serverMute === false && newState.serverMute === true;
  if (wasJustMuted && newChannelId) {
    console.log(`User ${userId} was server muted in channel ${newChannelId}`);
    
    // Skip if this is the channel owner or a submoderator
    if ((channelOwners.has(newChannelId) && channelOwners.get(newChannelId) === userId) || 
        (submodManager && submodManager.isSubmod && submodManager.isSubmod(newChannelId, userId))) {
      console.log(`Preventing mute of channel owner/submod ${userId}`);
      
      // Unmute them immediately to prevent owners/submods from being muted
      try {
        await newState.setMute(false, 'Channel owner/submod protection');
      } catch (error) {
        console.error('Error unmuting protected user:', error);
      }
      return;
    }
    
    // This is right-click mute from a user or admin, track it in our system
    addMutedUser(newChannelId, userId);
    
    // Try to determine who performed the mute action
    try {
      guild.fetchAuditLogs({
        type: 24, // SERVER_MEMBER_UPDATE
        limit: 1
      }).then(async auditLogs => {
        const recentAction = auditLogs.entries.first();
        
        // Check if this is a recent mute action (within the last 3 seconds)
        if (recentAction && 
            (Date.now() - recentAction.createdTimestamp < 3000) && 
            recentAction.target.id === userId) {
          
          // Get the executor of the mute action
          const executorId = recentAction.executor.id;
          const executor = await guild.members.fetch(executorId).catch(() => null);
          
          if (executor) {
            // Check if executor is channel owner or submod
            const isOwner = channelOwners.get(newChannelId) === executorId;
            const isSubmod = submodManager && submodManager.isSubmod && 
                           submodManager.isSubmod(newChannelId, executorId);
            
            // If neither owner nor submod, check if they have server admin permissions
            if (!isOwner && !isSubmod && !executor.permissions.has(PermissionFlagsBits.Administrator)) {
              // This person shouldn't be able to mute others, undo the mute
              console.log(`Unauthorized mute by ${executorId}, undoing`);
              newState.setMute(false, 'Unauthorized mute action');
              removeMutedUser(newChannelId, userId);
              return;
            }
            
            // Log the mute action using our existing system
            const channel = guild.channels.cache.get(newChannelId);
            if (channel) {
              auditLogger.logUserMute(guild.id, channel, newState.member.user, executor.user);
            }
          }
        }
      }).catch(error => {
        console.error('Error fetching audit logs for mute:', error);
      });
    } catch (error) {
      console.error('Error processing right-click mute:', error);
    }
  }
  
  // CASE 2: User was server unmuted (either by right-click or command)
  const wasJustUnmuted = oldState.serverMute === true && newState.serverMute === false;
  if (wasJustUnmuted && newChannelId) {
    console.log(`User ${userId} was server unmuted in channel ${newChannelId}`);
    
    // This is right-click unmute, update our tracking
    removeMutedUser(newChannelId, userId);
    
    // Try to determine who performed the unmute action
    try {
      guild.fetchAuditLogs({
        type: 24, // SERVER_MEMBER_UPDATE
        limit: 1
      }).then(async auditLogs => {
        const recentAction = auditLogs.entries.first();
        
        // Check if this is a recent unmute action (within the last 3 seconds)
        if (recentAction && 
            (Date.now() - recentAction.createdTimestamp < 3000) && 
            recentAction.target.id === userId) {
          
          // Get the executor of the unmute action
          const executorId = recentAction.executor.id;
          const executor = await guild.members.fetch(executorId).catch(() => null);
          
          if (executor) {
            // Check if executor is channel owner or submod
            const isOwner = channelOwners.get(newChannelId) === executorId;
            const isSubmod = submodManager && submodManager.isSubmod && 
                           submodManager.isSubmod(newChannelId, executorId);
            
            // If neither owner nor submod, check if they have server admin permissions
            if (!isOwner && !isSubmod && !executor.permissions.has(PermissionFlagsBits.Administrator)) {
              // This person shouldn't be able to unmute others, redo the mute if needed
              console.log(`Unauthorized unmute by ${executorId}, redoing`);
              if (isUserMuted(newChannelId, userId)) {
                newState.setMute(true, 'Enforcing authorized mute');
              }
              return;
            }
            
            // Log the unmute action using our existing system
            const channel = guild.channels.cache.get(newChannelId);
            if (channel) {
              auditLogger.logUserUnmute(guild.id, channel, newState.member.user, executor.user);
            }
          }
        }
      }).catch(error => {
        console.error('Error fetching audit logs for unmute:', error);
      });
    } catch (error) {
      console.error('Error processing right-click unmute:', error);
    }
  }
  
  // CASE 3: User joins a channel where they should be muted
  if ((!oldChannelId || oldChannelId !== newChannelId) && newChannelId) {
    // Check if user should be muted in this channel
    if (isUserMuted(newChannelId, userId) && !newState.serverMute) {
      console.log(`User ${userId} should be muted in channel ${newChannelId}, applying mute`);
      try {
        await newState.setMute(true, 'Enforcing channel mute');
      } catch (error) {
        console.error('Error applying mute on channel join:', error);
      }
    }
  }
  
  // CASE 4: User leaves a channel where they were muted
  if (oldChannelId && (!newChannelId || oldChannelId !== newChannelId)) {
    // If they were muted in the old channel, unmute them when leaving
    if (isUserMuted(oldChannelId, userId) && oldState.serverMute) {
      console.log(`User ${userId} left muted channel ${oldChannelId}, removing mute`);
      try {
        // Important: remove the server mute when they leave the channel
        await newState.setMute(false, 'Left muted channel');
      } catch (error) {
        // Only log real errors, not disconnection issues
        if (error && error.message && !error.message.includes('not connected to voice')) {
          console.error('Error in mute removal on leave:', error);
        }
      }
    }
  }
  // ===== END MUTE HANDLING SECTION =====

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
      // Get the user who joined
      const member = newState.member;
      
      // Get the channel name - either custom or default
      let channelName;
      const customName = channelNameManager.getCustomChannelName(member.id);
      
      if (customName) {
        channelName = customName;
      } else if (member.nickname) {
        // Use server nickname if available
        channelName = `${member.nickname}'s channel`;
      } else {
        // Fall back to username if no nickname is set
        channelName = `${member.user.username}'s channel`;
      }
      
      // Create the channel in the same category
      const createdChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildVoice,
        parent: settings.category
      });
      
      // Move the member to the new channel
      await member.voice.setChannel(createdChannel);
      
      // Set the owner of the new channel
      channelOwners.set(createdChannel.id, member.id);
      togglePrivate.set(createdChannel.id, 0);
      toggleLock.set(createdChannel.id, 0);
      
      console.log(`Created new voice channel: ${channelName} (${createdChannel.id}) for ${member.user.username}`);
      
      try {
        const welcomeEmbed = createWelcomeEmbed();
        await createdChannel.send({ 
          //content: `<@${member.id}> Welcome to your new voice channel!`,
          embeds: [welcomeEmbed] 
        });
        console.log(`Sent welcome message to new channel: ${createdChannel.name} (${createdChannel.id})`);
      } catch (error) {
        console.error(`Error sending welcome message to channel ${createdChannel.id}:`, error);
      }

      // Log the channel creation
      auditLogger.logChannelCreation(guild.id, createdChannel, member.user);
      
      // If this user owns permanent voice channels, track this temp channel for them
      const ownedPermRooms = Array.from(guild.channels.cache.values())
        .filter(channel => 
          channel.type === ChannelType.GuildVoice && 
          Settings.doesChannelHavePermVoice(guild.id, channel.id)
        )
        .filter(channel => {
          const userPerms = channel.permissionOverwrites.cache.get(member.id);
          return userPerms && 
                 userPerms.allow.has(PermissionFlagsBits.Connect) &&
                 userPerms.allow.has(PermissionFlagsBits.Speak);
        });
            
      if (ownedPermRooms.length > 0) {
        permanentOwnerManager.setTempChannelForPermanentOwner(member.id, createdChannel.id);
        console.log(`User ${member.id} owns permanent rooms, tracking temp channel ${createdChannel.id}`);
      }
    } catch (error) {
      console.error("Error creating voice channel:", error);
    }
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
          if (submodManager && typeof submodManager.clearChannelSubmods === 'function') {
            submodManager.clearChannelSubmods(oldChannel.id);
          }
          
          // Check if the deleted channel was owned by a permanent room owner
          const permanentOwnerId = permanentOwnerManager.getPermanentOwnerForTempChannel(oldChannel.id);
          if (permanentOwnerId) {
            console.log(`Removing permanent owner ${permanentOwnerId}'s temp channel mapping for deleted channel ${oldChannel.id}`);
            permanentOwnerManager.removeTempChannelForPermanentOwner(permanentOwnerId);
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
        if (submodManager && typeof submodManager.clearChannelSubmods === 'function') {
          submodManager.clearChannelSubmods(oldChannel.id);
        }
        
        // Check if the deleted channel was owned by a permanent room owner
        const permanentOwnerId = permanentOwnerManager.getPermanentOwnerForTempChannel(oldChannel.id);
        if (permanentOwnerId) {
          console.log(`Removing permanent owner ${permanentOwnerId}'s temp channel mapping for deleted channel ${oldChannel.id}`);
          permanentOwnerManager.removeTempChannelForPermanentOwner(permanentOwnerId);
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