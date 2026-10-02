const pluginConfig = {
    name: 'getpp',
    alias: ['pp', 'profilepic', 'avatar'],
    category: 'group',
    description: 'Ambil foto profil target (mention/reply)',
    usage: '.getpp @user',
    example: '.getpp @628xxx',
    isOwner: false,
    isPremium: false,
    isGroup: false,
    isPrivate: false,
    cooldown: 5,
    energi: 0,
    isEnabled: true
}

async function handler(m, { sock }) {
    let target = m.sender
    
    if (m.quoted) {
        target = m.quoted.sender
    } else if (m.mentionedJid?.length) {
        target = m.mentionedJid[0]
    } else if (m.args[0]) {
        let num = m.args[0].replace(/[^0-9]/g, '')
        if (num.startsWith('0')) num = '62' + num.slice(1)
        target = num + '@s.whatsapp.net'
    }
    
    const targetNum = target.split('@')[0]
    
    let ppUrl
    try {
        ppUrl = await sock.profilePictureUrl(target, 'image')
    } catch {
        ppUrl = 'https://files.catbox.moe/ejy4ky.jpg'
    }

    try {
        const res = await fetch(ppUrl);
        const buf = Buffer.from(await res.arrayBuffer());
        await sock.sendMessage(m.chat,{image:buf,caption:`Foto profil milik @${targetNum}`,mentions:[target]},{quoted:m});
    } catch {
        await sock.sendMessage(m.chat,{image:{url:ppUrl},caption:`Foto profil milik @${targetNum}`,mentions:[target]},{quoted:m});
    }
}

export { pluginConfig as config, handler }
import { Module } from "../lib/plugins.js";
import { makeLegacyMessage, runLegacyContext, getDatabase as getLegacyDatabase, withLegacySocket } from "../lib/miku-legacy.js";
const __meta = {"command": "getpp", "aliases": ["pp", "profilepic", "avatar"], "package": "group", "description": "Ambil foto profil target (mention/reply)", "isOwner": false, "isGroup": true, "isAdmin": false, "isBotAdmin": false};
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
