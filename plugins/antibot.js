import { getDatabase } from "../lib/miku-legacy.js";
import {
  findParticipantByNumber,
  getParticipantJid,
} from "../lib/anita-lid.js";
import { Module } from "../lib/plugins.js";
import {
  makeLegacyMessage,
  runLegacyContext,
  getDatabase as getLegacyDatabase,
  withLegacySocket,
} from "../lib/miku-legacy.js";
import config from "../config.js";

const pluginConfig = {
  name: ["antibot", "botdetect"],
  alias: [],
  category: "group",
  description: "Deteksi dan kick bot WhatsApp (Baileys) dari grup",
  usage: ".antibot <on/off>",
  example: ".antibot on",
  isOwner: false,
  isPremium: false,
  isGroup: true,
  isPrivate: false,
  isAdmin: true,
  isBotAdmin: true,
  cooldown: 5,
  energi: 0,
  isEnabled: true,
};

/* =========================================================
   MESSAGE
   ========================================================= */

function gpMsg(key, replacements = {}) {
  const defaults = {
    antibot:
      "🤖 AntiBot — @%user% bot terdeteksi dan telah dikeluarkan dari grup.",
  };

  let text =
    config?.groupProtection?.[key] ||
    defaults[key] ||
    "";

  for (const [k, v] of Object.entries(replacements)) {
    text = text.replace(
      new RegExp(`%${k}%`, "g"),
      String(v ?? "")
    );
  }

  return text;
}

/* =========================================================
   HELPERS
   ========================================================= */

function extractMessageId(m) {
  return String(
    m?.key?.id ||
      m?.id ||
      ""
  ).trim();
}

function extractSenderDevice(m) {
  const participant = String(
    m?.key?.participant || ""
  );

  const match = participant.match(/:(\d+)@/);

  if (!match) return null;

  const value = Number.parseInt(
    match[1],
    10
  );

  return Number.isNaN(value)
    ? null
    : value;
}

function isUnknownPushName(pushName) {
  const value = String(
    pushName || ""
  )
    .trim()
    .toLowerCase();

  return (
    !value ||
    ["unknown", "undefined", "null"].includes(
      value
    )
  );
}

/* =========================================================
   BOT MESSAGE ANALYZER
   ========================================================= */

function analyzeBotMessage(m) {
  const messageId =
    extractMessageId(m);

  if (!messageId) {
    return {
      isBot: false,
      score: 0,
      reasons: [],
      confidence: "low",
      messageId: "",
      senderDevice: null,
    };
  }

  /*
   * Normal WhatsApp IDs.
   * These must NOT automatically be treated as bots.
   */
  if (
    messageId.startsWith("WAMID.") ||
    messageId.startsWith("false_") ||
    messageId.startsWith("true_")
  ) {
    return {
      isBot: false,
      score: 0,
      reasons: [],
      confidence: "low",
      messageId,
      senderDevice:
        extractSenderDevice(m),
    };
  }

  let score = 0;
  const reasons = [];

  const idUpper =
    messageId.toUpperCase();

  if (idUpper.startsWith("BAE5")) {
    score += 5;
    reasons.push("id-BAE5");
  } else if (
    idUpper.startsWith("3EB0") &&
    idUpper.length === 22
  ) {
    score += 4;
    reasons.push("id-3EB0");
  } else if (
    idUpper.startsWith("B24E")
  ) {
    score += 5;
    reasons.push("id-B24E");
  } else if (
    idUpper.startsWith("94DD")
  ) {
    score += 5;
    reasons.push("id-94DD");
  } else if (
    idUpper.startsWith("B1E")
  ) {
    score += 5;
    reasons.push("id-B1E");
  } else if (
    /^[A-F0-9]{28,40}$/i.test(
      messageId
    )
  ) {
    score += 2;
    reasons.push("id-upper-hex");
  } else if (
    messageId.length === 16
  ) {
    score += 3;
    reasons.push("id-length-16");
  } else if (
    messageId.length < 20 &&
    !messageId.includes("-")
  ) {
    score += 2;
    reasons.push(
      "id-length-suspicious"
    );
  }

  if (
    /[a-z]/.test(messageId) &&
    !messageId.startsWith("3EB0") &&
    !messageId.includes("-")
  ) {
    score += 4;
    reasons.push(
      "id-lowercase-signature"
    );
  }

  const len =
    messageId.length;

  if (
    len !== 16 &&
    len !== 20 &&
    len !== 22 &&
    len !== 32 &&
    !messageId.includes("-")
  ) {
    score += 3;
    reasons.push(
      "id-length-unusual"
    );
  }

  if (m?.isBaileys === true) {
    score += 5;
    reasons.push(
      "flag-isBaileys"
    );
  }

  const msg =
    m?.message || {};

  const actualMsg =
    msg.ephemeralMessage?.message ||
    msg.viewOnceMessage?.message ||
    msg.viewOnceMessageV2?.message ||
    msg;

  const textMsg =
    m?.text ||
    actualMsg?.conversation ||
    actualMsg
      ?.extendedTextMessage
      ?.text ||
    "";

  const contextInfo =
    actualMsg
      ?.extendedTextMessage
      ?.contextInfo ||
    actualMsg
      ?.imageMessage
      ?.contextInfo ||
    actualMsg
      ?.videoMessage
      ?.contextInfo ||
    {};

  if (
    contextInfo.externalAdReply
  ) {
    score += 6;
    reasons.push(
      "custom-ad-reply"
    );
  }

  if (
    contextInfo.isForwarded &&
    contextInfo.forwardingScore >
      100
  ) {
    score += 3;
    reasons.push(
      "fake-forward-score"
    );
  }

  if (
    /[\u200B-\u200D\uFEFF]/.test(
      textMsg
    )
  ) {
    score += 3;
    reasons.push(
      "invisible-characters"
    );
  }

  const botMessageTypes = [
    "buttonsMessage",
    "templateMessage",
    "listMessage",
    "interactiveMessage",
    "buttonsResponseMessage",
    "templateButtonReplyMessage",
    "listResponseMessage",
    "interactiveResponseMessage",
  ];

  for (
    const type of botMessageTypes
  ) {
    if (actualMsg[type]) {
      score += 6;
      reasons.push(
        `message-type-${type}`
      );
      break;
    }
  }

  if (
    msg.deviceSentMessage
  ) {
    score += 1;
    reasons.push(
      "message-deviceSent"
    );

    if (
      msg.deviceSentMessage
        ?.message
    ) {
      score += 1;
      reasons.push(
        "message-deviceWrapper"
      );
    }
  }

  const senderDevice =
    extractSenderDevice(m);

  if (
    Number.isInteger(
      senderDevice
    ) &&
    senderDevice > 20
  ) {
    score += 2;
    reasons.push(
      "participant-highDevice"
    );
  }

  const lowerPushName =
    String(
      m?.pushName || ""
    ).toLowerCase();

  if (
    isUnknownPushName(
      m?.pushName
    )
  ) {
    score += 1;
    reasons.push(
      "pushname-unknown"
    );
  } else if (
    /bot|system|admin|owner|host|panel/i.test(
      lowerPushName
    )
  ) {
    score += 2;
    reasons.push(
      "pushname-suspicious"
    );
  }

  const confidence =
    score >= 6
      ? "high"
      : score >= 4
      ? "medium"
      : "low";

  return {
    isBot: score >= 5,
    score,
    reasons,
    confidence,
    messageId,
    senderDevice,
  };
}

/* =========================================================
   COMMAND HANDLER
   ========================================================= */

function handler(m, { sock }) {
  const db =
    getDatabase();

  /*
   * The legacy wrapper can provide m.args
   * as either an array or string.
   */
  let args = "";

  if (
    Array.isArray(m.args)
  ) {
    args = String(
      m.args.join(" ") || ""
    )
      .trim()
      .toLowerCase();
  } else if (
    typeof m.args ===
    "string"
  ) {
    args = m.args
      .trim()
      .toLowerCase();
  }

  /*
   * Extra fallback from message body.
   */
  if (
    !args &&
    typeof m.body ===
      "string"
  ) {
    const parts =
      m.body
        .trim()
        .replace(
          /^[.!#/]/,
          ""
        )
        .split(/\s+/);

    args = String(
      parts
        .slice(1)
        .join(" ") || ""
    ).toLowerCase();
  }

  const groupData =
    db.getGroup(
      m.chat
    ) || {};

  const current =
    Boolean(
      groupData.antibot
    );

  /* ---------------- STATUS ---------------- */

  if (
    !args ||
    args === "status"
  ) {
    return m.reply(
      "🤖 *AntiBot*\n\n" +
        `> Status: ${
          current
            ? "✅ Aktif"
            : "❌ Nonaktif"
        }\n\n` +
        "> Deteksi: *Smart Heuristic*\n\n" +
        '> Gunakan: `.antibot on` / `.antibot off`'
    );
  }

  /* ---------------- ON ---------------- */

  if (args === "on") {
    const newData = {
      ...groupData,
      antibot: true,
    };

    db.setGroup(
      m.chat,
      newData
    );

    /*
     * Save database.
     */
    try {
      db.save();
    } catch (
      saveError
    ) {
      console.error(
        "[AntiBot] DB save error:",
        saveError?.message ||
          saveError
      );
    }

    try {
      m.react?.("✅");
    } catch {}

    return m.reply(
      "✅ *AntiBot diaktifkan*\n\n" +
        "Bot WhatsApp yang terdeteksi akan dihapus " +
        "dan dikeluarkan dari grup."
    );
  }

  /* ---------------- OFF ---------------- */

  if (args === "off") {
    const newData = {
      ...groupData,
      antibot: false,
    };

    db.setGroup(
      m.chat,
      newData
    );

    try {
      db.save();
    } catch (
      saveError
    ) {
      console.error(
        "[AntiBot] DB save error:",
        saveError?.message ||
          saveError
      );
    }

    try {
      m.react?.("❌");
    } catch {}

    return m.reply(
      "❌ *AntiBot dinonaktifkan*"
    );
  }

  return m.reply(
    '❌ Gunakan `.antibot on` atau `.antibot off`'
  );
}

/* =========================================================
   BOT DETECTION
   ========================================================= */

function isBotMessage(m) {
  const result =
    analyzeBotMessage(m);

  return {
    isBot:
      result.isBot,
    reason:
      result.reasons[0] ||
      null,
    score:
      result.score,
    reasons:
      result.reasons,
    confidence:
      result.confidence,
  };
}

/* =========================================================
   DETECT + DELETE + KICK
   ========================================================= */

async function detectBot(
  m,
  sock
) {
  if (!m?.isGroup) {
    return false;
  }

  const db =
    getDatabase();

  const groupData =
    db.getGroup(
      m.chat
    );

  if (
    !groupData?.antibot
  ) {
    return false;
  }

  const result =
    isBotMessage(m);

  if (
    !result.isBot
  ) {
    return false;
  }

  const botJid =
    m.sender;

  if (!botJid) {
    return false;
  }

  const groupMeta =
    m.groupMetadata ||
    m.metadata;

  if (
    !groupMeta?.participants
  ) {
    return false;
  }

  const rawBotId =
    String(
      sock?.user?.id || ""
    );

  const myNumber =
    rawBotId
      .split(":")[0]
      .split("@")[0];

  if (!myNumber) {
    return false;
  }

  const myJid =
    `${myNumber}@s.whatsapp.net`;

  /*
   * Never kick this bot.
   */
  const targetNumber =
    String(botJid)
      .split(":")[0]
      .split("@")[0];

  if (
    targetNumber ===
    myNumber
  ) {
    return false;
  }

  const botParticipant =
    findParticipantByNumber(
      groupMeta.participants,
      myJid
    );

  /*
   * Bot must be admin.
   */
  if (
    !botParticipant?.admin
  ) {
    return false;
  }

  const targetParticipant =
    findParticipantByNumber(
      groupMeta.participants,
      botJid
    );

  /*
   * Never kick an admin.
   */
  if (
    targetParticipant?.admin
  ) {
    return false;
  }

  const targetJidToKick =
    targetParticipant
      ? getParticipantJid(
          targetParticipant
        )
      : botJid;

  try {
    /*
     * Delete suspicious message.
     */
    try {
      if (m.key) {
        await sock.sendMessage(
          m.chat,
          {
            delete: m.key,
          }
        );
      }
    } catch {
      try {
        await sock.sendMessage(
          m.chat,
          {
            delete: {
              remoteJid:
                m.chat,
              fromMe:
                false,
              id:
                m.key?.id ||
                m.id,
              participant:
                m.sender,
            },
          }
        );
      } catch {}
    }

    /*
     * Remove detected bot.
     */
    await sock.groupParticipantsUpdate(
      m.chat,
      [targetJidToKick],
      "remove"
    );

    /*
     * Notify group.
     */
    await sock.sendMessage(
      m.chat,
      {
        text: gpMsg(
          "antibot",
          {
            user:
              botJid.split(
                "@"
              )[0],
          }
        ),
        mentions: [
          botJid,
        ],
      }
    );

    return true;
  } catch (
    err
  ) {
    console.error(
      "[AntiBot] Failed:",
      err?.message ||
        err
    );

    return false;
  }
}

/* =========================================================
   EXPORT
   ========================================================= */

export {
  pluginConfig as config,
  handler,
  detectBot,
  isBotMessage,
};

/* =========================================================
   LEGACY / MODULE BRIDGE
   ========================================================= */

const __meta = {
  command: "antibot",
  aliases: [
    "botdetect",
  ],
  package: "group",
  description:
    "Deteksi dan kick bot WhatsApp (Baileys) dari grup",
  isOwner: false,
  isGroup: true,
  isAdmin: true,
  isBotAdmin: true,
};

/* =========================================================
   LEGACY RUNNER
   ========================================================= */

async function __runLegacy(
  message,
  args = ""
) {
  const sock =
    withLegacySocket(
      message.conn
    );

  /*
   * Always normalize arguments.
   */
  const argumentText =
    Array.isArray(args)
      ? args.join(" ")
      : String(args || "");

  const rawCommand =
    String(
      message.body || ""
    )
      .trim()
      .replace(
        /^[.!#/]/,
        ""
      )
      .split(/\s+/)[0]
      .toLowerCase();

  const lm =
    makeLegacyMessage(
      message,
      argumentText,
      rawCommand ||
        __meta.command
    );

  /*
   * Ensure args is an array.
   */
  if (
    !Array.isArray(
      lm.args
    )
  ) {
    lm.args =
      argumentText
        .trim()
        .split(/\s+/)
        .filter(Boolean);
  }

  /*
   * Load group info.
   */
  if (lm.isGroup) {
    try {
      await lm.loadGroupInfo();
    } catch (
      error
    ) {
      console.error(
        "[AntiBot] Group info error:",
        error?.message ||
          error
      );
    }
  }

  /*
   * Permission checks.
   */
  if (
    __meta.isOwner &&
    !lm.isOwner
  ) {
    return lm.reply(
      "❌ Owner only."
    );
  }

  if (
    __meta.isGroup &&
    !lm.isGroup
  ) {
    return lm.reply(
      "❌ This command can only be used in groups."
    );
  }

  if (
    __meta.isAdmin &&
    !lm.isAdmin &&
    !lm.isOwner
  ) {
    return lm.reply(
      "❌ Only group admins can use this command."
    );
  }

  if (
    __meta.isBotAdmin &&
    !lm.isBotAdmin
  ) {
    return lm.reply(
      "❌ Bot must be a group admin to use this command."
    );
  }

  return runLegacyContext(
    lm,
    () =>
      handler(
        lm,
        {
          sock,
          db:
            getLegacyDatabase(
              lm
            ),
          text:
            argumentText,
        }
      )
  );
}

/* =========================================================
   MODULE REGISTRATION
   ========================================================= */

Module(__meta)(
  async (
    message,
    args = ""
  ) =>
    __runLegacy(
      message,
      args
    )
);
