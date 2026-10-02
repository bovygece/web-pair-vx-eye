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
  name: "antispam",

  alias: [
    "antispamgc",
  ],

  category: "group",

  description:
    "Mengatur perlindungan grup dari pesan spam",

  usage:
    ".antispam <on/off/status/warning/kick/delete/delay>",

  example:
    ".antispam on\n.antispam warning\n.antispam kick\n.antispam 2",

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

/* -------------------------------------------------------------------------- */
/* SPAM TRACKER                                                               */
/* -------------------------------------------------------------------------- */

const spamTracker = new Map();

/*
 * How many fast messages are required
 * before the user is considered a spammer.
 */
const SPAM_THRESHOLD = 5;

/*
 * Automatically remove inactive tracker entries.
 */
const TRACKER_TIMEOUT = 60 * 1000;

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

function getArgs(m) {
  if (Array.isArray(m?.args)) {
    return m.args
      .map((x) =>
        String(x || "").trim()
      )
      .filter(Boolean);
  }

  if (
    typeof m?.args === "string"
  ) {
    return m.args
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }

  return [];
}

/* -------------------------------------------------------------------------- */
/* DATABASE                                                                   */
/* -------------------------------------------------------------------------- */

function saveGroup(
  db,
  chat,
  groupData
) {
  try {
    db.setGroup(
      chat,
      groupData
    );
  } catch (error) {
    console.error(
      "[AntiSpam] setGroup error:",
      error?.message ||
        error
    );
  }

  try {
    if (
      typeof db.save ===
      "function"
    ) {
      db.save();
    }
  } catch (error) {
    console.error(
      "[AntiSpam] save error:",
      error?.message ||
        error
    );
  }
}

/* -------------------------------------------------------------------------- */
/* TRACKER                                                                    */
/* -------------------------------------------------------------------------- */

function getTracker(
  chat,
  sender
) {
  /*
   * IMPORTANT:
   * Use template literal.
   *
   * Old code used:
   * "${chat}_${sender}"
   *
   * which created the SAME literal key
   * for every user.
   */
  const key =
    `${chat}_${sender}`;

  let data =
    spamTracker.get(key);

  if (!data) {
    data = {
      count: 0,
      lastMessage: 0,
      warnings: 0,
    };

    spamTracker.set(
      key,
      data
    );
  }

  return {
    key,
    data,
  };
}

function clearTracker(
  chat,
  sender
) {
  const key =
    `${chat}_${sender}`;

  spamTracker.delete(
    key
  );
}

/* -------------------------------------------------------------------------- */
/* COMMAND HANDLER                                                            */
/* -------------------------------------------------------------------------- */

async function handler(
  m,
  { db }
) {
  const database =
    db || getDatabase();

  const args =
    getArgs(m);

  const action =
    String(
      args[0] || ""
    )
      .trim()
      .toLowerCase();

  const groupData =
    database.getGroup(
      m.chat
    ) || {};

  const prefix =
    m.prefix || ".";

  /* ---------------------------------------------------------------------- */
  /* STATUS                                                                  */
  /* ---------------------------------------------------------------------- */

  if (
    !action ||
    action === "status" ||
    action === "help"
  ) {
    const enabled =
      Boolean(
        groupData.antispam
      );

    const delay =
      Number(
        groupData.antispamDelay
      ) || 2000;

    const punishment =
      groupData.antispamAction ||
      "warning";

    return m.reply(
      "🛡️ *ANTI SPAM GROUP*\n\n" +
        `> Status: *${
          enabled
            ? "AKTIF ✅"
            : "NONAKTIF ❌"
        }*\n` +
        `> Hukuman: *${String(
          punishment
        ).toUpperCase()}*\n` +
        `> Delay: *${delay} ms* (${(
          delay / 1000
        ).toFixed(1)} detik)\n` +
        `> Threshold: *${SPAM_THRESHOLD} pesan cepat*\n\n` +
        "*Pengaturan:*\n" +
        `> \`${prefix}antispam on\`\n` +
        `> \`${prefix}antispam off\`\n` +
        `> \`${prefix}antispam warning\`\n` +
        `> \`${prefix}antispam kick\`\n` +
        `> \`${prefix}antispam delete\`\n` +
        `> \`${prefix}antispam 2\`\n` +
        `> \`${prefix}antispam 1500ms\``
    );
  }

  /* ---------------------------------------------------------------------- */
  /* DELAY                                                                    */
  /* ---------------------------------------------------------------------- */

  /*
   * Supported:
   *
   * .antispam 2
   * .antispam 2s
   * .antispam 1500ms
   */
  const delayMatch =
    action.match(
      /^(\d+)(s|ms)?$/
    );

  if (delayMatch) {
    let delayMs =
      Number.parseInt(
        delayMatch[1],
        10
      );

    const unit =
      delayMatch[2];

    /*
     * 1-10 without unit = seconds.
     */
    if (
      unit === "s"
    ) {
      delayMs *= 1000;
    } else if (
      !unit &&
      delayMs >= 1 &&
      delayMs <= 10
    ) {
      delayMs *= 1000;
    }

    /*
     * Safety limits.
     */
    delayMs =
      Math.max(
        500,
        delayMs
      );

    delayMs =
      Math.min(
        10000,
        delayMs
      );

    groupData.antispamDelay =
      delayMs;

    /*
     * If user sets delay,
     * automatically enable AntiSpam.
     */
    groupData.antispam =
      true;

    if (
      !groupData.antispamAction
    ) {
      groupData.antispamAction =
        "warning";
    }

    saveGroup(
      database,
      m.chat,
      groupData
    );

    try {
      m.react?.("✅");
    } catch {}

    return m.reply(
      "🛡️ *ANTI SPAM DELAY UPDATED*\n\n" +
        "> Status: *AKTIF ✅*\n" +
        `> Delay: *${delayMs} ms*\n` +
        `> Waktu: *${(
          delayMs / 1000
        ).toFixed(1)} detik*\n` +
        `> Threshold: *${SPAM_THRESHOLD} pesan cepat*`
    );
  }

  /* ---------------------------------------------------------------------- */
  /* ON                                                                       */
  /* ---------------------------------------------------------------------- */

  if (
    action === "on"
  ) {
    const wasEnabled =
      Boolean(
        groupData.antispam
      );

    groupData.antispam =
      true;

    if (
      !groupData.antispamDelay
    ) {
      groupData.antispamDelay =
        2000;
    }

    if (
      !groupData.antispamAction
    ) {
      groupData.antispamAction =
        "warning";
    }

    saveGroup(
      database,
      m.chat,
      groupData
    );

    /*
     * Clear old spam counters
     * when protection is enabled.
     */
    for (
      const key of spamTracker.keys()
    ) {
      if (
        key.startsWith(
          `${m.chat}_`
        )
      ) {
        spamTracker.delete(
          key
        );
      }
    }

    try {
      m.react?.("✅");
    } catch {}

    return m.reply(
      "🛡️ *ANTI SPAM AKTIF ✅*\n\n" +
        `> Status: *ON*\n` +
        `> Hukuman: *${String(
          groupData.antispamAction
        ).toUpperCase()}*\n` +
        `> Delay: *${groupData.antispamDelay} ms*\n` +
        `> Threshold: *${SPAM_THRESHOLD} pesan cepat*\n\n` +
        "Sekarang pesan yang dikirim terlalu cepat " +
        "akan dihitung sebagai spam."
    );
  }

  /* ---------------------------------------------------------------------- */
  /* OFF                                                                      */
  /* ---------------------------------------------------------------------- */

  if (
    action === "off"
  ) {
    groupData.antispam =
      false;

    saveGroup(
      database,
      m.chat,
      groupData
    );

    /*
     * Clear all trackers for this group.
     */
    for (
      const key of spamTracker.keys()
    ) {
      if (
        key.startsWith(
          `${m.chat}_`
        )
      ) {
        spamTracker.delete(
          key
        );
      }
    }

    try {
      m.react?.("❌");
    } catch {}

    return m.reply(
      "🛡️ *ANTI SPAM DINONAKTIFKAN ❌*\n\n" +
        "> Status: *OFF*"
    );
  }

  /* ---------------------------------------------------------------------- */
  /* WARNING                                                                 */
  /* ---------------------------------------------------------------------- */

  if (
    action === "warning"
  ) {
    groupData.antispam =
      true;

    groupData.antispamAction =
      "warning";

    if (
      !groupData.antispamDelay
    ) {
      groupData.antispamDelay =
        2000;
    }

    saveGroup(
      database,
      m.chat,
      groupData
    );

    try {
      m.react?.("✅");
    } catch {}

    return m.reply(
      "🛡️ *ANTI SPAM WARNING AKTIF ✅*\n\n" +
        "> Status: *ON*\n" +
        "> Hukuman: *WARNING*\n" +
        `> Delay: *${groupData.antispamDelay} ms*\n\n` +
        "Spam pertama akan mendapatkan peringatan."
    );
  }

  /* ---------------------------------------------------------------------- */
  /* KICK                                                                     */
  /* ---------------------------------------------------------------------- */

  if (
    action === "kick"
  ) {
    groupData.antispam =
      true;

    groupData.antispamAction =
      "kick";

    if (
      !groupData.antispamDelay
    ) {
      groupData.antispamDelay =
        2000;
    }

    saveGroup(
      database,
      m.chat,
      groupData
    );

    try {
      m.react?.("✅");
    } catch {}

    return m.reply(
      "🛡️ *ANTI SPAM KICK AKTIF ✅*\n\n" +
        "> Status: *ON*\n" +
        "> Hukuman: *KICK*\n" +
        `> Delay: *${groupData.antispamDelay} ms*\n\n` +
        "Member yang terdeteksi spam akan " +
        "dikeluarkan dari grup."
    );
  }

  /* ---------------------------------------------------------------------- */
  /* DELETE                                                                   */
  /* ---------------------------------------------------------------------- */

  if (
    action === "delete"
  ) {
    groupData.antispam =
      true;

    groupData.antispamAction =
      "delete";

    if (
      !groupData.antispamDelay
    ) {
      groupData.antispamDelay =
        2000;
    }

    saveGroup(
      database,
      m.chat,
      groupData
    );

    try {
      m.react?.("✅");
    } catch {}

    return m.reply(
      "🛡️ *ANTI SPAM DELETE AKTIF ✅*\n\n" +
        "> Status: *ON*\n" +
        "> Hukuman: *DELETE*\n" +
        `> Delay: *${groupData.antispamDelay} ms*\n\n` +
        "Pesan spam akan dihapus."
    );
  }

  /* ---------------------------------------------------------------------- */
  /* INVALID                                                                  */
  /* ---------------------------------------------------------------------- */

  return m.reply(
    "❌ *Opsi tidak valid!*\n\n" +
      "Gunakan:\n" +
      `> \`${prefix}antispam on\`\n` +
      `> \`${prefix}antispam off\`\n` +
      `> \`${prefix}antispam status\`\n` +
      `> \`${prefix}antispam warning\`\n` +
      `> \`${prefix}antispam kick\`\n` +
      `> \`${prefix}antispam delete\`\n` +
      `> \`${prefix}antispam 2\``
  );
}

/* -------------------------------------------------------------------------- */
/* CHECK SPAM                                                                 */
/* -------------------------------------------------------------------------- */

async function checkSpam(
  m,
  sock,
  db
) {
  if (!m?.isGroup) {
    return false;
  }

  /*
   * Never process:
   * - bot's own messages
   * - owners
   * - group admins
   */
  if (
    m.fromMe ||
    m.isOwner ||
    m.isAdmin
  ) {
    return false;
  }

  const database =
    db || getDatabase();

  const groupData =
    database.getGroup(
      m.chat
    );

  /*
   * AntiSpam must be ON.
   */
  if (
    !groupData?.antispam
  ) {
    return false;
  }

  const senderId =
    m.sender;

  if (!senderId) {
    return false;
  }

  const now =
    Date.now();

  const delayThreshold =
    Number(
      groupData.antispamDelay
    ) || 2000;

  const tracker =
    getTracker(
      m.chat,
      senderId
    );

  const userData =
    tracker.data;

  const elapsed =
    userData.lastMessage
      ? now -
        userData.lastMessage
      : Infinity;

  /*
   * First message.
   */
  if (
    !userData.lastMessage
  ) {
    userData.count =
      1;
  }

  /*
   * Message arrived inside
   * configured delay.
   */
  else if (
    elapsed <
    delayThreshold
  ) {
    userData.count +=
      1;
  }

  /*
   * User waited long enough.
   */
  else {
    userData.count =
      1;
  }

  userData.lastMessage =
    now;

  spamTracker.set(
    tracker.key,
    userData
  );

  /*
   * Five rapid messages =
   * spam.
   */
  if (
    userData.count >=
    SPAM_THRESHOLD
  ) {
    return true;
  }

  return false;
}

/* -------------------------------------------------------------------------- */
/* HANDLE SPAM ACTION                                                        */
/* -------------------------------------------------------------------------- */

async function handleSpamAction(
  m,
  sock,
  db
) {
  if (
    !m?.isGroup ||
    !m.sender
  ) {
    return false;
  }

  const database =
    db || getDatabase();

  const groupData =
    database.getGroup(
      m.chat
    ) || {};

  if (
    !groupData.antispam
  ) {
    return false;
  }

  const action =
    groupData.antispamAction ||
    "warning";

  const senderId =
    m.sender;

  const tracker =
    getTracker(
      m.chat,
      senderId
    );

  const userData =
    tracker.data;

  /* ---------------------------------------------------------------------- */
  /* WARNING                                                                 */
  /* ---------------------------------------------------------------------- */

  if (
    action === "warning"
  ) {
    userData.warnings +=
      1;

    userData.count =
      0;

    /*
     * First and second warning.
     */
    if (
      userData.warnings <
      3
    ) {
      try {
        await m.reply(
          "⚠️ *ANTI SPAM TERDETEKSI*\n\n" +
            `> @${senderId.split("@")[0]}\n` +
            `> Peringatan: *${userData.warnings}/3*\n\n` +
            "Mohon jangan mengirim pesan " +
            "berulang-ulang terlalu cepat di grup.",
          {
            mentions: [
              senderId,
            ],
          }
        );
      } catch (
        error
      ) {
        console.error(
          "[AntiSpam] Warning error:",
          error?.message ||
            error
        );
      }
    }

    /*
     * Third warning.
     */
    else {
      try {
        await m.reply(
          "⚠️ *ANTI SPAM — 3 WARNINGS*\n\n" +
            `> @${senderId.split("@")[0]}\n\n` +
            "Anda telah menerima 3 peringatan " +
            "karena mengirim pesan terlalu cepat.\n" +
            "Silakan hentikan spam agar tidak " +
            "dikenakan tindakan berikutnya.",
          {
            mentions: [
              senderId,
            ],
          }
        );
      } catch (
        error
      ) {
        console.error(
          "[AntiSpam] Warning error:",
          error?.message ||
            error
        );
      }

      /*
       * Reset warning counter after 3.
       */
      userData.warnings =
        0;
    }

    spamTracker.set(
      tracker.key,
      userData
    );

    return true;
  }

  /* ---------------------------------------------------------------------- */
  /* KICK                                                                     */
  /* ---------------------------------------------------------------------- */

  if (
    action === "kick"
  ) {
    /*
     * Bot must be admin.
     */
    if (
      !m.isBotAdmin
    ) {
      try {
        await m.reply(
          "⚠️ *ANTI SPAM TERDETEKSI*\n\n" +
            `@${senderId.split("@")[0]} terdeteksi melakukan spam.\n\n` +
            "Bot tidak dapat mengeluarkan member " +
            "karena bot bukan admin grup.",
          {
            mentions: [
              senderId,
            ],
          }
        );
      } catch {}

      userData.count =
        0;

      spamTracker.set(
        tracker.key,
        userData
      );

      return false;
    }

    /*
     * Delete spam message first.
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
                senderId,
            },
          }
        );
      } catch {}
    }

    /*
     * Kick sender.
     */
    try {
      await sock.groupParticipantsUpdate(
        m.chat,
        [senderId],
        "remove"
      );

      try {
        await m.reply(
          "🛑 *SPAMMER DIKELUARKAN*\n\n" +
            `@${senderId.split("@")[0]} ` +
            "dikeluarkan karena terdeteksi melakukan spam.",
          {
            mentions: [
              senderId,
            ],
          }
        );
      } catch {}
    } catch (
      error
    ) {
      console.error(
        "[AntiSpam] Kick failed:",
        error?.message ||
          error
      );

      try {
        await m.reply(
          "⚠️ *ANTI SPAM*\n\n" +
            `@${senderId.split("@")[0]} terdeteksi melakukan spam, ` +
            "tetapi bot gagal mengeluarkannya.",
          {
            mentions: [
              senderId,
            ],
          }
        );
      } catch {}
    }

    clearTracker(
      m.chat,
      senderId
    );

    return true;
  }

  /* ---------------------------------------------------------------------- */
  /* DELETE                                                                   */
  /* ---------------------------------------------------------------------- */

  if (
    action === "delete"
  ) {
    /*
     * Delete spam message.
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
      /*
       * Fallback delete format.
       */
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
                senderId,
            },
          }
        );
      } catch (
        error
      ) {
        console.error(
          "[AntiSpam] Delete failed:",
          error?.message ||
            error
        );
      }
    }

    userData.count =
      0;

    spamTracker.set(
      tracker.key,
      userData
    );

    return true;
  }

  /*
   * Unknown action fallback.
   */
  userData.count =
    0;

  spamTracker.set(
    tracker.key,
    userData
  );

  return false;
}

/* -------------------------------------------------------------------------- */
/* COMBINED SPAM PROCESSOR                                                    */
/* -------------------------------------------------------------------------- */

/*
 * This function can be called by the bot's
 * message/event handler.
 *
 * It performs:
 *
 * message -> detect -> action
 */
async function processSpam(
  m,
  sock,
  db
) {
  const spam =
    await checkSpam(
      m,
      sock,
      db
    );

  if (!spam) {
    return false;
  }

  return handleSpamAction(
    m,
    sock,
    db
  );
}

/* -------------------------------------------------------------------------- */
/* CLEAN OLD TRACKER ENTRIES                                                  */
/* -------------------------------------------------------------------------- */

const cleanupTimer =
  setInterval(() => {
    const now =
      Date.now();

    for (
      const [
        key,
        data,
      ] of spamTracker.entries()
    ) {
      if (
        !data.lastMessage ||
        now -
          data.lastMessage >
          TRACKER_TIMEOUT
      ) {
        spamTracker.delete(
          key
        );
      }
    }
  }, 60000);

/*
 * Do not keep Node.js process alive
 * only because of cleanup timer.
 */
try {
  cleanupTimer.unref?.();
} catch {}

/* -------------------------------------------------------------------------- */
/* EXPORT                                                                     */
/* -------------------------------------------------------------------------- */

export {
  pluginConfig as config,
  handler,
  checkSpam,
  handleSpamAction,
  processSpam,
};

/* -------------------------------------------------------------------------- */
/* LEGACY / MODULE BRIDGE                                                     */
/* -------------------------------------------------------------------------- */

const __meta = {
  command: "antispam",

  aliases: [
    "antispamgc",
  ],

  package: "group",

  description:
    "Mengatur perlindungan grup dari pesan spam",

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
   * Correctly remove only a real
   * command prefix.
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
   * Always normalize lm.args.
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
    } catch (
      error
    ) {
      console.error(
        "[AntiSpam] loadGroupInfo error:",
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
   * Run command handler.
   */
  return runLegacyContext(
    lm,
    () =>
      handler(
        lm,
        {
          sock,

          /*
           * Use the same database
           * throughout this operation.
           */
          db: getDatabase(),

          text:
            argumentText,
        }
      )
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
