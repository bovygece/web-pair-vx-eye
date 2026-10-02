import { Module } from "../lib/plugins.js";
import axios from "axios";
import yts from "yt-search";
import { makeTextSticker } from "../lib/text-sticker.js";

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const FACTS = [
  "🧠 জানো কি? অক্টোপাসের তিনটি হৃদয় থাকে।",
  "🌌 জানো কি? মহাকাশে শব্দ সাধারণভাবে ছড়াতে পারে না, কারণ সেখানে বাতাস নেই।",
  "🐝 মৌমাছি নাচের মাধ্যমে অন্য মৌমাছিকে খাবারের অবস্থান জানাতে পারে।",
  "🌙 চাঁদের আলো আসলে সূর্যের আলো, যা চাঁদের পৃষ্ঠ থেকে প্রতিফলিত হয়।",
  "🐬 ডলফিন একে অপরকে আলাদা আলাদা স্বরের মাধ্যমে চিনতে পারে।",
];

const TRUTHS = [
  "সত্যি করে বলো—গ্রুপে কাকে সবচেয়ে বেশি tag করো? 😄",
  "তোমার সবচেয়ে প্রিয় anime কোনটা? 🎌",
  "শেষ কবে crush-এর profile দেখেছিলে? 👀",
  "গ্রুপে তোমার সবচেয়ে মজার ঘটনা কোনটা? 😂",
  "একটা গোপন talent বলো, যা খুব কম মানুষ জানে। ✨",
];

const DARES = [
  "১০ সেকেন্ডের মধ্যে একটা funny sticker পাঠাও। 😂",
  "গ্রুপের একজনকে ‘আজ তুমি boss’ বলে tag করো। 👑",
  "তোমার mood তিনটা emoji দিয়ে প্রকাশ করো। 😎🔥😂",
  "একটা বাংলা মজার লাইন লিখে সবাইকে হাসাও। 🤣",
  "একজন বন্ধুকে একটা সুন্দর compliment দাও। 💖",
];

const QUIZ = [
  { q: "বাংলাদেশের রাজধানী কোনটি?", a: "ঢাকা" },
  { q: "পৃথিবীর উপগ্রহের নাম কী?", a: "চাঁদ" },
  { q: "সূর্যের সবচেয়ে কাছের গ্রহ কোনটি?", a: "বুধ" },
  { q: "পানির রাসায়নিক সংকেত কী?", a: "H2O" },
];

async function groupOnly(message) {
  if (!message.isGroup) {
    await message.send("❌ এই ফিচারটি শুধু গ্রুপে ব্যবহার করা যাবে।");
    return false;
  }
  return true;
}

function mentionTarget(message) {
  return message.mentions?.[0] || message.quoted?.participant || null;
}

Module({ command: "groupinfo", aliases: ["গ্রুপতথ্য", "গ্রুপইনফো"], package: "bengali-group", description: "বাংলায় গ্রুপের তথ্য" })(async (message) => {
  if (!(await groupOnly(message))) return;
  try {
    await message.loadGroupInfo();
    const meta = message.groupMetadata || message.groupInfo || {};
    const participants = meta.participants || message.participants || [];
    const admins = participants.filter(p => p.admin === "admin" || p.admin === "superadmin");
    await message.send(
      `╭━━〔 👥 গ্রুপ তথ্য 〕━━╮\n` +
      `┃ 🏷️ নাম: ${meta.subject || "অজানা"}\n` +
      `┃ 👤 সদস্য: ${participants.length || "?"}\n` +
      `┃ 👑 অ্যাডমিন: ${admins.length || "?"}\n` +
      `┃ 🆔 আইডি: ${message.from}\n` +
      `╰━━━━━━━━━━━━━━━━╯`
    );
  } catch {
    await message.send("❌ গ্রুপের তথ্য এখন পাওয়া যাচ্ছে না।");
  }
});

Module({ command: "adminlist", aliases: ["অ্যাডমিন", "অ্যাডমিনলিস্ট"], package: "bengali-group", description: "গ্রুপের অ্যাডমিন তালিকা" })(async (message) => {
  if (!(await groupOnly(message))) return;
  try {
    await message.loadGroupInfo();
    const participants = message.groupMetadata?.participants || [];
    const admins = participants.filter(p => p.admin === "admin" || p.admin === "superadmin");
    if (!admins.length) return message.send("ℹ️ কোনো অ্যাডমিনের তালিকা পাওয়া গেল না।");
    const text = admins.map((p, i) => `┃ ${i + 1}. @${String(p.id || p.jid || "").split("@")[0]}`).join("\n");
    await message.send(`╭━━〔 👑 গ্রুপ অ্যাডমিন 〕━━╮\n${text}\n╰━━━━━━━━━━━━━━━━╯`, { mentions: admins.map(p => p.id || p.jid).filter(Boolean) });
  } catch {
    await message.send("❌ অ্যাডমিন তালিকা পাওয়া যায়নি।");
  }
});

Module({ command: "truth", aliases: ["সত্য", "ট্রুথ"], package: "bengali-group", description: "বাংলা Truth প্রশ্ন" })(async (message) => {
  if (!(await groupOnly(message))) return;
  await message.send(`🎯 *Truth*\n\n${pick(TRUTHS)}\n\n↩️ চাইলে যার উত্তর চাই তার message-এ reply করো।`);
});

Module({ command: "dare", aliases: ["ডেয়ার", "ডেয়ার"], package: "bengali-group", description: "বাংলা Dare challenge" })(async (message) => {
  if (!(await groupOnly(message))) return;
  await message.send(`🔥 *Dare*\n\n${pick(DARES)}`);
});

Module({ command: "fact", aliases: ["তথ্য", "জানোকি"], package: "bengali-group", description: "মজার বাংলা তথ্য" })(async (message) => {
  if (!(await groupOnly(message))) return;
  await message.send(pick(FACTS));
});

Module({ command: "quiz", aliases: ["কুইজ", "প্রশ্ন"], package: "bengali-group", description: "বাংলা কুইজ" })(async (message) => {
  if (!(await groupOnly(message))) return;
  const item = pick(QUIZ);
  await message.send(`🧩 *ছোট্ট কুইজ*\n\n❓ ${item.q}\n\n💡 উত্তর জানতে লিখো: .উত্তর`);
  quizAnswers.set(message.from, item.a);
});

const quizAnswers = new Map();
Module({ command: "উত্তর", aliases: ["answer", "ans"], package: "bengali-group", description: "শেষ কুইজের উত্তর" })(async (message) => {
  if (!(await groupOnly(message))) return;
  const answer = quizAnswers.get(message.from);
  if (!answer) return message.send("ℹ️ আগে .quiz চালাও।");
  quizAnswers.delete(message.from);
  await message.send(`✅ সঠিক উত্তর: *${answer}*`);
});

Module({ command: "coin", aliases: ["কয়েন", "কয়েন", "flip"], package: "bengali-group", description: "মুদ্রা ছুঁড়ে ফলাফল" })(async (message) => {
  if (!(await groupOnly(message))) return;
  await message.send(`🪙 ফলাফল: *${Math.random() < 0.5 ? "হেড" : "টেল"}*`);
});

Module({ command: "dice", aliases: ["ডাইস", "ছক্কা"], package: "bengali-group", description: "ডাইস ছুঁড়ে ফলাফল" })(async (message) => {
  if (!(await groupOnly(message))) return;
  await message.send(`🎲 ডাইসের ফল: *${1 + Math.floor(Math.random() * 6)}*`);
});

Module({ command: "saysticker", aliases: ["textsticker", "টেক্সটস্টিকার", "লিখেস্টিকার"], package: "bengali-group", description: "নিজের লেখা animated sticker" })(async (message, match) => {
  if (!(await groupOnly(message))) return;
  const text = String(match || "").trim();
  if (!text) return message.send("✍️ ব্যবহার: .saysticker হ্যালো সবাই");
  try {
    await message.send({ sticker: await makeTextSticker(text) });
  } catch (error) {
    console.error("[saysticker]", error?.message || error);
    await message.send("❌ লেখা থেকে animated sticker বানানো যায়নি।");
  }
});

Module({ command: "ytbangla", aliases: ["ইউটিউব", "ytsearch", "ভিডিওখুঁজো"], package: "bengali-group", description: "YouTube থেকে বাংলা সার্চ ফল" })(async (message, match) => {
  if (!(await groupOnly(message))) return;
  const query = String(match || "").trim();
  if (!query) return message.send("🔎 ব্যবহার: .ytbangla বাংলা গান");
  try {
    const result = await yts(query);
    const videos = (result.videos || []).slice(0, 5);
    if (!videos.length) return message.send("❌ কোনো YouTube ফল পাওয়া যায়নি।");
    const lines = videos.map((v, i) => `${i + 1}. *${v.title}*\n   👤 ${v.author?.name || "অজানা"}\n   ⏱️ ${v.timestamp || "?"}\n   🔗 ${v.url}`);
    await message.send(`╭━━〔 ▶️ YouTube খোঁজ 〕━━╮\n${lines.join("\n\n")}\n╰━━━━━━━━━━━━━━━━╯`);
  } catch {
    await message.send("❌ YouTube সার্চ এখন কাজ করছে না।");
  }
});

Module({ command: "animephoto", aliases: ["এনিমেফটো", "এনিমেপিক", "animepic"], package: "bengali-group", description: "Anime-এর ছবি খোঁজা" })(async (message, match) => {
  if (!(await groupOnly(message))) return;
  const query = String(match || "").trim();
  if (!query) return message.send("🖼️ ব্যবহার: .animephoto Naruto");
  try {
    const gql = `query ($search: String) { Media(search: $search, type: ANIME) { title { romaji english } coverImage { large } siteUrl } }`;
    const res = await axios.post("https://graphql.anilist.co", { query: gql, variables: { search: query } }, { timeout: 15000 });
    const ani = res.data?.data?.Media;
    if (!ani?.coverImage?.large) return message.send("❌ এই নামে কোনো anime ছবি পাওয়া যায়নি।");
    await message.send({ image: { url: ani.coverImage.large }, caption: `🎌 *${ani.title.romaji || ani.title.english || query}*\n\n🖼️ Anime ছবি\n🔗 ${ani.siteUrl || ""}` });
  } catch {
    await message.send("❌ Anime ছবি এখন পাওয়া যাচ্ছে না।");
  }
});

Module({ command: "মুড", aliases: ["mood", "আজমুড"], package: "bengali-group", description: "মজার mood reaction" })(async (message) => {
  if (!(await groupOnly(message))) return;
  await message.send(pick(["😎 আজ তোমার মুড: একদম বস!", "🥰 আজ তোমার মুড: প্রেমে পড়া anime চরিত্র!", "😂 আজ তোমার মুড: শুধু হাসি আর sticker!", "🔥 আজ তোমার মুড: পুরো group জ্বালিয়ে দেওয়ার মতো energetic!"]));
});

const DEFAULT_RULES = [
  "১) সবাইকে সম্মান করে কথা বলুন।",
  "২) অযথা spam, flood বা একই message বারবার পাঠাবেন না।",
  "৩) অনুমতি ছাড়া ব্যক্তিগত তথ্য বা বিরক্তিকর content শেয়ার করবেন না।",
  "৪) ঝগড়া হলে শান্ত থাকুন এবং admin-এর সিদ্ধান্ত মানুন।",
  "৫) মজা করুন, কিন্তু কাউকে অপমান করবেন না। ❤️",
];

Module({ command: "rules", aliases: ["রুলস", "নিয়ম", "নিয়ম"], package: "bengali-group", description: "বাংলা গ্রুপের সুন্দর নিয়ম" })(async (message) => {
  if (!(await groupOnly(message))) return;
  await message.send(`╭━━〔 📜 গ্রুপের নিয়ম 〕━━╮\n${DEFAULT_RULES.map(x => `┃ ${x}`).join("\n")}\n╰━━━━━━━━━━━━━━━━╯`);
});

Module({ command: "grouphelp", aliases: ["গ্রুপহেল্প", "গ্রুপসাহায্য"], package: "bengali-group", description: "বাংলা গ্রুপ ফিচারের সাহায্য" })(async (message) => {
  if (!(await groupOnly(message))) return;
  await message.send(
    `╭━━〔 🛠️ গ্রুপ সাহায্য 〕━━╮\n` +
    `┃ 💬 .hello / .hi — normal text (single dot)\n` +
    `┃ ✍️ .saysticker লেখা — নিজের sticker\n` +
    `┃ 📖 .golpo — বাংলা গল্প\n` +
    `┃ ▶️ .ytbangla <খোঁজ> — YouTube ফল\n` +
    `┃ 🎵 .গান <নাম> — গান\n` +
    `┃ 🖼️ .animephoto <নাম> — anime ছবি\n` +
    `┃ 🧠 .fact — মজার তথ্য\n` +
    `┃ 🎯 .truth / .dare — group game\n` +
    `┃ 🧩 .quiz — ছোট্ট কুইজ\n` +
    `┃ 👥 .groupinfo — গ্রুপ তথ্য\n` +
    `┃ 👑 .adminlist — admin তালিকা\n` +
    `┃ 📜 .rules — গ্রুপ নিয়ম\n` +
    `╰━━━━━━━━━━━━━━━━╯`
  );
});
