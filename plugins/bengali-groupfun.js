import { Module } from "../lib/plugins.js";
import sticker from "../lib/sticker.js";
import config from "../config.js";
import axios from "axios";
import fs from "fs";
import path from "path";

/* -------------------------------------------------------------------------- */
/* বাংলা GROUP FUN — SMALL ANIME VIDEO STICKERS                              */
/* -------------------------------------------------------------------------- */

const enabledGroups = new Set();
const CACHE_DIR = path.join(process.cwd(), "media", "anime-stickers");
const API_BASE = "https://nekos.best/api/v2";
const API_UA = "VX-MD-BOT/1.0 (anime-video-stickers)";
const inflight = new Map();

// Only anime action GIFs are used. No DP/photo cards.
const ACTIONS = {
  kiss: ["kiss", "peck", "blowkiss"],
  love: ["kiss", "cuddle", "hug", "peck"],
  propose: ["kiss", "cuddle", "hug"],
  couple: ["cuddle", "hug", "kiss"],
  dance: ["dance", "spin", "happy"],
  call: ["wave", "handshake", "salute"],
  tag: ["wave", "wink", "happy"],
  reply: ["smile", "wink", "happy"],
  roast: ["laugh", "smug", "bonk", "slap"],
  troll: ["laugh", "smug", "bonk"],
  rate: ["happy", "wink", "smug"],
  ship: ["cuddle", "hug", "kiss"],
  pick: ["think", "shrug", "happy"],
  happy: ["happy", "laugh", "wink"],
  sad: ["cry", "pout", "sleep"],
  angry: ["angry", "punch", "kick"],
  hug: ["hug", "cuddle", "handhold"],
  highfive: ["highfive", "handshake"],
  bonk: ["bonk", "slap"],
  slap: ["slap", "bonk"],
  punch: ["punch", "kick"],
  wink: ["wink", "smile"],
  blush: ["blush", "smile"],
  laugh: ["laugh", "happy"],
  cry: ["cry", "pout"],
  jealous: ["angry", "pout", "smug"],
  sorry: ["bow", "pout", "cry"],
  thanks: ["bow", "happy", "smile"],
  welcome: ["wave", "happy", "smile"],
  goodmorning: ["wave", "happy", "smile"],
  goodnight: ["sleep", "wave", "cuddle"],
  bye: ["wave", "wink", "salute"],
  cute: ["nya", "blush", "smile"],
  respect: ["salute", "handshake", "wave"],
  magic: ["happy", "wink", "dance"],
  wow: ["shocked", "happy", "laugh"],
};

const BENGALI = {
  sticker: [
    "😂 এই নে, তোর জন্য ছোট্ট anime video sticker!",
    "🤣 কথা কম, anime sticker বেশি!",
    "🎌 Group-এর main character হাজির!",
    "😎 এই sticker-টা একদম তোর mood-এর মতো!",
  ],
  tag: [
    "🏷️ যাকে tag করেছিস, তার জন্য anime reaction হাজির!",
    "😂 এই tag-এর উত্তর কথায় না, sticker-এ!",
    "🎌 Tag দেখেছি—anime mode ON!",
  ],
  reply: [
    "↩️ Reply-এর জবাব এবার anime sticker দিয়ে!",
    "🤣 তোর কথার উত্তর sticker-এই বুঝে নে!",
    "😂 Reply পেয়েছি—anime reaction নে!",
  ],
  love: [
    "❤️ তোমাকে আমি ভালোবাসি! 💕",
    "🥰 এই যে, তোমার জন্য একটু anime ভালোবাসা!",
    "💖 Group-এর সামনে মনের কথা বলে ফেললাম!",
  ],
  propose: [
    "💍 তোমাকে আমি ভালোবাসি—আমার সাথে থাকবে? ❤️",
    "🌸 তোমার হাসিটা আমার anime-এর favourite scene! 💕",
    "❤️ আজ group-এর সামনে বলেই দিলাম—তোমাকে ভালোবাসি!",
  ],
  couple: [
    "💞 এই দুইজনকে দেখলে anime couple মনে হয়!",
    "🥰 দুজনের chemistry দেখে group-ও লজ্জা পাচ্ছে!",
    "💘 Couple alert! সবাই একটু জায়গা দাও! 😂",
  ],
  funny: [
    "🤣 ভাই, এত সিরিয়াস কেন? একটা anime sticker নে!",
    "😂 Group-এ শান্তি ছিল, তুই এসে sticker-এর বন্যা করলি!",
    "😎 আজকে তুই না, তোর anime character কথা বলবে!",
    "🙈 এই কাণ্ডটা group admin দেখলে কী হবে ভাবছিস? 😂",
  ],
};

const STORIES = [
  "📖 ছোট্ট গল্প: এক ছেলে group-এ লিখল—‘আজ আমি একদম শান্ত।’ পাঁচ মিনিট পর ১২টা sticker, ৪টা tag আর ৩টা roast! সবাই বলল—‘এই যদি শান্ত হয়, অশান্তি কাকে বলে?’ 😂",
  "📖 একদিন এক anime ছেলে প্রেম নিবেদন করতে গেল। মুখে কথা এল না, তাই একটা kiss sticker পাঠাল। মেয়েটা reply দিল—‘আগে homework শেষ করো!’ 🤣",
  "📖 Group-এ একজন শুধু ‘হাই’ লিখেছিল। Bot ভাবল, এত ছোট কথা কেন? সঙ্গে সঙ্গে dance sticker পাঠিয়ে পুরো group-কে নাচিয়ে দিল! 💃😂",
  "📖 দুই বন্ধু বলল, ‘আমরা আর প্রেম করব না।’ দশ মিনিট পর দুজনেই একজন আরেকজনকে tag করে লিখল—‘তুমি কোথায়?’ Group বলল—‘আবার শুরু!’ 🤣❤️",
  "📖 এক admin বলল, ‘আজ কোনো spam নয়।’ একজন বলল, ‘ঠিক আছে।’ তারপর ২০টা anime sticker! Admin শুধু লিখল—‘এইটা কী?’ উত্তর: ‘Spam না, art!’ 😂🎌",
];

const SHAYARI = [
  "🌸 হাসি থাকুক মুখে, anime থাকুক মনে—group-এর আড্ডা জমুক প্রতি ক্ষণে। 💕",
  "❤️ Tag দিলে reply দেব, reply দিলে sticker—বন্ধুত্ব থাকলে group হবে আরও better! 😂",
  "💘 প্রেম যদি হয় anime-এর মতো, ঝামেলা কম আর sticker হোক শত শত!",
  "🌙 রাত যতই গভীর হোক, group-এর গল্প থামে না—একটা sticker পড়লেই হাসি থামে না! 🤣",
  "🌸 তোমার নামে tag দিলাম, মনের কথা বললাম—reply না দিলে কিন্তু anime sticker ছাড়লাম! 😂",
];

const JOKES = [
  "😂 Admin: এত sticker কে পাঠাচ্ছে? Member: আমি না, আমার anime!",
  "🤣 সে বলল ‘এক মিনিট পরে আসছি’—group বলল ‘ঠিক আছে, ২০২৭-এ দেখা হবে!’",
  "😂 প্রেমের হিসাব করতে গিয়ে calculator-ও বলল: ভাই, anime sticker পাঠাও!",
  "🤣 Group-এ শান্তি ছিল… তারপর একজন লিখল: ‘কেউ জাগো?’",
  "😂 একজন বলল ‘আমি আজ mature।’ সঙ্গে সঙ্গে group তাকে anime baby sticker দিল!",
  "🤣 Crush-কে tag করে বলল ‘একটা কথা ছিল…’ তারপর ১০ মিনিট typing… শেষে পাঠাল একটা sticker!",
];

function random(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function ensureCacheDir() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function safeName(value) {
  return String(value).replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
}

function cachePath(action) {
  return path.join(CACHE_DIR, `${safeName(action)}.gif`);
}

async function fetchAnimeGif(action) {
  const response = await axios.get(`${API_BASE}/${encodeURIComponent(action)}`, {
    timeout: 20000,
    headers: { "User-Agent": API_UA },
  });
  const result = response?.data?.results?.[0];
  if (!result?.url) throw new Error(`No anime GIF returned for ${action}`);

  const media = await axios.get(result.url, {
    responseType: "arraybuffer",
    timeout: 30000,
    headers: { "User-Agent": API_UA },
  });
  return Buffer.from(media.data);
}

async function getAnimeGif(action) {
  ensureCacheDir();
  const file = cachePath(action);

  // Local cache first. This keeps repeated group commands fast.
  if (fs.existsSync(file)) {
    const stat = fs.statSync(file);
    if (Date.now() - stat.mtimeMs < 24 * 60 * 60 * 1000) {
      return fs.readFileSync(file);
    }
  }

  if (!inflight.has(action)) {
    inflight.set(action, (async () => {
      const gif = await fetchAnimeGif(action);
      fs.writeFileSync(file, gif);
      return gif;
    })().finally(() => inflight.delete(action)));
  }

  return inflight.get(action);
}

async function makeAnimeVideoSticker(type = "happy") {
  const choices = ACTIONS[type] || ACTIONS.happy;
  let lastError;

  // Try several related anime actions when an endpoint is temporarily unavailable.
  for (const action of [...choices].sort(() => Math.random() - 0.5)) {
    try {
      await getAnimeGif(action);

      // Requested local fs.readFileSync workflow: convert the cached GIF/video
      // into a compact animated WhatsApp WebP sticker.
      const video = fs.readFileSync(cachePath(action));
      return await sticker.toSticker("gif", video, {
        packname: config.packname || "VX MD BOT ANIME",
        author: config.author || "VX MD BOT",
        categories: ["anime", "💖", "😂"],
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Anime sticker unavailable");
}

async function sendAnimeSticker(message, type = "happy") {
  const buffer = await makeAnimeVideoSticker(type);
  return message.send({ sticker: buffer });
}

async function sendTextAndSticker(message, text, type, mention = false) {
  await message.send(text);
  const stickerBuffer = await makeAnimeVideoSticker(type);
  return message.send({ sticker: stickerBuffer });
}

async function requireGroup(message) {
  if (!message.isGroup) {
    await message.send("❌ এই ফিচার শুধু গ্রুপে ব্যবহার করা যাবে।");
    return false;
  }
  return true;
}

async function requireAdmin(message) {
  await message.loadGroupInfo();
  if (!message.isAdmin && !message.isFromMe) {
    await message.send("❌ শুধু গ্রুপ অ্যাডমিন এই সেটিং পরিবর্তন করতে পারবে।");
    return false;
  }
  return true;
}

function firstMention(message) {
  return message.mentions?.[0] || message.quoted?.participant || null;
}

function mentionCount(message) {
  return [...new Set(message.mentions || [])].length;
}

function categoryFromText(text) {
  const body = String(text || "").toLowerCase();
  if (/(kiss|কিস|চুমু|চুম্মা|চুম্মি|চুমা|চুমু দে|চুম্মা দে)/i.test(body)) return "kiss";
  if (/(propose|proposal|প্রপোজ|প্রস্তাব|ভালোবাসি|ভালবাসি|আমি তোমাকে ভালোবাসি)/i.test(body)) return "propose";
  if (/(love|লাভ|ভালোবাস|ভালবাস|প্রেম)/i.test(body)) return "love";
  if (/(couple|কাপল|জুটি|জোড়া|জোড়া)/i.test(body)) return "couple";
  if (/(dance|ডান্স|নাচ|নাচো|নাচবে|নাচানাচি)/i.test(body)) return "dance";
  if (/(call|কল|ফোন)/i.test(body)) return "call";
  if (/(roast|রোস্ট|ঠাট্টা|ট্রল|troll|মজা কর)/i.test(body)) return "roast";
  if (/(rate|রেট|রেটিং)/i.test(body)) return "rate";
  if (/(ship|শিপ|জুটি)/i.test(body)) return "ship";
  if (/(hug|হাগ|জড়িয়ে|জড়িয়ে|আলিঙ্গন)/i.test(body)) return "hug";
  if (/(high.?five|হাইফাইভ|হাই ফাইভ)/i.test(body)) return "highfive";
  if (/(bonk|বঙ্ক|মাথায় বাড়ি)/i.test(body)) return "bonk";
  if (/(slap|চড়|চড়|থাপ্পড়|থাপ্পড়)/i.test(body)) return "slap";
  if (/(punch|ঘুষি)/i.test(body)) return "punch";
  if (/(wink|চোখ টিপ|চোখটিপ)/i.test(body)) return "wink";
  if (/(blush|লজ্জা|লাজুক)/i.test(body)) return "blush";
  if (/(laugh|হাস|হাসি|হাসছে)/i.test(body)) return "laugh";
  if (/(cry|কাঁদ|কান্না|দুঃখ|মনখারাপ)/i.test(body)) return "sad";
  if (/(angry|রাগ|রাগী|ক্ষ্যাপা|খেপা)/i.test(body)) return "angry";
  if (/(jealous|হিংসে|জেলাস)/i.test(body)) return "jealous";
  if (/(sorry|সরি|ক্ষমা)/i.test(body)) return "sorry";
  if (/(thanks|thank|ধন্যবাদ|থ্যাঙ্ক)/i.test(body)) return "thanks";
  if (/(welcome|স্বাগতম|ওয়েলকাম|ওয়েলকাম)/i.test(body)) return "welcome";
  if (/(সুপ্রভাত|শুভ সকাল|good morning)/i.test(body)) return "goodmorning";
  if (/(শুভরাত্রি|শুভ রাত্রি|good night)/i.test(body)) return "goodnight";
  if (/(bye|বিদায়|বিদায়|বাই|টাটা)/i.test(body)) return "bye";
  if (/(cute|কিউট|মিষ্টি)/i.test(body)) return "cute";
  if (/(respect|সম্মান)/i.test(body)) return "respect";
  if (/(wow|ওয়াও|ওয়াও|দারুণ)/i.test(body)) return "wow";
  return "happy";
}

/* -------------------------------------------------------------------------- */
/* Main switch                                                                */
/* -------------------------------------------------------------------------- */
Module({
  command: "bsticker",
  aliases: ["bstick", "bengalisticker", "banglasticker", "বাংলাস্টিকার", "স্টিকার"],
  package: "group-fun",
  description: "বাংলা action অনুযায়ী full-frame anime animated sticker",
  usage: ".bsticker চুম্মা / নাচ / ভালোবাসি / প্রপোজ",
})(async (message, match) => {
  try {
    if (!(await requireGroup(message))) return;
    const input = String(match || "").trim();

    if (/^(on|off)$/i.test(input)) {
      if (!(await requireAdmin(message))) return;
      const on = input.toLowerCase() === "on";
      if (on) enabledGroups.add(message.from);
      else enabledGroups.delete(message.from);
      return message.send(on
        ? "✅ বাংলা anime video sticker ON হয়েছে।"
        : "🛑 বাংলা anime video sticker OFF হয়েছে।");
    }

    if (!enabledGroups.has(message.from) && !message.isAdmin && !message.isFromMe) {
      return message.send("ℹ️ এই গ্রুপে anime sticker বন্ধ আছে। Admin `.bsticker on` লিখুন।");
    }

    if (!input) {
      return message.send("🎌 `.bsticker চুম্মা` • `.bsticker নাচ` • `.bsticker প্রপোজ @member` • `.bsticker ভালোবাসি @member`");
    }

    await sendAnimeSticker(message, categoryFromText(input));
  } catch (error) {
    console.error("[bsticker]", error?.message || error);
    await message.send("❌ Anime video sticker পাওয়া যায়নি। আবার চেষ্টা করুন।");
  }
});

/* -------------------------------------------------------------------------- */
/* Generic command factory                                                    */
/* -------------------------------------------------------------------------- */
function addStickerCommand({ command, aliases = [], type, description, usage, needsTarget = false, textKey = null }) {
  Module({ command, aliases, package: "group-fun", description, usage })(async (message) => {
    if (!(await requireGroup(message))) return;
    if (needsTarget && !firstMention(message)) {
      return message.send("🏷️ একজনকে tag করুন বা তার message-এ reply করুন।");
    }
    try {
      if (textKey) await message.send(random(BENGALI[textKey] || BENGALI.funny));
      await sendAnimeSticker(message, type);
    } catch (error) {
      console.error(`[${command}]`, error?.message || error);
      await message.send("❌ Anime video sticker পাঠানো যায়নি।");
    }
  });
}

addStickerCommand({ command: "sticker", aliases: ["stik", "funsticker", "ভিডিওস্টিকার", "স্টিকারভিডিও"], type: "happy", description: "ছোট anime animated video sticker", usage: ".sticker" });
addStickerCommand({ command: "tagsticker", aliases: ["tagstick", "ট্যাগস্টিকার", "ট্যাগস্টিক", "ট্যাগ"], type: "tag", description: "tag/reply করা member-এর জন্য anime sticker", usage: ".tagsticker @member", needsTarget: true, textKey: "tag" });
addStickerCommand({ command: "replysticker", aliases: ["replystick", "রিপ্লাইস্টিকার", "রিপ্লাইস্টিক", "রিপ্লাই"], type: "reply", description: "reply করা message-এর জন্য anime sticker", usage: ".replysticker", needsTarget: true, textKey: "reply" });
addStickerCommand({ command: "kiss", aliases: ["কিস", "চুমু", "চুম্মা", "চুম্মি", "চুমা"], type: "kiss", description: "tag/reply করা member-কে anime kiss sticker", usage: ".kiss @member", needsTarget: true });
addStickerCommand({ command: "dance", aliases: ["ডান্স", "নাচ", "নাচো", "নাচবে", "নাচানাচি"], type: "dance", description: "anime dance video sticker", usage: ".dance" });
addStickerCommand({ command: "hug", aliases: ["হাগ", "জড়িয়ে", "জড়িয়ে", "আলিঙ্গন", "জড়িয়েধর"], type: "hug", description: "anime hug sticker", usage: ".hug @member", needsTarget: true });
addStickerCommand({ command: "propose", aliases: ["প্রপোজ", "প্রপোজাল", "প্রস্তাব", "ভালোবাসিপ্রস্তাব"], type: "propose", description: "tag করা member-কে Bengali propose message + anime sticker", usage: ".propose @member", needsTarget: true, textKey: "propose" });
addStickerCommand({ command: "love", aliases: ["লাভ", "ভালোবাসা", "ভালবাসা", "ভালোবাসি", "ভালবাসি"], type: "love", description: "Bengali love message + anime sticker", usage: ".love @member", needsTarget: true, textKey: "love" });
addStickerCommand({ command: "couple", aliases: ["কাপল", "জুটি", "জোড়া", "জোড়া"], type: "couple", description: "দুই tagged member-এর funny couple sticker", usage: ".couple @a @b" });
addStickerCommand({ command: "roast", aliases: ["রোস্ট", "ঠাট্টা", "মজা", "ট্রল", "troll"], type: "roast", description: "funny anime roast sticker", usage: ".roast @member", needsTarget: true, textKey: "funny" });
addStickerCommand({ command: "rate", aliases: ["রেট", "রেটিং"], type: "rate", description: "random anime reaction sticker", usage: ".rate @member", needsTarget: true });
addStickerCommand({ command: "ship", aliases: ["শিপ", "শিপিং", "জোড়া", "জুটি"], type: "ship", description: "দুই member-এর anime love sticker", usage: ".ship @a @b" });
addStickerCommand({ command: "highfive", aliases: ["হাইফাইভ", "হাইফাইভস্টিকার", "হাই ফাইভ"], type: "highfive", description: "anime high-five sticker", usage: ".highfive @member", needsTarget: true });
addStickerCommand({ command: "bonk", aliases: ["বঙ্ক", "মাথায়বাড়ি"], type: "bonk", description: "funny anime bonk sticker", usage: ".bonk @member", needsTarget: true });
addStickerCommand({ command: "slap", aliases: ["চড়", "চড়", "থাপ্পড়", "থাপ্পড়"], type: "slap", description: "funny anime slap sticker", usage: ".slap @member", needsTarget: true });
addStickerCommand({ command: "punch", aliases: ["ঘুষি"], type: "punch", description: "cartoon anime punch reaction", usage: ".punch @member", needsTarget: true });
addStickerCommand({ command: "wink", aliases: ["চোখটিপ", "চোখটিপে", "চোখ টিপ"], type: "wink", description: "anime wink sticker", usage: ".wink @member", needsTarget: true });
addStickerCommand({ command: "blush", aliases: ["লজ্জা", "লাজুক"], type: "blush", description: "anime blush sticker", usage: ".blush @member", needsTarget: true });
addStickerCommand({ command: "laugh", aliases: ["হাসি", "হাস", "হাসছে"], type: "laugh", description: "anime laughing sticker", usage: ".laugh" });
addStickerCommand({ command: "cry", aliases: ["কাঁদ", "কান্না", "দুঃখ", "মনখারাপ"], type: "cry", description: "anime crying sticker", usage: ".cry" });
addStickerCommand({ command: "angry", aliases: ["রাগ", "রাগী", "ক্ষ্যাপা", "খেপা"], type: "angry", description: "anime angry sticker", usage: ".angry @member", needsTarget: true });
addStickerCommand({ command: "jealous", aliases: ["হিংসে", "জেলাস"], type: "jealous", description: "anime jealous reaction", usage: ".jealous @member", needsTarget: true });
addStickerCommand({ command: "sorry", aliases: ["সরি", "ক্ষমা"], type: "sorry", description: "anime sorry sticker", usage: ".sorry @member", needsTarget: true });
addStickerCommand({ command: "thanks", aliases: ["ধন্যবাদ", "থ্যাঙ্ক", "থ্যাঙ্কস"], type: "thanks", description: "anime thanks sticker", usage: ".thanks @member", needsTarget: true });
addStickerCommand({ command: "welcome", aliases: ["স্বাগতম", "ওয়েলকাম", "ওয়েলকাম"], type: "welcome", description: "anime welcome sticker", usage: ".welcome @member", needsTarget: true });
addStickerCommand({ command: "goodmorning", aliases: ["সুপ্রভাত", "শুভসকাল", "শুভ সকাল"], type: "goodmorning", description: "anime good-morning sticker", usage: ".goodmorning" });
addStickerCommand({ command: "goodnight", aliases: ["শুভরাত্রি", "শুভ রাত্রি", "শুভরাত"], type: "goodnight", description: "anime good-night sticker", usage: ".goodnight" });
addStickerCommand({ command: "bye", aliases: ["বিদায়", "বিদায়", "বাই", "টাটা"], type: "bye", description: "anime bye sticker", usage: ".bye" });
addStickerCommand({ command: "cute", aliases: ["কিউট", "মিষ্টি"], type: "cute", description: "anime cute sticker", usage: ".cute @member", needsTarget: true });
addStickerCommand({ command: "respect", aliases: ["সম্মান"], type: "respect", description: "anime respect sticker", usage: ".respect @member", needsTarget: true });
addStickerCommand({ command: "wow", aliases: ["ওয়াও", "ওয়াও", "দারুণ"], type: "wow", description: "anime wow sticker", usage: ".wow" });

/* Two-person love/couple commands explicitly check for two tags. */
async function twoTargetSticker(message, type, label) {
  if (!(await requireGroup(message))) return;
  if (mentionCount(message) < 2) return message.send(`💞 দুইজনকে tag করুন: .${label} @member1 @member2`);
  try {
    await message.send(random(BENGALI.couple));
    await sendAnimeSticker(message, type);
  } catch (error) {
    console.error(`[${label}]`, error?.message || error);
    await message.send("❌ Anime video sticker পাঠানো যায়নি।");
  }
}

Module({ command: "lovematch", aliases: ["lovematch", "লাভম্যাচ", "প্রেমজুটি"], package: "group-fun", description: "দুই tagged member-এর love anime sticker", usage: ".lovematch @a @b" })(async (message) => twoTargetSticker(message, "love", "lovematch"));

Module({
  command: "pick",
  aliases: ["পিক", "বেছে", "বাছাই"],
  package: "group-fun",
  description: "option অনুযায়ী funny anime reaction",
  usage: ".pick চা | কফি | জুস",
})(async (message, match) => {
  if (!(await requireGroup(message))) return;
  const options = String(match || "").split("|").map(x => x.trim()).filter(Boolean).slice(0, 20);
  if (options.length < 2) return message.send("🎲 ব্যবহার: `.pick চা | কফি | জুস`");
  try { await message.send(`🎯 আমার পছন্দ: ${random(options)} 😎`); await sendAnimeSticker(message, "pick"); }
  catch { await message.send("❌ Anime video sticker পাঠানো যায়নি।"); }
});

/* -------------------------------------------------------------------------- */
/* Bengali text commands: story, shayari, joke                               */
/* -------------------------------------------------------------------------- */
async function findStoryImage(topic) {
  if (!topic) return null;
  try {
    const res = await axios.get("https://commons.wikimedia.org/w/api.php", {
      params: {
        action: "query",
        generator: "search",
        gsrsearch: `${topic} anime`,
        gsrnamespace: 6,
        gsrlimit: 1,
        prop: "imageinfo",
        iiprop: "url",
        format: "json",
        origin: "*",
      },
      timeout: 12000,
    });
    const pages = Object.values(res.data?.query?.pages || {});
    return pages[0]?.imageinfo?.[0]?.url || null;
  } catch {
    return null;
  }
}

Module({ command: "golpo", aliases: ["গল্প", "গল্পশুনাও", "গল্পশোনাও", "story", "স্টোরি"], package: "group-fun", description: "বাংলায় মজার গল্প ও চাইলে ছবি" })(async (message, match) => {
  if (!(await requireGroup(message))) return;
  const topic = String(match || "").trim().slice(0, 80);
  const story = topic
    ? `📖 *${topic} নিয়ে ছোট্ট গল্প*\n\nএক সন্ধ্যায় ${topic} নিয়ে group-এ গল্প শুরু হলো। সবাই নিজের নিজের কথা বলল, আর শেষে বোঝা গেল—একটু হাসি, একটু বন্ধুত্ব আর একটু anime মজা থাকলেই সাধারণ দিনটাও অসাধারণ হয়ে যায়। ✨😂`
    : random(STORIES);
  const image = await findStoryImage(topic);
  if (image) {
    try {
      await message.send({ image: { url: image }, caption: story });
    } catch {
      await message.send(story);
    }
  } else {
    await message.send(story);
  }
  try { await sendAnimeSticker(message, "happy"); } catch {}
});

Module({ command: "shayari", aliases: ["শায়েরি", "শায়েরি", "সাইরি", "সায়রি"], package: "group-fun", description: "বাংলা মজার শায়েরি" })(async (message) => {
  if (!(await requireGroup(message))) return;
  await message.send(random(SHAYARI));
  try { await sendAnimeSticker(message, "love"); } catch {}
});

Module({ command: "joke", aliases: ["জোক", "জোকস", "কৌতুক", "মজারগল্প"], package: "group-fun", description: "বাংলা funny group joke" })(async (message) => {
  if (!(await requireGroup(message))) return;
  await message.send(random(JOKES));
  try { await sendAnimeSticker(message, "laugh"); } catch {}
});

/* -------------------------------------------------------------------------- */
/* Mention/reply + Bengali natural-language auto reactions                    */
/* -------------------------------------------------------------------------- */
const AUTO_WORDS = /(কল|ফোন|call|ভালোবাসি|ভালবাসি|আমি তোমাকে ভালোবাসি|প্রপোজ|প্রেম|love|kiss|কিস|চুমু|চুম্মা|চুম্মি|নাচ|নাচবে|dance|hug|হাগ|জড়িয়ে|আলিঙ্গন|রাগ|angry|sad|দুঃখ|মনখারাপ|bye|বিদায়|টাটা|roast|রোস্ট|ট্রল|মজা|জোক|joke|গল্প|golpo|শায়েরি|shayari|sticker|স্টিকার|লজ্জা|কিউট|ধন্যবাদ|সরি|হিংসে|জেলাস|হাইফাইভ)/i;

Module({
  on: "text",
  package: "group-fun",
  name: "bengali-anime-natural-trigger",
  description: "বটকে tag/reply করে বাংলা action লিখলে ছোট anime video sticker",
})(async (message) => {
  try {
    if (!message.isGroup || !message.isMentioned) return;
    const body = String(message.body || "");
    if (!AUTO_WORDS.test(body)) return;
    await sendAnimeSticker(message, categoryFromText(body));
  } catch (error) {
    console.error("[bengali-natural-trigger]", error?.message || error);
  }
});

Module({
  command: "gfun",
  aliases: ["গ্রুপফান", "বাংলাফান", "funhelp"],
  package: "group-fun",
  description: "সব বাংলা group-fun anime sticker command",
})(async (message) => {
  if (!(await requireGroup(message))) return;
  return message.send(
    `╭━━━〔 🎌 বাংলা ANIME GROUP FUN 〕━━━╮\n` +
    `┃ 🎞️ .sticker / .bsticker — full-frame anime sticker\n` +
    `┃ 🏷️ .tagsticker @member — tag sticker\n` +
    `┃ ↩️ .replysticker — reply sticker\n` +
    `┃ 💋 .kiss @member — চুম্মা sticker\n` +
    `┃ 💃 .dance — নাচ sticker\n` +
    `┃ 🤗 .hug @member — জড়িয়ে ধরা\n` +
    `┃ ❤️ .love @member — আমি তোমাকে ভালোবাসি\n` +
    `┃ 💍 .propose @member — Bengali proposal\n` +
    `┃ 💞 .couple @a @b — funny couple\n` +
    `┃ 💘 .lovematch @a @b — love match\n` +
    `┃ 😂 .roast / .ট্রল @member — funny\n` +
    `┃ 🫵 .slap / .bonk @member — funny anime\n` +
    `┃ 🤝 .highfive @member — high five\n` +
    `┃ 😉 .wink / .blush @member — reaction\n` +
    `┃ 😭 .cry / .sad — কান্না\n` +
    `┃ 😡 .angry / .রাগ — রাগ\n` +
    `┃ 🌸 .shayari — বাংলা শায়েরি\n` +
    `┃ 📖 .golpo — বাংলা গল্প + sticker\n` +
    `┃ 🤣 .joke — বাংলা funny joke\n` +
    `┃ 🌅 .goodmorning / .সুপ্রভাত\n` +
    `┃ 🌙 .goodnight / .শুভরাত্রি\n` +
    `┃ 👋 .bye / .বিদায় — bye sticker\n` +
    `┃\n` +
    `┃ 📖 বাংলা গল্প সিরিজ — শুধু লেখা, কোনো sticker নয়\n` +
    `┃ 👻 .d — ভূতের গল্প\n` +
    `┃ ❤️ .a — প্রেমের গল্প\n` +
    `┃ 😂 .b — মজার গল্প\n` +
    `┃ 🕵️ .t — রহস্য/থ্রিলার গল্প\n` +
    `┃ 💙 .e — আবেগের গল্প\n` +
    `┃ 🤝 .f — বন্ধুত্বের গল্প\n` +
    `┃ 📚 .g — পড়াশোনা/অনুপ্রেরণার গল্প\n` +
    `┃ 🏛️ .h — ইতিহাস/ঐতিহ্যের গল্প\n` +
    `┃ 🔁 একই গ্রুপে বারবার দিলে আগের গল্প না দিয়ে নতুন গল্প বাছাই করা হয়\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
  );
});

export { sendAnimeSticker, makeAnimeVideoSticker };
