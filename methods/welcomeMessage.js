// methods/welcomeMessage.js
const { EmbedBuilder } = require('discord.js');

/**
 * Create a welcome message with command instructions for new channel owners
 * @returns {EmbedBuilder} - Discord.js embed message with channel commands
 */
function createWelcomeEmbed() {
  return new EmbedBuilder()
    .setTitle('🎉 Welcome to Your Voice Channel!')
    .setColor('#00AAFF')
    .setDescription('This channel is yours to customize and moderate! Here are the commands you can use:')
    .addFields(
      { name: '📋 General Commands', value: 
        '`/rename [name]` - Change your channel name\n' +
        '`/limit [count]` - Set user limit (0-99, 0 = unlimited)\n' +
        '`/help` - Get help with various commands'
      },
      { name: '👮 Moderation Commands', value: 
        '`/kick [user]` - Kick a user from your channel\n' +
        '`/ban [user]` - Ban a user from your channel\n' +
        '`/unban [user]` - Unban a previously banned user\n' + 
        '`/mute [user]` - Server mute a user in your channel\n' +
        '`/unmute [user]` - Unmute a user in your channel'
      },
      { name: '👥 Team Management', value: 
        '`/submod [user]` - Add a submoderator to help manage\n' +
        '`/unsubmod [user]` - Remove a submoderator\n' +
        '`/listsubmods` - List all submoderators in your channel'
      },
      { name: '📊 Information', value: 
        '`/listbanned` - List all banned users\n' +
        '`/listmuted` - List all muted users\n' +
        '`/votemute [user]` - Start a vote to mute a disruptive user'
      }
    )
    .setFooter({ text: 'Anyone can create their own voice channel by joining the "CREATE" channel!' });
}

module.exports = { createWelcomeEmbed };