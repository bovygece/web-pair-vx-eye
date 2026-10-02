import { Module } from "../lib/plugins.js";
import fetch from "node-fetch";

Module({
  command: "copilot",
  package: "ai",
  description: "Chat with copilot",
})(async (message, match) => {
  if (!match) return message.send("_অনুগ্রহ করে একটি প্রশ্ন লিখুন_");

  try {
    const sent = await message.send("🤔 ভাবছি...");
    const res = await fetch(
      `https://api.yupra.my.id/api/ai/copilot?text=${encodeURIComponent(match)}`
    );
    const data = await res.json();

    if (!data.status) {
      return await message.send(
        "⚠️ উত্তর পাওয়া যায়নি। আবার চেষ্টা করুন।",
        { edit: sent.key }
      );
    }

    const answer = data.result;
    await message.send(answer, { edit: sent.key });
  } catch (error) {
    console.error("copilot ERROR]:", error.message);
    await message.send("⚠️ একটি সমস্যা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।");
  }
});

Module({
  command: "gpt",
  package: "ai",
  description: "Chat with GPT AI",
})(async (message, match) => {
  if (!match) return message.send("_অনুগ্রহ করে একটি প্রশ্ন লিখুন_");
  try {
    const sent = await message.send("🤔 ভাবছি...");
    const res = await fetch(
      `https://api.yupra.my.id/api/ai/gpt5?text=${encodeURIComponent(match)}`
    );
    const data = await res.json();

    if (!data.status) {
      return await message.send(
        "⚠️ উত্তর পাওয়া যায়নি। আবার চেষ্টা করুন।",
        { edit: sent.key }
      );
    }

    const answer = data.result;
    await message.send(answer, { edit: sent.key });
  } catch (error) {
    console.error("[gpt ERROR]:", error.message);
    await message.send("⚠️ একটি সমস্যা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।");
  }
});

/* ========================================================================== */
/* VX MD BOT — GODFATHER AI GROUP MODE                                       */
/* ========================================================================== */
import config from "../config.js";
import { db } from "../lib/client.js";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

const AI_GROUP_KEY = (group) => `aifather:${group}:enabled`;

const aiGroupEnabled = (m) => {
  if (!m?.isGroup) return false;

  const botNum = String(m.botnum || m.conn?.user?.id || "")
    .split("@")[0]
    .split(":")[0]
    .replace(/\D/g, "");

  return !!botNum && db.get(botNum, AI_GROUP_KEY(m.from), false) === true;
};

const aiAdmin = (m) =>
  !!(m?.isFromMe || m?.isfromMe || m?.isAdmin || m?.isGroupAdmin);

const cleanJid = (jid) =>
  String(jid || "")
    .trim()
    .replace(/:\d+(?=@)/, "")
    .toLowerCase();

const mentionOf = (jid) => `@${cleanJid(jid).split("@")[0]}`;

function taggedJid(message) {
  const direct = Array.isArray(message?.mentions) ? message.mentions : [];
  const raw = message?.raw?.message || message?.mek?.message || {};

  // WhatsApp can wrap the real message (ephemeral/view-once/etc.).
  // Read mentionedJid from every common contextInfo location so a real
  // @mention is detected even when the serializer exposes an empty list.
  const found = [];
  const walk = (node, depth = 0) => {
    if (!node || typeof node !== "object" || depth > 8) return;
    if (Array.isArray(node.mentionedJid)) found.push(...node.mentionedJid);
    if (node.contextInfo?.mentionedJid) found.push(...node.contextInfo.mentionedJid);
    for (const value of Object.values(node)) {
      if (value && typeof value === "object") walk(value, depth + 1);
    }
  };
  walk(raw);

  const all = [...direct, ...found].map(cleanJid).filter(Boolean);

  // আগে সাধারণ নম্বর-JID, না থাকলে LID (নতুন WhatsApp গ্রুপে ট্যাগ LID হিসেবে আসে)
  return (
    all.find((j) => /@s\.whatsapp\.net$/i.test(j)) ||
    all.find((j) => /@lid$/i.test(j)) ||
    null
  );
}

async function sendMediaReliable(message, payload, options = {}) {
  const target = message.from;
  const sendOptions = {
    quoted: options.quoted || message.raw || undefined,
  };

  try {
    return await message.conn.sendMessage(target, payload, sendOptions);
  } catch (firstError) {
    console.error("[godfather] direct media send failed:", firstError?.message || firstError);
    try {
      return await message.send(payload, options);
    } catch (secondError) {
      console.error("[godfather] wrapper media send failed:", secondError?.message || secondError);
      throw secondError;
    }
  }
}

async function getTargetInfo(message, jid) {
  const meta =
    message.groupMetadata ||
    (typeof message.conn?.groupMetadata === "function"
      ? await message.conn.groupMetadata(message.from).catch(() => null)
      : null);

  const participant = (meta?.participants || []).find((p) =>
    [p?.id, p?.lid, p?.jid, p?.phoneNumber, p?.participant]
      .filter(Boolean)
      .some((x) => cleanJid(x) === jid)
  );

  let waInfo = null;

  try {
    if (typeof message.conn?.onWhatsApp === "function") {
      const result = await message.conn.onWhatsApp(jid).catch(() => []);
      waInfo = Array.isArray(result) ? result[0] : null;
    }
  } catch {}

  const name =
    participant?.notify ||
    participant?.name ||
    participant?.displayName ||
    waInfo?.notify ||
    waInfo?.name ||
    waInfo?.verifiedName ||
    (jid ? jid.split("@")[0] : "অজানা সদস্য");

  const role =
    participant?.admin === "superadmin"
      ? "গ্রুপ মালিক"
      : participant?.admin === "admin"
        ? "গ্রুপ অ্যাডমিন"
        : "গ্রুপ সদস্য";

  return {
    jid,
    name: String(name),
    role,
    group: meta?.subject || "এই গ্রুপ",
    isAdmin: !!participant?.admin,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function askYupra(prompt) {
  const res = await fetch(
    `https://api.yupra.my.id/api/ai/gpt5?text=${encodeURIComponent(prompt)}`,
    { signal: AbortSignal.timeout(45_000) }
  );
  const data = await res.json();
  if (!data?.status || !data?.result) throw new Error("empty reply");
  return String(data.result).trim();
}

async function askPollinationsGet(prompt) {
  const res = await fetch(
    `https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=openai&private=true`,
    { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(45_000) }
  );
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const text = (await res.text()).trim();
  if (!text) throw new Error("empty reply");
  return text;
}

async function askPollinationsPost(prompt) {
  const res = await fetch("https://text.pollinations.ai/openai", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
    body: JSON.stringify({ model: "openai", messages: [{ role: "user", content: prompt }], private: true }),
    signal: AbortSignal.timeout(45_000),
  });
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("empty reply");
  return String(text).trim();
}

/* এখানে একাধিক ফ্রি ইঞ্জিন চেষ্টা করা হয়, একটা ডাউন থাকলেও Godfather যেন থেমে না যায় */
async function askAI(prompt) {
  const attempts = [
    ["pollinations-get", askPollinationsGet],
    ["pollinations", askPollinationsPost],
    ["yupra", askYupra],
  ];
  const errors = [];
  for (const [name, run] of attempts) {
    for (let tryNo = 0; tryNo < 2; tryNo++) {
      try {
        return await run(prompt);
      } catch (e) {
        if (e?.status === 429 && tryNo === 0) {
          await sleep(1500);
          continue;
        }
        errors.push(`${name}: ${String(e?.message || e).slice(0, 120)}`);
        console.warn(`[godfather ai] ${name} failed:`, e?.message || e);
        break;
      }
    }
  }
  throw new Error(errors.join(" | "));
}

async function ttsBengali(text, lang = "bn") {
  const clean = String(text)
    .replace(/[\p{Extended_Pictographic}\u200d\ufe0f*_~`>#|]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900);

  // Google TTS এক অনুরোধে ~200 অক্ষর নেয়, তাই টুকরো করে জুড়ি
  const parts = [];
  let cur = "";
  for (let s of clean.match(/[^।.!?\n]+[।.!?]?/g) || [clean]) {
    s = s.trim();
    while (s.length > 180) {
      let cut = s.lastIndexOf(" ", 180);
      if (cut < 40) cut = 180;
      if (cur) parts.push(cur), (cur = "");
      parts.push(s.slice(0, cut).trim());
      s = s.slice(cut).trim();
    }
    if ((cur + " " + s).trim().length > 180) {
      if (cur) parts.push(cur);
      cur = s;
    } else cur = (cur + " " + s).trim();
  }
  if (cur) parts.push(cur);

  const bufs = [];
  for (let i = 0; i < parts.length; i++) {
    const url =
      `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob` +
      `&tl=${encodeURIComponent(lang)}&total=${parts.length}&idx=${i}` +
      `&textlen=${parts[i].length}&q=${encodeURIComponent(parts[i])}`;

    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);
    bufs.push(Buffer.from(await res.arrayBuffer()));
  }
  if (!bufs.length) throw new Error("no speakable text");
  return Buffer.concat(bufs);
}

/* ---------- Godfather: ভাষা চেনা + সদস্যের নিজে সেভ করা তথ্য (.myinfo) ---------- */

const GF_HI =
  /\b(kya|kaise|kaun|kahan|kitna|kitni|umar|ghar|naam|batao|bata|hai|hain|uska|uski|iska|iski|rehta|rahta)\b/gi;
const GF_BN =
  /\b(ki|kemon|kothay|bari|boyos|boyosh|nam|bolo|bolun|tar|take|thake|koto|ke)\b/gi;

function godfatherLang(text) {
  const t = String(text || "");
  if (/[\u0980-\u09FF]/.test(t)) return "bn";
  if (/[\u0900-\u097F]/.test(t)) return "hi";
  const hi = (t.match(GF_HI) || []).length;
  const bn = (t.match(GF_BN) || []).length;
  if (hi > bn) return "hi";
  if (bn > hi) return "bn";
  if (/\b(what|who|where|how|age|name|tell|about|his|her|is|the)\b/i.test(t)) return "en";
  return "bn";
}

const GF_LANG_NAME = { bn: "Bengali (বাংলা)", hi: "Hindi (हिंदी)", en: "English" };

async function savedInfoFor(message, jid) {
  try {
    const raw = await import("node:fs/promises").then((m) =>
      m.readFile(process.cwd() + "/data-myinfo.json", "utf8")
    );
    const data = JSON.parse(raw);
    const digits = (v) => String(v || "").split("@")[0].split(":")[0].replace(/\D/g, "");
    const wanted = new Set([digits(jid)]);

    const meta = message.groupMetadata;
    for (const p of meta?.participants || []) {
      const own = [p?.id, p?.jid, p?.lid, p?.phoneNumber, p?.participant].map(digits).filter(Boolean);
      if (own.includes(digits(jid))) own.forEach((x) => wanted.add(x));
    }

    for (const [key, rec] of Object.entries(data || {})) {
      const all = [key, ...(Array.isArray(rec?.ids) ? rec.ids : [])];
      if (all.some((x) => wanted.has(x)) && rec?.text) return String(rec.text);
    }
  } catch {}
  return "";
}

async function makeTalkingVideo(imageBuffer, audioBuffer) {
  if (!ffmpegPath || !imageBuffer || !audioBuffer) return null;

  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");

  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "vx-godfather-")
  );

  const img = path.join(dir, "profile.jpg");
  const aud = path.join(dir, "voice.mp3");
  const out = path.join(dir, "godfather.mp4");

  try {
    await fs.writeFile(img, imageBuffer);
    await fs.writeFile(aud, audioBuffer);

    await promisify(execFile)(
      ffmpegPath,
      [
        "-y",
        "-loop",
        "1",
        "-i",
        img,
        "-i",
        aud,
        "-vf",
        "scale=720:720:force_original_aspect_ratio=decrease,pad=720:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-tune",
        "stillimage",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-shortest",
        "-movflags",
        "+faststart",
        out,
      ],
      { timeout: 60_000 }
    );

    return await fs.readFile(out);
  } finally {
    await fs
      .rm(dir, { recursive: true, force: true })
      .catch(() => {});
  }
}

async function profilePicture(message, jid) {
  try {
    if (typeof message.conn?.profilePictureUrl !== "function") {
      return null;
    }

    const url = await message.conn
      .profilePictureUrl(jid, "image")
      .catch(() => null);

    if (!url) return null;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) return null;

    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function sendGodfather(
  message,
  target,
  question = "এই সদস্য সম্পর্কে মজার কিন্তু সম্মানজনক একটি পরিচয় দাও।",
  mode = "text"
) {
  const info = await getTargetInfo(message, target);
  const lang = godfatherLang(question);
  const saved = await savedInfoFor(message, target);

  const prompt =
    `You are VX MD BOT's friendly Godfather AI for a WhatsApp group.\n` +
    `Target name: ${info.name}\n` +
    `Role: ${info.role}\n` +
    `Group: ${info.group}\n` +
    `WhatsApp ID: ${info.jid}\n` +
    `Details this member saved about themselves with .myinfo: ${saved || "NONE SAVED"}\n` +
    `User request: ${question}\n` +
    `Important: For personal details (real name, age, home/location, family, relationship, etc.) use ONLY the saved details above. ` +
    `If the request asks for something that is not in the saved details, say clearly and politely that this member has not saved it yet ` +
    `and that they can save it themselves with .myinfo. Never invent or guess private facts and never mention phone numbers. ` +
    `Besides the saved details, only use the supplied group role/name. ` +
    `If the user request is a general introduction, introduce the member using the name, role and ALL the saved details (if any). ` +
    `Reply only in natural ${GF_LANG_NAME[lang]}, in its native script, concise and fun. Do not mix other languages.`;

  const answer = await askAI(prompt);

  const header =
    `🧞 *GODFATHER AI*\n` +
    `👤 *নাম:* ${info.name}\n` +
    `🪪 *ভূমিকা:* ${info.role}\n` +
    `👥 *গ্রুপ:* ${info.group}\n` +
    `📱 *ট্যাগ:* ${mentionOf(info.jid)}\n\n` +
    `🤖 *AI:* ${answer}`;

  const pic = await profilePicture(message, target);

  if (mode === "voice" || mode === "video") {
    try {
      const voice = await ttsBengali(answer, lang);

      if (mode === "voice") {
        await sendMediaReliable(message, {
          audio: voice,
          mimetype: "audio/mpeg",
          ptt: true,
        }, { mentions: [target] });

        await message.send(header, {
          mentions: [target],
        });

        return;
      }

      const video = await makeTalkingVideo(pic, voice);

      if (video) {
        await sendMediaReliable(message,
          {
            video,
            mimetype: "video/mp4",
            caption: header,
          },
          { mentions: [target] }
        );

        return;
      }
    } catch (e) {
      console.error(
        "[godfather] media error:",
        e?.message || e
      );
    }
  }

  if (pic) {
    await sendMediaReliable(
      message,
      { image: pic, caption: header },
      { mentions: [target] }
    );
  } else {
    await message.send(header, {
      mentions: [target],
    });
  }
}

Module({
  command: "aigroup",
  package: "group",
  aliases: ["aifather"],
  description: "Group Godfather AI ON/OFF",
  usage: ".aigroup on | .aigroup off",
})(async (message, match) => {
  if (!message.isGroup) {
    return message.send("❌ *শুধুমাত্র গ্রুপে ব্যবহার করা যাবে।*");
  }

  if (!aiAdmin(message)) {
    return message.send(
      "❌ *শুধুমাত্র গ্রুপ অ্যাডমিন Godfather AI ON/OFF করতে পারবেন।*"
    );
  }

  const botNum = String(
    message.botnum || message.conn?.user?.id || ""
  )
    .split("@")[0]
    .split(":")[0]
    .replace(/\D/g, "");

  if (!botNum) {
    return message.send("❌ বট নম্বর পাওয়া যায়নি।");
  }

  const input = String(match || "").trim().toLowerCase();

  const current =
    db.get(botNum, AI_GROUP_KEY(message.from), false) === true;

  if (!input) {
    return message.send(
      `🧞 *GODFATHER AI*\n\n` +
      `স্ট্যাটাস: ${current ? "✅ ON" : "❌ OFF"}\n\n` +
      `• .aigroup on\n` +
      `• .aigroup off\n` +
      `• 🧞 দিয়ে কোনো সদস্যকে ট্যাগ করুন`
    );
  }

  if (input === "on") {
    db.setHot(
      botNum,
      AI_GROUP_KEY(message.from),
      true
    );

    return message.send(
      "🧞 *GODFATHER AI ON* ✅\n\n" +
      "এখন কোনো সদস্যকে 🧞 দিয়ে ট্যাগ করে প্রশ্ন করুন।\n" +
      "উদাহরণ: 🧞 @member তার নাম কী?"
    );
  }

  if (input === "off") {
    db.setHot(
      botNum,
      AI_GROUP_KEY(message.from),
      false
    );

    return message.send(
      "🧞 *GODFATHER AI OFF* ❌"
    );
  }

  return message.send(
    "ব্যবহার করুন: *.aigroup on* / *.aigroup off*"
  );
});

Module({
  command: "godfather",
  package: "aigroup",
  aliases: ["gfather", "godfatherai"],
  description: "AI profile/details for a tagged group member",
  usage: ".godfather @member [question] | voice | video",
})(async (message, match) => {
  if (!message.isGroup) {
    return message.send(
      "❌ *Godfather AI শুধুমাত্র গ্রুপে কাজ করে।*"
    );
  }

  if (!aiGroupEnabled(message)) {
    return message.send(
      "🧞 *Godfather AI OFF আছে।*\n" +
      "গ্রুপ অ্যাডমিনকে *.aigroup on* করতে হবে।"
    );
  }

  const target = taggedJid(message);

  if (!target) {
    return message.send(
      "🧞 কোনো সদস্যকে ট্যাগ করুন।\n" +
      "উদাহরণ: *.godfather @member তার নাম কী?*"
    );
  }

  let input = String(match || "")
    .replace(/@\S+/g, "")
    .trim();

  let mode = "text";

  if (/^voice\b/i.test(input)) {
    mode = "voice";
    input = input
      .replace(/^voice\b/i, "")
      .trim();
  } else if (/^video\b/i.test(input)) {
    mode = "video";
    input = input
      .replace(/^video\b/i, "")
      .trim();
  }

  try {
    await message.react?.("🧞");
  } catch {}

  try {
    await sendGodfather(
      message,
      target,
      input ||
        "তার নাম এবং গ্রুপের ভূমিকা দেখে একটি মজার পরিচয় দাও।",
      mode
    );
  } catch (e) {
    console.error(
      "[godfather]",
      e?.message || e
    );

    await message.send(
      "❌ Godfather AI এখন উত্তর দিতে পারছে না। কিছুক্ষণ পরে আবার চেষ্টা করুন।"
    );
  }
});

Module({
  on: "text",
  package: "aigroup",
  description: "Godfather AI emoji trigger",
})(async (message) => {
  try {
    if (
      !message?.isGroup ||
      !aiGroupEnabled(message)
    ) {
      return;
    }

    const body = String(
      message.body || message.text || ""
    ).trim();

    if (!body || body.startsWith(".")) return;

    if (
      ![
        "🧞",
        "🧞‍♂️",
        "🧞‍♀️",
        "👑🤖",
      ].some((x) => body.includes(x))
    ) {
      return;
    }

    const target = taggedJid(message);

    if (!target) {
      return message.send(
        "🧞 কোনো সদস্যকে ট্যাগ করে লিখুন: " +
        "*🧞 @member তার নাম কী?*"
      );
    }

    const question = body
      .replace(/🧞‍♂️|🧞‍♀️|🧞|👑🤖/g, "")
      .replace(/@\S+/g, "")
      .trim();

    await sendGodfather(
      message,
      target,
      question ||
        "তার নাম এবং গ্রুপের ভূমিকা দেখে একটি মজার পরিচয় দাও।",
      "text"
    );
  } catch (e) {
    console.error(
      "[godfather emoji]",
      e?.message || e
    );
  }
});
