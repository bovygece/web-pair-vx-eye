import axios from "axios";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import ffmpegPath from "ffmpeg-static";
import config from "../config.js";
import { Module } from "../lib/plugins.js";

/*
|--------------------------------------------------------------------------
| AIPIC + AI CHAT  -  ছবি বানান ও এআই এর সাথে কথা (যে ভাষায় লিখবেন সেই ভাষায় উত্তর)
|--------------------------------------------------------------------------
|   .aipic একটি ছেলে ফুচকা বিক্রি করছে, ঢাকার রাস্তা, সূর্যাস্ত
|   .aipic --wide cinematic mountain at sunrise      (চওড়া ছবি)
|   .aipic --tall anime girl with umbrella in rain   (লম্বা ছবি)
|   কোনো লেখায় রিপ্লাই করেও লিখতে পারেন:  .aipic
|
| বাংলা / হিন্দি / ইংরেজি - যে কোনো ভাষায় লিখতে পারেন।
| Aliases: .aiimage .aiimg .imagine .genimg .aiphoto
|
| ইঞ্জিন (যেটা আগে চলবে):
|   1) OpenAI (ChatGPT এর ইমেজ মডেল)  - যদি Railway/হোস্টিং এ
|      OPENAI_API_KEY ভেরিয়েবল সেট থাকে  (সেরা কোয়ালিটি)
|      ঐচ্ছিক: OPENAI_IMAGE_MODEL = gpt-image-1 (ডিফল্ট) / dall-e-3
|   2) ফ্রি পাবলিক ইঞ্জিন (Pollinations flux -> turbo -> default)
|      -> কোনো key লাগে না
|--------------------------------------------------------------------------
*/

const enc = encodeURIComponent;
const MAX_PROMPT = 900;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const SIZES = {
  square: { w: 1024, h: 1024 },
  wide: { w: 1344, h: 768 },
  tall: { w: 768, h: 1344 },
};

function sniffImage(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.subarray(0, 4).toString("hex") === "89504e47") return "image/png";
  if (
    buf.subarray(0, 4).toString("latin1") === "RIFF" &&
    buf.subarray(8, 12).toString("latin1") === "WEBP"
  )
    return "image/webp";
  return null;
}

function parseInput(raw) {
  let text = String(raw || "").trim();
  let shape = "square";

  const m = text.match(/^--(wide|tall|square)\b\s*/i);
  if (m) {
    shape = m[1].toLowerCase();
    text = text.slice(m[0].length).trim();
  }
  return { prompt: text.replace(/\s+/g, " ").slice(0, MAX_PROMPT), shape };
}

/* ---------------------------- engines ---------------------------- */

async function fromOpenAI(prompt, shape) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");

  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
  const isDalle = /dall-e/i.test(model);
  const size = isDalle
    ? { square: "1024x1024", wide: "1792x1024", tall: "1024x1792" }[shape]
    : { square: "1024x1024", wide: "1536x1024", tall: "1024x1536" }[shape];

  const { data } = await axios.post(
    "https://api.openai.com/v1/images/generations",
    { model, prompt, size, n: 1, ...(isDalle ? { response_format: "b64_json" } : {}) },
    {
      timeout: 120000,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    }
  );

  const item = data?.data?.[0];
  if (item?.b64_json) return { buffer: Buffer.from(item.b64_json, "base64"), source: `OpenAI ${model}` };
  if (item?.url) {
    const res = await axios.get(item.url, { responseType: "arraybuffer", timeout: 60000 });
    return { buffer: Buffer.from(res.data), source: `OpenAI ${model}` };
  }
  throw new Error("OpenAI returned no image");
}

async function fromPollinations(prompt, shape, model) {
  const { w, h } = SIZES[shape];
  const seed = Math.floor(Math.random() * 1e9);
  const url =
    `https://image.pollinations.ai/prompt/${enc(prompt)}` +
    `?width=${w}&height=${h}&seed=${seed}&nologo=true&private=true&enhance=true` +
    (model ? `&model=${model}` : "");

  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 90000,
    headers: { "User-Agent": UA },
    validateStatus: (s) => s >= 200 && s < 300,
  });
  const buffer = Buffer.from(res.data);
  if (!sniffImage(buffer)) throw new Error("not an image");
  return { buffer, source: `Pollinations${model ? " " + model : ""}` };
}

const imgSleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function generateImage(prompt, shape) {
  const attempts = [];
  if (process.env.OPENAI_API_KEY) attempts.push(["openai", () => fromOpenAI(prompt, shape)]);
  attempts.push(
    ["flux", () => fromPollinations(prompt, shape, "flux")],
    ["turbo", () => fromPollinations(prompt, shape, "turbo")],
    ["default", () => fromPollinations(prompt, shape, "")]
  );

  const errors = [];
  for (const [name, run] of attempts) {
    // ফ্রি সার্ভার মাঝেমধ্যে সাময়িকভাবে ব্যস্ত থাকে (420/429/5xx), তাই একই ইঞ্জিন দুবার চেষ্টা করি
    for (let tryNo = 0; tryNo < 2; tryNo++) {
      try {
        const result = await run();
        if (result?.buffer?.length > 5000) return result;
        throw new Error("image too small");
      } catch (e) {
        const status = e?.response?.status;
        if (tryNo === 0 && (status === 429 || status === 420 || (status >= 500 && status < 600))) {
          await imgSleep(1200);
          continue;
        }
        const msg = String(e?.response?.data?.error?.message || e?.message || e).slice(0, 140);
        errors.push(`${name}: ${msg}`);
        console.warn(`[aipic] ${name} failed:`, msg);
        break;
      }
    }
  }
  throw new Error(errors.join(" | "));
}

/* ============================ ভাষা চেনা ============================ */

const TTS_LANGS = new Set([
  "hi", "bn", "en", "ur", "ta", "te", "mr", "gu", "kn", "ml", "pa", "ne", "si",
  "ar", "id", "ms", "es", "fr", "de", "it", "pt", "ru", "ja", "ko", "zh-CN",
  "tr", "th", "vi", "nl", "pl", "fa", "sw",
]);

const SCRIPT_LANG = [
  [/[\u0980-\u09FF]/g, "bn"],
  [/[\u0900-\u097F]/g, "hi"],
  [/[\u0B80-\u0BFF]/g, "ta"],
  [/[\u0C00-\u0C7F]/g, "te"],
  [/[\u0A80-\u0AFF]/g, "gu"],
  [/[\u0A00-\u0A7F]/g, "pa"],
  [/[\u0C80-\u0CFF]/g, "kn"],
  [/[\u0D00-\u0D7F]/g, "ml"],
  [/[\u0600-\u06FF]/g, "ur"],
];

// রোমান হরফে লেখা হিন্দি (Hinglish) ও বাংলা (Banglish) চেনার শব্দ
const HI_ROM =
  /\b(kya|kaise|kaisa|kaisi|kyun|kyu|hai|hain|hoon|tum|tumhara|tumhare|tumhe|tumko|aap|aapka|aapko|mujhe|mujhko|mera|meri|nahi|nhi|batao|bata|sunao|acha|accha|theek|thik|kahan|kaun|abhi|kuch|raha|rahi|bhai|yaar|haan|karo|karna|kar|kardo|band|khol|kholo|kisne|banaya|banayi|chahiye|bolo|malik)\b/gi;
const BN_ROM =
  /\b(kemon|kmn|acho|achho|ache|ami|tumi|tomar|tomake|amar|amake|apni|apnar|bhalo|valo|koro|korbo|kore|korcho|korchi|kothay|keno|kobe|ekta|ekti|hobe|hocche|jani|kichu|baniyeche|baniyechen|banaiche|banaise|bondhu|nai|bolbo|dao|likho|shono|bolun)\b/gi;

function detectLang(text) {
  const t = String(text || "");
  let best = null;
  let bestN = 0;
  for (const [re, lang] of SCRIPT_LANG) {
    const n = (t.match(re) || []).length;
    if (n > bestN) {
      best = lang;
      bestN = n;
    }
  }
  if (best) return best;

  const hi = (t.match(HI_ROM) || []).length;
  const bn = (t.match(BN_ROM) || []).length;
  if (bn > hi) return "bn";
  if (hi > bn) return "hi";
  return "en";
}

const isRoman = (t) => !/[^\u0000-\u024F\s\d\p{P}\p{S}\p{Extended_Pictographic}]/u.test(String(t || ""));

const lastLang = new Map(); // ইউজার -> শেষ যে ভাষায় কথা বলেছে (bn / hi / en)
const uiLangOf = (message) => {
  const l = lastLang.get(historyKey(message));
  return l === "hi" || l === "en" ? l : "bn";
};

/* ===================== বার্তা (bn / hi / en) ===================== */

const T = {
  bn: {
    picHelp:
      "🎨 *AI PIC*\n\nযে ছবি চান সেটা লিখুন:\n`.aipic একটি ছেলে ফুচকা বিক্রি করছে, ঢাকার রাস্তা, সূর্যাস্ত`\n\n📐 সাইজ:\n`.aipic --wide ...`  (চওড়া)\n`.aipic --tall ...`  (লম্বা)\n\n_যে ভাষায় খুশি লিখুন - বাংলা / হিন্দি / ইংরেজি সবই চলবে।_",
    picTitle: "এআই ইমেজ",
    picFail: () => "❌ *এআই ছবি বানানো যায়নি।*\n\nএকটু পরে আবার চেষ্টা করুন অথবা প্রম্পট বদলে লিখুন। 🙏",
    chatHelp: (on) =>
      "🤖 *এআই চ্যাট*\n\nযা খুশি লিখুন, আপনার ভাষাতেই উত্তর দেব:\n`.ai হাই`\n`.ai एक छोटी कहानी सुनाओ`\n`.ai tell me a joke`\n\n🎙️ ভয়েসে উত্তর পেতে:\n`.ai voice on`  /  বন্ধ করতে: `.ai voice off`\n" +
      `_এই চ্যাটে ভয়েস এখন: ${on ? "চালু ✅" : "বন্ধ ❌"}_\n\n🎨 ছবি বানাতে:\n\`.ai pic সূর্যাস্তে একটি ঘোড়া\`\n\n👥 গ্রুপ (অ্যাডমিন): \`.ai group open\` / \`.ai group off\`\n🔗 লিংক দিলে বাংলা ভয়েসে সতর্কতা: \`.ai link on\` / \`.ai link off\`\n\n🧹 নতুন করে শুরু: \`.ai reset\``,
    voiceOn:
      "🎙️ *এআই ভয়েস চালু হয়েছে!*\n\nএখন থেকে এই চ্যাটে যে-ই `.ai` এর সাথে কিছু লিখবে, আমি তার ভাষাতেই ভয়েস নোটে উত্তর দেব (হিন্দিতে লিখলে হিন্দিতে, বাংলায় লিখলে বাংলায়, ইংরেজিতে লিখলে ইংরেজিতে)।\n\nবন্ধ করতে: `.ai voice off`",
    voiceOff: "🔇 *এআই ভয়েস বন্ধ হয়েছে।* এখন থেকে লেখায় উত্তর পাবেন।",
    voiceStatus: (on) => `🎙️ এই চ্যাটে এআই ভয়েস এখন: *${on ? "চালু ✅" : "বন্ধ ❌"}*\n\nচালু করতে: \`.ai voice on\`\nবন্ধ করতে: \`.ai voice off\``,
    reset: "🧹 ঠিক আছে, পুরনো কথা ভুলে গেলাম। নতুন করে শুরু করি! 😊",
    aiFail: () => "❌ *এআই সার্ভার এখন ব্যস্ত আছে।*\n\nএকটু পরে আবার চেষ্টা করুন। 🙏",
  },
  hi: {
    picHelp:
      "🎨 *AI PIC*\n\nजो फ़ोटो चाहिए वो लिखें:\n`.aipic एक लड़का फुचका बेच रहा है, ढाका की सड़क, सूर्यास्त`\n\n📐 साइज़:\n`.aipic --wide ...`  (चौड़ी)\n`.aipic --tall ...`  (लंबी)\n\n_किसी भी भाषा में लिखें - हिंदी / बंगाली / अंग्रेज़ी सब चलेगा।_",
    picTitle: "एआई इमेज",
    picFail: () => "❌ *एआई फ़ोटो नहीं बन पाई।*\n\nथोड़ी देर बाद फिर कोशिश करें या प्रॉम्प्ट बदलकर लिखें। 🙏",
    chatHelp: (on) =>
      "🤖 *एआई चैट*\n\nकुछ भी लिखें, आपकी ही भाषा में जवाब दूँगा:\n`.ai hi`\n`.ai एक छोटी कहानी सुनाओ`\n`.ai আমাকে একটা গল্প বলো`\n\n🎙️ वॉइस में जवाब पाने के लिए:\n`.ai voice on`  /  बंद करने के लिए: `.ai voice off`\n" +
      `_इस चैट में वॉइस अभी: ${on ? "चालू ✅" : "बंद ❌"}_\n\n🎨 फ़ोटो बनाने के लिए:\n\`.ai pic सूर्यास्त में एक घोड़ा\`\n\n👥 ग्रुप (एडमिन): \`.ai group open\` / \`.ai group off\`\n🔗 लिंक भेजने पर बंगाली वॉइस में चेतावनी: \`.ai link on\` / \`.ai link off\`\n\n🧹 नई बात शुरू: \`.ai reset\``,
    voiceOn:
      "🎙️ *एआई वॉइस चालू हो गया!*\n\nअब इस चैट में जो भी `.ai` के साथ कुछ लिखेगा, मैं उसकी भाषा में ही वॉइस नोट में जवाब दूँगा (हिंदी में लिखे तो हिंदी में, बंगाली में लिखे तो बंगाली में, अंग्रेज़ी में लिखे तो अंग्रेज़ी में)।\n\nबंद करने के लिए: `.ai voice off`",
    voiceOff: "🔇 *एआई वॉइस बंद हो गया।* अब जवाब लिखकर मिलेगा।",
    voiceStatus: (on) => `🎙️ इस चैट में एआई वॉइस अभी: *${on ? "चालू ✅" : "बंद ❌"}*\n\nचालू करने के लिए: \`.ai voice on\`\nबंद करने के लिए: \`.ai voice off\``,
    reset: "🧹 ठीक है, पुरानी बात भूल गया। नए सिरे से शुरू करते हैं! 😊",
    aiFail: () => "❌ *एआई सर्वर अभी व्यस्त है।*\n\nथोड़ी देर बाद फिर कोशिश करें। 🙏",
  },
  en: {
    picHelp:
      "🎨 *AI PIC*\n\nWrite the picture you want:\n`.aipic a boy selling fuchka, Dhaka street, sunset`\n\n📐 Size:\n`.aipic --wide ...`  (wide)\n`.aipic --tall ...`  (tall)\n\n_Write in any language - Bengali / Hindi / English all work._",
    picTitle: "AI Image",
    picFail: () => "❌ *Couldn't create the AI picture.*\n\nTry again in a little while or change the prompt. 🙏",
    chatHelp: (on) =>
      "🤖 *AI CHAT*\n\nWrite anything, I'll reply in your own language:\n`.ai hi`\n`.ai tell me a short story`\n`.ai एक छोटी कहानी सुनाओ`\n\n🎙️ For voice replies:\n`.ai voice on`  /  turn off: `.ai voice off`\n" +
      `_Voice in this chat: ${on ? "ON ✅" : "OFF ❌"}_\n\n🎨 To make a picture:\n\`.ai pic a horse at sunset\`\n\n👥 Group (admins): \`.ai group open\` / \`.ai group off\`\n🔗 Bengali voice warning on links: \`.ai link on\` / \`.ai link off\`\n\n🧹 Start fresh: \`.ai reset\``,
    voiceOn:
      "🎙️ *AI voice is ON!*\n\nFrom now on, whenever anyone in this chat writes something with `.ai`, I'll reply as a voice note in their own language (Hindi → Hindi, Bengali → Bengali, English → English).\n\nTurn off: `.ai voice off`",
    voiceOff: "🔇 *AI voice is OFF.* You'll get text replies again.",
    voiceStatus: (on) => `🎙️ AI voice in this chat: *${on ? "ON ✅" : "OFF ❌"}*\n\nTurn on: \`.ai voice on\`\nTurn off: \`.ai voice off\``,
    reset: "🧹 Okay, I've forgotten the old conversation. Let's start fresh! 😊",
    aiFail: () => "❌ *The AI server is busy right now.*\n\nPlease try again in a little while. 🙏",
  },
};

const tr = (lang) => T[lang] || T.bn;

/* ============================ ছবি (shared) ============================ */

// বাংলা/হিন্দি/রোমান লেখা হলে ইমেজ ইঞ্জিনের জন্য ইংরেজিতে অনুবাদ করে নিই (ভালো ছবি আসে)
async function toEnglishPrompt(prompt) {
  const needs = /[^\u0000-\u007F]/.test(prompt) || detectLang(prompt) !== "en";
  if (!needs) return prompt;
  try {
    const out = await askChatAI([
      {
        role: "system",
        content:
          "Translate the user's image description into a vivid English prompt for an AI image generator. Output ONLY the English prompt, nothing else.",
      },
      { role: "user", content: prompt },
    ]);
    const t = String(out || "")
      .replace(/\[\[\s*LANG[^\]]*\]\]/gi, "")
      .replace(/^["'\s]+|["'\s]+$/g, "")
      .replace(/\s+/g, " ");
    return t.length > 3 && t.length <= MAX_PROMPT ? t : prompt;
  } catch {
    return prompt;
  }
}

async function runAiPic(message, input = "") {
  let lang = uiLangOf(message);
  try {
    if (!input && message.quoted?.body) input = String(message.quoted.body).trim();

    const { prompt, shape } = parseInput(input);
    if (prompt) {
      const d = detectLang(prompt);
      lang = d === "hi" || d === "bn" ? d : "en";
    }

    if (!prompt) return message.reply(tr(lang).picHelp);

    try {
      await message.react?.("🎨");
    } catch {}

    const enPrompt = await toEnglishPrompt(prompt);
    const { buffer, source } = await generateImage(enPrompt, shape);

    const caption =
      `🎨 *${tr(lang).picTitle}*\n\n` +
      `📝 ${prompt.length > 300 ? prompt.slice(0, 300) + "…" : prompt}\n\n` +
      `> ${source}`;

    await message.conn.sendMessage(
      message.from,
      { image: buffer, caption },
      message.raw ? { quoted: message.raw } : {}
    );

    try {
      await message.react?.("✅");
    } catch {}
  } catch (error) {
    console.error("[aipic]", error);
    try {
      await message.react?.("❌");
    } catch {}
    console.error("[aipic] final error:", String(error?.message || error).slice(0, 400));
    return message.reply(tr(lang).picFail());
  }
}

Module({
  command: "aipic",
  aliases: ["aiimage", "aiimg", "imagine", "genimg", "aiphoto"],
  package: "ai",
  description: "এআই দিয়ে ছবি বানান: .aipic <যা খুশি লিখুন>",
})(async (message, match = "") => runAiPic(message, String(match || "").trim()));

/* ============================ AI CHAT ============================ */
/*
|   .ai hi / .ai नमस्ते / .ai কেমন আছো   -> যে ভাষায় লিখবেন সেই ভাষায় উত্তর
|   .ai voice on     -> এই চ্যাটে এআই ভয়েস নোটে উত্তর দেবে (ভাষা অনুযায়ী আলাদা ভয়েস)
|   .ai voice off    -> আবার লেখায় উত্তর
|   .ai pic <যা খুশি> -> এআই ছবি বানাবে
|   .ai reset        -> নতুন করে শুরু
|   .ai group open / .ai group off (বা "ग्रुप ओपन कर", "গ্রুপ বন্ধ করো") -> গ্রুপ খোলা/বন্ধ (অ্যাডমিন)
|   .ai link on / off -> কেউ লিংক দিলে বাংলা ভয়েসে "লিংক দিও না" বলবে (অ্যাডমিন বাদে)
|   "তোমাকে কে বানিয়েছে / tumhe kisne banaya / who made you"
|        -> VX MD BOT কে Owner Monster বানিয়েছেন (সব ভাষায়)
|   Aliases: .chatgpt .ask .aivoice
|
| ইঞ্জিন: OPENAI_API_KEY থাকলে OpenAI (OPENAI_CHAT_MODEL, ডিফল্ট
| gpt-4o-mini); না থাকলে ফ্রি পাবলিক এআই ইঞ্জিন।
| ভয়েস: Google TTS (ভাষা অনুযায়ী) -> ffmpeg দিয়ে WhatsApp ভয়েস নোট।
*/

const HISTORY_TTL = 30 * 60 * 1000;
const HISTORY_MAX = 12; // messages (user + ai)
const histories = new Map();

const SYSTEM_PROMPT =
  "You are VX MD BOT AI, a smart, friendly assistant chatting on WhatsApp. " +
  "Your name is VX MD BOT and you were made by Owner Monster. If anyone asks who made, " +
  "created, built or owns you, answer that VX MD BOT was made by Owner Monster " +
  "(never mention OpenAI, Google or any other company). " +
  "LANGUAGE RULE: detect the language of the user's latest message and reply in that SAME language. " +
  "Hindi or Hinglish -> Hindi. Bengali or Bengali typed in English letters (Banglish) -> Bengali. " +
  "English -> English. Any other language -> that language. " +
  "In normal text mode keep the same script the user used. " +
  "FORMAT RULE: begin EVERY reply with a tag [[LANG:xx]] where xx is the ISO 639-1 code of the " +
  "language you are replying in (hi, bn, en, ur, ta, te, ...). The tag is removed automatically. " +
  "Talk naturally like a helpful friend. Keep replies short and clear unless the user asks for detail. " +
  "Use a few emojis. If you don't know something, say so honestly.";

const VOICE_STYLE =
  " VOICE MODE: your reply will be spoken aloud as a voice message. Write it in the NATIVE script " +
  "of the language (Hindi/Hinglish -> Devanagari Hindi, Bengali/Banglish -> Bengali script; never Latin " +
  "letters for these). Keep it short (2-5 sentences), plain spoken words, and do NOT use emojis, " +
  "markdown, lists, links or symbols.";

const LANG_REMINDER = "\n\n(Reply in the same language as this message and begin with the [[LANG:xx]] tag.)";

/* ------------------------- ভয়েস অন/অফ (প্রতি চ্যাটে) ------------------------- */

const VOICE_FILE = path.join(process.cwd(), "data-aivoice.json");
const voiceChats = new Set();

(async () => {
  try {
    const list = JSON.parse(await fs.readFile(VOICE_FILE, "utf8"));
    if (Array.isArray(list)) list.forEach((k) => voiceChats.add(String(k)));
  } catch {}
})();

async function saveVoiceState() {
  try {
    await fs.writeFile(VOICE_FILE, JSON.stringify([...voiceChats]));
  } catch (e) {
    console.warn("[ai voice] state save failed:", e?.message || e);
  }
}

function historyKey(message) {
  return `${message.from}:${String(message.sender || "").split("@")[0].split(":")[0]}`;
}

function getHistory(key) {
  const h = histories.get(key);
  if (!h || Date.now() - h.time > HISTORY_TTL) {
    histories.delete(key);
    return [];
  }
  return h.messages;
}

function pushHistory(key, role, content) {
  const messages = getHistory(key);
  messages.push({ role, content });
  while (messages.length > HISTORY_MAX) messages.shift();
  histories.set(key, { time: Date.now(), messages });
}

async function chatOpenAI(messages) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  const { data } = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    { model: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini", messages, temperature: 0.8 },
    { timeout: 60000, headers: { Authorization: `Bearer ${key}` } }
  );
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("empty reply");
  return String(text).trim();
}

async function chatPollinationsPost(messages) {
  const { data } = await axios.post(
    "https://text.pollinations.ai/openai",
    { model: "openai", messages, private: true },
    { timeout: 60000, headers: { "Content-Type": "application/json", "User-Agent": UA } }
  );
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("empty reply");
  return String(text).trim();
}

/* single-prompt engines: flatten the conversation into one text */
function flatten(messages) {
  return messages
    .map((m) => (m.role === "system" ? m.content : `${m.role === "user" ? "User" : "AI"}: ${m.content}`))
    .join("\n") + "\nAI:";
}

async function chatYupra(messages) {
  const { data } = await axios.get(
    `https://api.yupra.my.id/api/ai/gpt5?text=${enc(flatten(messages).slice(-3500))}`,
    { timeout: 45000 }
  );
  if (!data?.status || !data?.result) throw new Error("empty reply");
  return String(data.result).trim();
}

async function chatPollinationsGet(messages) {
  const { data } = await axios.get(
    `https://text.pollinations.ai/${enc(flatten(messages).slice(-3500))}?model=openai&private=true`,
    { timeout: 60000, headers: { "User-Agent": UA }, responseType: "text", transformResponse: (r) => r }
  );
  const text = String(data || "").trim();
  if (!text) throw new Error("empty reply");
  return text;
}

const chatSleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function askChatAI(messages) {
  const attempts = [];
  if (process.env.OPENAI_API_KEY) attempts.push(["openai", chatOpenAI]);
  // আগে ফ্রি অ্যানোনিমাস ইঞ্জিন (শুধু সাময়িক rate-limit হয়), তারপর /openai
  // (এখন ক্রেডিট লাগে), সবশেষে yupra (মাঝেমধ্যে ডোমেইন ডাউন থাকে)
  attempts.push(
    ["pollinations-get", chatPollinationsGet],
    ["pollinations", chatPollinationsPost],
    ["yupra", chatYupra]
  );
  const errors = [];
  for (const [name, run] of attempts) {
    for (let tryNo = 0; tryNo < 2; tryNo++) {
      try {
        return await run(messages);
      } catch (e) {
        const status = e?.response?.status;
        if (tryNo === 0 && (status === 429 || status === 420 || (status >= 500 && status < 600))) {
          await chatSleep(1500);
          continue;
        }
        const msg = String(e?.response?.data?.error?.message || e?.message || e).slice(0, 120);
        errors.push(`${name}: ${msg}`);
        console.warn(`[ai chat] ${name} failed:`, msg);
        break;
      }
    }
  }
  throw new Error(errors.join(" | "));
}

/* ---------------------- "কে বানিয়েছে?" প্রশ্ন ---------------------- */

// প্রতিটি সারি: সবগুলো প্যাটার্ন মিললে তবেই প্রশ্নটা "কে বানিয়েছে / মালিক কে"
const OWNER_Q = [
  // English
  [/\bwho\b/i, /\b(made|created|built|developed|coded|programmed|owns?|owner|creator|developer)\b/i, /\b(you|u|your|ur|this bot|the bot)\b/i],
  // Hindi
  [/किसने|कौन/, /बनाया|बनाई|बनाये|मालिक|ओनर|क्रिएटर|डेवलपर/, /तुम|आप|तुझ|तेरा|तेरे|बॉट|बोट/],
  // Hinglish
  [/\b(kisne|kisne)\b/i, /\b(banaya|banayi|banaye|bnaya|bnayi)\b/i, /\b(tumhe|tumhen|tumko|aapko|tujhe|tujhko|bot)\b/i],
  [/\b(malik|owner|creator|developer)\b/i, /\b(kaun|kon|kaun hai|kon hai)\b/i, /\b(bot|tumhara|tumhare|tera|tere|aapka)\b/i],
  // Bengali
  [/কে|কারা/, /বানিয়েছ|বানাইছ|বানিয়েছে|তৈরি|বানাল|মালিক|ওনার|নির্মাতা|ডেভেলপার/, /তোমা|আপনা|তোকে|তোর|বট/],
  // Banglish
  [/\b(ke|ke ke|kara)\b/i, /\b(baniyeche|baniyechhe|baniyechen|banaise|banaiche|toiri|malik|owner)\b/i, /\b(tomake|tomar|apnake|apnar|amake|bot)\b/i],
];

const isOwnerQuestion = (text) => {
  const t = String(text || "");
  if (t.length > 120) return false;
  return OWNER_Q.some((row) => row.every((re) => re.test(t)));
};

const OWNER_ANSWER = {
  en: "I'm VX MD BOT, and I was made by Owner Monster. 😊",
  hi: "मैं VX MD BOT हूँ, और मुझे Owner Monster ने बनाया है। 😊",
  hi_rom: "Main VX MD BOT hoon, aur mujhe Owner Monster ne banaya hai. 😊",
  bn: "আমি VX MD BOT, আমাকে Owner Monster বানিয়েছেন। 😊",
  bn_rom: "Ami VX MD BOT, amake Owner Monster baniyechen. 😊",
};

function ownerAnswerFor(input, voiceOn) {
  const lang = detectLang(input);
  if (lang === "hi" || lang === "bn") {
    const roman = isRoman(input) && !voiceOn; // ভয়েসে সবসময় নিজের লিপিতে
    return { lang, text: OWNER_ANSWER[roman ? `${lang}_rom` : lang] };
  }
  return { lang: "en", text: OWNER_ANSWER.en };
}

/* ---------------------------- ভয়েস (ভাষা অনুযায়ী) ---------------------------- */

const VOICE_MAX_CHARS = 1000; // এর বেশি বড় উত্তর হলে ভয়েসের সাথে লেখাও যাবে
const TTS_CHUNK = 180; // Google TTS এক অনুরোধে ~200 অক্ষর নেয়

function cleanForSpeech(text) {
  return String(text || "")
    .replace(/\[\[\s*LANG[^\]]*\]\]/gi, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[*_~`>#|]/g, "")
    .replace(/[\p{Extended_Pictographic}\u200d\ufe0f]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitForTTS(text, max = TTS_CHUNK) {
  const chunks = [];
  const sentences = text.match(/[^।.!?\n]+[।.!?]?/g) || [text];
  let cur = "";

  const flush = () => {
    if (cur.trim()) chunks.push(cur.trim());
    cur = "";
  };

  for (let s of sentences) {
    s = s.trim();
    if (!s) continue;

    while (s.length > max) {
      let cut = s.lastIndexOf(" ", max);
      if (cut < 40) cut = max;
      flush();
      chunks.push(s.slice(0, cut).trim());
      s = s.slice(cut).trim();
    }

    if ((cur + " " + s).trim().length > max) flush();
    cur = (cur + " " + s).trim();
  }
  flush();
  return chunks.filter(Boolean);
}

function normLang(code) {
  let l = String(code || "").trim().toLowerCase();
  if (!l) return null;
  if (l === "zh" || l.startsWith("zh-")) l = "zh-CN";
  else l = l.split("-")[0];
  return TTS_LANGS.has(l) ? l : null;
}

async function ttsChunk(text, idx, total, lang) {
  const url =
    `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob` +
    `&tl=${enc(lang)}&total=${total}&idx=${idx}&textlen=${text.length}&q=${enc(text)}`;
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 30000,
    headers: { "User-Agent": UA, Referer: "https://translate.google.com/" },
    validateStatus: (s) => s >= 200 && s < 300,
  });
  const buf = Buffer.from(res.data);
  if (buf.length < 500) throw new Error("TTS empty audio");
  return buf;
}

async function ttsSpeak(text, lang) {
  const clean = cleanForSpeech(text).slice(0, VOICE_MAX_CHARS);
  if (!clean) throw new Error("no speakable text");
  const parts = splitForTTS(clean);
  const bufs = [];
  for (let i = 0; i < parts.length; i++) bufs.push(await ttsChunk(parts[i], i, parts.length, lang));
  return Buffer.concat(bufs);
}

/* mp3 -> ogg/opus (WhatsApp ভয়েস নোটের সঠিক ফরম্যাট) */
async function mp3ToOpus(mp3) {
  if (!ffmpegPath) return null;
  let dir;
  try {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "aivoice-"));
    const inp = path.join(dir, "in.mp3");
    const out = path.join(dir, "out.ogg");
    await fs.writeFile(inp, mp3);
    await new Promise((resolve, reject) =>
      execFile(
        ffmpegPath,
        ["-y", "-i", inp, "-vn", "-c:a", "libopus", "-b:a", "32k", "-ar", "48000", "-ac", "1", "-f", "ogg", out],
        { timeout: 40000 },
        (err) => (err ? reject(err) : resolve())
      )
    );
    const buf = await fs.readFile(out);
    return buf.length > 500 ? buf : null;
  } catch (e) {
    console.warn("[ai voice] opus convert failed:", e?.message || e);
    return null;
  } finally {
    if (dir) fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function sendVoice(message, text, lang) {
  const mp3 = await ttsSpeak(text, lang);
  const opus = await mp3ToOpus(mp3);
  const audio = opus
    ? { audio: opus, mimetype: "audio/ogg; codecs=opus", ptt: true }
    : { audio: mp3, mimetype: "audio/mpeg", ptt: true };

  await message.conn.sendMessage(
    message.from,
    audio,
    message.raw ? { quoted: message.raw } : {}
  );
}

/* উত্তর থেকে [[LANG:xx]] ট্যাগ আলাদা করি; না থাকলে লেখা দেখে ভাষা ধরি */
function splitLangTag(answer, input) {
  const raw = String(answer || "");
  const m = raw.match(/\[\[\s*LANG\s*:\s*([A-Za-z-]{2,6})\s*\]\]/i);
  const text = raw.replace(/\[\[\s*LANG[^\]]*\]\]/gi, "").trim();
  let lang = m ? normLang(m[1]) : null;
  if (!lang) {
    const d = detectLang(text);
    lang = d !== "en" ? d : detectLang(input);
  }
  return { text, lang: normLang(lang) || "en" };
}

/* উত্তর পাঠাও: ভয়েস চালু থাকলে ভয়েস নোটে, ব্যর্থ হলে লেখায় */
async function deliver(message, text, lang, voiceOn) {
  const send = () => message.reply(text.length > 3500 ? text.slice(0, 3500) + "…" : text);

  if (voiceOn) {
    try {
      await sendVoice(message, text, lang);
      // উত্তর অনেক বড় হলে ভয়েস শুধু শুরুর অংশ পড়ে, তাই পুরো লেখাও পাঠাই
      if (cleanForSpeech(text).length > VOICE_MAX_CHARS) await send();
      return;
    } catch (e) {
      console.error("[ai voice]", e?.message || e);
    }
  }
  await send();
}

/* ===================== গ্রুপ কন্ট্রোল + লিংক সতর্কতা ===================== */

const digitsOf = (v) => String(v || "").split("@")[0].split(":")[0].replace(/\D/g, "");

const isBotOwner = (message) => {
  const owner = digitsOf(config?.owner);
  return !!owner && digitsOf(message.sender) === owner;
};

const isSelfMsg = (m) => !!(m?.fromMe || m?.isFromMe || m?.isfromMe);

const G = {
  bn: {
    groupOnly: "❌ এটা শুধু গ্রুপে কাজ করবে।",
    adminOnly: "❌ শুধু গ্রুপ অ্যাডমিনরা এটা করতে পারবেন।",
    botAdmin: "❌ আগে আমাকে গ্রুপের অ্যাডমিন বানান, তারপর আবার বলুন।",
    opened: "✅ গ্রুপ খুলে দিলাম, এখন সবাই মেসেজ করতে পারবে।",
    closed: "🔒 গ্রুপ বন্ধ করে দিলাম, এখন শুধু অ্যাডমিনরা মেসেজ করতে পারবে।",
    failed: "❌ গ্রুপ সেটিং বদলানো যায়নি। একটু পরে আবার চেষ্টা করুন।",
    linkOn:
      "🔗 *লিংক সতর্কতা চালু হয়েছে!*\n\nএখন থেকে এই গ্রুপে কোনো সদস্য লিংক দিলে আমি বাংলায় ভয়েসে বলে দেব যে লিংক দেওয়া নিষেধ। (অ্যাডমিনদের ক্ষেত্রে বলব না।)\n\nবন্ধ করতে: `.ai link off`",
    linkOff: "🔕 *লিংক সতর্কতা বন্ধ হয়েছে।*",
    linkStatus: (on) => `🔗 এই গ্রুপে লিংক সতর্কতা এখন: *${on ? "চালু ✅" : "বন্ধ ❌"}*\n\nচালু করতে: \`.ai link on\`\nবন্ধ করতে: \`.ai link off\``,
  },
  hi: {
    groupOnly: "❌ यह सिर्फ़ ग्रुप में काम करेगा।",
    adminOnly: "❌ सिर्फ़ ग्रुप एडमिन यह कर सकते हैं।",
    botAdmin: "❌ पहले मुझे ग्रुप का एडमिन बनाइए, फिर दोबारा बोलिए।",
    opened: "✅ ग्रुप खोल दिया, अब सब मैसेज कर सकते हैं।",
    closed: "🔒 ग्रुप बंद कर दिया, अब सिर्फ़ एडमिन मैसेज कर सकते हैं।",
    failed: "❌ ग्रुप सेटिंग नहीं बदल पाई। थोड़ी देर बाद फिर कोशिश करें।",
    linkOn:
      "🔗 *लिंक चेतावनी चालू हो गई!*\n\nअब इस ग्रुप में कोई मेंबर लिंक भेजेगा तो मैं बंगाली वॉइस में बोल दूँगा कि लिंक भेजना मना है। (एडमिन के लिए नहीं बोलूँगा।)\n\nबंद करने के लिए: `.ai link off`",
    linkOff: "🔕 *लिंक चेतावनी बंद हो गई।*",
    linkStatus: (on) => `🔗 इस ग्रुप में लिंक चेतावनी अभी: *${on ? "चालू ✅" : "बंद ❌"}*\n\nचालू करने के लिए: \`.ai link on\`\nबंद करने के लिए: \`.ai link off\``,
  },
  en: {
    groupOnly: "❌ This only works in a group.",
    adminOnly: "❌ Only group admins can do this.",
    botAdmin: "❌ Please make me a group admin first, then ask again.",
    opened: "✅ Group opened, everyone can send messages now.",
    closed: "🔒 Group closed, only admins can send messages now.",
    failed: "❌ Couldn't change the group setting. Try again in a little while.",
    linkOn:
      "🔗 *Link warning is ON!*\n\nFrom now on, if a member sends a link in this group, I'll say in a Bengali voice note that links aren't allowed. (Admins are exempt.)\n\nTurn off: `.ai link off`",
    linkOff: "🔕 *Link warning is OFF.*",
    linkStatus: (on) => `🔗 Link warning in this group: *${on ? "ON ✅" : "OFF ❌"}*\n\nTurn on: \`.ai link on\`\nTurn off: \`.ai link off\``,
  },
};
const gt = (lang) => G[lang] || G.bn;

/* "group open kar" / "ग्रुप बंद कर" / "গ্রুপ খোলো" ... -> "open" | "close" | null */
const GROUP_WORD = /group|grp|\bgc\b|গ্রুপ|গ্রূপ|ग्रुप|ग्रूप/i;
const OPEN_WORD = /\b(open|opn|khol|kholo|kholdo|on)\b|ओपन|खोल|खुला|चालू|ওপেন|খোল|খুল|চালু|অন/i;
const CLOSE_WORD = /\b(close|off|band|bandh|lock)\b|क्लोज|बंद|बन्द|ऑफ|বন্ধ|ক্লোজ|অফ|লক/i;

const QUESTION_WORD = /\b(how|what|why|kaise|kyun|kyu|kya|kemon|keno)\b|कैसे|क्या|क्यों|কীভাবে|কেমন|কেন|কি\s/i;

function groupIntent(text) {
  const t = String(text || "");
  if (t.length > 60 || t.split(/\s+/).length > 6 || /[?？]/.test(t)) return null;
  if (!GROUP_WORD.test(t) || QUESTION_WORD.test(t)) return null;
  const o = OPEN_WORD.test(t);
  const c = CLOSE_WORD.test(t);
  if (o && !c) return "open";
  if (c && !o) return "close";
  return null;
}

async function handleGroupControl(message, action, input, voiceOn) {
  const lang = (() => {
    const d = detectLang(input);
    return d === "hi" || d === "bn" ? d : /[A-Za-z]/.test(input) ? "en" : "bn";
  })();
  const g = gt(lang);

  if (!message.isGroup) return message.reply(g.groupOnly);

  try {
    await message.loadGroupInfo();
    const allowed = message.isAdmin === true || isSelfMsg(message) || isBotOwner(message);
    if (!allowed) return message.reply(g.adminOnly);
    if (message.isBotAdmin !== true) return message.reply(g.botAdmin);

    await message.conn.groupSettingUpdate(
      message.from,
      action === "open" ? "not_announcement" : "announcement"
    );
    try {
      await message.react?.(action === "open" ? "🔓" : "🔒");
    } catch {}
    return deliver(message, action === "open" ? g.opened : g.closed, lang, voiceOn);
  } catch (e) {
    console.error("[ai group]", e?.message || e);
    return message.reply(g.failed);
  }
}

/* ---- লিংক সতর্কতা (প্রতি গ্রুপে অন/অফ, সবসময় বাংলা ভয়েসে) ---- */

const LINK_FILE = path.join(process.cwd(), "data-ailinkwarn.json");
const linkChats = new Set();
const linkCooldown = new Map(); // গ্রুপ:সদস্য -> শেষ সতর্কতার সময়
const LINK_COOLDOWN_MS = 20 * 1000;

(async () => {
  try {
    const list = JSON.parse(await fs.readFile(LINK_FILE, "utf8"));
    if (Array.isArray(list)) list.forEach((k) => linkChats.add(String(k)));
  } catch {}
})();

async function saveLinkState() {
  try {
    await fs.writeFile(LINK_FILE, JSON.stringify([...linkChats]));
  } catch (e) {
    console.warn("[ai link] state save failed:", e?.message || e);
  }
}

const LINK_RE =
  /(https?:\/\/|www\.)\S+|chat\.whatsapp\.com\/\S+|wa\.me\/\S+|t\.me\/\S+|discord\.gg\/\S+|\b[a-z0-9-]+\.(?:com|net|org|in|io|me|xyz|app|link|gg|co|online|site)\b(?:\/\S*)?/i;

const LINK_VOICE = [
  "ভাই, গ্রুপে লিংক দিও না। লিংক দেওয়া নিষেধ।",
  "এই যে, লিংক দিও না। গ্রুপের নিয়ম মেনে চলো।",
  "লিংক দেওয়া যাবে না ভাই। দয়া করে লিংক মুছে দাও।",
  "সাবধান! গ্রুপে লিংক পাঠানো বারণ। আর দিও না।",
  "ভাই, লিংক দিও না। দিলে কিন্তু সমস্যা হবে।",
];

const LINK_CMD = /^(?:link|links|linkwarn|লিংক|লিঙ্ক|लिंक|लिंक्स)\s*[:\-]?\s*(on|off|অন|অফ|চালু|বন্ধ|ऑन|ऑफ|चालू|बंद)?$/i;

Module({
  on: "text",
  package: "ai",
  description: "লিংক দিলে বাংলা ভয়েসে সতর্কতা (.ai link on/off)",
})(async (message) => {
  try {
    if (!message?.isGroup || isSelfMsg(message)) return;
    const chatKey = String(message.from);
    if (!linkChats.has(chatKey)) return;

    const body = String(message.body || message.text || "").trim();
    if (!body || body.startsWith(".")) return;
    if (!LINK_RE.test(body)) return;

    const who = digitsOf(message.sender);
    const cdKey = `${chatKey}:${who}`;
    if (Date.now() - (linkCooldown.get(cdKey) || 0) < LINK_COOLDOWN_MS) return;

    await message.loadGroupInfo();
    if (message.isAdmin === true || isBotOwner(message)) return;

    linkCooldown.set(cdKey, Date.now());

    const phrase = LINK_VOICE[Math.floor(Math.random() * LINK_VOICE.length)];
    try {
      await sendVoice(message, phrase, "bn");
    } catch (e) {
      console.error("[ai link voice]", e?.message || e);
    }

    await message.conn.sendMessage(
      message.from,
      { text: `⚠️ @${who} লিংক দেওয়া নিষেধ! দয়া করে মুছে দিন।`, mentions: [message.sender] },
      message.raw ? { quoted: message.raw } : {}
    );
  } catch (e) {
    console.error("[ai link]", e?.message || e);
  }
});

/* ---------------------------- command ---------------------------- */

const VOICE_CMD = /^(?:voice|vc|ভয়েস|ভইস|वॉइस|वायस)\s*[:\-]?\s*(on|off|অন|অফ|চালু|বন্ধ|ऑन|ऑफ|चालू|बंद)?$/i;

async function handleAi(message, match = "") {
  const key = historyKey(message);
  const chatKey = String(message.from);
  let ui = uiLangOf(message);

  try {
    let input = String(match || "").trim();
    if (!input && message.quoted?.body) input = String(message.quoted.body).trim();

    if (!input || /^(help|menu|হেল্প|মেনু|मदद|हेल्प|मेन्यू)$/i.test(input)) {
      return message.reply(tr(ui).chatHelp(voiceChats.has(chatKey)));
    }

    // ---- ভয়েস অন / অফ ----
    const vm = input.match(VOICE_CMD);
    if (vm) {
      const arg = (vm[1] || "").toLowerCase();
      const wantOn = ["on", "অন", "চালু", "ऑन", "चालू"].includes(arg);
      const wantOff = ["off", "অফ", "বন্ধ", "ऑफ", "बंद"].includes(arg);

      if (wantOn) {
        voiceChats.add(chatKey);
        await saveVoiceState();
        return message.reply(tr(ui).voiceOn);
      }
      if (wantOff) {
        voiceChats.delete(chatKey);
        await saveVoiceState();
        return message.reply(tr(ui).voiceOff);
      }
      return message.reply(tr(ui).voiceStatus(voiceChats.has(chatKey)));
    }

    // ---- লিংক সতর্কতা অন / অফ (শুধু অ্যাডমিন) ----
    const lm = input.match(LINK_CMD);
    if (lm) {
      const g = gt(ui);
      if (!message.isGroup) return message.reply(g.groupOnly);
      const arg = (lm[1] || "").toLowerCase();
      const wantOn = ["on", "অন", "চালু", "ऑन", "चालू"].includes(arg);
      const wantOff = ["off", "অফ", "বন্ধ", "ऑफ", "बंद"].includes(arg);

      if (!wantOn && !wantOff) return message.reply(g.linkStatus(linkChats.has(chatKey)));

      await message.loadGroupInfo();
      if (!(message.isAdmin === true || isSelfMsg(message) || isBotOwner(message))) {
        return message.reply(g.adminOnly);
      }
      if (wantOn) linkChats.add(chatKey);
      else linkChats.delete(chatKey);
      await saveLinkState();
      return message.reply(wantOn ? g.linkOn : g.linkOff);
    }

    // ---- "group open kar" / "group off kar" ----
    const gi = groupIntent(input);
    if (gi) return handleGroupControl(message, gi, input, voiceChats.has(chatKey));

    if (/^(reset|clear|new|রিসেট|নতুন|रीसेट|नया)$/i.test(input)) {
      histories.delete(key);
      return message.reply(tr(ui).reset);
    }

    // ".ai pic ..." / ".ai photo ..." / ".ai image ..." -> এআই ছবি
    const pic = input.match(/^(?:pic|photo|image|img|imagine|draw|पिक|फोटो|फ़ोटो|ছবি|পিক|ফটো)(?=[\s:-]|$)[:\s-]*(.*)$/i);
    if (pic) return runAiPic(message, pic[1].trim());

    const voiceOn = voiceChats.has(chatKey);
    const userText = input.slice(0, 2000);

    // ---- "তোমাকে কে বানিয়েছে?" -> সরাসরি নির্দিষ্ট উত্তর, ব্যবহারকারীর ভাষায় ----
    if (isOwnerQuestion(userText)) {
      const { lang, text } = ownerAnswerFor(userText, voiceOn);
      lastLang.set(key, lang);
      pushHistory(key, "user", userText);
      pushHistory(key, "assistant", text);
      return deliver(message, text, lang, voiceOn);
    }

    try {
      await message.react?.(voiceOn ? "🎙️" : "🤖");
    } catch {}

    const messages = [
      { role: "system", content: SYSTEM_PROMPT + (voiceOn ? VOICE_STYLE : "") },
      ...getHistory(key),
      { role: "user", content: userText + LANG_REMINDER },
    ];

    const raw = await askChatAI(messages);
    const { text: answer, lang } = splitLangTag(raw, userText);

    lastLang.set(key, lang === "hi" || lang === "bn" ? lang : "en");
    ui = uiLangOf(message);

    pushHistory(key, "user", userText);
    pushHistory(key, "assistant", answer.slice(0, 2000));

    await deliver(message, answer, lang, voiceOn);

    try {
      await message.react?.("✅");
    } catch {}
  } catch (error) {
    console.error("[ai chat]", error);
    try {
      await message.react?.("❌");
    } catch {}
    console.error("[ai chat] final error:", String(error?.message || error).slice(0, 400));
    return message.reply(tr(ui).aiFail());
  }
}

Module({
  command: "ai",
  aliases: ["chatgpt", "ask"],
  package: "ai",
  description: "এআই এর সাথে কথা বলুন (যে ভাষায় লিখবেন সেই ভাষায় উত্তর): .ai hi  |  .ai voice on  |  .ai pic <বর্ণনা>",
})(async (message, match = "") => handleAi(message, match));

// শর্টকাট: .aivoice on / .aivoice off
Module({
  command: "aivoice",
  package: "ai",
  description: "এআই ভয়েস চালু/বন্ধ: .aivoice on | .aivoice off",
})(async (message, match = "") => handleAi(message, `voice ${String(match || "").trim()}`));
