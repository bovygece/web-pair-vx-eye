import { getDatabase } from "../lib/miku-legacy.js"
const pluginConfig = {
    name: 'jadwalgroup',
    alias: ['schedulegroup', 'jdwlgrup', 'autoopenclose'],
    category: 'group',
    description: 'Jadwal buka/tutup grup otomatis',
    usage: '.jadwalgroup <open/close> <HH:MM>',
    example: '.jadwalgroup open 06:00',
    isOwner: false,
    isPremium: false,
    isGroup: true,
    isPrivate: false,
    cooldown: 5,
    energi: 0,
    isEnabled: true,
    isAdmin: true,
    isBotAdmin: true
};

function parseTime(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return null;
    
    const cleaned = timeStr.trim().replace(/\s+/g, '');
    const match = cleaned.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    
    const hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    
    return { hours, minutes };
}

function formatTime(hours, minutes) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

async function handler(m, { sock, db }) {
    const args = m.args || []
    const action = args[0]?.toLowerCase();
    
    let time = args[1];
    if (args.length >= 4 && args[2] === ':') {
        time = `${args[1]}:${args[3]}`;
    } else if (args.length >= 2) {
        time = args.slice(1).join('').replace(/\s+/g, '');
    }
    
    if (!action) {
        const group = db.getGroup(m.chat) || {};
        const openTime = group.scheduleOpen || null;
        const closeTime = group.scheduleClose || null;
        
        let scheduleInfo = `⏰ *ᴊᴀᴅᴡᴀʟ ɢʀᴜᴘ*

「 📋 *sᴛᴀᴛᴜs* 」
🔓 ᴏᴘᴇɴ: *${openTime || 'নিষ্ক্রিয়'}*
🔒 ᴄʟᴏsᴇ: *${closeTime || 'নিষ্ক্রিয়'}*

*Cara Penggunaan:*
\`.jadwalgroup open 06:00\`
\`.jadwalgroup close 22:00\`
\`.jadwalgroup hapus open\`
\`.jadwalgroup hapus close\``;
        
        await m.reply(scheduleInfo);
        return;
    }
    
    if (action === 'মুছে দিন' || action === 'delete' || action === 'remove') {
        const type = args[1]?.toLowerCase();
        
        if (type !== 'open' && type !== 'close') {
            await m.reply(
                `⚠️ *ᴠᴀʟɪᴅᴀsɪ ɢᴀɢᴀʟ*\n\n` +
                `> ব্যবহার করুন: \`.jadwalgroup hapus open\`\n` +
                `> atau: \`.jadwalgroup hapus close\``
            );
            return;
        }
        
        const group = db.getGroup(m.chat) || {};
        
        if (type === 'open') {
            delete group.scheduleOpen;
            db.setGroup(m.chat, group);
            
            await m.reply(
                `✅ *ʙᴇʀʜᴀsɪʟ*\n\n` +
                `> Jadwal *buka grup* otomatis telah মুছে ফেলা হয়েছে.`
            );
        } else {
            delete group.scheduleClose;
            db.setGroup(m.chat, group);
            
            await m.reply(
                `✅ *ʙᴇʀʜᴀsɪʟ*\n\n` +
                `> Jadwal *tutup grup* otomatis telah মুছে ফেলা হয়েছে.`
            );
        }
        return;
    }
    
    if (action !== 'open' && action !== 'close') {
        await m.reply(
            `⚠️ *ᴠᴀʟɪᴅᴀsɪ ɢᴀɢᴀʟ*\n\n` +
            `> Action অবশ্যই \`open\` atau \`close\`!\n\n` +
            `> *উদাহরণ:*\n` +
            `> \`.jadwalgroup open 06:00\`\n` +
            `> \`.jadwalgroup close 22:00\``
        );
        return;
    }
    
    if (!time) {
        await m.reply(
            `⚠️ *ᴠᴀʟɪᴅᴀsɪ ɢᴀɢᴀʟ*\n\n` +
            `> Waktu অবশ্যই এপূরণ করুন!\n\n` +
            `> *Format:* \`HH:MM\` (24 jam)\n` +
            `> *উদাহরণ:* \`.jadwalgroup ${action} 08:00\``
        );
        return;
    }
    
    const parsed = parseTime(time);
    if (!parsed) {
        await m.reply(
            `⚠️ *ᴠᴀʟɪᴅᴀsɪ ɢᴀɢᴀʟ*\n\n` +
            `> Format waktu না valid!\n\n` +
            `> *Format:* \`HH:MM\` (24 jam)\n` +
            `> *উদাহরণ:* \`06:00\`, \`22:30\`, \`08:15\``
        );
        return;
    }
    
    const group = db.getGroup(m.chat) || {};
    const formattedTime = formatTime(parsed.hours, parsed.minutes);
    
    if (action === 'open') {
        group.scheduleOpen = formattedTime;
    } else {
        group.scheduleClose = formattedTime;
    }
    
    db.setGroup(m.chat, group);
    
    const actionText = action === 'open' ? 'BUKA' : 'TUTUP';
    const emoji = action === 'open' ? '🔓' : '🔒';
    
    const successMsg = `✅ *ᴊᴀᴅᴡᴀʟ ᴅɪsɪᴍᴘᴀɴ*

╭┈┈⬡「 ⏰ *sᴇᴛᴛɪɴɢ* 」
┃ ㊗ ${emoji} ᴀᴋsɪ: *${actionText}*
┃ ㊗ ⏱️ ᴡᴀᴋᴛᴜ: *${formattedTime} WIB*
┃ ㊗ 📡 sᴛᴀᴛᴜs: *🟢 সক্রিয়*
╰┈┈⬡

> _Grup হবে otomatis ${action === 'open' ? 'dibuka' : 'ditutup'}_
> _setiap hari pada jam *${formattedTime}* WIB._`;
    
    await m.reply(successMsg);
}

export { pluginConfig as config, handler }
import { Module } from "../lib/plugins.js";
import { makeLegacyMessage, runLegacyContext, getDatabase as getLegacyDatabase, withLegacySocket } from "../lib/miku-legacy.js";
const __meta = {"command": "jadwalgroup", "aliases": ["schedulegroup", "jdwlgrup", "autoopenclose"], "package": "group", "description": "Jadwal buka/tutup grup otomatis", "isOwner": false, "isGroup": true, "isAdmin": true, "isBotAdmin": true};
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
