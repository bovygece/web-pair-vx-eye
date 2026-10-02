import {
  generateWAMessageFromContent,
  proto,
} from "@whiskeysockets/baileys";

const pluginConfig = {
  name: "setownertype",
  alias: ["ownertype", "ownervariant", "ownerstyle"],
  category: "owner",

  description: "Mengatur variant tampilan owner message",
  usage: ".setownertype",
  example: ".setownertype",

  isOwner: true,
  isPremium: false,
  isGroup: false,
  isPrivate: false,

  cooldown: 3,
  energi: 0,
  isEnabled: true,
};

const VARIANTS = {
  1: {
    name: "Canvas Image",
    desc: "Gambar canvas dengan foto profil",
    emoji: "🎨",
  },

  2: {
    name: "Carousel Cards",
    desc: "Kartu carousel interaktif dengan tombol",
    emoji: "🃏",
  },

  3: {
    name: "Text Only",
    desc: "Pesan teks biasa tanpa gambar",
    emoji: "📝",
  },

  4: {
    name: "Group",
    desc: "ContextInfo group style",
    emoji: "👥",
  },

  5: {
    name: "Simple",
    desc: "Pesan teks simple + foto profile",
    emoji: "✨",
  },

  6: {
    name: "Video",
    desc: "Video ucapan perpisahan",
    emoji: "🎥",
  },

  7: {
    name: "Interactive Quoted",
    desc: "Interactive message dengan quoted",
    emoji: "💬",
  },

  8: {
    name: "Super Simple",
    desc: "Pesan teks sangat singkat tanpa hiasan",
    emoji: "👋",
  },
};

async function handler(m, { sock, db }) {
  const args = m.args || [];
  const variant = String(args[0] || "").toLowerCase();

  const current = Number(db.setting("ownerType")) || 1;

  // =========================================================
  // DIRECT COMMAND
  // .setownertype v1
  // .setownertype 1
  // =========================================================

  if (variant && /^v?[1-8]$/.test(variant)) {
    const id = parseInt(variant.replace("v", ""), 10);

    db.setting("ownerType", id);
    await db.save();

    await m.reply(
      `✅ *OWNER TYPE DIUBAH*\n\n` +
        `${VARIANTS[id].emoji} *V${id} — ${VARIANTS[id].name}*\n` +
        `_${VARIANTS[id].desc}_`,
    );

    return;
  }

  // =========================================================
  // CREATE V1 - V8 MENU
  // =========================================================

  const rows = Object.entries(VARIANTS).map(([id, val]) => {
    const number = Number(id);
    const active = number === current ? " ✓" : "";

    return {
      title: `${val.emoji} V${id}${active} — ${val.name}`,
      description: val.desc,
      id: `${m.prefix}setownertype v${id}`,
    };
  });

  // =========================================================
  // NATIVE SINGLE SELECT BUTTON
  // =========================================================

  const buttons = [
    {
      name: "single_select",
      buttonParamsJson: JSON.stringify({
        title: "👋 Select Owner Type",

        sections: [
          {
            title: "🚪 Daftar Tipe Owner",
            rows: rows,
          },
        ],
      }),
    },
  ];

  // =========================================================
  // BODY TEXT
  // =========================================================

  const bodyText =
    `👋🚪 *OWNER TYPE*\n\n` +
    `Atur tampilan pesan owner saat member keluar dari grup 🚶💨\n\n` +

    `Tipe aktif saat ini:\n` +
    `${VARIANTS[current].emoji} *V${current} — ${VARIANTS[current].name}* 🎯\n\n` +

    `*PENJELASAN TIPE:*\n\n` +

    `• *V1 Canvas Image* 🎨\n` +
    `Gambar canvas otomatis dengan foto profil dan nama member yang keluar.\n\n` +

    `• *V2 Carousel Cards* 🃏\n` +
    `Kartu carousel interaktif lengkap dengan tombol action.\n\n` +

    `• *V3 Text Only* 📝\n` +
    `Pesan teks biasa tanpa gambar, ringan dan sederhana.\n\n` +

    `• *V4 Group* 👥\n` +
    `Menggunakan contextInfo group style dengan tampilan forward yang rapi.\n\n` +

    `• *V5 Simple* ✨\n` +
    `Pesan teks sederhana dengan foto profil member yang keluar.\n\n` +

    `• *V6 Video* 🎥\n` +
    `Video ucapan perpisahan dengan caption otomatis untuk member.\n\n` +

    `• *V7 Interactive Quoted* 💬\n` +
    `Pesan interactive dengan quoted member yang keluar.\n\n` +

    `• *V8 Super Simple* 👋\n` +
    `Pesan owner sangat singkat tanpa hiasan.\n\n` +

    `> 👇 *Tekan tombol di bawah untuk memilih tipe owner.*`;

  // =========================================================
  // NATIVE WHATSAPP INTERACTIVE MESSAGE
  // =========================================================

  const interactiveMessage =
    proto.Message.InteractiveMessage.create({
      body: proto.Message.InteractiveMessage.Body.create({
        text: bodyText,
      }),

      footer: proto.Message.InteractiveMessage.Footer.create({
        text: "🚪 Owner System",
      }),

      nativeFlowMessage:
        proto.Message.InteractiveMessage.NativeFlowMessage.create({
          buttons,
        }),
    });

  // =========================================================
  // CREATE MESSAGE
  // =========================================================

  const message = generateWAMessageFromContent(
    m.chat,
    {
      viewOnceMessage: {
        message: {
          interactiveMessage,
        },
      },
    },
    {
      userJid: sock.user?.id,
      quoted: m,
    },
  );

  // =========================================================
  // SEND MESSAGE
  // =========================================================

  await sock.relayMessage(
    m.chat,
    message.message,
    {
      messageId: message.key.id,
    },
  );
}


import { Module } from "../lib/plugins.js";
import { makeLegacyMessage, runLegacyContext, getDatabase as getLegacyDatabase, withLegacySocket } from "../lib/miku-legacy.js";
const __meta = {"command": "setownertype", "aliases": ["ownertype", "ownervariant", "ownerstyle"], "package": "owner", "description": "Mengatur variant tampilan owner message", "isOwner": true, "isGroup": false, "isAdmin": false, "isBotAdmin": false};
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
