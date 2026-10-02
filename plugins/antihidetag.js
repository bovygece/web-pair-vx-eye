import { Module } from "../lib/plugins.js";
import { getDatabase } from "../lib/miku-legacy.js";
import { handleAntiHidetag } from "../lib/anita-group-protection.js";
Module({command:"antihidetag",aliases:["antihidetagall"],package:"group",description:"Mencegah hidden tag massal",isGroup:true,isAdmin:true,isBotAdmin:true})(async(m,args="")=>{ if(!m.isGroup)return m.reply("❌ Group only."); await m.loadGroupInfo(); if(!m.isAdmin&&!m.isOwner)return m.reply("❌ Admin only."); const db=getDatabase(m); const v=String(args).trim().toLowerCase(); if(!v)return m.reply(`🛡️ Anti-Hidetag: ${db.getGroup(m.chat)?.antihidetag==="on"?"✅ ON":"❌ OFF"}
Use .antihidetag on/off`); if(v==="on"){db.setGroup(m.chat,{antihidetag:"on"});return m.reply("✅ Anti-Hidetag ON");} if(v==="off"){db.setGroup(m.chat,{antihidetag:"off"});return m.reply("❌ Anti-Hidetag OFF");} return m.reply("❌ Use .antihidetag on/off"); });
