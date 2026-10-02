import { getDatabase } from "../lib/miku-legacy.js"

const pluginConfig = {
    name: 'antijudol',
    alias: ['antijudi', 'nojudi', 'antislot'],
    category: 'group',
    description: 'Deteksi konten judol এ grup',
    usage: '.antijudol <on/off/metode> [kick/remove]',
    example: '.antijudol on',
    isOwner: false,
    isPremium: false,
    isGroup: true,
    isPrivate: false,
    isAdmin: true,
    isBotAdmin: true,
    cooldown: 3,
    energi: 0,
    isEnabled: true
}

function handler(m) {
    const db = getDatabase()
    const groupData = db.getGroup(m.chat) || {}
    const option = m.text?.toLowerCase()?.trim()

    if (!option) {
        const status = groupData.antijudol || 'off'
        const mode = groupData.antijudolMode || 'remove'
        return m.reply(
            `🎰 *ᴀɴᴛɪᴊᴜᴅᴏʟ*\n\n` +
            `> Status: *${status.toUpperCase()}*\n` +
            `> Mode: *${mode.toUpperCase()}*\n\n` +
            `> Deteksi konten judol যেমন juএ, slot, gacor, maxwin, togel, bonus member, link alternatif, এবং pola sejenis.\n\n` +
            `> \`${m.prefix}antijudol on\`\n` +
            `> \`${m.prefix}antijudol off\`\n` +
            `> \`${m.prefix}antijudol metode kick\`\n` +
            `> \`${m.prefix}antijudol metode remove\``
        )
    }

    if (option === 'on') {
        db.setGroup(m.chat, { antijudol: 'on' })
        return m.reply('✅ *AntiJudol diaktifkan*')
    }

    if (option === 'off') {
        db.setGroup(m.chat, { antijudol: 'off' })
        return m.reply('❌ *AntiJudol dinonaktifkan*')
    }

    if (option.startsWith('metode')) {
        const method = m.args?.[1]?.toLowerCase()
        if (method === 'kick') {
            db.setGroup(m.chat, { antijudol: 'on', antijudolMode: 'kick' })
            return m.reply('✅ *AntiJudol mode KICK diaktifkan*')
        }
        if (method === 'remove' || method === 'delete') {
            db.setGroup(m.chat, { antijudol: 'on', antijudolMode: 'remove' })
            return m.reply('✅ *AntiJudol mode DELETE diaktifkan*')
        }
        return m.reply(`❌ Metode না valid! ব্যবহার করুন: \`kick\` atau \`remove\``)
    }

    if (option === 'kick') {
        db.setGroup(m.chat, { antijudol: 'on', antijudolMode: 'kick' })
        return m.reply('✅ *AntiJudol mode KICK diaktifkan*')
    }

    if (option === 'remove' || option === 'delete') {
        db.setGroup(m.chat, { antijudol: 'on', antijudolMode: 'remove' })
        return m.reply('✅ *AntiJudol mode DELETE diaktifkan*')
    }

    return m.reply('❌ Opsi না valid! ব্যবহার করুন: `on`, `off`, `metode kick`, `metode remove`')
}

export { pluginConfig as config, handler }

import { Module } from "../lib/plugins.js";
import { makeLegacyMessage, runLegacyContext, getDatabase as getLegacyDatabase, withLegacySocket } from "../lib/miku-legacy.js";
const __meta = {"command": "antijudol", "aliases": ["antijudi", "nojudi", "antislot"], "package": "group", "description": "Deteksi konten judol এ grup", "isOwner": false, "isGroup": true, "isAdmin": true, "isBotAdmin": true};
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
