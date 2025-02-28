const tmi = require("tmi.js");
const fetch = require("cross-fetch");

const {Pool} = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
})

const fileNames = [];
const fileContents = {};

async function ensureChannelsTableExists() {
    try {
        await pool.query(`
      CREATE TABLE IF NOT EXISTS channels (
        channel_name TEXT PRIMARY KEY,
        username TEXT,
        commands TEXT[][],
        modifier TEXT
      )
    `);
        console.log("Channels table ensured.");
    } catch (err) {
        console.error("Error ensuring channels table:", err);
    }
}

async function addNewChannel(channelName) {
    try {
        const res = await pool.query(
            "SELECT * FROM channels WHERE channel_name = $1",
            [channelName]
        );

        if (res.rows.length > 0) {
            console.log(`${channelName} already exists in the database.`);
        } else {
            await pool.query(
                "INSERT INTO channels (channel_name, username, commands, modifier) VALUES ($1, $2, $3, $4)",
                [channelName, channelName, [["pb", "your pb"]], "!"]
            );
            fileNames.push(channelName);
            fileContents[channelName] = [
                channelName,
                [["pb", "your pb"]],
                "!",
            ];
            console.log(`Created entry for channel: ${channelName}`);
        }
    } catch (err) {
        console.error(`Error creating entry for channel "${channelName}":`, err);
    }
}

async function deleteChannel(channelName) {
    try {
        await pool.query("DELETE FROM channels WHERE channel_name = $1", [
            channelName,
        ]);
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

async function updateDatabase(channelName, newUsername, newCommands, newModifier) {
    try {

        const formattedCommands = Array.isArray(newCommands)
            ? `{${newCommands.map(cmd => `"${cmd[0]}","${cmd[1]}"`).join(",")}}`
            : '{}';

        await pool.query(
            "UPDATE channels SET username = $1, commands = $2, modifier = $3 WHERE channel_name = $4",
            [newUsername, formattedCommands, newModifier, channelName]
        );

        fileContents[channelName] = [
            newUsername,
            newCommands,
            newModifier,
        ];

    } catch (err) {
        console.error(`Error updating entry for channel "${channelName}":`, err);
    }
}


async function loadChannelsFromDatabase() {
    try {
        const res = await pool.query("SELECT * FROM channels");

        res.rows.forEach((row) => {
            const {channel_name, username, commands, modifier} = row;
            fileNames.push(channel_name);
            console.log('added '+channel_name)
            fileContents[channel_name] = [username, commands, modifier];
        });
        console.log(res.rows)
    } catch (err) {
        console.error("Error loading data from database:", err);
    }
}

async function initialize() {
    await ensureChannelsTableExists();
    await loadChannelsFromDatabase();
}

initialize();

console.log(fileNames);
console.log(fileContents);

const opts = {
    identity: {
        username: "ActiniumBot",
        password: "oauth:70402aw9cpohlq5sau23rolbdobz8j",
    },
    channels: fileNames,
};

const client = new tmi.Client(opts);

client.on("message", async (channel, userstate, message, self) => {
    const username = userstate.username;
    const normalizedChannel = channel.replace("#", "");
    const modText = fileContents[normalizedChannel][2];
    if (self) return;

    // Bot commands
    if (
        (message.toLowerCase().includes("hello ") ||
            message.toLowerCase().includes("hi ")) &&
        (message.toLowerCase().includes(" bot") ||
            message.toLowerCase().includes(" actinium"))
    ) {
        const random = Math.random();
        if (random < 0.1) {
            client.say(
                channel,
                `${userstate["display-name"]}, do you believe that Jesus is the lord and saviour?`
            );
        } else {
            client.say(channel, `Hi ${userstate["display-name"]}!`);
        }
    }

    if (message.toLowerCase().includes("+actinium")) {
        const args = message.split(" ");
        if (args.length < 2) {
            args.push(username);
        }
        if (username === args[1] || username === "arsoniv") {
            addNewChannel(args[1]);
            client.say(channel, `${args[1]} added to channel list :)`);
        }
    }

    if (message.toLowerCase().includes("-actinium")) {
        const args = message.split(" ");
        if (args.length < 2) {
            args.push(username);
        }
        if (username === args[1] || username === "arsoniv") {
            deleteChannel(args[1]);
            client.say(channel, `${args[1]} removed from channel list :(`);
        }
    }

    console.log(fileContents[normalizedChannel][1]);
    for (const [key, value] of fileContents[normalizedChannel][1]) {
        if (message.toLowerCase().includes(modText + "" + key)) {
            client.say(channel, value + ".");
        }
    }


    // Username change command
    if (message.toLowerCase().startsWith("^chuser")) {
        const args = message.split(" ");
        if (username === normalizedChannel || username === "arsoniv") {
            if (args.length === 2) {
                const newUsername = args[1];
                updateDatabase(normalizedChannel, newUsername, fileContents[normalizedChannel][1], modText);
                client.say(channel, `Username updated to ${newUsername}`);
            } else {
                client.say(channel, "Provide your minecraft username.");
            }
        } else {
            client.say(channel, "Only the broadcaster can use this command.");
        }
    }


    if (message.toLowerCase().startsWith("^addcom")) {
        const args = message.split(" ");
        if (username === normalizedChannel || username === "arsoniv") {
            if (args.length >= 3) {
                const trigger = args[1];
                const result = args.slice(2).join(" ");

                let newCommands = fileContents[normalizedChannel][1];
                newCommands.push([trigger, result]);

                updateDatabase(normalizedChannel, fileContents[normalizedChannel][0], newCommands, modText);
                client.say(channel, `Added new command: ${trigger}`);
            } else {
                client.say(channel, "Provide a trigger and result.");
            }
        } else {
            client.say(channel, "Only the broadcaster can use this command.");
        }
    }

    if (message.toLowerCase().startsWith(modText + "commands")) {
        let commands = fileContents[normalizedChannel][1];
        let message = normalizedChannel + "'s custom commands: "
        commands.forEach(command => {
            message += command[0] + " ";
        });
        client.say(channel, message);
    }

    if (message.toLowerCase().startsWith(modText + "msr")) {
        const args = message.split(" ");
        if (args.length !== 2) {
            args.push(fileContents[normalizedChannel][0]);
        }

        const data = await fetchMSApiData(args[1]);

        if (data) {
            client.say(channel, `${data.result.username} [${data.result.elo}]`)
        } else {
            client.say(channel, `Sorry, I could not fetch the data for ${args[1]}.`);
        }
    }

    if (message.toLowerCase().startsWith("^delcom")) {
        const args = message.split(" ");
        if (username === normalizedChannel || username === "arsoniv") {
            if (args.length === 2) {
                const trigger = args[1];
                let oldCommands = fileContents[normalizedChannel][1];

                // Filter out the command with the specified trigger
                const newCommands = oldCommands.filter(subArray => subArray[0] !== trigger);

                // Update the file with the modified commands array
                updateDatabase(normalizedChannel, fileContents[normalizedChannel][0], newCommands, modText);

                client.say(channel, `Removed command: ${trigger}`);
            } else {
                client.say(channel, "Please provide a trigger to remove.");
            }
        } else {
            client.say(channel, "Only the broadcaster can use this command.");
        }
    }


    // Mod text change command
    if (message.toLowerCase().startsWith("^chmod")) {
        const args = message.split(" ");
        if (username === normalizedChannel || username === "arsoniv") {
            const newModText = args[1];
            updateDatabase(normalizedChannel, "", fileContents[normalizedChannel][1], newModText);
            client.say(channel, `ModText updated to ${newModText}`);
        } else {
            client.say(
                channel,
                "Only the broadcaster can use this command or provide your desired ModText."
            );
        }
    }

    function formatTimeFromMs(milliseconds) {
        const totalSeconds = Math.floor(milliseconds / 1000); // Convert ms to seconds
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        // Pad with zero if seconds are less than 10
        const formattedSeconds = seconds.toString().padStart(2, '0');
        const formattedMinutes = minutes.toString().padStart(2, '0');

        return `${formattedMinutes}:${formattedSeconds}`;
    }

    if (message.toLowerCase().startsWith(modText + "lastrun")) {
        const args = message.split(" ");
        if (args.length !== 2) {
            args.push(fileContents[normalizedChannel][0]);
        }

        await (async () => {
            const response2 = await fetch(
                "https://paceman.gg/stats/api/getRecentRuns?name=" +
                args[1] +
                "&limit=1"
            );
            const data2 = await response2.json(); // Parse the JSON response
            const data = data2[0];

            const stats = [
                {name: "nether", displayName: "Nether"},
                {name: "bastion", displayName: "Bastion"},
                {name: "fortress", displayName: "Fortress"},
                {name: "first_portal", displayName: "First Portal"},
                {name: "stronghold", displayName: "Stronghold"},
                {name: "end", displayName: "End"},
                {name: "finish", displayName: "Finish"},
            ];

            const date = new Date(data.time * 1000);

            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const year = date.getFullYear();
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');

            const formattedDate = `${day}-${month}-${year} ${hours}:${minutes}`;

            let message6 = (args[1] + "'s Most Recent Run:  ");

            message6 += `${formattedDate}  |  `;

            // Loop through the stats to display each piece of data
            stats.forEach((stat) => {
                if (data[stat.name]) {
                    const statData = data[stat.name];
                    message6 += `${stat.displayName}: ${formatTimeFromMs(statData)}  |  `;
                }
            });
            client.say(channel, message6);
        })();
    }

    if (message.toLowerCase().startsWith(modText + "paceman")) {
        const args = message.split(" ");

        if (args.length === 1) {
            args.push(fileContents[normalizedChannel][0]);
        }

        const parseCutoff = (cutoff) => {
            const parts = cutoff.split(":");
            return parts.length === 2 ? parseInt(parts[0]) * 60 + parseInt(parts[1]) : parseInt(parts[0]) * 60;
        };

        const calculateMedian = (arr) => {
            const sorted = [...arr].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        };

        const msToMinSec = (ms) => {
            const minutes = Math.floor(ms / 60000);
            const seconds = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
            return `${minutes}:${seconds}`;
        };

        await (async () => {
            const username = args[1];
            const split = args.length > 2 ? args[2].toLowerCase() : null;
            const cutoff = args.length > 3 ? parseCutoff(args[3]) * 1000 : null;

            const response = await fetch(
                `https://paceman.gg/stats/api/getRecentRuns/?name=${username}&hours=999999&limit=9999`
            );
            const data = await response.json();

            const stats = [
                {name: "nether", displayName: "Nether"},
                {name: "bastion", displayName: "Bastion"},
                {name: "fortress", displayName: "Fortress"},
                {name: "first_structure", displayName: "First Structure"},
                {name: "second_structure", displayName: "Second Structure"},
                {name: "first_portal", displayName: "First Portal"},
                {name: "stronghold", displayName: "Stronghold"},
                {name: "end", displayName: "End"},
                {name: "finish", displayName: "Finish"},
            ];

            let message6 = "";

            if (!split) {
                stats.forEach((stat) => {
                    const splitData = data.filter(run => run[stat.name] && (!cutoff || run[stat.name] <= cutoff))
                        .map(run => run[stat.name]);
                    if (splitData.length > 0) {
                        const count = splitData.length;
                        const avg = splitData.reduce((a, b) => a + b, 0) / count;
                        const median = calculateMedian(splitData);
                        const fastest = Math.min(...splitData);

                        message6 += `${stat.displayName}s: Count: ${count}, Mean: ${msToMinSec(avg)}, Median: ${msToMinSec(median)}, Fastest: ${formatTimeFromMs(fastest)}`;
                    }
                });
            } else {
                // Case 2 or 3: Specific split (with or without cutoff)
                const stat = stats.find(s => s.name === split);
                if (stat) {
                    const splitData = data.filter(run => run[stat.name] && (!cutoff || run[stat.name] <= cutoff)).map(run => formatTimeFromMs(run[stat.name]));

                    if (splitData.length > 0) {
                        const count = splitData.length;
                        const avg = splitData.reduce((a, b) => a + b, 0) / count;
                        const median = calculateMedian(splitData);
                        const fastest = Math.min(...splitData);

                        message6 += `${stat.displayName} (Total: ${count}, Median: ${median}, Average: ${avg}, Fastest: ${fastest}${(args.length > 3 ? 'Filter: ' + args[3] + ' ' : '')}- ${splitData.join(", ")}`;
                    } else {
                        message6 = `No times found for ${stat.displayName} split`;
                        if (cutoff) message6 += ` under ${args[3]}`;
                    }
                } else {
                    message6 = `No data found for split "${split}".`;
                }
            }

            client.say(channel, message6 || "No data available.");
        })();
    }


    if (message.toLowerCase().startsWith(modText + "pace ")) {
        const args = message.split(" ");
        if (args.length !== 2) {
            args.push(fileContents[normalizedChannel][0]);
        }


        await (async () => {
            const response2 = await fetch(
                "https://paceman.gg/stats/api/getSessionStats/?name=" +
                args[1] +
                "&hours=99999999&hoursBetween=999999999"
            );
            const data = await response2.json(); // Parse the JSON response

            // Check if data contains valid stats
            const stats = [
                {name: "nether", displayName: "Nether"},
                {name: "bastion", displayName: "Bastion"},
                {name: "fortress", displayName: "Fortress"},
                {name: "first_structure", displayName: "First Structure"},
                {name: "second_structure", displayName: "Second Structure"},
                {name: "first_portal", displayName: "First Portal"},
                {name: "stronghold", displayName: "Stronghold"},
                {name: "end", displayName: "End"},
                {name: "finish", displayName: "Finish"},
            ];

            let message6 = "";

            // Loop through the stats to display each piece of data
            stats.forEach((stat) => {
                const statData = data[stat.name];
                if (statData && statData.count > 0) {
                    message6 += `${stat.displayName}s: ${statData.count} (${statData.avg} avg)  |  `;
                }
            });
            client.say(channel, message6);
        })();
    }

    if (message.toLowerCase().startsWith(modText + "bible")) {
        await (async () => {
            try {
                const response = await fetch("https://bible-api.com/?random=verse");
                const data = await response.json();

                // Check if the API returned a verse
                client.say(channel, `${data.text}  |  ${data.reference}`);
            } catch (error) {
                console.error("Error fetching Bible verse:", error);
                client.say(
                    channel,
                    "Sorry, there was an error fetching the Bible verse."
                );
            }
        })();
    }
    if (message.toLowerCase().startsWith(modText + "joke")) {
        await (async () => {
            try {
                const response = await fetch("https://v2.jokeapi.dev/joke/Any");
                const data = await response.json();

                // Check if the API returned a verse
                client.say(channel, `${data.setup}  |  ${data.delivery}`);
            } catch (error) {
                console.error("Error fetching Bible verse:", error);
                client.say(
                    channel,
                    "Sorry, there was an error fetching the Bible verse."
                );
            }
        })();
    }

    if (message.toLowerCase().startsWith(modText + "fact")) {
        await (async () => {
            try {
                const response = await fetch(
                    "https://uselessfacts.jsph.pl/random.json?language=en"
                );
                const data = await response.json();

                // Check if the API returned a verse
                client.say(channel, `${data.text}`);
            } catch (error) {
                console.error("Error fetching Bible verse:", error);
                client.say(
                    channel,
                    "Sorry, there was an error fetching the Bible verse."
                );
            }
        })();
    }

    if (message.toLowerCase().startsWith(modText + "listusers")) {
        client.say(channel, "Users: " + fileNames.join(", "))
    }

    if (message.toLowerCase().startsWith(modText + "catfact")) {
        await (async () => {
            try {
                const response = await fetch("https://catfact.ninja/fact");
                const data = await response.json();
                client.say(channel, `${data.fact}`);
            } catch (error) {
                console.error("Error fetching Bible verse:", error);
                client.say(
                    channel,
                    "Sorry, there was an error fetching the Bible verse."
                );
            }
        })();
    }

    if (message.toLowerCase().startsWith(modText + "session")) {
        const args = message.split(" ");
        if (args.length !== 2) {
            args.push(fileContents[normalizedChannel][0]);
        }

        await (async () => {
            const response2 = await fetch(
                "https://paceman.gg/stats/api/getSessionStats/?name=" +
                args[1] +
                "&hours=24&hoursBetween=2"
            );
            const data = await response2.json(); // Parse the JSON response

            // Check if data contains valid stats
            const stats = [
                {name: "nether", displayName: "Nether"},
                {name: "bastion", displayName: "Bastion"},
                {name: "fortress", displayName: "Fortress"},
                {name: "first_structure", displayName: "First Structure"},
                {name: "second_structure", displayName: "Second Structure"},
                {name: "first_portal", displayName: "First Portal"},
                {name: "stronghold", displayName: "Stronghold"},
                {name: "end", displayName: "End"},
                {name: "finish", displayName: "Finish"},
            ];

            let message6 = "";

            // Loop through the stats to display each piece of data
            stats.forEach((stat) => {
                const statData = data[stat.name];
                if (statData && statData.count > 0) {
                    message6 += `${stat.displayName}s: ${statData.count} (${statData.avg} avg)  |  `;
                }
            });
            client.say(channel, message6);
        })();
    }

    // Elo rank command
    if (
        message.toLowerCase().startsWith(modText + "elo")
    ) {
        const args = message.split(" ");
        if (args.length !== 2) {
            args.push(fileContents[normalizedChannel][0]);
        }

        await (async () => {
            try {
                const response = await fetch(
                    "https://mcsrranked.com/api/users/" + args[1]
                );
                const data = await response.json();
                const eloRate = data.data.eloRate;
                const eloRank = data.data.eloRank;
                const wins = data.data.statistics.season.wins.ranked;
                const losses = data.data.statistics.season.loses.ranked;
                const matches = data.data.statistics.season.playedMatches.ranked;
                const bestWS = data.data.statistics.total.highestWinStreak.ranked;
                const winRate = matches > 0 ? ((wins / matches) * 100) : 0;
                client.say(channel, `${args[1]}'s elo: ${eloRate} | #${eloRank} | ${wins}W - ${losses}L  | ${Math.floor(winRate)}% | Matches: ${matches} | Best WS: ${bestWS}`);
            } catch (error) {
                console.error("Fetch error:", error);
                client.say(
                    channel,
                    `Sorry, I couldn't fetch the Elo for ${args[1]}.`
                );
            }
        })();
    }
});

client.on("raided", (channel, username, viewers) => {
    client.say(channel, `FREE VIEWERS?`);
    client.say(channel, `Thank you ${username} for ${viewers} free viewer${viewers === 1 ? '' : 's'}`);
});

client.on("connected", (addr, port) => {
    console.log(`Connected to ${addr}:${port}`);
});

client.connect();
