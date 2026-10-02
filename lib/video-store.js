import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import axios from "axios";

/*
 * Menu video + Welcome videos ka central manager.
 * Config file: media/videos.json  (URL yahan daalo)
 * Local files: media/menu.mp4, media/welcome-<slot>.mp4, media/welcome.mp4
 */

const MEDIA_DIR = path.join(process.cwd(), "media");
const CONFIG_FILE = path.join(MEDIA_DIR, "videos.json");
const MAX_BYTES = 60 * 1024 * 1024;

export const MENU_VIDEO_FILE = path.join(MEDIA_DIR, "menu.mp4");
export const welcomeSlotFile = (n) => path.join(MEDIA_DIR, `welcome-${n}.mp4`);
const LEGACY_WELCOME = path.join(MEDIA_DIR, "welcome.mp4");

export function readConfig() {
  const fallback = { menu: { url: "" }, welcome: { mode: "random", slots: [] } };
  let txt = "";
  try { txt = fs.readFileSync(CONFIG_FILE, "utf8"); } catch { return fallback; }
  try {
    return JSON.parse(txt);
  } catch (e1) {
    // comma bhool gaye ho to khud theek karke padho
    try {
      const fixed = txt
        .replace(/\}(\s*)\{/g, "},$1{")
        .replace(/,(\s*[}\]])/g, "$1");
      const cfg = JSON.parse(fixed);
      console.warn("[video-store] videos.json me comma ki galti thi, auto-fix se padha gaya");
      return cfg;
    } catch (e2) {
      console.error("[video-store] videos.json INVALID:", e2?.message || e2);
      return fallback;
    }
  }
}

export function writeConfig(cfg) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

/* url -> buffer (memory cache, taaki har baar download na ho) */
const urlCache = new Map();
async function fetchUrl(url) {
  if (urlCache.has(url)) return urlCache.get(url);
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 60000,
    maxContentLength: MAX_BYTES,
    maxBodyLength: MAX_BYTES,
  });
  const buf = Buffer.from(res.data);
  if (!buf.length) throw new Error("empty video");
  urlCache.set(url, buf);
  return buf;
}

export function clearUrlCache() {
  urlCache.clear();
}

function readFileSafe(file) {
  try {
    if (fs.existsSync(file) && fs.statSync(file).size > 0) return fs.readFileSync(file);
  } catch {}
  return null;
}

/* Audio hata do (video bilkul silent) - ffmpeg na ho to original hi rahega */
const silentCache = new WeakMap();
export function stripAudio(buf) {
  if (silentCache.has(buf)) return Promise.resolve(silentCache.get(buf));
  return new Promise((resolve) => {
    let bin = "ffmpeg";
    try {
      // eslint-disable-next-line no-undef
      const p = process.env.FFMPEG_PATH;
      if (p) bin = p;
    } catch {}
    const tmpIn = path.join(MEDIA_DIR, `.tmp-in-${Date.now()}.mp4`);
    const tmpOut = path.join(MEDIA_DIR, `.tmp-out-${Date.now()}.mp4`);
    const cleanup = () => {
      for (const f of [tmpIn, tmpOut]) try { fs.unlinkSync(f); } catch {}
    };
    try {
      fs.mkdirSync(MEDIA_DIR, { recursive: true });
      fs.writeFileSync(tmpIn, buf);
      const ff = spawn(bin, ["-y", "-i", tmpIn, "-an", "-c:v", "copy", "-movflags", "+faststart", tmpOut]);
      ff.on("error", () => { cleanup(); resolve(buf); });
      ff.on("close", (code) => {
        let out = buf;
        if (code === 0) {
          const r = readFileSafe(tmpOut);
          if (r) out = r;
        }
        cleanup();
        silentCache.set(buf, out);
        resolve(out);
      });
    } catch {
      cleanup();
      resolve(buf);
    }
  });
}

/* ---------------------------- MENU VIDEO ---------------------------- */

let menuCache = null; // { key, buf }
export async function getMenuVideo() {
  const cfg = readConfig();
  const url = String(cfg?.menu?.url || "").trim();
  let raw = null;

  if (/^https?:\/\//i.test(url)) {
    try { raw = await fetchUrl(url); }
    catch (e) { console.warn("[video-store] menu url failed:", e?.message || e); }
  }
  if (!raw) raw = readFileSafe(MENU_VIDEO_FILE);
  if (!raw) return null;

  const key = raw.length + ":" + url;
  if (menuCache?.key === key) return menuCache.buf;
  const buf = await stripAudio(raw);
  menuCache = { key, buf };
  return buf;
}

/* --------------------------- WELCOME VIDEOS -------------------------- */

let seqIndex = 0;

function listSlots() {
  const cfg = readConfig();
  const slots = Array.isArray(cfg?.welcome?.slots) ? cfg.welcome.slots : [];
  return { cfg, slots };
}

export async function getWelcomeVideo(limit = 0) {
  const { cfg, slots } = listSlots();
  const candidates = [];

  for (const s of slots) {
    const n = Number(s?.slot);
    if (!n) continue;
    const url = String(s?.url || "").trim();
    if (/^https?:\/\//i.test(url)) candidates.push({ n, url });
    else if (fs.existsSync(welcomeSlotFile(n))) candidates.push({ n, file: welcomeSlotFile(n) });
    else if (n === 1 && fs.existsSync(LEGACY_WELCOME)) candidates.push({ n, file: LEGACY_WELCOME });
  }

  candidates.sort((a, b) => a.n - b.n);
  const lim = Number(limit) || 0;
  if (lim > 0 && candidates.length > lim) candidates.length = lim; // sirf pehle N videos ON

  if (!candidates.length && fs.existsSync(LEGACY_WELCOME)) {
    candidates.push({ n: 1, file: LEGACY_WELCOME });
  }
  if (!candidates.length) return null;

  const pickOrder = [];
  if (cfg?.welcome?.mode === "sequential") {
    const start = seqIndex++ % candidates.length;
    for (let i = 0; i < candidates.length; i++) pickOrder.push(candidates[(start + i) % candidates.length]);
  } else {
    const first = Math.floor(Math.random() * candidates.length);
    for (let i = 0; i < candidates.length; i++) pickOrder.push(candidates[(first + i) % candidates.length]);
  }

  // jo video load na ho usse skip karke agla try karo
  for (const c of pickOrder) {
    try {
      const buf = c.url ? await fetchUrl(c.url) : readFileSafe(c.file);
      if (buf) return buf;
    } catch (e) {
      console.warn(`[video-store] welcome slot ${c.n} failed:`, e?.message || e);
    }
  }
  return null;
}

/* WhatsApp se set kiya hua video save karo (slot ka URL khaali kar do) */
export function saveWelcomeSlot(n, buffer) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  fs.writeFileSync(welcomeSlotFile(n), buffer);
  if (Number(n) === 1) fs.writeFileSync(LEGACY_WELCOME, buffer);

  const cfg = readConfig();
  cfg.welcome = cfg.welcome || { mode: "random", slots: [] };
  cfg.welcome.slots = Array.isArray(cfg.welcome.slots) ? cfg.welcome.slots : [];
  let slot = cfg.welcome.slots.find((s) => Number(s.slot) === Number(n));
  if (!slot) {
    slot = { slot: Number(n), url: "" };
    cfg.welcome.slots.push(slot);
    cfg.welcome.slots.sort((a, b) => a.slot - b.slot);
  }
  slot.url = "";
  writeConfig(cfg);
}

export function saveMenuVideo(buffer) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  fs.writeFileSync(MENU_VIDEO_FILE, buffer);
  const cfg = readConfig();
  cfg.menu = { ...(cfg.menu || {}), url: "" };
  writeConfig(cfg);
  menuCache = null;
}

export function countAvailableWelcome() {
  return describeSlots().filter((r) => r.src !== "EMPTY").length;
}

export function describeSlots() {
  const { slots } = listSlots();
  return slots.map((s) => {
    const n = Number(s.slot);
    const url = String(s.url || "").trim();
    const src = url ? "URL" : fs.existsSync(welcomeSlotFile(n)) || (n === 1 && fs.existsSync(LEGACY_WELCOME)) ? "FILE" : "EMPTY";
    return { slot: n, src };
  });
}
