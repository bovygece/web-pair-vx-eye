import { getDatabase } from "../lib/miku-legacy.js";
import { saluranCtx } from "../lib/miku-legacy.js";
import config from "../config.js";

const pluginConfig = {
  name: "anticall",
  alias: ["antiকল", "antitelp", "rejectcall"],
  category: "owner",
  description: "Auto tolak panggilan প্রবেশ করুন",
  usage: ".anticall on/off",
  example: ".anticall on",
  isOwner: true,
  isPremium: false,
  isGroup: false,
  isPrivate: false,
  cooldown: 3,
  energi: 0,
  isEnabled: true,
};

async function handler(m, { sock }) {
  const db = getDatabase();
  const option = m.text?.toLowerCase()?.trim();

  if (!option) {
    const current = db.setting("antiCall") ?? config.features?.antiCall ?? true;
    return m.reply(
      `📞 *Anti Call*\n\n` +
        `> Status: *${current ? "Aktif ✅" : "Nonaktif ❌"}*\n\n` +
        `*PENGGUNAAN:*\n` +
        `> *${m.prefix}anticall on* — Aktifkan\n` +
        `> *${m.prefix}anticall off* — Nonaktifkan\n\n` +
        `_Bot হবে otomatis menolak panggilan প্রবেশ করুন_`
    );
  }

  if (option === "on") {
    db.setting("antiCall", true);
    const ctx = saluranCtx();
    return m.reply(
      `📞 *Anti Call Aktif*\n\n` +
        `> Bot হবে otomatis menolak panggilan প্রবেশ করুন`,
      { contextInfo: ctx }
    );
  }

  if (option === "off") {
    db.setting("antiCall", false);
    return m.reply(
      `📞 *Anti Call Nonaktif*\n\n` +
        `> Bot না হবে menolak panggilan প্রবেশ করুন`
    );
  }

  return m.reply(
    `❌ *Opsi না Valid*\n\n> ব্যবহার করুন *${m.prefix}anticall on* atau *${m.prefix}anticall off*`
  );
}



import { Module } from "../lib/plugins.js";
import { makeLegacyMessage, runLegacyContext, getDatabase as getLegacyDatabase, withLegacySocket } from "../lib/miku-legacy.js";
const __meta = {"command": "anticall", "aliases": ["antitelp", "rejectcall"], "package": "owner", "description": "Auto tolak panggilan প্রবেশ করুন", "isOwner": true, "isGroup": false, "isAdmin": false, "isBotAdmin": false};
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
