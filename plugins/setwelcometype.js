import {
  getAssetBuffer,
} from "../lib/miku-legacy.js";
import config from "../config.js";
import {
  prepareWAMessageMedia,
  generateWAMessageFromContent,
} from "@whiskeysockets/baileys";

const pluginConfig = {
  name: "setwelcometype",
  alias: ["welcometype", "welcomevariant", "welcomestyle"],
  category: "owner",
  description: "Mengatur variant tampilan welcome message",
  usage: ".setwelcometype",
  example: ".setwelcometype",
  isOwner: true,
  isPremium: false,
  isGroup: false,
  isPrivate: false,
  cooldown: 3,
  energi: 0,
  isEnabled: true,
};

const VARIANTS = {
  1: { name: "Canvas Image", desc: "Gambar canvas dengan foto profil", emoji: "🎨" },
  2: { name: "Carousel Cards", desc: "Kartu carousel interaktif dengan tombol", emoji: "🃏" },
  3: { name: "Text Only", desc: "Pesan teks biasa tanpa gambar", emoji: "📝" },
  4: { name: "Group", desc: "ContextInfo group style", emoji: "👥" },
  5: { name: "Simple", desc: "Pesan teks simple + foto profile", emoji: "✨" },
  6: { name: "Video", desc: "Video sambutan dengan caption", emoji: "🎥" },
  7: { name: "Interactive Quoted", desc: "Interactive message dengan quoted", emoji: "💬" },
  8: { name: "Super Simple", desc: "Pesan teks sangat singkat tanpa hiasan", emoji: "👋" },
};

async function handler(m, { sock, db }) {
  const args = m.args || [];
  const variant = String(args[0] || "").toLowerCase();
  const current = Number(db.setting("welcomeType")) || 1;

  if (variant && /^v?[1-8]$/.test(variant)) {
    const id = parseInt(variant.replace("v", ""), 10);
    db.setting("welcomeType", id);
    await db.save();
    await m.reply(
      `✅ *WELCOME TYPE DIUBAH*\n\n` +
      `${VARIANTS[id].emoji} *V${id} — ${VARIANTS[id].name}*\n` +
      `_${VARIANTS[id].desc}_`,
    );
    return;
  }

  const rows = Object.entries(VARIANTS).map(([id, val]) => ({
    title: `${val.emoji} V${id}${Number(id) === current ? " ✓" : ""} — ${val.name}`,
    description: val.desc,
    id: `${m.prefix}setwelcometype v${id}`,
  }));

  const bodyText =
    `👋🎨 *WELCOME TYPE*\n\n` +
    `Atur tampilan pesan welcome saat member baru masuk grup 🚪✨\n` +
    `Tipe aktif saat ini: *${VARIANTS[current].emoji} V${current} — ${VARIANTS[current].name}* 🎯\n\n` +
    `*PENJELASAN TIPE:*\n\n` +
    `• *V1 Canvas Image* 🎨 — Gambar canvas otomatis dengan foto profil dan nama member baru.\n\n` +
    `• *V2 Carousel Cards* 🃏 — Kartu carousel interaktif lengkap dengan tombol action.\n\n` +
    `• *V3 Text Only* 📝 — Pesan teks biasa tanpa gambar.\n\n` +
    `• *V4 Group* 👥 — ContextInfo group style dengan tampilan forward yang rapi.\n\n` +
    `• *V5 Simple* ✨ — Pesan teks sederhana dengan foto profil member.\n\n` +
    `• *V6 Video* 🎥 — Video sambutan dengan caption welcome untuk member.\n\n` +
    `• *V7 Interactive Quoted* 💬 — Pesan interactive dengan quoted member yang join.\n\n` +
    `• *V8 Super Simple* 👋 — Pesan welcome sangat singkat tanpa hiasan.\n\n` +
    `> 👇 *Tekan tombol di bawah untuk memilih tipe welcome.*`;

  // This is the same native-flow pattern already used by the bot's working menu:
  // bottom_sheet + tap_target_configuration + single_select.
  let media = null;
  try {
    const image = await getAssetBuffer("anita-baileys");
    if (image) {
      media = await prepareWAMessageMedia(
        { image },
        { upload: sock.waUploadToServer },
      );
    }
  } catch (e) {
    console.error("[setwelcometype] media error:", e?.message || e);
  }

  const saluranId = config.saluran?.id || "120363410099245350@newsletter";
  const saluranName = config.saluran?.name || config.bot?.name || "𝗩𝗫 𝗠𝗗 𝗕𝗢𝗧";

  const fakeQuoted = {
    key: {
      fromMe: false,
      participant: "0@s.whatsapp.net",
      remoteJid: m.chat,
    },
    message: {
      conversation: config.bot?.name || "𝗩𝗫 𝗠𝗗 𝗕𝗢𝗧",
    },
  };

  const msg = generateWAMessageFromContent(
    m.chat,
    {
      viewOnceMessage: {
        message: {
          messageContextInfo: {},
          interactiveMessage: {
            header: media?.imageMessage
              ? {
                  title: "",
                  subtitle: "",
                  hasMediaAttachment: true,
                  imageMessage: media.imageMessage,
                }
              : undefined,
            body: { text: bodyText },
            footer: {
              text: "👇 Tekan tombol di bawah",
            },
            contextInfo: {
              mentionedJid: [m.sender],
              isForwarded: true,
              forwardingScore: 9,
              forwardedNewsletterMessageInfo: {
                newsletterJid: saluranId,
                newsletterName: saluranName,
                serverMessageId: 127,
              },
            },
            nativeFlowMessage: {
              messageParamsJson: JSON.stringify({
                bottom_sheet: {
                  in_thread_buttons_limit: 2,
                  divider_indices: [1, 2, 3, 4, 5, 999],
                  list_title: "Please select WELCOME Type",
                  button_title: "😁 Select WELCOME Type",
                },
                tap_target_configuration: {
                  title: "WELCOME",
                  description: "Select welcome type",
                  canonical_url: "https://anita.site",
                  domain: "anita.site",
                  button_index: 0,
                },
              }),
              buttons: [
                {
                  name: "single_select",
                  buttonParamsJson: JSON.stringify({
                    title: "😁 Select WELCOME Type",
                    sections: [
                      {
                        title: "🎨 Daftar Tipe Welcome",
                        rows,
                      },
                    ],
                    icon: "DEFAULT",
                  }),
                },
              ],
            },
          },
        },
      },
    },
    { quoted: fakeQuoted, userJid: sock.user?.jid },
  );

  await sock.relayMessage(m.chat, msg.message, {
    messageId: msg.key.id,
  });
}



import { Module } from "../lib/plugins.js";
import { makeLegacyMessage, runLegacyContext, getDatabase as getLegacyDatabase, withLegacySocket } from "../lib/miku-legacy.js";
const __meta = {"command": "setwelcometype", "aliases": ["welcometype", "welcomevariant", "welcomestyle"], "package": "owner", "description": "Mengatur variant tampilan welcome message", "isOwner": true, "isGroup": false, "isAdmin": false, "isBotAdmin": false};
async function __runLegacy(message,args) {
  const sock=withLegacySocket(message.conn);
  const rawCommand=String(message.body||"").trim().replace(/^\./,"").split(/\s+/)[0].toLowerCase();
  const lm=makeLegacyMessage(message,args,rawCommand||__meta.command);
  if(lm.isGroup) { try{ await lm.loadGroupInfo(); }catch{} }
  if(__meta.isOwner && !lm.isOwner) return lm.reply("❌ Owner only.");
  if(__meta.isGroup && !lm.isGroup) return lm.reply("❌ This command can only be used in groups.");
  if(__meta.isAdmin && !lm.isAdmin && !lm.isOwner) return lm.reply("❌ Only group admins can use this command.");
  if(__meta.isBotAdmin && !lm.isBotAdmin) return lm.reply("❌ Bot must be a group admin to use this command.");
  return runLegacyContext(lm,()=>handler(lm,{sock,db:getLegacyDatabase(lm),text:String(args||"")}));
}
Module(__meta)(async (message,args="")=>__runLegacy(message,args));
