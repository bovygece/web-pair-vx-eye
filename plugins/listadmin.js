import axios from "axios";
import config from "../config.js";
import { hasFullAccess, getUserRole, VALID_SERVERS } from "../lib/anita-roles-cpanel.js";
import te from "../lib/miku-legacy.js";
import { Module } from "../lib/plugins.js";
import { makeLegacyMessage, runLegacyContext, getDatabase as getLegacyDatabase, withLegacySocket } from "../lib/miku-legacy.js";

const COMMANDS = VALID_SERVERS.map(v => `listadmin${v}`);
const ALIASES = VALID_SERVERS.map(v => `admins${v}`);
const META = { command: "listadminv1", aliases: [...COMMANDS.slice(1), ...ALIASES], package: "panel", description: "List semua admin panel (v1-v5)", isOwner:false, isGroup:false, isAdmin:false, isBotAdmin:false };

function parseVersion(cmd="listadminv1") { const m=String(cmd).match(/v([1-5])$/i); const n=m?m[1]:"1"; return {server:`v${n}`,key:`server${n}`}; }
function serverConfig(serverKey){
  const pc=config.pterodactyl || {};
  const idx=serverKey.replace("server","");
  const fromConfig=pc[serverKey] || {};
  return {
    domain: fromConfig.domain || process.env[`PTERO_SERVER${idx}_DOMAIN`] || "",
    apikey: fromConfig.apikey || fromConfig.apiKey || process.env[`PTERO_SERVER${idx}_APIKEY`] || process.env[`PTERO_SERVER${idx}_API_KEY`] || "",
  };
}
async function handler(m,{sock}){
  const {server, key}=parseVersion(m.command);
  if(!hasFullAccess(m.sender,server,m.isOwner)) return m.reply(`❌ *Akses ditolak*\n\n> Anda tidak memiliki akses ke *${server.toUpperCase()}*.\n> Role: *${getUserRole(m.sender,server)||"tidak ada"}*`);
  const cfg=serverConfig(key);
  if(!cfg.domain || !cfg.apikey) return m.reply(`⚠️ *${server.toUpperCase()} belum dikonfigurasi*\n\nTambahkan di config.js sebagai pterodactyl.server${server.slice(1)} atau environment:\nPTERO_SERVER${server.slice(1)}_DOMAIN\nPTERO_SERVER${server.slice(1)}_APIKEY`);
  try{
    const res=await axios.get(`${cfg.domain.replace(/\/$/,"")}/api/application/users`,{headers:{Authorization:`Bearer ${cfg.apikey}`,Accept:"Application/vnd.pterodactyl.v1+json","Content-Type":"application/json"},timeout:30000});
    const admins=(res.data?.data||[]).filter(u=>u?.attributes?.root_admin);
    if(!admins.length) return m.reply(`📋 *DAFTAR ADMIN [${server.toUpperCase()}]*\n\n> Tidak ada admin terdaftar.`);
    let out=`📋 *DAFTAR ADMIN [${server.toUpperCase()}]*\n\n> Total: *${admins.length}* admin\n\n`;
    admins.forEach((u,i)=>{const a=u.attributes||{};out+=`${i+1}. *${a.username||"-"}*\n   └ ID: \`${a.id||"-"}\` | Email: \`${a.email||"-"}\`\n`;});
    return m.reply(out);
  }catch(e){ console.error(`[listadmin] ${server}`,e?.message||e); return m.reply(`❌ *${server.toUpperCase()} API error*\n> ${e?.response?.data?.errors?.[0]?.detail||e?.message||"Request failed"}`); }
}
async function run(message,args){ const lm=makeLegacyMessage(message,args,String(message.body||"").trim().replace(/^\./,"").split(/\s+/)[0].toLowerCase()||META.command); return runLegacyContext(lm,()=>handler(lm,{sock:withLegacySocket(message.conn),db:getLegacyDatabase(lm),text:String(args||"")})); }
for(const cmd of COMMANDS){ const meta={...META,command:cmd,aliases:ALIASSES_FOR(cmd)}; Module(meta)((m,args="")=>run(m,args)); }
function ALIASSES_FOR(cmd){ const n=cmd.match(/v([1-5])$/i)?.[1]||"1"; return [`admins${n}`]; }
