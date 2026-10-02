import { Module } from "../lib/plugins.js";

Module({
  command: "owner",
  aliases: ["creator", "developer"],
  package: "general",
  description: "Show original bot developer information",
})(async (message) => {
  try {
    const OWNER_NAME = "𝗠𝗢𝗡 𝗦𝗧𝗘𝗥 ";
    const OWNER_NUMBER = "919907925376";
    const BOT_NAME =
      global.config?.BOT_NAME ||
      global.config?.botName ||
      "VX-MD-BOT";

    // ==========================================
    // VCARD
    // ==========================================

    const vcard = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `FN:${OWNER_NAME}`,
      `ORG:${OWNER_NAME}`,
      "TITLE:Original Bot Developer",
      `TEL;type=CELL;type=VOICE;waid=${OWNER_NUMBER}:+${OWNER_NUMBER}`,
      `NOTE:© 2026 ${OWNER_NAME}. Original Bot Developer.`,
      "END:VCARD",
    ].join("\n");

    // ==========================================
    // SEND OWNER CONTACT
    // ==========================================

    await message.conn.sendMessage(
      message.from,
      {
        contacts: {
          displayName: OWNER_NAME,
          contacts: [
            {
              vcard: vcard,
            },
          ],
        },
      }
    );

    // ==========================================
// OWNER INFORMATION
// ==========================================

const text =
  `💬 *কেউ যদি 𝙱𝚘𝚝 লাগাও তাহলে ওই নাম্বার এ 𝚂𝚖𝚜 দাও।*`;

    // ==========================================
    // SEND OWNER INFO
    // ==========================================

    await message.conn.sendMessage(
      message.from,
      {
        text: text,
      }
    );

    console.log(
      `[owner.js] Owner information sent to ${message.from}`
    );

  } catch (error) {
    console.error(
      "[owner.js] Error:",
      error?.stack || error?.message || error
    );

    // ==========================================
    // SIMPLE FALLBACK
    // ==========================================

    try {
      await message.reply(
        `👑 *OWNER INFORMATION* 👑\n\n` +
        `👤 *Name:* 𝗠𝗢𝗡 𝗦𝗧𝗘𝗥 \n` +
        `📞 *WhatsApp:* +919907925376\n` +
        `🤖 *Bot Developer:* Original Bot Developer\n\n` +
        `© 2026 𝗩𝗫 𝗠𝗗 𝗕𝗢𝗧`
      );
    } catch (fallbackError) {
      console.error(
        "[owner.js] Fallback error:",
        fallbackError?.message || fallbackError
      );
    }
  }
});
