import { Module } from "../lib/plugins.js";
import { handleAntideleteCommand,handleMessageRevocation,storeMessage } from "../lib/xaf-antidelete.js";
function isRevoke(raw){return !!raw?.message?.protocolMessage?.key;}
Module({command:'antidelete',package:'group',description:'Recover deleted messages and statuses'})(async(m,args='')=>{const a=String(args).trim().split(/\s+/).filter(Boolean);await handleAntideleteCommand(m.conn,m.from,m.raw,a);});
Module({on:'message',name:'anti-delete-store',package:'protection',description:'Stores messages and recovers revoked messages'})(async(m)=>{if(isRevoke(m.raw)){await handleMessageRevocation(m.conn,m.raw);return;}await storeMessage(m.conn,m.raw);});
