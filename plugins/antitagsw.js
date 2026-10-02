import { Module } from "../lib/plugins.js";
import fs from 'fs'; import path from 'path';
const DB=path.join(process.cwd(),'data','antitagsw.json');
function load(){try{if(!fs.existsSync(DB)){fs.mkdirSync(path.dirname(DB),{recursive:true});fs.writeFileSync(DB,'{}');}return JSON.parse(fs.readFileSync(DB,'utf8'))||{};}catch{return {};}}
function save(x){fs.mkdirSync(path.dirname(DB),{recursive:true});fs.writeFileSync(DB,JSON.stringify(x,null,2));}
Module({command:'antitagsw',package:'group',description:'Anti tag status protection'})(async(m,args='')=>{const db=load();const a=String(args).trim().toLowerCase();if(a==='on'){db[m.from]=true;save(db);return m.send('✅ Anti Tag Status ON');}if(a==='off'){db[m.from]=false;save(db);return m.send('❌ Anti Tag Status OFF');}return m.send('Use:\n.antitagsw on\n.antitagsw off');});
Module({on:'message',name:'anti-tagsw-protection',package:'protection',description:'Deletes group status mentions'})(async(m)=>{if(!m.isGroup)return;const db=load();if(!db[m.from])return;const c=m.raw?.message||{};const hasStatus=Object.keys(c).some(k=>/status.*mention|mention.*status|group.*status/i.test(k));if(hasStatus)try{await m.conn.sendMessage(m.from,{delete:m.key});}catch{}});
