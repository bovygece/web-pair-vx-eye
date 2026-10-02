import { Module } from "../lib/plugins.js";
import config from "../config.js";
import {
  saveWelcomeSlot,
  saveMenuVideo,
  describeSlots,
  clearUrlCache,
} from "../lib/video-store.js";

/*
 * WhatsApp se video badalna (owner only) - video par REPLY karke:
 *
 *   .setwelcomevideo      -> welcome video 1
 *   .setwelcomevideo1     -> welcome video 1
 *   .setwelcomevideo2     -> welcome video 2
 *   .setwelcomevideo3     -> welcome video 3  ... (25 tak)
 *   .setmenuvideo         -> .menu wala video (silent GIF-style)
 *   .welcomevideos        -> kaun sa slot bhara hai dekho
 *
 * URL se badalna ho to media/videos.json file me link daalo.
 */

const MAX_SLOTS = 25;

function isOwnerMessage(m) {
  if (m?.isFromMe || m?.isfromMe || m?.fromMe || m?.key?.fromMe || m?.isOwner) return true;
  const num = String(m?.sender || "").split("@")[0].split(":")[0].replace(/\D/g, "");
  const owners = [config.owner, config.sudo]
    .map((x) => String(x || "").replace(/\D/g, ""))
    .filter(Boolean);
  return Boolean(num) && owners.includes(num);
}

function isVideoMessage(msg) {
  const mime = String(
    msg?.content?.mimetype || msg?.msg?.mimetype || msg?.mimetype || ""
  ).toLowerCase();
  return msg?.type === "videoMessage" || mime.startsWith("video/") || mime.includes("mp4");
}

async function getReplyVideo(message) {
  const quoted = message.quoted || (isVideoMessage(message) ? message : null);
  if (!quoted) return { error: "❌ Kisi video par reply karke command bhejein." };
  if (!isVideoMessage(quoted)) return { error: "❌ Sirf video/MP4 par reply karein." };
  const buffer = await quoted.download?.();
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { error: "❌ Video download nahi hua, dobara try karein." };
  }
  return { buffer };
}

/* ---- .setwelcomevideo, .setwelcomevideo1 ... .setwelcomevideo25 ---- */
for (let n = 1; n <= MAX_SLOTS; n++) {
  const names = [`setwelcomevideo${n}`, `welcomevideo${n}`];
  if (n === 1) names.push("setwelcomevideo", "welcomemp4", "setwlcvideo", "welcomevideo");

  Module({
    command: names[0],
    aliases: names.slice(1),
    package: "owner",
    description: `WhatsApp se welcome video ${n} change karein (video par reply)`,
  })(async (message) => {
    try {
      if (!isOwnerMessage(message)) return message.send?.("❌ Owner only.");
      await message.react?.("⏳");
      const { buffer, error } = await getReplyVideo(message);
      if (error) return message.send?.(error);

      saveWelcomeSlot(n, buffer);
      clearUrlCache();

      await message.react?.("✅");
      return message.send?.(
        `✅ *WELCOME VIDEO ${n} UPDATED*\n\n` +
        `Ab welcome par saved videos me se random video jayega.`
      );
    } catch (err) {
      console.error("[setwelcomevideo] error:", err?.stack || err);
      await message.react?.("❌");
      return message.send?.(`❌ Update nahi hua.\nReason: ${err?.message || "Unknown"}`);
    }
  });
}

/* ---- .setmenuvideo ---- */
Module({
  command: "setmenuvideo",
  aliases: ["menuvideo"],
  package: "owner",
  description: "WhatsApp se .menu ka video change karein (video par reply)",
})(async (message) => {
  try {
    if (!isOwnerMessage(message)) return message.send?.("❌ Owner only.");
    await message.react?.("⏳");
    const { buffer, error } = await getReplyVideo(message);
    if (error) return message.send?.(error);

    saveMenuVideo(buffer);

    await message.react?.("✅");
    return message.send?.("✅ *MENU VIDEO UPDATED*\n\n.menu par ab ye video (bina awaaz) chalega.");
  } catch (err) {
    console.error("[setmenuvideo] error:", err?.stack || err);
    await message.react?.("❌");
    return message.send?.(`❌ Update nahi hua.\nReason: ${err?.message || "Unknown"}`);
  }
});

/* ---- .welcomevideos ---- */
Module({
  command: "welcomevideos",
  aliases: ["listwelcomevideo"],
  package: "owner",
  description: "Welcome video slots ki list",
})(async (message) => {
  if (!isOwnerMessage(message)) return message.send?.("❌ Owner only.");
  const rows = describeSlots();
  if (!rows.length) return message.send?.("Koi slot nahi mila (media/videos.json check karein).");
  return message.send?.(
    "🎬 *WELCOME VIDEO SLOTS*\n\n" +
      rows.map((r) => `${r.src === "EMPTY" ? "⬜" : "✅"} Video ${r.slot}: ${r.src}`).join("\n")
  );
});
