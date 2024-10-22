const tmi = require("tmi");
const fs = require("fs").promises;
const path = require("path");

const fileNames = [];
const fileContents = {};

const directoryPath = path.join(__dirname, "channels");

async function createNewFile(channelName) {
  const filePath = path.join(directoryPath, `${channelName}`);

  try {
    await fs.access(filePath);
  } catch (err) {
    const defaultContent = `${channelName}\n\n!`;
    await fs.writeFile(filePath, defaultContent, "utf8");
    fileNames.push(channelName);
    fileContents[channelName] = [channelName];
  }
}

async function deleteChannel(channelName) {
  const filePath = path.join(directoryPath, `${channelName}`);

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

async function updateFile(channelName, newUsername, newPB, newModifyer) {
  const filePath = path.join(directoryPath, `${channelName}`);

  try {
    const content = await fs.readFile(filePath, "utf8");
    const lines = content.split("\n");

    if (newUsername) {
      lines[0] = newUsername;
    }
    if (newPB) {
      lines[1] = newPB;
    }
    if (newModifyer) {
      lines[2] = newModifyer;
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
        const normalizedChannel = file;
        fileNames.push(normalizedChannel);
        fileContents[normalizedChannel] = lines;
      }
    }
  } catch (err) {
    console.error("Error reading files:", err);
  }
}

loadFilesAndContents();

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
