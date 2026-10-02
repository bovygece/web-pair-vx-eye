import moment from "moment-timezone";

let timer=null;
let running=false;

export function startGroupScheduler(manager, db){
  if(timer) return timer;
  const tick=async()=>{
    if(running) return; running=true;
    try{
      const now=moment().tz("Asia/Kolkata");
      const hm=now.format("HH:mm");
      for(const [sid,entry] of manager.sessions){
        const sock=entry?.sock; if(!sock) continue;
        let groups={}; try{groups=await sock.groupFetchAllParticipating();}catch{continue;}
        for(const [jid,meta] of Object.entries(groups||{})){
          const g=db.get(sid,`group:${jid}`,{})||{};

          // Relative group timers from plugins/grouptime.js.
          // They are persisted in the per-bot/per-group database, so a restart
          // does not lose the timer. The 30-second scheduler tick is used as
          // the execution guard.
          const nowMs=Date.now();
          let relativeAction=null;
          let relativeKey=null;
          if(Number(g.groupTimeCloseAt||0)>0 && Number(g.groupTimeCloseAt)<=nowMs){
            relativeAction="close";
            relativeKey="groupTimeCloseAt";
          } else if(Number(g.groupTimeOpenAt||0)>0 && Number(g.groupTimeOpenAt)<=nowMs){
            relativeAction="open";
            relativeKey="groupTimeOpenAt";
          }

          if(relativeAction){
            try{
              await sock.groupSettingUpdate(jid,relativeAction==="open"?"not_announcement":"announcement");
              const updated={...g,[relativeKey]:null};
              db.set(sid,`group:${jid}`,updated);
              if(relativeAction==="open"){
                await sock.sendMessage(jid,{text:`╭─────────────────────╮
│ ✮⃟≛⃝≛⃟ ⃝≛⃟ *𝐆𝐫𝐨𝐮𝐩 𝐎𝐩𝐞𝐧* ⃟≛⃝≛⃟✮
│
│ ♡ ➤ *পাখির ডাকে সকাল হলো* 🕊️
│
│ ♡ ➤ *𝙂𝙤𝙤𝙙 𝙈𝙤𝙧𝙣𝙞𝙣𝙜 𝙎𝙤𝙗𝙖𝙞 𝘽𝙤𝙡𝙤* ☀️
│
│ ♡ ➤ *বউ থাকলে চুমু দাও* 😘
│
│ ♡ ➤ *𝙉𝙖 𝙏𝙝𝙖𝙠𝙡𝙚 𝘼𝙧𝙤 𝙂𝙝𝙪𝙢𝙖𝙤* 🛌
│
│ ♡ ➤ *জামাই থাকলে হাত ধরো* 🤝
│
│ ♡ ➤ *𝙉𝙖 𝙏𝙝𝙖𝙠𝙡𝙚 𝙈𝙤𝙗𝙖𝙞𝙡 𝙂𝙝𝙖𝙩𝙤* 📱
│
│ ♡ ➤ *চা কফি গরম গরম* ☕
│
│ ♡ ➤ *𝙎𝙞𝙣𝙜𝙡𝙚 𝙍𝙖 𝙋𝙖𝙞 𝙎𝙤𝙧𝙤𝙢* 😂
│
│ ♡ ➤ *গ্রুপে সবাই মজা করো* 🎉
│
│ ♡ ➤ *𝙍𝙖𝙩𝙚 𝘼𝙗𝙖𝙧 𝘼𝙙𝙙𝙖 𝙅𝙤𝙧𝙤* 🌃
│
│ ╰➤ *𝐆𝐫𝐨𝐮𝐩 :* 𝐎𝐅𝐅 ❌
│ ╰➤ *𝐆𝐫𝐨𝐮𝐩 :* 𝐎𝐍 ✅
│
│ 🥰 *𝐆𝐨𝐨𝐝 𝐌𝐨𝐫𝐧𝐢𝐧𝐠 𝐄𝐯𝐞𝐫𝐲𝐨𝐧𝐞* 🥰
╰─────────────────────╯

♡────────────────────♡
*𝗩𝗫 𝗠𝗗 𝗕𝗢𝗧* 🫶🏻`}).catch(()=>{});
              } else {
                await sock.sendMessage(jid,{text:`╭─────────────────╮
│ ✮͢⃟≛⃝≛⃝𝐆𝐨𝐨𝐝 𝐍𝐢𝐠𝐡𝐭 𝐈𝐧𝐭𝐫𝐨⃟≛⃝ ⃟≛⃝✮
│╭─────── ♡ ───────
││♡ ➤ *কুত্তার চোখে জ্বল* 🐕💦
││
││♡ ➤ *𝙶𝚘𝚘𝚍 𝚗𝚒𝚐𝚑𝚝 𝚊𝚕𝚕* 😴
││
││♡ ➤ *বউ থাকলে চুমাও* 😘
││
││♡ ➤ *𝙽𝚊 𝚝𝚑𝚊𝚔𝚕𝚎 𝚐𝚑𝚞𝚖𝚊𝚠* 😴
││
││♡ ➤ *জামাই থাকলে চুমাও* 💋
││
││♡ ➤ *𝙽𝚊 𝚝𝚑𝚊𝚔𝚕𝚎 𝚐𝚑𝚞𝚖𝚊𝚠* 😂
││
││♡ ➤ *গাইস বউ নাই কপালে* 🤦‍♂️
││
││♡ ➤ *𝚔𝚘𝚝𝚑𝚊 𝚑𝚘𝚋𝚎 𝚜𝚘𝚔𝚊𝚕𝚎* 🥰
│╰────────────────
│╰➤ 𝐆𝐨𝐨𝐝 𝐍𝐢𝐠𝐡𝐭 𝐄𝐯𝐞𝐫𝐲𝐨𝐧𝐞 🥰
│╰➤ 𝐆𝐫𝐨𝐮𝐩 : 𝐎𝐟𝐟 ❌
│╰➤ 𝐆𝐫𝐨𝐮𝐩 : 𝐎𝐧 ✅
│╰➤ 𝐎𝐩𝐞𝐧 𝐓𝐢𝐦𝐞 : 𝐀𝐝𝐦𝐢𝐧 𝐚𝐬𝐥𝐞
│
│🥰 𝐓𝐡𝐚𝐧𝐤𝐬 𝐘𝐨𝐮 𝐄𝐯𝐞𝐫𝐲𝐨𝐧𝐞 🥰
♡─────────────────♡`}).catch(()=>{});
              }
            }catch(e){ console.error(`[scheduler] ${jid} ${relativeAction}:`,e?.message||e); }
            continue;
          }

          const action=g.scheduleOpen===hm?"open":g.scheduleClose===hm?"close":null;
          if(!action) continue;
          const marker=`schedule:last:${jid}`;
          if(db.get(sid,marker,"")===`${now.format("YYYY-MM-DD")}:${action}:${hm}`) continue;
          try{
            await sock.groupSettingUpdate(jid,action==="open"?"not_announcement":"announcement");
            db.set(sid,marker,`${now.format("YYYY-MM-DD")}:${action}:${hm}`);
            if(action==="open" && (g.notifopengroup===true || g.notifopengroup==="on")){
              await sock.sendMessage(jid,{text:"🔓 Group dibuka otomatis sesuai jadwal."}).catch(()=>{});
            }
          }catch(e){ console.error(`[scheduler] ${jid} ${action}:`,e?.message||e); }
        }
      }
    }finally{running=false;}
  };
  timer=setInterval(tick,30_000); timer.unref?.(); tick().catch(()=>{}); return timer;
}
