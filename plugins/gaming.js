import { Module } from "../lib/plugins.js";
import { db } from "../lib/client.js";

/**
 * VX MD BOT — Group Gaming
 *
 * Persistent setting:
 *   gaming:<groupJid>:enabled
 *
 * Runtime game sessions live in memory. This is intentional: an active game
 * resets after a bot restart, while the ON/OFF setting stays in the DB.
 */

const sessions = new Map();
const MAX_PLAYERS = 6;
const GAME_TTL = 5 * 60 * 1000;

const getBotNum = (message) => {
  const raw =
    message?.botnum ||
    message?.conn?.user?.id ||
    message?.conn?.user?.jid ||
    "";
  return String(raw).split("@")[0].split(":")[0].replace(/\D/g, "") || null;
};

const key = (group) => `gaming:${group}:enabled`;

const enabled = (message) => {
  if (!message?.isGroup) return false;
  const botNum = getBotNum(message);
  return !!botNum && db.get(botNum, key(message.from), false) === true;
};

const isAdmin = (message) =>
  !!(
    message?.isFromMe ||
    message?.isfromMe ||
    message?.isAdmin ||
    message?.isGroupAdmin
  );

const sender = (message) =>
  message?.sender ||
  message?.key?.participant ||
  message?.participant ||
  "";

const playerName = (message) =>
  String(message?.pushName || sender(message).split("@")[0] || "Player");

const mention = (jid) => (jid ? `@${String(jid).split("@")[0]}` : "Player");

const send = (message, text, mentions = []) =>
  message.send(text, mentions.length ? { mentions } : undefined);

function cleanup(group) {
  const s = sessions.get(group);
  if (s && Date.now() - s.createdAt > GAME_TTL) sessions.delete(group);
  return sessions.get(group);
}

function newSession(group, type) {
  const s = {
    group,
    type,
    createdAt: Date.now(),
    players: new Map(),
    data: {},
  };
  sessions.set(group, s);
  return s;
}

function addPlayer(s, message) {
  const jid = sender(message);
  if (!jid) return { ok: false, reason: "player" };

  if (!s.players.has(jid) && s.players.size >= MAX_PLAYERS) {
    return { ok: false, reason: "full" };
  }

  if (!s.players.has(jid)) {
    s.players.set(jid, {
      jid,
      name: playerName(message),
      joinedAt: Date.now(),
    });
  }

  return { ok: true, player: s.players.get(jid) };
}

function helpText() {
  return (
    `╭━━━〔 🎮 *VX GROUP GAMING* 〕━━━╮\n` +
    `┃ 🎯 .game — গেমিং মেনু\n` +
    `┃ 🔎 .game search — সব গেম\n` +
    `┃ 🏁 .game rps — Rock Paper Scissors\n` +
    `┃ 🧠 .game quiz — Quiz Battle\n` +
    `┃ ➗ .game math — Math Race\n` +
    `┃ 🔢 .game guess — Number Guess\n` +
    `┃ 🎲 .game dice — Dice Battle\n` +
    `┃ 🔤 .game word — Word Chain\n` +
    `┃ 🛑 .game stop — চলমান গেম বন্ধ করুন\n` +
    `┃\n` +
    `┃ 👥 একটি গেমে সর্বোচ্চ ৬ জন খেলোয়াড়\n` +
    `┃ 💬 গেম শুরু হওয়ার পর সব মেম্বার খেলতে পারবেন\n` +
    `┃ ✨ .game ছাড়াও game/rps/quiz/dice লিখে\n` +
    `┃    গেম শুরু করা যাবে\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━━━━╯`
  );
}

function listText() {
  return (
    `🎮 *AVAILABLE GROUP GAMES*\n\n` +
    `🏁 *RPS* — Rock / Paper / Scissors (2–6)\n` +
    `🧠 *QUIZ* — সঠিক উত্তর দিয়ে জিতুন\n` +
    `➗ *MATH* — সবচেয়ে দ্রুত সঠিক উত্তর\n` +
    `🔢 *GUESS* — লুকানো নম্বর খুঁজুন\n` +
    `🎲 *DICE* — সবচেয়ে বড় রোল জিতবে\n` +
    `🔤 *WORD* — Word Chain Battle\n\n` +
    `👉 শুরু করতে: *.game <name>*\n` +
    `উদাহরণ: *.game rps*`
  );
}

function rpsHelp() {
  return (
    `🏁 *RPS BATTLE*\n\n` +
    `২–৬ জন খেলতে পারবেন।\n` +
    `Join: *.game join*\n` +
    `Move: *.game rock* / *.game paper* / *.game scissors*\n\n` +
    `কমপক্ষে ২ জন খেলোয়াড় move দিলে round result আসবে।`
  );
}

const quizBank = [
  {
    q: "ভারতের রাজধানী কী?",
    a: ["delhi", "new delhi", "নয়াদিল্লি", "নয়া দিল্লি", "নয়াদিল্লি"],
    show: "নয়া দিল্লি",
  },
  {
    q: "2 + 2 × 3 = ?",
    a: ["8"],
    show: "8",
  },
  {
    q: "পৃথিবীর প্রাকৃতিক উপগ্রহ কী?",
    a: ["moon", "চন্দ্র", "চাঁদ"],
    show: "চাঁদ",
  },
  {
    q: "WhatsApp কোন কোম্পানির অংশ?",
    a: ["meta"],
    show: "Meta",
  },
  {
    q: "পানির chemical formula কী?",
    a: ["h2o"],
    show: "H₂O",
  },
  {
    q: "ভারতের জাতীয় পশু কী?",
    a: ["tiger", "বাঘ"],
    show: "বাঘ",
  },
  {
    q: "এক সপ্তাহে কত দিন?",
    a: ["7", "seven", "সাত"],
    show: "৭",
  },
  {
    q: "5 × 5 = ?",
    a: ["25"],
    show: "25",
  },
];

const words = [
  "apple",
  "tiger",
  "river",
  "music",
  "orange",
  "rocket",
  "garden",
  "school",
  "planet",
  "flower",
  "dragon",
  "friend",
];

function randomQuiz() {
  return quizBank[Math.floor(Math.random() * quizBank.length)];
}

function startQuiz(message) {
  const s = newSession(message.from, "quiz");
  const p = addPlayer(s, message);

  s.data.question = randomQuiz();
  s.data.answered = false;

  return send(
    message,
    `🧠 *QUIZ BATTLE STARTED!*\n\n` +
      `❓ ${s.data.question.q}\n\n` +
      `👥 Player: ${mention(p.player.jid)}\n` +
      `🏆 যে সবার আগে সঠিক উত্তর দেবে, সে round জিতবে!\n` +
      `⏱️ ৫ মিনিট পরে game auto-close হবে।`,
    [p.player.jid]
  );
}

function startMath(message) {
  const s = newSession(message.from, "math");
  addPlayer(s, message);

  const a = Math.floor(Math.random() * 30) + 5;
  const b = Math.floor(Math.random() * 20) + 2;
  const op = Math.random() < 0.5 ? "+" : "×";
  const answer = op === "+" ? a + b : a * b;

  s.data = {
    a,
    b,
    op,
    answer,
    solved: false,
  };

  return send(
    message,
    `➗ *MATH RACE STARTED!*\n\n` +
      `❓ *${a} ${op} ${b} = ?*\n\n` +
      `সবচেয়ে আগে সঠিক answer পাঠান।\n` +
      `👥 ২–৬ players • 🏆 First correct wins`
  );
}

function startGuess(message) {
  const s = newSession(message.from, "guess");
  addPlayer(s, message);

  s.data.number = Math.floor(Math.random() * 100) + 1;
  s.data.guesses = new Map();

  return send(
    message,
    `🔢 *NUMBER GUESS STARTED!*\n\n` +
      `আমি *১ থেকে ১০০*-এর মধ্যে একটি number বেছে নিয়েছি।\n` +
      `যে কোনো member শুধু number পাঠান, যেমন: *.game 42*\n` +
      `আমি HIGH/LOW জানিয়ে দেব।\n\n` +
      `🏆 সঠিক number যে পাবে, সে জিতে যাবে!`
  );
}

function startDice(message) {
  const s = newSession(message.from, "dice");
  const p = addPlayer(s, message);

  s.data.rolls = new Map([
    [p.player.jid, Math.floor(Math.random() * 6) + 1],
  ]);

  return send(
    message,
    `🎲 *DICE BATTLE STARTED!*\n\n` +
      `@${p.player.jid.split("@")[0]} *${s.data.rolls.get(p.player.jid)}* roll করেছে।\n\n` +
      `অন্য players: *.game roll*\n` +
      `সর্বোচ্চ ৬ জন players।\n` +
      `সবাই roll করলে সবচেয়ে বড় number জিতবে!`,
    [p.player.jid]
  );
}

function startWord(message) {
  const s = newSession(message.from, "word");
  const p = addPlayer(s, message);

  s.data.last = words[Math.floor(Math.random() * words.length)];

  return send(
    message,
    `🔤 *WORD CHAIN STARTED!*\n\n` +
      `Starting word: *${s.data.last}*\n` +
      `এখন এমন একটি English word পাঠান যা *${s.data.last.slice(-1).toUpperCase()}* দিয়ে শুরু হয়।\n\n` +
      `Join anytime: *.game join*\n` +
      `Move: *.game <word>*\n` +
      `👤 Started by ${mention(p.player.jid)}`,
    [p.player.jid]
  );
}

function startRps(message) {
  const s = newSession(message.from, "rps");
  const p = addPlayer(s, message);
  s.data.moves = new Map();

  return send(
    message,
    rpsHelp() +
      `\n\n👤 Joined: ${mention(p.player.jid)}`,
    [p.player.jid]
  );
}

async function handleActive(message, args) {
  const s = cleanup(message.from);

  if (!s || !enabled(message)) return false;

  const input = String(args || "").trim();
  const low = input.toLowerCase();
  const jid = sender(message);

  if (low === "stop" || low === "end" || low === "cancel") {
    if (!isAdmin(message) && s.players.size && !s.players.has(jid)) {
      return send(
        message,
        "❌ শুধু game-এর খেলোয়াড় বা group admin game বন্ধ করতে পারবেন।"
      );
    }

    sessions.delete(message.from);

    await send(
      message,
      "🛑 *Game stopped.* নতুন game শুরু করতে `.game` লিখুন।"
    );

    return true;
  }

  if (low === "join" || low === "join game") {
    const p = addPlayer(s, message);

    if (!p.ok) {
      await send(
        message,
        p.reason === "full"
          ? "❌ Game full — সর্বোচ্চ ৬ জন player।"
          : "❌ Player শনাক্ত করা যায়নি।"
      );

      return true;
    }

    await send(
      message,
      `✅ ${mention(jid)} *${s.type.toUpperCase()}*-এ যোগ দিয়েছে (${s.players.size}/${MAX_PLAYERS})`,
      [jid]
    );

    return true;
  }

  if (s.type === "rps") {
    if (["rock", "paper", "scissors"].includes(low)) {
      const p = addPlayer(s, message);

      if (!p.ok) {
        return send(message, "❌ Game full।");
      }

      s.data.moves.set(jid, low);

      if (s.data.moves.size < 2) {
        await send(
          message,
          `✋ ${mention(jid)} *${low}* lock করেছে।\nআরেকজন player-এর জন্য অপেক্ষা করা হচ্ছে...`,
          [jid]
        );

        return true;
      }

      const moves = [...s.data.moves.entries()];

      const winning = (a, b) =>
        (a === "rock" && b === "scissors") ||
        (a === "scissors" && b === "paper") ||
        (a === "paper" && b === "rock");

      const winners = [];

      for (const [aJid, aMove] of moves) {
        const beats = moves.filter(
          ([, bMove]) => winning(aMove, bMove)
        );

        const loses = moves.filter(
          ([, bMove]) => winning(bMove, aMove)
        );

        if (beats.length && !loses.length) {
          winners.push(aJid);
        }
      }

      let result = `🏁 *RPS RESULT*\n\n`;

      for (const [pj, mv] of moves) {
        result += `• ${mention(pj)} → ${mv}\n`;
      }

      result += winners.length
        ? `\n🏆 Winner: ${winners.map(mention).join(", ")}`
        : `\n🤝 Draw!`;

      await send(
        message,
        result,
        moves.map(([x]) => x)
      );

      sessions.delete(message.from);

      return true;
    }

    return false;
  }

  if (s.type === "quiz") {
    const normalized = low
      .replace(/[?!.]/g, "")
      .trim();

    const q = s.data.question;

    const correct = q.a.some(
      (x) => normalized === String(x).toLowerCase()
    );

    if (correct && !s.data.answered) {
      s.data.answered = true;

      addPlayer(s, message);

      await send(
        message,
        `🎉 *CORRECT!*\n` +
          `🏆 Winner: ${mention(jid)}\n` +
          `✅ Answer: ${q.show}`,
        [jid]
      );

      sessions.delete(message.from);

      return true;
    }

    await send(
      message,
      correct
        ? "Round ইতিমধ্যেই শেষ হয়েছে।"
        : "❌ ভুল উত্তর — আবার চেষ্টা করুন!"
    );

    return true;
  }

  if (s.type === "math") {
    if (!/^-?\d+$/.test(low)) return false;

    if (
      Number(low) === s.data.answer &&
      !s.data.solved
    ) {
      s.data.solved = true;

      addPlayer(s, message);

      await send(
        message,
        `⚡ *FAST!*\n` +
          `🏆 ${mention(jid)} সবার আগে সঠিক উত্তর দিয়েছে!\n` +
          `✅ Answer: ${s.data.answer}`,
        [jid]
      );

      sessions.delete(message.from);

      return true;
    }

    await send(
      message,
      "❌ ভুল answer — চেষ্টা চালিয়ে যান!"
    );

    return true;
  }

  if (s.type === "guess") {
    if (!/^\d{1,3}$/.test(low)) return false;

    const n = Number(low);

    if (n < 1 || n > 100) {
      return send(
        message,
        "❌ Number অবশ্যই ১–১০০-এর মধ্যে হতে হবে।"
      ).then(() => true);
    }

    addPlayer(s, message);

    if (n === s.data.number) {
      await send(
        message,
        `🎯 *BULLSEYE!*\n` +
          `🏆 ${mention(jid)} *${n}* সঠিকভাবে guess করেছে!`,
        [jid]
      );

      sessions.delete(message.from);

      return true;
    }

    await send(
      message,
      `🔎 ${mention(jid)} guess করেছে *${n}* → ${
        n < s.data.number
          ? "📈 আরও বড় number"
          : "📉 আরও ছোট number"
      }`,
      [jid]
    );

    return true;
  }

  if (s.type === "dice") {
    if (low !== "roll" && low !== "dice") {
      return false;
    }

    const p = addPlayer(s, message);

    if (!p.ok) {
      return send(
        message,
        "❌ Game full — সর্বোচ্চ ৬ জন player।"
      );
    }

    if (s.data.rolls.has(jid)) {
      return send(
        message,
        `🎲 ${mention(jid)}, আপনি ইতিমধ্যেই roll করেছেন।`,
        [jid]
      );
    }

    const roll = Math.floor(Math.random() * 6) + 1;

    s.data.rolls.set(jid, roll);

    let text =
      `🎲 ${mention(jid)} *${roll}* roll করেছে`;

    if (s.data.rolls.size >= 2) {
      const max = Math.max(
        ...s.data.rolls.values()
      );

      const winners = [
        ...s.data.rolls.entries(),
      ]
        .filter(([, x]) => x === max)
        .map(([x]) => x);

      text += `\n\n🏁 *DICE RESULT*\n`;

      for (const [pj, x] of s.data.rolls) {
        text += `• ${mention(pj)} → ${x}\n`;
      }

      text +=
        winners.length > 1
          ? `\n🤝 Draw: ${winners.map(mention).join(", ")}`
          : `\n🏆 Winner: ${mention(winners[0])}`;

      sessions.delete(message.from);
    } else {
      text += `\nআরও players-এর জন্য অপেক্ষা করা হচ্ছে...`;
    }

    await send(
      message,
      text,
      [jid, ...s.data.rolls.keys()]
    );

    return true;
  }

  if (s.type === "word") {
    if (!/^[a-z]+$/i.test(input)) {
      return false;
    }

    const word = input.toLowerCase();

    if (word.length < 2) {
      return send(
        message,
        "❌ কমপক্ষে ২ letters-এর একটি word পাঠান।"
      ).then(() => true);
    }

    const last = s.data.last.toLowerCase();

    if (
      word[0] !== last[last.length - 1]
    ) {
      await send(
        message,
        `❌ *${word}* চলবে না। Word-টি *${last[last.length - 1].toUpperCase()}* দিয়ে শুরু হতে হবে।`
      );

      return true;
    }

    if (s.data.used?.has(word)) {
      return send(
        message,
        "♻️ এই word আগে ব্যবহার করা হয়েছে।"
      ).then(() => true);
    }

    addPlayer(s, message);

    s.data.used ||= new Set([last]);
    s.data.used.add(word);
    s.data.last = word;

    await send(
      message,
      `✅ ${mention(jid)} → *${word}*\n` +
        `➡️ এখন *${word[word.length - 1].toUpperCase()}* দিয়ে word পাঠান।`,
      [jid]
    );

    return true;
  }

  return false;
}

// Admin ON/OFF
Module({
  command: "gaming",
  package: "group",
  aliases: ["gameon", "gameoff"],
  description: "Group Gaming ON/OFF",
  usage: ".gaming on | .gaming off",
})(async (message, match) => {
  if (!message.isGroup) {
    return message.send("❌ *শুধুমাত্র গ্রুপে ব্যবহার করুন।*");
  }

  if (!isAdmin(message)) {
    return message.send(
      "❌ *শুধুমাত্র group admin Gaming ON/OFF করতে পারবেন।*"
    );
  }

  const botNum = getBotNum(message);

  if (!botNum) {
    return message.send("❌ বট নম্বর পাওয়া যায়নি।");
  }

  const input = String(match || "")
    .trim()
    .toLowerCase();

  const current =
    db.get(botNum, key(message.from), false) === true;

  if (!input) {
    return message.send(
      `🎮 *GROUP GAMING*\n\n` +
        `Status: ${current ? "✅ ON" : "❌ OFF"}\n\n` +
        `• .gaming on\n` +
        `• .gaming off\n` +
        `• .game`
    );
  }

  if (input === "on") {
    db.setHot(
      botNum,
      key(message.from),
      true
    );

    return message.send(
      `🎮 *GROUP GAMING ON* ✅\n\n` +
        `এখন যে কোনো member খেলতে পারবেন।\n` +
        `*.game* লিখুন অথবা *game / rps / quiz / dice* লিখুন।`
    );
  }

  if (input === "off") {
    db.setHot(
      botNum,
      key(message.from),
      false
    );

    sessions.delete(message.from);

    return message.send(
      "🎮 *GROUP GAMING OFF* ❌\nচলমান game-ও বন্ধ করে দেওয়া হয়েছে।"
    );
  }

  return message.send(
    "ব্যবহার করুন: *.gaming on* / *.gaming off*"
  );
});

// Main game command
Module({
  command: "game",
  package: "gaming",
  aliases: ["games", "playgame", "gameplay"],
  description: "Play multiplayer group games",
  usage: ".game [rps|quiz|math|guess|dice|word|search|join|stop]",
})(async (message, match) => {
  if (!message.isGroup) {
    return message.send(
      "❌ *Gaming শুধুমাত্র group-এ কাজ করে।*"
    );
  }

  if (!enabled(message)) {
    return message.send(
      "🎮 *Gaming OFF আছে।*\n" +
        "Group admin-কে *.gaming on* করতে হবে।"
    );
  }

  const input = String(match || "").trim();
  const low = input.toLowerCase();

  if (
    !input ||
    low === "menu" ||
    low === "list" ||
    low === "search" ||
    low === "games"
  ) {
    return message.send(
      helpText() + "\n\n" + listText()
    );
  }

  if (
    cleanup(message.from) &&
    !["stop", "end", "cancel"].includes(low)
  ) {
    const handled = await handleActive(
      message,
      input
    );

    if (handled) return;

    if (
      low !== "rps" &&
      low !== "quiz" &&
      low !== "math" &&
      low !== "guess" &&
      low !== "dice" &&
      low !== "word"
    ) {
      return message.send(
        "🎮 এই game-এ এই move valid নয়। `.game` লিখে help দেখুন।"
      );
    }
  }

  switch (low) {
    case "rps":
    case "rockpaperscissors":
    case "rock paper scissors":
      return startRps(message);

    case "quiz":
    case "quizbattle":
      return startQuiz(message);

    case "math":
    case "mathrace":
      return startMath(message);

    case "guess":
    case "number":
    case "numberguess":
      return startGuess(message);

    case "dice":
    case "diceroll":
      return startDice(message);

    case "word":
    case "wordchain":
      return startWord(message);

    default:
      return message.send(
        helpText() +
          "\n\n❌ Game পাওয়া যায়নি। *.game search* দিয়ে list দেখুন।"
      );
  }
});

// Plain-text game triggers. This makes "game", "rps", "quiz" etc. start
// naturally without forcing every member to type a dot command.
Module({
  on: "text",
  package: "gaming",
  description: "Start/play games from natural group text",
})(async (message) => {
  try {
    if (
      !message?.isGroup ||
      !enabled(message)
    ) {
      return;
    }

    const body = String(
      message.body || message.text || ""
    ).trim();

    if (!body || body.startsWith(".")) return;

    const low = body.toLowerCase();

    // If a game is active, let normal text answer/moves participate.
    if (cleanup(message.from)) {
      const handled = await handleActive(
        message,
        body
      );

      if (handled) return;
    }

    const triggers = new Map([
      ["game", "menu"],
      ["games", "menu"],
      ["gaming", "menu"],
      ["গেম", "menu"],
      ["গেমিং", "menu"],

      ["rps", "rps"],
      ["rock paper scissors", "rps"],

      ["quiz", "quiz"],
      ["quiz game", "quiz"],

      ["math game", "math"],
      ["mathrace", "math"],

      ["guess game", "guess"],
      ["number game", "guess"],

      ["dice game", "dice"],
      ["dice", "dice"],

      ["word game", "word"],
      ["word chain", "word"],
    ]);

    const game = triggers.get(low);

    if (!game) return;

    if (game === "menu") {
      return message.send(
        helpText() + "\n\n" + listText()
      );
    }

    // Start the selected game directly; do not send a duplicate pre-start
    // message because the game starter already announces the round.
    if (game === "rps") {
      return startRps(message);
    }

    if (game === "quiz") {
      return startQuiz(message);
    }

    if (game === "math") {
      return startMath(message);
    }

    if (game === "guess") {
      return startGuess(message);
    }

    if (game === "dice") {
      return startDice(message);
    }

    if (game === "word") {
      return startWord(message);
    }
  } catch (e) {
    console.error(
      "[gaming] text handler:",
      e?.message || e
    );
  }
});
