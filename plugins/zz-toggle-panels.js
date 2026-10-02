import fs from "fs";
import path from "path";
import { Module, commands } from "../lib/plugins.js";
import { db } from "../lib/client.js";
import config from "../config.js";
import { sendNativeButtons } from "../lib/native-buttons.js";
import { getDatabase } from "../lib/miku-legacy.js";
import { setAntiMedia, isAntiMediaOn } from "../lib/xaf-antimedia.js";
import { setAntiSticker, isAntiStickerOn } from "../lib/xaf-antisticker.js";
import {
  setAntiStatus,
  isAntiStatusOn,
  setAntiStatusKick,
  isAntiStatusKickOn,
} from "../lib/xaf-antistatus.js";

/*
 * ============================================================================
 * TOGGLE PANELS
 * ============================================================================
 *
 * Sirf command likho (jaise  .antilink  /  .welcome  /  .antimedia ) aur
 * ON/OFF ke BUTTONS aa jayenge.
 *
 *   - Jo setting OFF hai uska "ON karo" button aata hai -> dabao, ON ho jayega
 *   - Phir bot naya panel bhejta hai jisme "OFF karo" button aata hai -> dabao, OFF ho jayega
 *   - Jahan kai option hain wahan  "ALL ON" / "ALL OFF"  button bhi hai
 *
 * Purana text wala tarika ( .antilink on / .antilink off / .antilink kick ...)
 * pehle ki tarah hi kaam karta hai. Ye file sabse last me load hoti hai (zz-)
 * aur har command ko sirf tab pakadti hai jab uske saath kuch likha na ho.
 * ============================================================================
 */

const PREFIX = () => config.prefix || ".";

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

function botNumber(m, digitsOnly = false) {
  const id = m?.conn?.user?.id || m?.conn?.user?.jid || "";
  let n = String(id).split("@")[0].split(":")[0] || "bot";
  if (digitsOnly) n = n.replace(/\D/g, "") || "unknown";
  return n;
}

const toBool = (v) =>
  v === true || v === 1 || (typeof v === "string" && ["true", "1", "yes", "on"].includes(v.toLowerCase()));

function dbSet(bot, key, value) {
  if (typeof db.setHot === "function") return db.setHot(bot, key, value);
  return db.set(bot, key, value);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* antitagsw keeps its own json file */
const TAGSW_FILE = path.join(process.cwd(), "data", "antitagsw.json");
function tagswLoad() {
  try {
    return JSON.parse(fs.readFileSync(TAGSW_FILE, "utf8")) || {};
  } catch {
    return {};
  }
}
function tagswSave(obj) {
  fs.mkdirSync(path.dirname(TAGSW_FILE), { recursive: true });
  fs.writeFileSync(TAGSW_FILE, JSON.stringify(obj, null, 2));
}

/* legacy per-group db (antihidetag, antijudol, antiphising, ...) */
function legacyGroup(m) {
  try {
    return getDatabase(m).getGroup(m.chat || m.from) || {};
  } catch {
    return {};
  }
}

/* -------------------------------------------------------------------------- */
/* ITEM BUILDERS                                                              */
/* each item: { key, label, get(ctx)->bool, set(ctx, bool) }                  */
/* -------------------------------------------------------------------------- */

/* welcome / goodbye : db key group:<jid>:welcome  { status, dp, video } */
function cfgItem(kind, field, key, label) {
  return {
    key,
    label,
    get: async ({ m, jid }) => {
      const cfg = await db.getAsync(botNumber(m), `group:${jid}:${kind}`, null);
      return !!cfg && typeof cfg === "object" && toBool(cfg[field]);
    },
    set: async ({ m, jid }, value) => {
      const bot = botNumber(m);
      const k = `group:${jid}:${kind}`;
      const cur = await db.getAsync(bot, k, null);
      const base =
        cur && typeof cur === "object"
          ? cur
          : kind === "welcome"
            ? { status: false, dp: false, video: false }
            : { status: false };
      await db.set(bot, k, { ...base, [field]: value });
    },
  };
}

/* antilink : antilink:<jid>:enabled / :mode  (kick | null | warn) */
function antilinkItems() {
  const en = (jid) => `antilink:${jid}:enabled`;
  const mo = (jid) => `antilink:${jid}:mode`;
  const modeItem = (key, label, mode) => ({
    key,
    label,
    get: ({ m, jid }) =>
      db.get(botNumber(m), en(jid), false) === true &&
      String(db.get(botNumber(m), mo(jid), "kick") || "kick").toLowerCase() === mode,
    set: ({ m, jid }, v) => {
      const bot = botNumber(m);
      if (v) {
        dbSet(bot, mo(jid), mode);
        dbSet(bot, en(jid), true);
      } else {
        dbSet(bot, en(jid), false);
      }
    },
  });
  return [
    {
      key: "on",
      label: "AntiLink",
      get: ({ m, jid }) => db.get(botNumber(m), en(jid), false) === true,
      set: ({ m, jid }, v) => {
        const bot = botNumber(m);
        if (v) {
          const cur = String(db.get(bot, mo(jid), "") || "").toLowerCase();
          if (!["kick", "null", "warn"].includes(cur)) dbSet(bot, mo(jid), "kick");
        }
        dbSet(bot, en(jid), v);
      },
    },
    modeItem("kick", "Kick", "kick"),
    modeItem("delete", "Delete", "null"),
    modeItem("warn", "Warning", "warn"),
  ];
}

/* antilinkgc : antilinkgc:<jid>:enabled / :mode (delete | kick) */
function antilinkgcItems() {
  const en = (jid) => `antilinkgc:${jid}:enabled`;
  const mo = (jid) => `antilinkgc:${jid}:mode`;
  const modeItem = (key, label, mode) => ({
    key,
    label,
    get: ({ m, jid }) =>
      db.get(botNumber(m, true), en(jid), false) === true &&
      String(db.get(botNumber(m, true), mo(jid), "delete") || "delete").toLowerCase() === mode,
    set: ({ m, jid }, v) => {
      const bot = botNumber(m, true);
      if (v) {
        dbSet(bot, mo(jid), mode);
        dbSet(bot, en(jid), true);
      } else {
        dbSet(bot, en(jid), false);
      }
    },
  });
  return [
    {
      key: "on",
      label: "AntiLinkGC",
      get: ({ m, jid }) => db.get(botNumber(m, true), en(jid), false) === true,
      set: ({ m, jid }, v) => {
        const bot = botNumber(m, true);
        if (v) {
          const cur = String(db.get(bot, mo(jid), "") || "").toLowerCase();
          if (!["kick", "delete"].includes(cur)) dbSet(bot, mo(jid), "delete");
        }
        dbSet(bot, en(jid), v);
      },
    },
    modeItem("delete", "Delete", "delete"),
    modeItem("kick", "Kick", "kick"),
  ];
}

/* anti status / anti group status (shared storage) */
const antiStatusItems = () => [
  {
    key: "on",
    label: "Anti Status",
    get: ({ jid }) => isAntiStatusOn(jid) === true,
    set: ({ jid }, v) => setAntiStatus(jid, v),
  },
  {
    key: "kick",
    label: "Status Kick",
    get: ({ jid }) => isAntiStatusKickOn(jid) === true,
    set: ({ jid }, v) => setAntiStatusKick(jid, v),
  },
];

/* plugins that store a simple flag and already understand  "<cmd> on|off"  */
function viaOriginal(cmdName, label, read) {
  return {
    key: "on",
    label,
    get: ({ m }) => read(legacyGroup(m)),
    set: async ({ m }, v) => {
      const orig = ORIGINALS.get(cmdName);
      if (!orig) throw new Error(`original .${cmdName} not found`);
      await orig.exec(m, v ? "on" : "off");
    },
    viaOriginal: true,
  };
}

/* -------------------------------------------------------------------------- */
/* PANEL DEFINITIONS                                                          */
/* -------------------------------------------------------------------------- */

const PANELS = {
  welcome: {
    title: "WELCOME SETTINGS",
    icon: "👋",
    items: () => [
      cfgItem("welcome", "status", "on", "Welcome"),
      cfgItem("welcome", "dp", "dp", "Welcome DP"),
      cfgItem("welcome", "video", "video", "Welcome Video"),
    ],
  },
  goodbye: {
    title: "GOODBYE SETTINGS",
    icon: "🚪",
    items: () => [cfgItem("goodbye", "status", "on", "Goodbye")],
  },
  antilink: { title: "ANTI LINK", icon: "🔗", items: antilinkItems, needsBotAdmin: true },
  antilinkgc: { title: "ANTI LINK GC", icon: "🔗", items: antilinkgcItems, needsBotAdmin: true },
  antimedia: {
    title: "ANTI MEDIA",
    icon: "🖼️",
    items: () => [
      {
        key: "on",
        label: "Anti Media",
        get: ({ jid }) => isAntiMediaOn(jid) === true,
        set: ({ jid }, v) => setAntiMedia(jid, v),
      },
    ],
  },
  antisticker: {
    title: "ANTI STICKER",
    icon: "🧩",
    items: () => [
      {
        key: "on",
        label: "Anti Sticker",
        get: ({ jid }) => isAntiStickerOn(jid) === true,
        set: ({ jid }, v) => setAntiSticker(jid, v),
      },
    ],
  },
  antitagsw: {
    title: "ANTI TAG STATUS",
    icon: "🏷️",
    items: () => [
      {
        key: "on",
        label: "Anti Tag Status",
        get: ({ jid }) => tagswLoad()[jid] === true,
        set: ({ jid }, v) => {
          const d = tagswLoad();
          d[jid] = !!v;
          tagswSave(d);
        },
      },
    ],
  },
  antistatus: { title: "ANTI STATUS", icon: "📖", items: antiStatusItems, needsBotAdmin: true },
  antigroupstatus: { title: "ANTI GROUP STATUS", icon: "📖", items: antiStatusItems, needsBotAdmin: true },
  antihidetag: {
    title: "ANTI HIDETAG",
    icon: "🙈",
    items: () => [viaOriginal("antihidetag", "Anti Hidetag", (g) => g.antihidetag === "on")],
  },
  antijudol: {
    title: "ANTI JUDOL",
    icon: "🎰",
    items: () => [viaOriginal("antijudol", "Anti Judol", (g) => g.antijudol === "on")],
  },
  antiphising: {
    title: "ANTI PHISING",
    icon: "🎣",
    items: () => [viaOriginal("antiphising", "Anti Phising", (g) => g.antiphising === "on" || g.antiphishing === "on")],
  },
  antiremove: {
    title: "ANTI REMOVE",
    icon: "🗑️",
    items: () => [viaOriginal("antiremove", "Anti Remove", (g) => g.antiremove === "on")],
  },
  antibot: {
    title: "ANTI BOT",
    icon: "🤖",
    items: () => [viaOriginal("antibot", "Anti Bot", (g) => !!g.antibot)],
  },
  antitoxic: {
    title: "ANTI TOXIC",
    icon: "☣️",
    items: () => [viaOriginal("antitoxic", "Anti Toxic", (g) => !!g.antitoxic)],
  },
  antispam: {
    title: "ANTI SPAM",
    icon: "📨",
    items: () => [viaOriginal("antispam", "Anti Spam", (g) => !!g.antispam)],
  },
};

/* original plugins (captured before we replace them) */
const ORIGINALS = new Map();
for (const name of Object.keys(PANELS)) {
  const p = commands.get(name);
  if (p) ORIGINALS.set(name, p);
}

/* -------------------------------------------------------------------------- */
/* SEND PANEL                                                                 */
/* -------------------------------------------------------------------------- */

async function readStates(ctx, items) {
  const out = [];
  for (const it of items) {
    let on = false;
    try {
      on = !!(await it.get(ctx));
    } catch (e) {
      console.warn("[toggle-panels] read failed:", it.key, e?.message || e);
    }
    out.push(on);
  }
  return out;
}

async function sendPanel(m, cmdName, def, items, note = "") {
  const ctx = { m, jid: m.from };
  const states = await readStates(ctx, items);
  const p = PREFIX();

  const lines = items.map((it, i) => `┃ ${states[i] ? "✅ ON " : "❌ OFF"}  ${it.label}`);
  const text =
    (note ? `${note}\n\n` : "") +
    `╭━━〔 ${def.icon} *${def.title}* 〕━━╮\n` +
    lines.join("\n") +
    `\n╰━━━━━━━━━━━━━━━━━━━━╯\n\n` +
    `👇 "ON karo" button = ON ho jayega\n👇 "OFF karo" button = OFF ho jayega` +
    (def.needsBotAdmin ? `\n⚠️ Kaam karne ke liye bot ko group admin banayein.` : "");

  // Har setting ke liye wo button jo abhi kaam ka hai:
  //   abhi OFF hai -> "ON karo" button,   abhi ON hai -> "OFF karo" button
  const buttons = items.map((it, i) => ({
    name: "quick_reply",
    buttonParamsJson: JSON.stringify({
      display_text: states[i] ? `❌ OFF karo • ${it.label}` : `✅ ON karo • ${it.label}`,
      id: `${p}${cmdName} turn ${states[i] ? "off" : "on"} ${it.key}`,
    }),
  }));

  if (items.length > 1) {
    buttons.push({
      name: "quick_reply",
      buttonParamsJson: JSON.stringify({ display_text: "✅ ALL ON", id: `${p}${cmdName} all on` }),
    });
    buttons.push({
      name: "quick_reply",
      buttonParamsJson: JSON.stringify({ display_text: "❌ ALL OFF", id: `${p}${cmdName} all off` }),
    });
  }

  try {
    await sendNativeButtons(m.conn, m.from, {
      title: `${def.icon} ${def.title}`,
      text,
      footer: "⚙️ 𝗩𝗫 𝗠𝗗 𝗕𝗢𝗧",
      buttons,
    });
  } catch (e) {
    console.warn("[toggle-panels] buttons failed, sending text:", e?.message || e);
    const help = items
      .map((it) => `${p}${cmdName} ${it.key === "on" ? "on" : it.key + " on"}`)
      .join("\n");
    await m.send(`${text}\n\n*Text commands:*\n${help}\n${p}${cmdName} off`);
  }
}

/* -------------------------------------------------------------------------- */
/* REGISTER WRAPPERS                                                          */
/* -------------------------------------------------------------------------- */

async function isAllowed(m) {
  try {
    await m.loadGroupInfo?.();
  } catch {}
  return !!(m.isAdmin || m.isGroupAdmin || m.isFromMe || m.isfromMe || m.isOwner);
}

for (const [cmdName, def] of Object.entries(PANELS)) {
  const orig = ORIGINALS.get(cmdName);

  Module({
    command: cmdName,
    aliases: orig?.aliases,
    package: orig?.package || "group",
    description: orig?.description || `${def.title} — ON/OFF buttons`,
  })(async (m, args = "") => {
    const a = String(args || "").trim().toLowerCase();

    /* explicit old-style usage (.antilink on / kick / warn ...) -> original */
    const parts = a.split(/\s+/).filter(Boolean);
    const isPanelAction = parts.length === 0 || parts[0] === "toggle" || parts[0] === "turn" || parts[0] === "all";
    if (!isPanelAction) {
      if (orig) return orig.exec(m, args);
      return;
    }

    try {
      if (!m.isGroup) return m.send("❌ Ye command sirf group me chalta hai.");
      if (!(await isAllowed(m))) return m.send("❌ Sirf group admin ye setting badal sakta hai.");

      const items = def.items();
      const ctx = { m, jid: m.from };

      /* just the command -> show panel */
      if (parts.length === 0) return await sendPanel(m, cmdName, def, items);

      /* .cmd all on / .cmd all off */
      if (parts[0] === "all") {
        const value = parts[1] === "on";
        if (!["on", "off"].includes(parts[1])) return await sendPanel(m, cmdName, def, items);
        // AntiLink / AntiLinkGC: "ALL" = sirf main switch (mode jaisa tha waisa rahe)
        const targets = cmdName === "antilink" || cmdName === "antilinkgc" ? [items[0]] : items;
        for (const it of targets) await it.set(ctx, value);
        await sleep(400);
        return await sendPanel(m, cmdName, def, def.items(), value ? "✅ Sab ON ho gaya" : "❌ Sab OFF ho gaya");
      }

      /* .cmd turn on <key>  /  .cmd turn off <key>  (button se aata hai) */
      if (parts[0] === "turn") {
        const want = parts[1] === "on";
        if (!["on", "off"].includes(parts[1])) return await sendPanel(m, cmdName, def, items);
        const target = items.find((it) => it.key === parts[2]);
        if (!target) return await sendPanel(m, cmdName, def, items);
        await target.set(ctx, want);
        try {
          await m.react?.(want ? "✅" : "❌");
        } catch {}
        await sleep(400);
        return await sendPanel(
          m,
          cmdName,
          def,
          def.items(),
          `${want ? "✅" : "❌"} ${target.label} ${want ? "ON" : "OFF"} ho gaya`
        );
      }

      /* .cmd toggle <key> */
      const item = items.find((it) => it.key === parts[1]);
      if (!item) return await sendPanel(m, cmdName, def, items);

      const current = !!(await item.get(ctx));
      await item.set(ctx, !current);
      try {
        await m.react?.(!current ? "✅" : "❌");
      } catch {}
      await sleep(400);
      return await sendPanel(
        m,
        cmdName,
        def,
        def.items(),
        `${!current ? "✅" : "❌"} ${item.label} ${!current ? "ON" : "OFF"} ho gaya`
      );
    } catch (err) {
      console.error(`[toggle-panels] .${cmdName} error:`, err?.stack || err?.message || err);
      try {
        await m.send(`❌ Error: ${err?.message || err}`);
      } catch {}
    }
  });
}
