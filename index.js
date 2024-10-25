const tmi = require("tmi.js");
const fs = require("fs").promises;
const path = require("path");
const fetch = require("cross-fetch");
const { architect, Network } = require("neataptic");
const axios = require("axios");

const express = require("express");
const app = express();
const port = process.env.PORT || 3000; // Use Render's port or default to 3000

// Health Check Endpoint
app.get("/health", (req, res) => {
  console.log("pinged");
  res.status(200).end();
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
        const normalizedChannel = file.replace(".txt", ""); // Remove .txt extension
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
    (message.toLowerCase().includes(" hello ") ||
      message.toLowerCase().includes(" hi ")) &&
    (message.toLowerCase().includes(" bot ") ||
      message.toLowerCase().includes(" actinium "))
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
      client.say(
        channel,
        "No PB data available, pb can be set with ^pb by channel owner"
      );
    }
  }

  if (message.toLowerCase() === "+actinium") {
    createNewFile(username);
    client.say(channel, `${username} added to channel list :)`);
  }

  if (message.toLowerCase() === "-actinium") {
    deleteChannel(username);
    client.say(
      channel,
      `${username} removed from channel list successfully :(.`
    );
  }

  // Username change command
  if (message.toLowerCase().startsWith("^chuser")) {
    const args = message.split(" ");
    if (username === (normalizedChannel || "arsoniv")) {
      if (args.length === 2) {
        const newUsername = args[1];
        updateFile(normalizedChannel, newUsername, "", "");
        client.say(channel, `Username updated to ${newUsername}`);
      } else {
        client.say(channel, "Provide your minecraft username.");
      }
    } else {
      client.say(channel, "Only the broadcaster can use this command.");
    }
  }

  // Mod text change command
  if (message.toLowerCase().startsWith("^chmod")) {
    const args = message.split(" ");
    if (username === (normalizedChannel || "arsoniv") && args.length === 2) {
      const newModText = args[1];
      updateFile(normalizedChannel, "", "", newModText);
      client.say(channel, `ModText updated to ${newModText}`);
    } else {
      client.say(
        channel,
        "Only the broadcaster can use this command or provide your desired ModText."
      );
    }
  }

  // Personal best update command
  if (message.toLowerCase().startsWith("^chpb")) {
    const args = message.split(" ");
    if (username === (normalizedChannel || "arsoniv") && args.length === 2) {
      const newPb = args[1];
      updateFile(normalizedChannel, "", newPb, "");
      client.say(channel, `PB updated to ${newPb}`);
    } else {
      client.say(
        channel,
        "Only the broadcaster can use this command or provide your RSG PB."
      );
    }
  }

  if (message.toLowerCase().includes(modText + "aipred")) {
    const args = message.split(" ");

    // Immediately invoke the async function
    (async () => {
      let seedType = 0;

      switch (args[3]) {
        case "village":
          seedType = 1;
          break;
        case "ship":
          seedType = 2;
          break;
        case "temple":
          seedType = 3;
          break;
        case "portal":
          seedType = 4;
          break;
        case "bt":
          seedType = 5;
          break;
        default:
          break;
      }
      let bastionType = 0;
      switch (args[4]) {
        case "treasure":
          bastionType = 1;
          break;
        case "houseing":
          bastionType = 2;
          break;
        case "stables":
          bastionType = 3;
          break;
        case "bridge":
          bastionType = 4;
          break;
        default:
          break;
      }
      if ((seedType || bastionType) === 0) {
        client.say(channel, `Please provide valid arguments`);
      } else {
        try {
          const response1 = await fetch(
            "https://mcsrranked.com/api/users/" + args[2]
          );
          const response2 = await fetch(
            "https://mcsrranked.com/api/users/" + args[1]
          );
          const data4 = await response2.json();
          const data3 = await response1.json();
          const uuid = data4.data.uuid;
          const elo1 = data4.data.eloRate;
          const elo2 = data3.data.eloRate;
          client.say(channel, `running simulation...`);
          aiPred(
            uuid,
            args[1],
            channel,
            seedType,
            bastionType,
            elo1,
            elo2,
            args[2]
          );
        } catch (error) {
          console.error("Error fetching data:", error);
          client.say(channel, `Error fetching data for prediction.`);
        }
      }
    })(); // Call the async function here
  }

  if (
    message.toLowerCase().startsWith(modText + "pred") ||
    message.toLowerCase().startsWith(modText + "predict")
  ) {
    const args = message.split(" ");
    if (args.length !== 2) {
      args.push(fileContents[normalizedChannel][0]);
    }
    (async () => {
      try {
        const response2 = await fetch(
          "https://mcsrranked.com/api/users/" + args[1]
        );
        if (!response2.ok) {
          throw new Error("Network response was not ok");
        }
        const data4 = await response2.json();
        const response = await fetch(
          "https://mcsrranked.com/api/users/" + args[1] + "/matches"
        );
        if (!response.ok) {
          throw new Error("Network response was not ok");
        }

        // Fetch the data from the API response
        const data = await response.json();
        const data2 = data.data; // Correctly reference the 'data' from the API response

        if (data2.length === 0) {
          client.say(channel, `Could not find info for: ` + args[1]);
        } else {
          let total = 0;
          let index = 0;

          // Loop through the first 5 games
          for (let i = 0; i < 5 && i < data2.length; i++) {
            const game = data2[i];

            // Ensure 'players' and 'changes' arrays are defined and valid
            if (
              !game.players ||
              game.players.length < 2 ||
              !game.changes ||
              game.changes.length < 2
            ) {
              console.warn("Game data incomplete or malformed:", game);
              continue; // Skip this iteration if data is not valid
            }

            let uuid = data4.data.uuid;
            console.log(uuid);

            // Add the ELO change based on the correct player, only if changes array has valid data
            if (game.type === 2) {
              if (game.changes[0].uuid === uuid) {
                total += game.changes[0].change;
              } else if (game.changes[1].uuid === uuid) {
                total += game.changes[1].change;
              }
            } else {
              i--;
            }
            index++;
          }

          // Make a prediction based on the total ELO change
          if (total > 8) {
            client.say(
              channel,
              `For sure! If ` +
                args[1] +
                ` plays ranked, I think they will win. `
            );
          } else if (total < -8) {
            client.say(
              channel,
              `I think ` + args[1] + ` will lose if they play ranked. `
            );
          } else {
            client.say(
              channel,
              `Hard to tell how ` + args[1] + ` will do if they play ranked. `
            );
          }
        }
      } catch (error) {
        console.error("Fetch error:", error);
        client.say(channel, `Sorry, I couldn't predict for ${args[1]}.`);
      }
    })();
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
          "https://mcsrranked.com/api/users/" + args[1]
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
          `Sorry, I couldn't fetch the Elo for ${fileContents[normalizedChannel][0]}.`
        );
      }
    })();
  }
});

async function fetchMatchHistory(playerIn) {
  try {
    const response = await axios.get(
      "https://mcsrranked.com/api/users/" + playerIn + "/matches"
    ); // Replace with your actual API URL

    // Log the response to inspect its structure
    console.log("Response Data:", response.data.data);

    // Assuming the array of match data is under a certain key (e.g., 'matches')
    // Adjust this based on your actual API response
    const matchHistory = response.data.data;

    return matchHistory;
  } catch (error) {
    console.error("Error fetching match history:", error);
    return [];
  }
}
function prepareTrainingData(matchHistory, uuid) {
  const trainingData = [];

  matchHistory.forEach((match) => {
    let playersIndex1 = 0;
    let playersIndex2 = 1;
    if (match.players[0].uuid === uuid) {
      playersIndex1 = 1;
      playersIndex2 = 0;
    }
    const oppoElo = match.players[playersIndex2].eloRate;
    const elo = match.players[playersIndex1].eloRate;
    let seedType = 0;
    const time = match.result.time;
    switch (match.seedType) {
      case "VILLAGE":
        seedType = 1;
        break;
      case "SHIPWRECK":
        seedType = 2;
        break;
      case "DESERT_TEMPLE":
        seedType = 3;
        break;
      case "RUINED_PORTAL":
        seedType = 4;
        break;
      case "BURIED_TREASURE":
        seedType = 5;
        break;
      default:
        break;
    }
    let bastionType = 0;
    switch (match.bastionType) {
      case "TREASURE":
        bastionType = 1;
        break;
      case "HOUSING":
        bastionType = 2;
        break;
      case "STABLES":
        bastionType = 3;
        break;
      case "BRIDGE":
        bastionType = 4;
        break;
      default:
        break;
    }
    let win = 0;
    let win2 = 1;
    if (match.result.uuid === uuid) {
      win = 1;
      win2 = 0;
    }

    if (match.result.uuid === null) {
      win = 0;
      win2 = 0;
    }

    const input = [elo, oppoElo, seedType, bastionType];

    const output = [win, win2, time];

    if (elo === null || oppoElo === null) {
      console.log("skipped due to null elo");
    } else {
      trainingData.push({ input, output });
    }
  });
  console.log(trainingData);
  return trainingData;
}

async function trainNetwork(network, trainingData) {
  network.train(trainingData, {
    rate: 0.1, // Learning rate
    iterations: 10000, // Number of training iterations
    error: 0.1, // Acceptable error threshold
    log: 1000, // Log the training progress every 1000 iterations
    shuffle: true, // Shuffle the training data before each iteration
  });

  console.log("Training completed.");
}

async function testNetwork(
  network,
  elo1,
  elo2,
  seedT,
  basT,
  channel,
  player1,
  player2
) {
  // Define an example input to test the network
  // The input structure should match the same format used in training
  const testInput = [
    elo1, // Example ELO rating for the player
    elo2, // Example ELO rating for the opponent
    seedT, // Seed type (e.g., 2 for SHIPWRECK)
    basT,
  ];

  // Activate the network with the test input
  const output = network.activate(testInput);

  const endResult = output[0] - output[1];

  if (endResult > 0) {
    client.say(
      channel,
      `Anylisis Complete! Results: ` + player1 + " beats " + player2
    );
  } else {
    client.say(
      channel,
      `Anylisis Complete! Results: ` + player1 + " loses to " + player2
    );
  }

  // Log the output of the network (should be an array of predictions)

  console.log("Network Output:", output);
}

async function aiPred(uuid, player, channel, seedT, basT, elo1, elo2, player2) {
  const network = new architect.Perceptron(4, 8, 8, 3);
  const matchHistory = await fetchMatchHistory(player);
  if (matchHistory.length === 0) {
    console.log("No match history found.");
    return;
  }

  const trainingData = prepareTrainingData(matchHistory, uuid);
  await trainNetwork(network, trainingData);

  testNetwork(network, elo1, elo2, seedT, basT, channel, player, player2);
}

client.on("connected", (addr, port) => {
  console.log(`Connected to ${addr}:${port}`);
});

client.connect();

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
