import { Module } from "../lib/plugins.js";

function normalizeJid(jid) {
  if (!jid) return "";
  return String(jid).trim().replace(/:\d+(?=@)/, "").toLowerCase();
}

function getParticipantJids(participant) {
  if (!participant) return [];
  return [
    participant.id,
    participant.jid,
    participant.lid,
    participant.pn,
    participant.phoneNumber,
  ].filter(Boolean).map(normalizeJid).filter(Boolean);
}

function getAllParticipantJids(participants) {
  const out = new Set();
  for (const participant of participants || []) {
    for (const jid of getParticipantJids(participant)) out.add(jid);
  }
  return [...out];
}

function getQuotedType(quoted) {
  return quoted?.type || "";
}

function getQuotedContent(quoted) {
  const type = getQuotedType(quoted);
  return quoted?.msg || quoted?.message?.[type] || quoted?.message || {};
}

function getQuotedText(quoted) {
  const msg = getQuotedContent(quoted);
  return (
    quoted?.body ||
    (typeof msg === "string" ? msg : "") ||
    msg?.conversation ||
    msg?.extendedTextMessage?.text ||
    msg?.imageMessage?.caption ||
    msg?.videoMessage?.caption ||
    msg?.documentMessage?.caption ||
    ""
  ).trim();
}

Module({
  command: "ht",
  aliases: ["hidetag"],
  package: "group",
  description: "Hide-tag all group members; supports reply text/media",
})(async (m, text) => {
  try {
    if (!m.isGroup) {
      return m.reply("❌ This command can only be used in a group.");
    }

    await m.loadGroupInfo();

    const participants = Array.isArray(m.groupParticipants)
      ? m.groupParticipants
      : Array.isArray(m.groupMetadata?.participants)
        ? m.groupMetadata.participants
        : [];

    const mentions = getAllParticipantJids(participants);
    const inputText = String(text || "").trim();
    const quoted = m.quoted;

    // Reply mode: resend the replied content while mentioning all members.
    if (quoted) {
      const type = getQuotedType(quoted);
      const q = getQuotedContent(quoted);

      if (type === "imageMessage") {
        const media = await quoted.download();
        if (!media) return m.reply("❌ Image download failed.");
        const caption = q?.caption || inputText || "";
        return m.send({ image: media, caption }, { mentions });
      }

      if (type === "videoMessage") {
        const media = await quoted.download();
        if (!media) return m.reply("❌ Video download failed.");
        const caption = q?.caption || inputText || "";
        return m.send({ video: media, caption }, { mentions });
      }

      if (type === "stickerMessage") {
        const media = await quoted.download();
        if (!media) return m.reply("❌ Sticker download failed.");
        await m.send({ sticker: media }, { mentions });
        if (inputText) await m.send(inputText, { mentions });
        return;
      }

      if (type === "audioMessage") {
        const media = await quoted.download();
        if (!media) return m.reply("❌ Audio download failed.");
        await m.send(
          {
            audio: media,
            mimetype: q?.mimetype || "audio/mp4",
            ptt: q?.ptt || false,
          },
          { mentions }
        );
        if (inputText) await m.send(inputText, { mentions });
        return;
      }

      if (type === "documentMessage") {
        const media = await quoted.download();
        if (!media) return m.reply("❌ Document download failed.");
        await m.conn.sendMessage(
          m.from,
          {
            document: media,
            mimetype: q?.mimetype || "application/octet-stream",
            fileName: q?.fileName || "file",
            mentions,
          },
          { quoted: m.raw }
        );
        if (inputText) await m.send(inputText, { mentions });
        return;
      }

      const finalText = inputText || getQuotedText(quoted);
      if (!finalText) return m.reply("❌ Empty message.");
      return m.send(finalText, { mentions });
    }

    // Normal text mode: .ht hello
    if (!inputText) {
      return m.reply(
        `📢 *HIDETAG*\n\n` +
        `• Reply to a message and type .ht\n` +
        `• Or type .ht <message>\n\n` +
        `Support: text, image, video, sticker, audio, document`
      );
    }

    return m.send(inputText, { mentions });
  } catch (err) {
    console.error("[ht] error:", err?.stack || err?.message || err);
    return m.reply("❌ Hidetag failed. Please try again.");
  }
});
