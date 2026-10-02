import crypto from "crypto";
import axios from "axios";
import yts from "yt-search";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import config from "../config.js";
import te from "../lib/miku-legacy.js";

const run = promisify(exec);
const pluginConfig = {
  name: "playch",
  alias: ["pch", "playsaluran"],
  category: "search",
  description: "Putar musik ke saluran (convert opus)",
  usage: ".playch <query> atau .playch --idch <id> <query>",
  example: ".playch komang",
  cooldown: 15,
  energi: 1,
  isEnabled: true,
};

function pickVideo(search) {
  const v = search?.videos || [];
  return v.find((x) => x.seconds && x.seconds < 900) || v[0] || null;
}

function formatViews(n) {
  if (!n) return "0";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toString();
}

async function toOggOpus(mp3Buf) {
  const tmp = path.join(process.cwd(), "temp");
  if (!fs.existsSync(tmp)) fs.mkdirSync(tmp, { recursive: true });
  const id = crypto.randomBytes(6).toString("hex");
  const inp = path.join(tmp, `in_${id}.mp3`);
  const out = path.join(tmp, `out_${id}.ogg`);
  fs.writeFileSync(inp, mp3Buf);
  await run(
    `ffmpeg -y -i "${inp}" -vn -map_metadata -1 -ac 1 -ar 48000 -c:a libopus -b:a 96k -vbr on -application audio -f ogg "${out}"`,
  );
  const buf = fs.readFileSync(out);
  try {
    fs.unlinkSync(inp);
  } catch { }
  try {
    fs.unlinkSync(out);
  } catch { }
  return buf;
}

function generateWaveform(audioBuf, samples = 64) {
  const waveform = new Uint8Array(samples);
  const chunkSize = Math.floor(audioBuf.length / samples);
  for (let i = 0; i < samples; i++) {
    const offset = i * chunkSize;
    let sum = 0;
    const len = Math.min(chunkSize, audioBuf.length - offset);
    for (let j = 0; j < len; j++) {
      sum += Math.abs(audioBuf[offset + j] - 128);
    }
    waveform[i] = Math.min(255, Math.floor((sum / len) * 2.5));
  }
  return waveform;
}

async function handler(m, { sock }) {
  const raw = m.text?.trim() || "";
  let chId = config?.saluran?.id;
  let chName = config?.saluran?.name || config?.bot?.name || "𝗩𝗫 𝗠𝗗 𝗕𝗢𝗧";
  let q = raw;

  const idchMatch = raw.match(/--idch\s+(\S+)/);
  if (idchMatch) {
    chId = idchMatch[1];
    chName = chId;
    q = raw.replace(/--idch\s+\S+/, "").trim();
  }

  if (!q)
    return m.reply(
      `🎵 *PLAY SALURAN*\n\n\`${m.prefix}playch <judul lagu>\`\n\`${m.prefix}playch --idch <id_saluran> <judul lagu>\``,
    );
  if (!chId)
    return m.reply(
      `❌ Saluran এখনও এatur. ব্যবহার করুন \`--idch <id>\` atau atur di config.js`,
    );

  m.react("🔎");
  try {
    const { videos } = await yts(q);
    const video = pickVideo({ videos });
    if (!video) return m.reply(`❌ Video না এtemukan`);

    const ytChannel = video.author?.name || video.author?.username || "Unknown";
    
    const res = await axios.get(`https://api.azbry.com/api/download/ytmp3?url=${encodeURIComponent(video.url)}`, { timeout: 60000 });
    const data = res.data;
    if (!data.status || !data.result || !data.result.download) {
       throw new Error("ব্যর্থ mengambil auএo থেকে API");
    }

    let info = `🎵 *NOW PLAYING (SALURAN)*\n\n`;
    info += `📌 *Judul:* ${video.title}\n\n`;
    info += `*DETAIL*\n`;
    info += `👤 Channel: *${ytChannel}*\n`;
    info += `⏱️ Durasi: *${video.duration.timestamp}*\n`;
    info += `👀 Views: *${formatViews(video.views)}*\n`;
    info += `📅 Upload: *${video.ago}*\n`;
    info += `🆔 ID: \`${video.videoId}\`\n\n`;
    if (video.description) {
      const desc = video.description.substring(0, 150).replace(/\n/g, " ");
      info += `*Deskripsi:*\n_${desc}${video.description.length > 150 ? "..." : ""}_\n\n`;
    }
    info += `📡 Saluran: \`${chId}\`\n`;
    info += `🔗 ${video.url}\n\n`;
    info += `_⏳ পাঠানো auএo তে saluran, অনুগ্রহ করে অপেক্ষা করুন..._`;

    await sock.sendMedia(m.chat, video.thumbnail, info, m, { type: "image" });

    m.react("🎵");

    const audioRes = await axios.get(data.result.download, { responseType: "arraybuffer", timeout: 60000 });
    const mp3Buf = Buffer.from(audioRes.data);

    if (mp3Buf.length < 50000) throw new Error("Auএo অতিরিক্ত তেcil");
    const opusBuf = await toOggOpus(mp3Buf);
    if (opusBuf.length < 10000) throw new Error("Konভার্সন opus ব্যর্থ");
    const title = video.title;

    const waveform = generateWaveform(opusBuf);
    await sock.sendMessage(chId, {
      audio: opusBuf,
      mimetype: "audio/ogg; codecs=opus",
      ptt: true,
      waveform: Array.from(waveform),
    });
    m.react("✅");
    m.reply(`✅ *${title}* সফল এপাঠান তে saluran`);
  } catch (e) {
    console.error("[PlayCh]", e);
    m.react("☢");
    m.reply(te(m.prefix, m.command, m.pushName));
  }
}


import { Module } from "../lib/plugins.js";
import { makeLegacyMessage, runLegacyContext, getDatabase as getLegacyDatabase, withLegacySocket } from "../lib/miku-legacy.js";
const __meta = {"command": "playch", "aliases": ["pch", "playsaluran"], "package": "search", "description": "Putar musik ke saluran (convert opus)", "isOwner": false, "isGroup": false, "isAdmin": false, "isBotAdmin": false};
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
