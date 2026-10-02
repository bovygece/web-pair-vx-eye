import { Module } from "../lib/plugins.js";
import config from "../config.js";

/*
 * .jid <channel link>  (alias: .chid)
 * WhatsApp Channel ka invite link dene par uska Channel JID nikal kar deta hai.
 *
 * Example:
 *   .jid https://whatsapp.com/channel/XXXX
 */
Module({
  command: "jid",
  aliases: ["chid"],
  package: "tools",
  description: "Get WhatsApp Channel JID from invite link",
})(async (message, match) => {
  const prefix = config.prefix || ".";

  // Link argument se ya reply kiye hue message se lo
  let source = String(match || "").trim();
  if (!source && /whatsapp\.com\/channel\//i.test(String(message.quoted?.body || ""))) {
    source = String(message.quoted.body).trim();
  }

  // Link nahi diya -> pehle jaisa: user / group ki JID (sirf owner)
  if (!/whatsapp\.com\/channel\//i.test(source)) {
    if (source) {
      return message.send(
        `📢 *ᴄʜᴀɴɴᴇʟ ᴊɪᴅ*\n\n` +
          `> Example:\n` +
          `${prefix}jid https://whatsapp.com/channel/XXXX`
      );
    }
    try {
      if (!message.isfromMe) {
        return message.send(
          `📢 *ᴄʜᴀɴɴᴇʟ ᴊɪᴅ*\n\n` +
            `> Example:\n` +
            `${prefix}jid https://whatsapp.com/channel/XXXX`
        );
      }
      const jid =
        message.quoted?.participant ||
        message.quoted?.participantAlt ||
        message.quoted?.sender ||
        message.mentions?.[0] ||
        message.from;
      return message.reply(`📋 JID Information\n\n\`\`\`${jid}\`\`\``);
    } catch (err) {
      console.error("JID command error:", err);
      return message.send("❌ Failed to get JID");
    }
  }

  try {
    const found = source.match(
      /https?:\/\/(?:www\.)?whatsapp\.com\/channel\/([A-Za-z0-9_-]+)/i
    );

    if (!found) {
      try { await message.react("❌"); } catch {}
      return message.send("❌ *Invalid WhatsApp Channel link.*");
    }

    const channelCode = found[1].trim();

    try { await message.react("⌛"); } catch {}

    const res = await message.client.newsletterMetadata("invite", channelCode);

    if (!res?.id) {
      try { await message.react("❌"); } catch {}
      return message.send("❌ *Channel JID not found.*");
    }

    try { await message.react("✅"); } catch {}

    return message.send(
      `📢 *ᴡʜᴀᴛsᴀᴘᴘ ᴄʜᴀɴɴᴇʟ ᴊɪᴅ*\n\n` +
        `🆔 \`${res.id}\``
    );
  } catch (error) {
    console.error("Channel JID Error:", error);
    try { await message.react("❌"); } catch {}
    return message.send(
      `⚠️ *Failed to get Channel JID*\n\n` +
        `${error?.message || "Unknown error"}`
    );
  }
});
