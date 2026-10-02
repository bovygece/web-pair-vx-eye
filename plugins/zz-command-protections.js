import { Module } from "../lib/plugins.js";
import { getDatabase, makeLegacyMessage, runLegacyContext } from "../lib/miku-legacy.js";
import { handleAntiJudol, handleAntiPhising, handleAntiHidetag } from "../lib/anita-group-protection.js";
import { detectBot } from "./antibot.js";
import { checkSpam, handleSpamAction } from "./antispam.js";
import { isToxic, handleToxicMessage, DEFAULT_TOXIC_WORDS } from "./antitoxic.js";

Module({on:"message",name:"merged-command-protections",package:"group",description:"Merged group protection enforcement"})(async(m)=>{
  if(!m?.isGroup||m.isFromMe||m.fromMe)return;
  await m.loadGroupInfo?.();
  const db=getDatabase(m); const g=db.getGroup(m.chat)||{};
  if(m.isAdmin||m.isOwner)return;
  try {
    if(g.antibot) { const lm=makeLegacyMessage(m,"","antibot"); await runLegacyContext(lm,()=>detectBot(lm,m.conn)); }
    if(g.antihidetag==="on") await handleAntiHidetag(m,m.conn,db);
    if(g.antijudol==="on") await handleAntiJudol(m,m.conn,db);
    if(g.antiphising==="on" || g.antiphishing==="on") await handleAntiPhising(m,m.conn,db);
    if(g.antispam) { const lm=makeLegacyMessage(m,"","antispam"); const hit=await runLegacyContext(lm,()=>checkSpam(lm,m.conn,db)); if(hit) await runLegacyContext(lm,()=>handleSpamAction(lm,m.conn,db)); }
    if(g.antitoxic) { const result=isToxic(String(m.body||""),g.toxicWords||DEFAULT_TOXIC_WORDS); if(result.toxic) await handleToxicMessage(m,m.conn,db,result.word); }
  } catch(e) { console.error("[merged-protection]",e?.message||e); }
});
