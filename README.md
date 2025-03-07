# TempVoice

**This project is mostly complete, and nearly production-ready**

An open source upcoming implementation of a temp voice bot with user and admin commands. Should work on multiple servers.

### Acknowledgements
- Jacon500 - Some code optimizations and assistance with some features, and bug testing.
- ZMaster - Some function setup and assistance
- NickALafrance - Some function setup and assistance, and more.

### Prerequisites

- [Node.js](https://nodejs.org/) (v16.x or higher)
- [Discord Developer Portal](https://discord.com/developers/applications) account to create your bot
- [Discord.JS](https://discord.js.org/) (v14.x or higher)

### Setup 
This guide is for setting up the bot assuming you are hosting it yourself. If you are using someone else's copy of it, skip to Step 4. 

1. To setup run the following commands
```npm
npm install discord.js dotenv
```

2. Populate the categories in the .env file (Rename env.example to .env):
```env   
DISCORD_TOKEN=""
CLIENTID = ""
ADMINROLEID = ""
#SERVER ID IS REQUIRED FOR A SERVER TO DEPLOY GUILD COMMANDS TO.
SERVERID = ""
# Where we will store the global server settings file
SETTINGSFILE = "./globalserversettings/settings.json"
```

3. You will need to run `node deploy-commands`.

4. In the server, run the `/setup` command and follow its instructions.
