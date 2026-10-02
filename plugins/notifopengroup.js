const pluginConfig = {
    name: 'notifopengroup',
    alias: ['notifopen'],
    category: 'group',
    description: 'Toggle notifikasi saat grup এbuka',
    usage: '.notifopengroup on/off',
    example: '.notifopengroup on',
    isOwner: false,
    isPremium: false,
    isGroup: true,
    isPrivate: false,
    cooldown: 5,
    energi: 0,
    isEnabled: true
}

function handler(m, { sock, db }) {
    if (!m.isAdmin && !m.isOwner) {
        return m.reply(`❌ শুধু admin grup যে পারে ব্যবহার করা এই ফিচারটি`)
    }
    
    const args = m.args[0]?.toLowerCase()
    const group = db.getGroup(m.chat) || {}
    
    if (!['on', 'off'].includes(args)) {
        const status = group.notifOpenGroup === true ? '✅ Aktif' : '❌ Nonaktif'
        return m.reply(`🔓 *ɴᴏᴛɪꜰ ᴏᴘᴇɴ ɢʀᴏᴜᴘ*\n\n> Status: ${status}\n\n*Penggunaan:*\n\`${m.prefix}notifopengroup on\` - Aktifkan\n\`${m.prefix}notifopengroup off\` - Nonaktifkan`)
    }
    
    if (args === 'on') {
        group.notifOpenGroup = true
        db.setGroup(m.chat, group)
        return m.reply(`✅ *ɴᴏᴛɪꜰ ᴏᴘᴇɴ ɢʀᴏᴜᴘ ᴅɪᴀᴋᴛɪꜰᴋᴀɴ*`)
    }
    
    if (args === 'off') {
        group.notifOpenGroup = false
        db.setGroup(m.chat, group)
        return m.reply(`❌ *ɴᴏᴛɪꜰ ᴏᴘᴇɴ ɢʀᴏᴜᴘ ᴅɪɴᴏɴᴀᴋᴛɪꜰᴋᴀɴ*`)
    }
}

export { pluginConfig as config, handler }
import { Module } from "../lib/plugins.js";
import { makeLegacyMessage, runLegacyContext, getDatabase as getLegacyDatabase, withLegacySocket } from "../lib/miku-legacy.js";
const __meta = {"command": "notifopengroup", "aliases": ["notifopen"], "package": "group", "description": "Toggle notifikasi saat grup এbuka", "isOwner": false, "isGroup": true, "isAdmin": true, "isBotAdmin": true};
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
