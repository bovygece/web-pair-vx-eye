import fs from "fs/promises";
import path from "path";
import { Module } from "../lib/plugins.js";

/*
|--------------------------------------------------------------------------
| MYINFO  -  নিজের তথ্য নিজে সেভ করুন (Godfather AI এটাই বলবে)
|--------------------------------------------------------------------------
|   .myinfo আমার নাম রাহিম, বয়স ২০, বাড়ি ঢাকা
|   .myinfo                -> আপনার সেভ করা তথ্য দেখুন
|   .myinfo delete         -> সেভ করা তথ্য মুছে ফেলুন
|   Aliases: .saveinfo .mydetails
|
| যে তথ্য কেউ নিজে সেভ করেনি, সেটা Godfather AI কখনো বানিয়ে বলবে না।
| তথ্য সেভ হয় বটের ফোল্ডারে  data-myinfo.json  ফাইলে।
|--------------------------------------------------------------------------
*/

const FILE = path.join(process.cwd(), "data-myinfo.json");
const MAX_LEN = 400;

/* ------------------------------ ভাষা ------------------------------ */

const HI_ROM = /\b(kya|kaise|hai|hain|mera|meri|mujhe|nahi|umar|ghar|naam|rehta|rahta|hoon|saal)\b/gi;
const BN_ROM = /\b(ami|amar|amake|bari|bosi|boyos|boyosh|thaki|achi|nam|tomar|koro|dao)\b/gi;

function detectLang(text) {
  const t = String(text || "");
  if (/[\u0980-\u09FF]/.test(t)) return "bn";
  if (/[\u0900-\u097F]/.test(t)) return "hi";
  const hi = (t.match(HI_ROM) || []).length;
  const bn = (t.match(BN_ROM) || []).length;
  if (bn > hi) return "bn";
  if (hi > bn) return "hi";
  return "en";
}

const M = {
  bn: {
    help:
      "📝 *MYINFO*\n\nনিজের তথ্য নিজে সেভ করুন:\n`.myinfo আমার নাম রাহিম, বয়স ২০, বাড়ি ঢাকা`\n\n👀 দেখতে: `.myinfo`\n🗑️ মুছতে: `.myinfo delete`\n\n_শুধু সেটাই লিখুন যা গ্রুপে সবাই জানলে সমস্যা নেই। ফোন নম্বর লিখবেন না।_",
    saved: (t) =>
      `✅ *আপনার তথ্য সেভ হয়েছে!*\n\n${t}\n\n🧞 এখন গ্রুপে কেউ আপনাকে ট্যাগ করে Godfather AI কে জিজ্ঞেস করলে সে এটাই বলবে।\n🗑️ মুছতে: \`.myinfo delete\``,
    show: (t) => `📝 *আপনার সেভ করা তথ্য:*\n\n${t}\n\n🗑️ মুছতে: \`.myinfo delete\``,
    none: "📝 আপনি এখনো কোনো তথ্য সেভ করেননি।\n\nসেভ করুন: `.myinfo আমার নাম রাহিম, বয়স ২০, বাড়ি ঢাকা`",
    deleted: "🗑️ আপনার সেভ করা তথ্য মুছে ফেলা হয়েছে।",
    phone: "❌ ফোন নম্বর বা আইডি নম্বর সেভ করা যাবে না। নম্বর ছাড়া লিখুন।",
    fail: "❌ তথ্য সেভ করা যায়নি। একটু পরে আবার চেষ্টা করুন।",
  },
  hi: {
    help:
      "📝 *MYINFO*\n\nअपनी जानकारी खुद सेव करें:\n`.myinfo मेरा नाम राहुल, उम्र 20, घर दिल्ली`\n\n👀 देखने के लिए: `.myinfo`\n🗑️ मिटाने के लिए: `.myinfo delete`\n\n_सिर्फ़ वही लिखें जो ग्रुप में सबको पता चलने पर दिक्कत न हो। फ़ोन नंबर न लिखें।_",
    saved: (t) =>
      `✅ *आपकी जानकारी सेव हो गई!*\n\n${t}\n\n🧞 अब ग्रुप में कोई आपको टैग करके Godfather AI से पूछेगा तो वो यही बताएगा।\n🗑️ मिटाने के लिए: \`.myinfo delete\``,
    show: (t) => `📝 *आपकी सेव की हुई जानकारी:*\n\n${t}\n\n🗑️ मिटाने के लिए: \`.myinfo delete\``,
    none: "📝 आपने अभी कोई जानकारी सेव नहीं की है।\n\nसेव करें: `.myinfo मेरा नाम राहुल, उम्र 20, घर दिल्ली`",
    deleted: "🗑️ आपकी सेव की हुई जानकारी मिटा दी गई।",
    phone: "❌ फ़ोन नंबर या आईडी नंबर सेव नहीं हो सकता। बिना नंबर के लिखें।",
    fail: "❌ जानकारी सेव नहीं हो पाई। थोड़ी देर बाद फिर कोशिश करें।",
  },
  en: {
    help:
      "📝 *MYINFO*\n\nSave your own details yourself:\n`.myinfo my name is Rahim, age 20, home Dhaka`\n\n👀 View: `.myinfo`\n🗑️ Delete: `.myinfo delete`\n\n_Only write what you're fine with the group knowing. Don't write phone numbers._",
    saved: (t) =>
      `✅ *Your details are saved!*\n\n${t}\n\n🧞 When someone tags you and asks Godfather AI, it will tell this.\n🗑️ Delete: \`.myinfo delete\``,
    show: (t) => `📝 *Your saved details:*\n\n${t}\n\n🗑️ Delete: \`.myinfo delete\``,
    none: "📝 You haven't saved any details yet.\n\nSave: `.myinfo my name is Rahim, age 20, home Dhaka`",
    deleted: "🗑️ Your saved details have been deleted.",
    phone: "❌ Phone or ID numbers can't be saved. Write it without the number.",
    fail: "❌ Couldn't save your details. Try again in a little while.",
  },
};

/* ------------------------------ সেভ/লোড ------------------------------ */

const digits = (v) => String(v || "").split("@")[0].split(":")[0].replace(/\D/g, "");

async function loadAll() {
  try {
    const data = JSON.parse(await fs.readFile(FILE, "utf8"));
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

async function saveAll(data) {
  await fs.writeFile(FILE, JSON.stringify(data, null, 2));
}

// প্রেরকের সব পরিচয় (নম্বর + LID) জোগাড় করি, যাতে ট্যাগ করলে ঠিকঠাক মিলে যায়
async function senderIds(message) {
  const ids = new Set([digits(message.sender)]);
  try {
    if (message.isGroup) {
      await message.loadGroupInfo();
      const me = digits(message.sender);
      for (const p of message.groupParticipants || []) {
        const own = [p?.id, p?.jid, p?.lid, p?.phoneNumber, p?.participant].map(digits).filter(Boolean);
        if (own.includes(me)) own.forEach((x) => ids.add(x));
      }
    }
  } catch {}
  ids.delete("");
  return [...ids];
}

function findKey(data, ids) {
  for (const [key, rec] of Object.entries(data)) {
    const all = [key, ...(Array.isArray(rec?.ids) ? rec.ids : [])];
    if (ids.some((id) => all.includes(id))) return key;
  }
  return null;
}

/* ------------------------------ কমান্ড ------------------------------ */

Module({
  command: "myinfo",
  aliases: ["saveinfo", "mydetails"],
  package: "ai",
  description: "নিজের তথ্য সেভ করুন (Godfather AI বলবে): .myinfo <নাম, বয়স, বাড়ি...>",
})(async (message, match = "") => {
  let lang = "bn";
  try {
    let input = String(match || "").trim();
    if (input) lang = detectLang(input);
    const t = M[lang];

    const ids = await senderIds(message);
    if (!ids.length) return message.reply(t.fail);

    const data = await loadAll();
    const key = findKey(data, ids);

    // ---- মুছে ফেলা ----
    if (/^(delete|del|remove|clear|reset|মুছো|মুছুন|ডিলিট|हटाओ|मिटाओ|डिलीट)$/i.test(input)) {
      if (key) {
        delete data[key];
        await saveAll(data);
      }
      return message.reply(t.deleted);
    }

    // ---- দেখা ----
    if (!input) {
      if (!key) return message.reply(M[lang].none);
      return message.reply(M[detectLang(data[key].text)].show(data[key].text));
    }

    // ---- সেভ ----
    input = input.replace(/^(set|save)\s+/i, "").replace(/\s+/g, " ").trim();
    if (!input) return message.reply(t.help);
    if (/\d{9,}/.test(input.replace(/[\s-]/g, ""))) return message.reply(t.phone);

    const text = input.slice(0, MAX_LEN);
    const useKey = key || ids[0];
    data[useKey] = { ids, text, updated: Date.now() };
    await saveAll(data);

    return message.reply(t.saved(text));
  } catch (e) {
    console.error("[myinfo]", e?.message || e);
    return message.reply(M[lang].fail);
  }
});