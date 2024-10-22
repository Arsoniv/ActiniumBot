const tmi = require("tmi.js");
const fs = require("fs").promises;
const path = require("path");


const express = require("express");
const app = express();
const port = process.env.PORT || 3000; // Use Render's port or default to 3000

// Health Check Endpoint
app.get("/health", (req, res) => {
    res.status(200).send("OK");
});


const fileNames = [];
const fileContents = {};

const directoryPath = path.join(__dirname, "channels");

async function ensureChannelsDirectoryExists() {
  try {
    // Check if the directory exists
    await fs.access(directoryPath);
    console.log("Channels directory already exists.");
  } catch (err) {
    // If the directory does not exist, create it
    await fs.mkdir(directoryPath);
    console.log("Channels directory created.");
  }
}

async function createNewFile(channelName) {
  const filePath = path.join(directoryPath, `${channelName}.txt`); // Add .txt extension

  try {
    await fs.access(filePath);
    console.log(`${channelName} file already exists.`);
  } catch (err) {
    const defaultContent = `${channelName}\n\n!`;
    await fs.writeFile(filePath, defaultContent, "utf8");
    fileNames.push(channelName);
    fileContents[channelName] = [channelName];
    console.log(`Created file for channel: ${channelName}`);
  }
}

async function deleteChannel(channelName) {
  const filePath = path.join(directoryPath, `${channelName}.txt`);

  try {
    await fs.access(filePath);
    await fs.unlink(filePath);
    delete fileContents[channelName];
    const index = fileNames.indexOf(channelName);
    if (index !== -1) {
      fileNames.splice(index, 1);
    }
    console.log(`${channelName} removed from channel list successfully :(.`);
  } catch (err) {
    console.error(`Error deleting channel "${channelName}":`, err);
  }
}

async function updateFile(channelName, newUsername, newPB, newModifier) {
  const filePath = path.join(directoryPath, `${channelName}.txt`);

  try {
    const content = await fs.readFile(filePath, "utf8");
    const lines = content.split("\n");

    if (newUsername) {
      lines[0] = newUsername;
    }
    if (newPB) {
      lines[1] = newPB;
    }
    if (newModifier) {
      lines[2] = newModifier;
    }

    fileContents[channelName] = lines;
    await fs.writeFile(filePath, lines.join("\n"), "utf8");
  } catch (err) {
    console.error(`Error updating file for channel "${channelName}":`, err);
  }
}

async function loadFilesAndContents() {
  try {
    const files = await fs.readdir(directoryPath);

    for (const file of files) {
      const filePath = path.join(directoryPath, file);
      const stat = await fs.stat(filePath);

      if (stat.isFile()) {
        const content = await fs.readFile(filePath, "utf8");
        const lines = content.split("\n");
        const normalizedChannel = file.replace('.txt', ''); // Remove .txt extension
        fileNames.push(normalizedChannel);
        fileContents[normalizedChannel] = lines;
      }
    }
  } catch (err) {
    console.error("Error reading files:", err);
  }
}

async function initialize() {
  await ensureChannelsDirectoryExists(); // Ensure directory exists
  await createNewFile("arsoniv"); // Create new file after directory check
  await loadFilesAndContents(); // Load existing files
}

initialize(); // Start initialization process

const opts = {
  identity: {
    username: "ActiniumBot",
    password: "oauth:bxxdocv8ztpsmen4xoj9ldxhv3j8v9",
  },
  channels: fileNames,
};

const client = new tmi.Client(opts);

client.on("message", (channel, userstate, message, self) => {
  const username = userstate.username;
  const normalizedChannel = channel.replace("#", "");
  const modText = fileContents[normalizedChannel][2];
  if (self) return;

  // Bot commands
  if (
    (message.toLowerCase().includes("hello") ||
      message.toLowerCase().includes("hi")) &&
    (message.toLowerCase().includes("bot") ||
      message.toLowerCase().includes("actinium"))
  ) {
    client.say(channel, `Hello, ${userstate["display-name"]}!`);
  }

  if (message.toLowerCase() === modText + "pb") {
    if (
      fileContents[normalizedChannel] &&
      fileContents[normalizedChannel].length > 1
    ) {
      client.say(channel, "RSG: " + fileContents[normalizedChannel][1]);
    } else {
      client.say(channel, "No PB data available.");
    }
  }

  if (message.toLowerCase() === "+actinium") {
    createNewFile(username);
    client.say(channel, `Added: ${username} to channels list!`);
  }
  
  if (message.toLowerCase() === "-actinium") {
    deleteChannel(username);
    client.say(
      channel,
      `${username} removed from channel list successfully :(.`,
    );
  }

  // Username change command
  if (message.toLowerCase().startsWith("^chuser")) {
    const args = message.split(" ");
    if (username === normalizedChannel && args.length === 2) {
      const newUsername = args[1];
      updateFile(normalizedChannel, newUsername, "", "");
      client.say(channel, `Username updated to ${newUsername}`);
    } else {
      client.say(
        channel,
        "Only the broadcaster can use this command or provide your Minecraft username.",
      );
    }
  }

  // Mod text change command
  if (message.toLowerCase().startsWith("^chmod")) {
    const args = message.split(" ");
    if (username === normalizedChannel && args.length === 2) {
      const newModText = args[1];
      updateFile(normalizedChannel, "", "", newModText);
      client.say(channel, `ModText updated to ${newModText}`);
    } else {
      client.say(
        channel,
        "Only the broadcaster can use this command or provide your desired ModText.",
      );
    }
  }

  // Personal best update command
  if (message.toLowerCase().startsWith("^chpb")) {
    const args = message.split(" ");
    if (username === normalizedChannel && args.length === 2) {
      const newPb = args[1];
      updateFile(normalizedChannel, "", newPb, "");
      client.say(channel, `PB updated to ${newPb}`);
    } else {
      client.say(
        channel,
        "Only the broadcaster can use this command or provide your RSG PB.",
      );
    }
  }

  // Elo rank command
  if (
    message.toLowerCase().startsWith(modText + "elo") ||
    message.toLowerCase().startsWith(modText + "rank")
  ) {
    const args = message.split(" ");
    if (args.length !== 2) {
      args.push(fileContents[normalizedChannel][0]);
    }

    (async () => {
      try {
        const response = await fetch(
          "https://mcsrranked.com/api/users/" +
            fileContents[normalizedChannel][0],
        );
        if (!response.ok) {
          throw new Error("Network response was not ok");
        }
        const data = await response.json();
        const eloRate = data.data.eloRate;
        const eloRank = data.data.eloRank;
        client.say(channel, `${args[1]}'s Elo: ${eloRate}, #${eloRank}.`);
      } catch (error) {
        console.error("Fetch error:", error);
        client.say(
          channel,
          `Sorry, I couldn't fetch the Elo for ${fileContents[normalizedChannel][0]}.`,
        );
      }
    })();
  }
});

client.on("connected", (addr, port) => {
  console.log(`Connected to ${addr}:${port}`);
});

client.connect();

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});