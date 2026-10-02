import { Module } from "../lib/plugins.js";
import { db } from "../lib/client.js";

/*
 * ============================================================
 * GROUP SAFETY PACK  (new)
 * ============================================================
 *  .safety                    - live protection dashboard
 *  .mute @user [10m|2h]       - bot deletes that member's messages
 *  .unmute @user   .mutelist
 *  .slowmode 10s | off        - non-admins can send 1 msg per N sec
 *  .lockdown [30m]            - only admins can chat (auto-open)
 *  .unlockdown
 *  .antiraid on|off           - 5+ joins in 60s => auto lockdown
 *  .antifake on|off|add 92|del 92|list
 *                             - remove new members by country code
 *  .blacklist add|remove|list - banned numbers are auto-removed
 *  .report [reason]           - anyone can alert the admins
 *
 * Admin commands need: sender = group admin, bot = group admin.
 * ============================================================
 */

/* ------------------------------ helpers ------------------------------ */

const RAID_JOINS = 5;
const RAID_WINDOW_MS = 60_000;
const RAID_LOCK_MS = 10 * 60_000;
const REPORT_COOLDOWN_MS = 60_000;

const joinLog = new Map(); // group -> [timestamps]
const lastMsg = new Map(); // group:user -> timestamp (slowmode)
const lockTimers = new Map(); // group -> timeout
const reportLog = new Map(); // group:user -> timestamp

const num = (jid = "") => String(jid).split("@")[0].split(":")[0].replace(/\D/g, "");
const baseJid = (jid = "") => {
  const [user, server] = String(jid).split("@");
  return `${user.split(":")[0]}@${server || "s.whatsapp.net"}`;
};

function botKey(conn) {
  return String(conn?.user?.id || conn?.user?.jid || "unknown").split("@")[0].split(":")[0];
}

function defaults() {
  return { mutes: {}, slow: 0, antiraid: false, antifake: { on: false, prefixes: [] }, blacklist: [], lockUntil: 0 };
}

function load(conn, group) {
  try {
    const raw = db.get(botKey(conn), `gsafe:${group}`, null);
    if (!raw) return defaults();
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return { ...defaults(), ...parsed, antifake: { ...defaults().antifake, ...(parsed.antifake || {}) } };
  } catch {
    return defaults();
  }
}

function save(conn, group, state) {
  try {
    const value = JSON.stringify(state);
    if (typeof db.setHot === "function") db.setHot(botKey(conn), `gsafe:${group}`, value);
    else db.set(botKey(conn), `gsafe:${group}`, value);
  } catch (e) {
    console.error("[groupsafety] save error:", e?.message || e);
  }
}

function isActive(s) {
  return (
    Object.keys(s.mutes).length > 0 || s.slow > 0 || s.lockUntil > 0 || s.antiraid || s.antifake.on || s.blacklist.length > 0
  );
}

function parseDuration(text = "") {
  const m = String(text).trim().toLowerCase().match(/^(\d+)\s*(s|sec|m|min|h|hr|d)?$/);
  if (!m) return 0;
  const n = Number(m[1]);
  const unit = m[2] || "m";
  if (unit.startsWith("s")) return n * 1000;
  if (unit.startsWith("h")) return n * 3_600_000;
  if (unit === "d") return n * 86_400_000;
  return n * 60_000;
}

function fmtDuration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} sec`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${(s / 3600).toFixed(s % 3600 ? 1 : 0)} hr`;
  return `${Math.round(s / 86400)} day`;
}

const box = (title, lines) =>
  `╭━━━〔 ${title} 〕━━━⬣\n${lines.map((l) => (l === "" ? "┃" : `┃ ${l}`)).join("\n")}\n╰━━━━━━━━━━━━━━━━━⬣`;

async function say(m, text, mentions = []) {
  try {
    return await m.conn.sendMessage(m.from, { text, mentions }, m.raw ? { quoted: m.raw } : {});
  } catch (e) {
    console.error("[groupsafety] send error:", e?.message || e);
  }
}

/* Returns true when the caller may continue. */
async function guard(m, { admin = true, botAdmin = true } = {}) {
  if (!m.isGroup) {
    await say(m, "❌ ये command सिर्फ group में चलती है।");
    return false;
  }
  await m.loadGroupInfo();
  if (admin && !m.isAdmin && !m.isFromMe && !m.isOwner) {
    await say(m, "❌ ये command सिर्फ *group admin* use कर सकते हैं।");
    return false;
  }
  if (botAdmin && !m.isBotAdmin) {
    await say(m, "⚠️ पहले bot को *group admin* बनाइए, फिर ये command चलेगी।");
    return false;
  }
  return true;
}

function targetOf(m, args = "") {
  const mention = m.mentions?.[0];
  if (mention) return baseJid(mention);
  const q = m.quoted?.participant || m.quoted?.sender;
  if (q) return baseJid(q);
  for (const word of String(args).split(/\s+/)) {
    const digits = word.replace(/\D/g, "");
    if (digits.length >= 7 && digits.length <= 15) return `${digits}@s.whatsapp.net`;
  }
  return null;
}

const tag = (jid) => `@${num(jid)}`;

async function isAdminJid(m, jid) {
  try {
    await m.loadGroupInfo();
    return (m.groupAdmins || []).some((a) => num(a) === num(jid));
  } catch {
    return false;
  }
}

async function setLock(conn, group, on) {
  await conn.groupSettingUpdate(group, on ? "announcement" : "not_announcement");
}

function scheduleUnlock(conn, group, ms) {
  clearTimeout(lockTimers.get(group));
  lockTimers.set(
    group,
    setTimeout(async () => {
      lockTimers.delete(group);
      await unlock(conn, group, "⏰ Lockdown का समय पूरा हुआ");
    }, ms)
  );
}

async function unlock(conn, group, reason) {
  const s = load(conn, group);
  s.lockUntil = 0;
  save(conn, group, s);
  clearTimeout(lockTimers.get(group));
  lockTimers.delete(group);
  try {
    await setLock(conn, group, false);
    await conn.sendMessage(group, {
      text: box("🔓 GROUP OPEN", [reason, "", "अब सभी members message कर सकते हैं ✅"]),
    });
  } catch (e) {
    console.error("[groupsafety] unlock error:", e?.message || e);
  }
}

/* ------------------------------ .safety ------------------------------ */

Module({
  command: "safety",
  aliases: ["gsafety", "safetymenu", "सुरक्षा"],
  package: "group",
  description: "Group protection dashboard",
})(async (m) => {
  if (!m.isGroup) return say(m, "❌ ये command सिर्फ group में चलती है।");
  const s = load(m.conn, m.from);
  const on = (v) => (v ? "🟢 ON" : "🔴 OFF");
  let antilink = false;
  try {
    antilink = db.get(botKey(m.conn), `antilink:${m.from}:enabled`, false) === true;
  } catch {}
  const lockLeft = s.lockUntil > Date.now() ? fmtDuration(s.lockUntil - Date.now()) : null;

  const text =
    box("🛡️ GROUP SAFETY", [
      `🔗 Anti-Link   : ${on(antilink)}`,
      `🚨 Anti-Raid   : ${on(s.antiraid)}`,
      `🌍 Anti-Fake   : ${on(s.antifake.on)}${s.antifake.prefixes.length ? ` (+${s.antifake.prefixes.join(", +")})` : ""}`,
      `🐢 Slowmode    : ${s.slow ? `🟢 ${s.slow}s` : "🔴 OFF"}`,
      `🔒 Lockdown    : ${lockLeft ? `🟢 ${lockLeft} बाकी` : "🔴 OFF"}`,
      `🔇 Muted       : ${Object.values(s.mutes).filter((t) => t > Date.now()).length} member`,
      `⛔ Blacklist   : ${s.blacklist.length} number`,
    ]) +
    "\n\n" +
    box("⚙️ COMMANDS (Admin)", [
      ".mute @user 30m   |  .unmute @user",
      ".slowmode 10s     |  .slowmode off",
      ".lockdown 30m     |  .unlockdown",
      ".antiraid on/off",
      ".antifake on/off/add 92/del 92",
      ".blacklist add/remove/list",
      "",
      "👥 सबके लिए: *.report* (message पर reply करके)",
    ]);
  return say(m, text);
});

/* ------------------------------ mute ------------------------------ */

Module({
  command: "mute",
  aliases: ["silence", "चुप"],
  package: "group",
  description: "Mute a member (bot deletes their messages)",
  isGroup: true,
  isAdmin: true,
})(async (m, args = "") => {
  if (!(await guard(m))) return;
  const target = targetOf(m, args);
  if (!target) return say(m, "❌ किसे mute करना है? Mention करें या उसके message पर reply करें।\nExample: `.mute @user 30m`");
  if (num(target) === num(m.conn.user?.id)) return say(m, "😅 मैं खुद को mute नहीं कर सकता।");
  if (await isAdminJid(m, target)) return say(m, "❌ Admin को mute नहीं किया जा सकता।");

  const durText = String(args).replace(/@\d+/g, "").trim().split(/\s+/).find((w) => parseDuration(w)) || "";
  const ms = parseDuration(durText) || 60 * 60_000; // default 1 hour
  const s = load(m.conn, m.from);
  s.mutes[target] = Date.now() + ms;
  save(m.conn, m.from, s);

  return say(
    m,
    box("🔇 MEMBER MUTED", [`👤 ${tag(target)}`, `⏱️ समय : ${fmtDuration(ms)}`, `👮 By : ${tag(m.sender)}`, "", "इस दौरान उसके messages delete होंगे।"]),
    [target, m.sender]
  );
});

Module({
  command: "unmute",
  aliases: ["unsilence"],
  package: "group",
  description: "Unmute a member",
  isGroup: true,
  isAdmin: true,
})(async (m, args = "") => {
  if (!(await guard(m, { botAdmin: false }))) return;
  const target = targetOf(m, args);
  if (!target) return say(m, "❌ Mention करें या reply करें।\nExample: `.unmute @user`");
  const s = load(m.conn, m.from);
  const key = Object.keys(s.mutes).find((k) => num(k) === num(target));
  if (!key) return say(m, "ℹ️ ये member mute नहीं है।");
  delete s.mutes[key];
  save(m.conn, m.from, s);
  return say(m, box("🔊 UNMUTED", [`👤 ${tag(target)}`, "अब ये फिर से message कर सकता है ✅"]), [target]);
});

Module({
  command: "mutelist",
  package: "group",
  description: "List muted members",
})(async (m) => {
  if (!m.isGroup) return say(m, "❌ ये command सिर्फ group में चलती है।");
  const s = load(m.conn, m.from);
  const now = Date.now();
  const rows = Object.entries(s.mutes).filter(([, t]) => t > now);
  if (!rows.length) return say(m, "✅ अभी कोई member mute नहीं है।");
  return say(
    m,
    box("🔇 MUTE LIST", rows.map(([j, t], i) => `${i + 1}. ${tag(j)} — ${fmtDuration(t - now)} बाकी`)),
    rows.map(([j]) => j)
  );
});

/* ------------------------------ slowmode ------------------------------ */

Module({
  command: "slowmode",
  aliases: ["slow"],
  package: "group",
  description: "Limit how often members can send messages",
  isGroup: true,
  isAdmin: true,
})(async (m, args = "") => {
  if (!(await guard(m))) return;
  const a = String(args).trim().toLowerCase();
  const s = load(m.conn, m.from);
  if (!a) return say(m, `🐢 Slowmode अभी: *${s.slow ? `${s.slow} sec` : "OFF"}*\n\nUse: \`.slowmode 10s\` / \`.slowmode off\``);
  if (["off", "0", "disable"].includes(a)) {
    s.slow = 0;
    save(m.conn, m.from, s);
    return say(m, "🐢 Slowmode *OFF* ✅");
  }
  const ms = parseDuration(a.match(/^\d+$/) ? `${a}s` : a);
  if (!ms || ms < 2000 || ms > 3_600_000) return say(m, "❌ 2 सेकंड से 1 घंटे के बीच समय दें।\nExample: `.slowmode 15s`");
  s.slow = Math.round(ms / 1000);
  save(m.conn, m.from, s);
  return say(m, box("🐢 SLOWMODE ON", [`हर member हर *${s.slow} sec* में सिर्फ 1 message भेज सकेगा।`, "Admins पर लागू नहीं।"]));
});

/* ------------------------------ lockdown ------------------------------ */

Module({
  command: "lockdown",
  aliases: ["lockgc", "panic"],
  package: "group",
  description: "Only admins can chat (optionally auto-open)",
  isGroup: true,
  isAdmin: true,
})(async (m, args = "") => {
  if (!(await guard(m))) return;
  const ms = parseDuration(String(args).trim());
  try {
    await setLock(m.conn, m.from, true);
  } catch {
    return say(m, "❌ Group lock नहीं हो पाया। Bot admin है या नहीं check करें।");
  }
  const s = load(m.conn, m.from);
  s.lockUntil = ms ? Date.now() + ms : Date.now() + 365 * 86_400_000;
  save(m.conn, m.from, s);
  if (ms) scheduleUnlock(m.conn, m.from, ms);
  return say(
    m,
    box("🔒 LOCKDOWN ON", [
      "अब सिर्फ *admins* message कर सकते हैं।",
      ms ? `⏱️ Auto-open : ${fmtDuration(ms)} बाद` : "खोलने के लिए: `.unlockdown`",
      `👮 By : ${tag(m.sender)}`,
    ]),
    [m.sender]
  );
});

Module({
  command: "unlockdown",
  aliases: ["unlockgc", "unpanic"],
  package: "group",
  description: "End lockdown",
  isGroup: true,
  isAdmin: true,
})(async (m) => {
  if (!(await guard(m))) return;
  await unlock(m.conn, m.from, `🔓 ${tag(m.sender)} ने lockdown खोला`);
});

/* ------------------------------ antiraid ------------------------------ */

Module({
  command: "antiraid",
  package: "group",
  description: "Auto-lock the group when many people join at once",
  isGroup: true,
  isAdmin: true,
})(async (m, args = "") => {
  if (!(await guard(m))) return;
  const a = String(args).trim().toLowerCase();
  const s = load(m.conn, m.from);
  if (a === "on" || a === "off") {
    s.antiraid = a === "on";
    save(m.conn, m.from, s);
    return say(
      m,
      box(`🚨 ANTI-RAID ${a.toUpperCase()}`, s.antiraid
        ? [`${RAID_WINDOW_MS / 1000} सेकंड में ${RAID_JOINS}+ लोग join करें तो`, `group ${RAID_LOCK_MS / 60000} मिनट के लिए auto-lock होगा।`]
        : ["Anti-raid बंद कर दिया गया।"])
    );
  }
  return say(m, `🚨 Anti-Raid अभी: *${s.antiraid ? "ON" : "OFF"}*\n\nUse: \`.antiraid on\` / \`.antiraid off\``);
});

/* ------------------------------ antifake ------------------------------ */

Module({
  command: "antifake",
  package: "group",
  description: "Auto-remove new members with blocked country codes",
  isGroup: true,
  isAdmin: true,
})(async (m, args = "") => {
  if (!(await guard(m))) return;
  const [cmd = "", val = ""] = String(args).trim().toLowerCase().split(/\s+/);
  const s = load(m.conn, m.from);

  if (cmd === "on" || cmd === "off") {
    s.antifake.on = cmd === "on";
    save(m.conn, m.from, s);
    return say(
      m,
      box(`🌍 ANTI-FAKE ${cmd.toUpperCase()}`, [
        s.antifake.prefixes.length ? `Blocked codes: +${s.antifake.prefixes.join(", +")}` : "अभी कोई code नहीं जुड़ा।",
        "Code जोड़ें: `.antifake add 92`",
      ])
    );
  }
  if (cmd === "add" || cmd === "del") {
    const code = val.replace(/\D/g, "");
    if (code.length < 1 || code.length > 4) return say(m, "❌ Country code लिखें।\nExample: `.antifake add 92`");
    if (code === "91" && cmd === "add") {
      /* allowed, but warn: many groups are Indian */
    }
    s.antifake.prefixes = cmd === "add" ? [...new Set([...s.antifake.prefixes, code])] : s.antifake.prefixes.filter((p) => p !== code);
    save(m.conn, m.from, s);
    return say(m, `✅ Blocked codes: ${s.antifake.prefixes.length ? "+" + s.antifake.prefixes.join(", +") : "कोई नहीं"}`);
  }
  if (cmd === "list") {
    return say(m, `🌍 Anti-Fake: *${s.antifake.on ? "ON" : "OFF"}*\nBlocked codes: ${s.antifake.prefixes.length ? "+" + s.antifake.prefixes.join(", +") : "कोई नहीं"}`);
  }
  return say(m, "Use:\n`.antifake on` / `.antifake off`\n`.antifake add 92` / `.antifake del 92`\n`.antifake list`");
});

/* ------------------------------ blacklist ------------------------------ */

Module({
  command: "blacklist",
  aliases: ["ban", "gban"],
  package: "group",
  description: "Auto-remove blacklisted numbers whenever they join",
  isGroup: true,
  isAdmin: true,
})(async (m, args = "") => {
  if (!(await guard(m))) return;
  const [cmd = "", ...rest] = String(args).trim().split(/\s+/);
  const s = load(m.conn, m.from);
  const sub = cmd.toLowerCase();

  if (sub === "list" || !sub) {
    return say(
      m,
      s.blacklist.length
        ? box("⛔ BLACKLIST", s.blacklist.map((n, i) => `${i + 1}. +${n}`))
        : "✅ Blacklist खाली है।\n\nUse: `.blacklist add @user` / `.blacklist add 919999999999`"
    );
  }

  if (sub === "add" || sub === "remove" || sub === "del") {
    const target = targetOf(m, rest.join(" "));
    if (!target) return say(m, "❌ Mention करें, reply करें या number लिखें।");
    const n = num(target);
    if (sub === "add") {
      if (await isAdminJid(m, target)) return say(m, "❌ Admin को blacklist नहीं कर सकते।");
      if (!s.blacklist.includes(n)) s.blacklist.push(n);
      save(m.conn, m.from, s);
      let removed = false;
      try {
        await m.conn.groupParticipantsUpdate(m.from, [target], "remove");
        removed = true;
      } catch {}
      return say(
        m,
        box("⛔ BLACKLISTED", [`👤 ${tag(target)}`, removed ? "Group से remove कर दिया ✅" : "Join करते ही remove होगा।"]),
        [target]
      );
    }
    s.blacklist = s.blacklist.filter((x) => x !== n);
    save(m.conn, m.from, s);
    return say(m, `✅ +${n} blacklist से हटा दिया।`);
  }
  return say(m, "Use:\n`.blacklist add @user`\n`.blacklist remove @user`\n`.blacklist list`");
});

/* ------------------------------ report ------------------------------ */

Module({
  command: "report",
  aliases: ["reportadmin", "alertadmin"],
  package: "group",
  description: "Alert the group admins about a problem",
})(async (m, args = "") => {
  if (!m.isGroup) return say(m, "❌ ये command सिर्फ group में चलती है।");
  const key = `${m.from}:${m.sender}`;
  const last = reportLog.get(key) || 0;
  if (Date.now() - last < REPORT_COOLDOWN_MS) return say(m, "⏳ थोड़ा रुकिए, आपकी report अभी-अभी गई है।");
  reportLog.set(key, Date.now());

  await m.loadGroupInfo();
  const admins = [...new Set((m.groupAdmins || []).map(baseJid))];
  const culprit = m.quoted?.participant || m.quoted?.sender;
  const reason = String(args).trim() || "कोई reason नहीं दिया";

  const lines = [
    `📣 Reporter : ${tag(m.sender)}`,
    culprit ? `🎯 Against  : ${tag(culprit)}` : "🎯 Against  : —",
    `📝 Reason   : ${reason}`,
    "",
    "👮 Admins:",
    ...admins.map((a) => `   ${tag(a)}`),
  ];
  await say(m, box("🚨 REPORT TO ADMINS", lines), [...admins, m.sender, ...(culprit ? [baseJid(culprit)] : [])]);
  try {
    await m.react("✅");
  } catch {}
});

/* ------------------------------ ENFORCEMENT: messages ------------------------------ */

Module({
  on: "message",
  name: "group-safety-enforcer",
  package: "group",
  description: "Enforces mute, slowmode and lockdown expiry",
})(async (m) => {
  try {
    if (!m?.isGroup || m.isFromMe) return;
    const s = load(m.conn, m.from);
    if (!isActive(s)) return;

    const now = Date.now();

    /* lockdown expired while the bot was offline */
    if (s.lockUntil && s.lockUntil <= now && !lockTimers.has(m.from)) {
      await unlock(m.conn, m.from, "⏰ Lockdown का समय पूरा हुआ");
      return;
    }
    if (s.lockUntil > now && !lockTimers.has(m.from) && s.lockUntil - now < 30 * 86_400_000) {
      scheduleUnlock(m.conn, m.from, s.lockUntil - now); // re-arm timer after a restart
    }

    const mutedKey = Object.keys(s.mutes).find((k) => num(k) === num(m.sender));
    const muted = mutedKey && s.mutes[mutedKey] > now;
    const slow = s.slow > 0;
    if (!muted && !slow) {
      /* clean expired mutes now and then */
      const expired = Object.keys(s.mutes).filter((k) => s.mutes[k] <= now);
      if (expired.length) {
        expired.forEach((k) => delete s.mutes[k]);
        save(m.conn, m.from, s);
      }
      return;
    }

    /* never touch admins */
    await m.loadGroupInfo();
    if (m.isAdmin || m.isOwner) return;
    if (!m.isBotAdmin) return;

    if (muted) {
      await m.conn.sendMessage(m.from, { delete: m.key }).catch(() => {});
      return;
    }

    if (slow) {
      const k = `${m.from}:${num(m.sender)}`;
      const last = lastMsg.get(k) || 0;
      if (now - last < s.slow * 1000) {
        await m.conn.sendMessage(m.from, { delete: m.key }).catch(() => {});
        return;
      }
      lastMsg.set(k, now);
    }
  } catch (e) {
    console.error("[groupsafety] enforcer error:", e?.message || e);
  }
});

/* ------------------------------ ENFORCEMENT: joins ------------------------------ */

Module({
  on: "group-participants.update",
  name: "group-safety-joins",
  package: "group",
  description: "Blacklist, anti-fake and anti-raid on member join",
})(async (_m, event, sock) => {
  try {
    if (event?.action !== "add") return;
    const group = event.id;
    const conn = sock;
    if (!group || !conn) return;

    const s = load(conn, group);
    if (!s.antiraid && !s.antifake.on && !s.blacklist.length) return;

    const md = event.groupMetadata || {};
    const parts = Array.isArray(md.participants) ? md.participants : [];
    const meNum = num(conn.user?.id);
    const iAmAdmin = parts.some(
      (p) => (p.admin === "admin" || p.admin === "superadmin" || p.isAdmin) && [p.id, p.jid, p.phoneNumber, p.lid].filter(Boolean).some((x) => num(x) === meNum)
    );

    const removeList = [];
    for (const jid of event.participants || []) {
      const entry = parts.find((p) => [p.id, p.jid, p.lid].filter(Boolean).some((x) => baseJid(x) === baseJid(jid)));
      const phone = num(entry?.phoneNumber || entry?.jid || (String(jid).includes("@s.whatsapp.net") ? jid : "")) || "";
      const ids = [num(jid), phone].filter(Boolean);

      if (s.blacklist.some((b) => ids.includes(b))) {
        removeList.push({ jid, why: "⛔ Blacklisted" });
        continue;
      }
      if (s.antifake.on && phone && s.antifake.prefixes.some((p) => phone.startsWith(p))) {
        removeList.push({ jid, why: `🌍 Blocked country code (+${s.antifake.prefixes.find((p) => phone.startsWith(p))})` });
      }
    }

    if (removeList.length && iAmAdmin) {
      for (const { jid, why } of removeList) {
        await conn.groupParticipantsUpdate(group, [jid], "remove").catch(() => {});
        await conn
          .sendMessage(group, { text: box("🛡️ AUTO REMOVED", [`👤 @${num(jid)}`, why]), mentions: [jid] })
          .catch(() => {});
      }
    }

    /* anti-raid */
    if (s.antiraid && iAmAdmin) {
      const now = Date.now();
      const list = (joinLog.get(group) || []).filter((t) => now - t < RAID_WINDOW_MS);
      for (let i = 0; i < (event.participants || []).length; i++) list.push(now);
      joinLog.set(group, list);

      if (list.length >= RAID_JOINS && !(s.lockUntil > now)) {
        joinLog.delete(group);
        await setLock(conn, group, true).catch(() => {});
        const fresh = load(conn, group);
        fresh.lockUntil = now + RAID_LOCK_MS;
        save(conn, group, fresh);
        scheduleUnlock(conn, group, RAID_LOCK_MS);
        await conn
          .sendMessage(group, {
            text: box("🚨 RAID DETECTED", [
              `${RAID_WINDOW_MS / 1000} सेकंड में ${list.length} लोग join हुए।`,
              `Group ${RAID_LOCK_MS / 60000} मिनट के लिए 🔒 lock कर दिया गया।`,
              "Admins: `.unlockdown` से खोल सकते हैं।",
            ]),
          })
          .catch(() => {});
      }
    }
  } catch (e) {
    console.error("[groupsafety] join handler error:", e?.message || e);
  }
});
