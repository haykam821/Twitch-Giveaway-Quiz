const pick = require("lodash.samplesize");

const debug = require("debug");
const log = debug("twitch-giveaway-quiz");

const parser = require("@snooful/orangered-parser");

let giveaway = null;

function isGiveawayOpen() {
	if (giveaway === null) return false;

	return giveaway.endsAt > Date.now();
}

parser.register([{
	arguments: [{
		key: "correct-choice",
		type: "string",
		required: true,
	}],
	handler: args => {
		if (!(args.context && args.context.badges && args.context.badges.broadcaster === "1")) {
			return args.send("You must be the broadcaster to use this command.");
		} else if (giveaway === null) {
			return args.send("There is no giveaway currently.");
		} else if (giveaway.endsAt > Date.now()) {
			return args.send("The giveaway's selection period has not ended yet.");
		} else if (!giveaway.choices.includes(args.correctChoice)) {
			return args.send("That was not an option.");
		}

		const winners = giveaway.selectionsByChoice[args.correctChoice];
		if (winners.length === 0) {
			args.send("Unfortunately, nobody picked that choice. :(");
		} else {
			const sample = pick(winners, 3);
			args.send("The winners are: " + sample.join(", "));
		}

		clearTimeout(giveaway.timeoutID);
		giveaway = null;

		log(giveaway);
	},
	name: "winner",
}, {
	arguments: [{
		key: "choices",
		type: "string",
	}],
	handler: args => {
		if (!(args.context && args.context.badges && args.context.badges.broadcaster === "1")) {
			args.send("You must be the broadcaster to use this command.");
		}

		const choices = args.choices.split(", ");

		const timeoutID = setTimeout(() => {
			args.send("The giveaway's selection period has ended after 10 seconds.");
		}, 10000);

		giveaway = {
			timeoutID,
			selectionsByChoice: choices.reduce((acc, choice) => {
				acc[choice] = [];
				return acc;
			}, {}),
			hasSelected: [],
			choices,
			endsAt: Date.now() + 10000, // in 10 seconds
		};

		args.send(`A giveaway has been created. It will end in 10 seconds. Use !select <choice> to select a choice from the following: ${choices.join(", ")}`);

		log(giveaway);
	},
	name: "subgiveaway",
}, {
	arguments: [{
		key: "choice",
		type: "string",
		required: true,
	}],
	handler: args => {
		if (!isGiveawayOpen()) {
			return client.say(args.target, "There is no giveaway with selections open currently.");
		} else if (!giveaway.choices.includes(args.choice)) {
			return args.send("That is not an available option. The options are: " + giveaway.choices.join(", "))
		} else if (giveaway.hasSelected.includes(args.context.username)) {
			return args.send("You have already selected.");
		}

		giveaway.selectionsByChoice[args.choice].push(args.context.username);
		giveaway.hasSelected.push(args.context.username);

		args.send(`You have selected the '${args.choice}' choice.`);

		log(giveaway);
	},
	name: "select",
}]);

const tmi = require("tmi.js");
const client = new tmi.client({
	identity: {
		username: process.env.BOT_USERNAME,
		password: process.env.OAUTH_TOKEN,
	},
	channels: [
		process.env.CHANNEL_NAME,
	],
});

client.on("message", (target, context, msg, self) => {
	if (!msg.startsWith("!")) return;
	if (self) return;

	try {
		parser.parse(msg.slice(1), {
			context,
			target,
			send: msg => {
				return client.say(target, msg);
			},
			localize: key => "Error: " + key.replace(/_/g, " ") + ". :(",
		});
	} catch (error) {
		client.say(target, "Sorry, something went wrong.");
		log("An error occurred during parse/execution of command: %o", error);
	}
});
client.on("connected", () => {
	log("Ready!");
});

client.connect();