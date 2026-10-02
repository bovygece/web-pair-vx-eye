import axios from "axios";
import sticker from "../lib/sticker.js";
import { Module, commands } from "../lib/plugins.js";
import config from "../config.js";

// NekosBest v2 requires a proper User-Agent.  The old handler omitted it,
// which made reaction commands fail on current API protection.
const BASE = "https://nekos.best/api/v2";
const UA = "VX-MD-BOT/1.0 (WhatsApp reaction bot)";

const reactions = {
  cry:{emoji:"😢",action:"is crying"}, blush:{emoji:"😊",action:"is blushing at"}, smile:{emoji:"😁",action:"smiled at"},
  happy:{emoji:"😄",action:"is happy with"}, smug:{emoji:"😏",action:"is smug at"}, pout:{emoji:"😤",action:"is pouting at"},
  confused:{emoji:"😕",action:"is confused by"}, bored:{emoji:"😑",action:"is bored with"}, angry:{emoji:"😡",action:"is angry at"},
  shocked:{emoji:"😲",action:"is shocked by"}, laugh:{emoji:"😂",action:"laughed at"}, think:{emoji:"🤔",action:"is thinking about"},
  bleh:{emoji:"😛",action:"goes bleh at"}, yawn:{emoji:"🥱",action:"yawns at"}, teehee:{emoji:"🤭",action:"teehees at"},
  hug:{emoji:"🤗",action:"hugged"}, cuddle:{emoji:"🫂",action:"cuddled"}, pat:{emoji:"🫶",action:"patted"}, peck:{emoji:"😘",action:"gave a peck to"},
  bite:{emoji:"🦷",action:"bit"}, nom:{emoji:"🍽️",action:"is nomming"}, tickle:{emoji:"🤣",action:"tickled"}, poke:{emoji:"👉",action:"poked"},
  handhold:{emoji:"🤝",action:"is holding hands with"}, handshake:{emoji:"🫱",action:"shook hands with"}, feed:{emoji:"🍴",action:"fed"}, carry:{emoji:"💪",action:"carried"},
  kabedon:{emoji:"🫦",action:"kabedoned"}, blowkiss:{emoji:"💨💋",action:"blew a kiss at"}, lappillow:{emoji:"🛌",action:"gave a lap pillow to"},
  bonk:{emoji:"🔨",action:"bonked"}, slap:{emoji:"✊",action:"slapped"}, punch:{emoji:"👊",action:"punched"}, kick:{emoji:"🦵",action:"kicked"},
  yeet:{emoji:"🚀",action:"yeeted"}, baka:{emoji:"🙄",action:"called baka to"}, wave:{emoji:"👋",action:"waved at"}, highfive:{emoji:"✋",action:"high-fived"},
  clap:{emoji:"👏",action:"clapped for"}, salute:{emoji:"🫡",action:"saluted"}, thumbsup:{emoji:"👍",action:"gave thumbs up to"}, wink:{emoji:"😉",action:"winked at"},
  nod:{emoji:"🙂",action:"nodded at"}, nope:{emoji:"🙅",action:"said nope to"}, shrug:{emoji:"🤷",action:"shrugged at"}, stare:{emoji:"👀",action:"is staring at"},
  facepalm:{emoji:"🤦",action:"facepalmed at"}, tableflip:{emoji:"😤",action:"flipped the table at"}, dance:{emoji:"💃",action:"danced with"},
  spin:{emoji:"🌀",action:"spun around with"}, run:{emoji:"🏃",action:"ran away from"}, shake:{emoji:"🤝",action:"shook"}, wag:{emoji:"🐾",action:"wagged tail at"},
  sip:{emoji:"☕",action:"sips tea ignoring"}, nya:{emoji:"🐱",action:"nyas at"},
};

async function getReactionUrl(key) {
  const { data } = await axios.get(`${BASE}/${encodeURIComponent(key)}`, {
    timeout: 30000,
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  const url = data?.results?.find((x) => x?.url)?.url;
  if (!url) throw new Error(`No ${key} GIF returned by NekosBest`);
  return url;
}

async function getMedia(url) {
  const { data, headers } = await axios.get(url, {
    timeout: 60000,
    responseType: "arraybuffer",
    maxContentLength: 25 * 1024 * 1024,
    headers: { "User-Agent": UA, Accept: "image/gif,image/*,*/*;q=0.8" },
  });
  const type = String(headers?.["content-type"] || "").toLowerCase();
  if (!data || data.length < 1000 || type.includes("text/html")) {
    throw new Error("Reaction media response is invalid");
  }
  return Buffer.from(data);
}

async function safeReact(message, emoji) {
  try { await message.react(emoji); } catch {}
}

async function sendReactionGif(message, key) {
  const reaction = reactions[key];
  if (!reaction) return;

  try {
    await safeReact(message, reaction.emoji);

    const senderJid = message.sender || "";
    const mentionedUser = message.mentions?.[0] || message.quoted?.sender;
    const sender = senderJid ? `@${senderJid.split("@")[0]}` : "Someone";
    const mentions = senderJid ? [senderJid] : [];

    let caption = "";
    if (mentionedUser) {
      caption = `${sender} ${reaction.action} @${mentionedUser.split("@")[0]}`;
      mentions.push(mentionedUser);
    } else if (message.isGroup) {
      caption = `${sender} ${reaction.action} everyone!`;
    }

    const gifUrl = await getReactionUrl(key);
    const gifBuffer = await getMedia(gifUrl);

    // Primary: animated WebP sticker (same appearance as .sticker).
    // Keep the MP4 around so it can be sent directly if WebP conversion fails.
    let videoBuffer = null;
    try {
      videoBuffer = await import("../lib/fetchGif.js").then((m) => m.gifToVideo(gifBuffer));
      const stickerBuffer = await sticker.toSticker("video", videoBuffer, {
        packname: config.packname || "VX MD BOT",
        author: config.author || "VX MD BOT",
        categories: ["anime", "reaction", "💖"],
      });
      await message.conn.sendMessage(message.from, {
        sticker: stickerBuffer,
        mentions: mentions.filter(Boolean),
      });
      return;
    } catch (stickerError) {
      console.warn(`[gif.js] sticker fallback for ${key}:`, stickerError?.message || stickerError);
    }

    // Fallback: send the original GIF as an animated video.  This prevents
    // ffmpeg/WebP conversion problems from making the command completely fail.
    try {
      await message.conn.sendMessage(message.from, {
        video: videoBuffer || gifBuffer,
        mimetype: "video/mp4",
        gifPlayback: true,
        caption,
        mentions: mentions.filter(Boolean),
      });
      return;
    } catch (videoError) {
      console.warn(`[gif.js] video fallback for ${key}:`, videoError?.message || videoError);
    }

    // Last fallback: never leave the command silent.
    await message.send(`${reaction.emoji} ${caption || reaction.action}`);
  } catch (error) {
    console.error(`[gif.js] Reaction error [${key}]:`, error?.stack || error?.message || error);
    await message.send(`❌ ${key} reaction is temporarily unavailable.`).catch(() => {});
  }
}

Module({ on: "text", name: "reaction-auto" })(async (message) => {
  try {
    const text = String(message.body || "").toLowerCase().trim();
    if (text === "kiss") return; // kiss.js owns kiss
    if (reactions[text]) await sendReactionGif(message, text);
  } catch (e) {
    console.error("[gif.js] auto reaction:", e?.message || e);
  }
});

for (const name of Object.keys(reactions)) {
  if (commands.has(name)) continue;
  Module({ command: name, package: "reactions", description: `Send ${name} reaction` })(async (message) => {
    await sendReactionGif(message, name);
  });
}
