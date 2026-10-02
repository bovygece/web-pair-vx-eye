import { getDatabase } from "../lib/miku-legacy.js"
const pluginConfig = {
    name: 'setintro',
    alias: ['setperkenalan', 'introset'],
    category: 'group',
    description: 'Set pesan intro grup (শুধু অ্যাডমিন)',
    usage: '.setintro <pesan>',
    example: '.setintro Selamat datang @user di @group!',
    isOwner: false,
    isPremium: false,
    isGroup: true,
    isPrivate: false,
    cooldown: 10,
    energi: 0,
    isEnabled: true,
    isAdmin: true
}

async function handler(m) {
    const db = getDatabase()
    const introText = m.fullArgs?.trim() || m.text?.trim()
    
    if (!introText) {
        return m.reply(
            `📝 *sᴇᴛ ɪɴᴛʀᴏ*\n\n` +
            `> দিন pesan intro!\n\n` +
            `*Placeholder যে terseএa:*\n` +
            `> @user - Nama pengguna\n` +
            `> @group - Nama grup\n` +
            `> @count - Jumlah member\n` +
            `> @date - Tanggal hari ini\n` +
            `> @time - Waktu এখন\n` +
            `> @desc - Deskripsi grup\n` +
            `> @botname - Nama bot\n\n` +
            `*উদাহরণ:*\n` +
            `> .setintro স্বাগতম @user এ grup @group! 👋`
        )
    }
    
    const groupData = db.getGroup(m.chat) || db.setGroup(m.chat)
    groupData.intro = introText
    db.setGroup(m.chat, groupData)
    db.save()
    
    await m.reply(
        `✅ *ɪɴᴛʀᴏ ᴅɪsᴀᴠᴇ!*\n` +
        `Pesan intro grup সফল এubah.\n` +
        `Ketik *${m.prefix}intro* জন্য meদেখুন hasilnহ্যাঁ.`
    )
}

export { pluginConfig as config, handler }
import { Module } from "../lib/plugins.js";
import { makeLegacyMessage, runLegacyContext, getDatabase as getLegacyDatabase, withLegacySocket } from "../lib/miku-legacy.js";
const __meta = {"command": "setintro", "aliases": ["setperkenalan", "introset"], "package": "group", "description": "Set pesan intro grup (শুধু অ্যাডমিন)", "isOwner": false, "isGroup": true, "isAdmin": true, "isBotAdmin": false};
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
