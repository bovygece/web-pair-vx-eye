import {
  getDatabase,
  makeLegacyMessage,
  runLegacyContext,
  withLegacySocket,
} from "../lib/miku-legacy.js";

import { Module } from "../lib/plugins.js";

/* -------------------------------------------------------------------------- */
/* CONFIG                                                                     */
/* -------------------------------------------------------------------------- */

const pluginConfig = {
  name: "antiphising",

  alias: [
    "antiphishing",
    "antiscamlink",
    "nophishing",
  ],

  category: "group",

  description:
    "Deteksi konten phishing di grup",

  usage:
    ".antiphising <on/off/metode> [kick/remove]",

  example:
    ".antiphising on",

  isOwner: false,
  isPremium: false,
  isGroup: true,
  isPrivate: false,
  isAdmin: true,
  isBotAdmin: true,

  cooldown: 3,
  energi: 0,
  isEnabled: true,
};

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

function getArgs(m) {
  if (Array.isArray(m?.args)) {
    return m.args
      .map((x) => String(x || "").trim())
      .filter(Boolean);
  }

  if (typeof m?.args === "string") {
    return m.args
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }

  return [];
}

function saveGroup(db, chat, groupData) {
  try {
    db.setGroup(chat, groupData);
  } catch (error) {
    console.error(
      "[AntiPhishing] setGroup error:",
      error?.message || error
    );
  }

  try {
    if (typeof db.save === "function") {
      db.save();
    }
  } catch (error) {
    console.error(
      "[AntiPhishing] save error:",
      error?.message || error
    );
  }
}

function getStatus(groupData) {
  return (
    groupData?.antiphising ||
    groupData?.antiphishing ||
    "off"
  );
}

function getMode(groupData) {
  return (
    groupData?.antiphisingMode ||
    groupData?.antiphishingMode ||
    "remove"
  );
}

function isEnabled(groupData) {
  const status = String(
    getStatus(groupData)
  ).toLowerCase();

  return (
    status === "on" ||
    status === "true" ||
    status === "1" ||
    groupData?.antiphising === true ||
    groupData?.antiphishing === true
  );
}

/* -------------------------------------------------------------------------- */
/* COMMAND HANDLER                                                            */
/* -------------------------------------------------------------------------- */

async function handler(m, { db }) {
  /*
   * Use the database passed by the current runtime.
   * If it is unavailable, use the main database.
   */
  const database =
    db || getDatabase();

  const args = getArgs(m);

  const option = String(
    args[0] || ""
  )
    .trim()
    .toLowerCase();

  const groupData =
    database.getGroup(m.chat) || {};

  const prefix =
    m.prefix || ".";

  /* ---------------------------------------------------------------------- */
  /* STATUS / HELP                                                          */
  /* ---------------------------------------------------------------------- */

  if (
    !option ||
    option === "status" ||
    option === "help"
  ) {
    const status =
      getStatus(groupData);

    const mode =
      getMode(groupData);

    return m.reply(
      "🎣 *ANTI PHISHING*\n\n" +
        `> Status: *${String(
          status
        ).toUpperCase()}*\n` +
        `> Mode: *${String(
          mode
        ).toUpperCase()}*\n\n` +
        "> Deteksi link phishing, login palsu, " +
        "verifikasi palsu, URL IP, punycode, " +
        "shortener mencurigakan dan pola scam.\n\n" +
        "*Pengaturan:*\n" +
        `> \`${prefix}antiphising on\`\n` +
        `> \`${prefix}antiphising off\`\n` +
        `> \`${prefix}antiphising kick\`\n` +
        `> \`${prefix}antiphising remove\`\n` +
        `> \`${prefix}antiphising metode kick\`\n` +
        `> \`${prefix}antiphising metode remove\``
    );
  }

  /* ---------------------------------------------------------------------- */
  /* ON                                                                     */
  /* ---------------------------------------------------------------------- */

  if (option === "on") {
    const currentMode =
      getMode(groupData);

    const mode =
      currentMode === "kick" ||
      currentMode === "remove"
        ? currentMode
        : "remove";

    const updated = {
      ...groupData,

      /*
       * Keep both spellings because other
       * parts of the bot may use either one.
       */
      antiphising: "on",
      antiphishing: "on",

      antiphisingMode: mode,
      antiphishingMode: mode,
    };

    saveGroup(
      database,
      m.chat,
      updated
    );

    try {
      m.react?.("✅");
    } catch {}

    return m.reply(
      "✅ *ANTI PHISHING DIAKTIFKAN*\n\n" +
        `> Status: *ON*\n` +
        `> Mode: *${mode.toUpperCase()}*\n\n` +
        "Link phishing yang terdeteksi akan " +
        (mode === "kick"
          ? "dihapus dan pengirimnya dikeluarkan dari grup."
          : "dihapus dari grup.")
    );
  }

  /* ---------------------------------------------------------------------- */
  /* OFF                                                                    */
  /* ---------------------------------------------------------------------- */

  if (option === "off") {
    const updated = {
      ...groupData,

      antiphising: "off",
      antiphishing: "off",

      /*
       * Keep the mode so it is restored
       * when AntiPhishing is enabled again.
       */
      antiphisingMode:
        getMode(groupData),

      antiphishingMode:
        getMode(groupData),
    };

    saveGroup(
      database,
      m.chat,
      updated
    );

    try {
      m.react?.("❌");
    } catch {}

    return m.reply(
      "❌ *ANTI PHISHING DINONAKTIFKAN*"
    );
  }

  /* ---------------------------------------------------------------------- */
  /* MODE / METODE                                                          */
  /* ---------------------------------------------------------------------- */

  if (
    option === "metode" ||
    option === "mode" ||
    option === "method"
  ) {
    const method =
      String(args[1] || "")
        .trim()
        .toLowerCase();

    if (
      method !== "kick" &&
      method !== "remove" &&
      method !== "delete"
    ) {
      return m.reply(
        "❌ *Metode tidak valid!*\n\n" +
          "Gunakan:\n" +
          `> \`${prefix}antiphising metode kick\`\n` +
          `> \`${prefix}antiphising metode remove\``
      );
    }

    const mode =
      method === "kick"
        ? "kick"
        : "remove";

    const updated = {
      ...groupData,

      /*
       * Selecting a mode also enables AntiPhishing.
       */
      antiphising: "on",
      antiphishing: "on",

      antiphisingMode: mode,
      antiphishingMode: mode,
    };

    saveGroup(
      database,
      m.chat,
      updated
    );

    try {
      m.react?.("✅");
    } catch {}

    return m.reply(
      "✅ *ANTI PHISHING MODE UPDATED*\n\n" +
        "> Status: *ON*\n" +
        `> Mode: *${mode.toUpperCase()}*`
    );
  }

  /* ---------------------------------------------------------------------- */
  /* DIRECT KICK                                                            */
  /* ---------------------------------------------------------------------- */

  if (option === "kick") {
    const updated = {
      ...groupData,

      antiphising: "on",
      antiphishing: "on",

      antiphisingMode: "kick",
      antiphishingMode: "kick",
    };

    saveGroup(
      database,
      m.chat,
      updated
    );

    try {
      m.react?.("✅");
    } catch {}

    return m.reply(
      "✅ *ANTI PHISHING MODE KICK AKTIF*\n\n" +
        "Link phishing yang terdeteksi akan " +
        "dihapus dan pengirimnya dikeluarkan dari grup."
    );
  }

  /* ---------------------------------------------------------------------- */
  /* DIRECT REMOVE / DELETE                                                 */
  /* ---------------------------------------------------------------------- */

  if (
    option === "remove" ||
    option === "delete"
  ) {
    const updated = {
      ...groupData,

      antiphising: "on",
      antiphishing: "on",

      antiphisingMode: "remove",
      antiphishingMode: "remove",
    };

    saveGroup(
      database,
      m.chat,
      updated
    );

    try {
      m.react?.("✅");
    } catch {}

    return m.reply(
      "✅ *ANTI PHISHING MODE REMOVE AKTIF*\n\n" +
        "Link phishing yang terdeteksi akan dihapus."
    );
  }

  /* ---------------------------------------------------------------------- */
  /* INVALID OPTION                                                         */
  /* ---------------------------------------------------------------------- */

  return m.reply(
    "❌ *Opsi tidak valid!*\n\n" +
      "Gunakan:\n" +
      `> \`${prefix}antiphising on\`\n` +
      `> \`${prefix}antiphising off\`\n` +
      `> \`${prefix}antiphising kick\`\n` +
      `> \`${prefix}antiphising remove\`\n` +
      `> \`${prefix}antiphising metode kick\`\n` +
      `> \`${prefix}antiphising metode remove\``
  );
}

/* -------------------------------------------------------------------------- */
/* EXPORT                                                                     */
/* -------------------------------------------------------------------------- */

export {
  pluginConfig as config,
  handler,
};

/* -------------------------------------------------------------------------- */
/* LEGACY / MODULE BRIDGE                                                     */
/* -------------------------------------------------------------------------- */

const __meta = {
  command: "antiphising",

  aliases: [
    "antiphishing",
    "antiscamlink",
    "nophishing",
  ],

  package: "group",

  description:
    "Deteksi konten phishing di grup",

  isOwner: false,
  isGroup: true,
  isAdmin: true,
  isBotAdmin: true,
};

/* -------------------------------------------------------------------------- */
/* LEGACY RUNNER                                                              */
/* -------------------------------------------------------------------------- */

async function __runLegacy(
  message,
  args = ""
) {
  const sock =
    withLegacySocket(
      message.conn
    );

  /*
   * Normalize arguments.
   */
  const argumentText =
    Array.isArray(args)
      ? args.join(" ")
      : String(args || "");

  /*
   * Correct command extraction.
   * Do NOT use replace(/^./), because that
   * removes the first character regardless
   * of whether it is actually a prefix.
   */
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
   * IMPORTANT:
   * Always make lm.args an array.
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
   * Load group information.
   */
  if (lm.isGroup) {
    try {
      await lm.loadGroupInfo();
    } catch (error) {
      console.error(
        "[AntiPhishing] loadGroupInfo error:",
        error?.message ||
          error
      );
    }
  }

  /* ---------------------------------------------------------------------- */
  /* PERMISSIONS                                                            */
  /* ---------------------------------------------------------------------- */

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

  /*
   * Run through legacy context.
   *
   * IMPORTANT:
   * Use the SAME database instance for
   * reading and writing group settings.
   */
  return runLegacyContext(
    lm,
    () =>
      handler(lm, {
        sock,

        db: getDatabase(),

        text:
          argumentText,
      })
  );
}

/* -------------------------------------------------------------------------- */
/* MODULE REGISTRATION                                                        */
/* -------------------------------------------------------------------------- */

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
