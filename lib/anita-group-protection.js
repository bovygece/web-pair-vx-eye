import { downloadMediaMessage } from "@whiskeysockets/baileys";
import {
  isLid,
  lidToJid,
  lidToJidSafe,
  getCachedJid,
  resolveAnyLidToJid,
} from "./anita-lid.js";
import config from "../config.js";
const messageCache = new Map();
const CACHE_EXPIRY = 30 * 60 * 1000;

// WhatsApp can deliver the same group-protection event more than once
// (especially with LID/status messages). Keep one short-lived claim per
// message + protection type so a warning/action is sent only once.
const protectionEventCache = new Map();
const PROTECTION_EVENT_TTL = 2 * 60 * 1000;

function claimProtectionEvent(messageId, action) {
  const id = String(messageId || '').trim();
  const type = String(action || '').trim();
  if (!id || !type) return true;

  const now = Date.now();
  for (const [key, timestamp] of protectionEventCache) {
    if (now - timestamp > PROTECTION_EVENT_TTL) protectionEventCache.delete(key);
  }

  const cacheKey = `${type}:${id}`;
  if (protectionEventCache.has(cacheKey)) return false;
  protectionEventCache.set(cacheKey, now);
  return true;
}
const CACHE_MAX_SIZE = 5000;

function gpMsg(key, replacements = {}) {
  const defaults = {
    antilink: "⚠ *Antilink* — @%user% লিংক পাঠিয়েছে.\nমেসেজ মুছে ফেলা হয়েছে.",
    antilinkKick: "⚠ *Antilink* — @%user% কিক করা হয়েছে লিংক পাঠানোর কারণে.",
    antilinkGc: "⚠ *Antilink WA* — @%user% লিংক পাঠিয়েছে WA.\nমেসেজ মুছে ফেলা হয়েছে.",
    antilinkGcKick:
      "⚠ *Antilink WA* — @%user% কিক করা হয়েছে লিংক পাঠানোর কারণে WA.",
    antilinkAll: "⚠ *Antilink* — @%user% লিংক পাঠিয়েছে.\nমেসেজ মুছে ফেলা হয়েছে.",
    antilinkAllKick: "⚠ *Antilink* — @%user% কিক করা হয়েছে লিংক পাঠানোর কারণে.",
    antitagsw: "⚠ *AntiTagSW* — এর Status Tag @%user% মুছে ফেলা হয়েছে.",
    antistatus: "⚠ *AntiStatus* — Status/Status Mention dari @%user% dihapus. Warning %count%/3.",
    antistatusKick: "🚫 *AntiStatus* — @%user% sudah 3/3 warning dan dikeluarkan dari grup.\nStatus tidak diizinkan di grup ini.",
    antiswgc: "⚠ *AntiSWGC* — SW group type *%type%* থেকে @%user% মুছে ফেলা হয়েছে.",
    antijudol:
      "⚠ *AntiJudol* — @%user% শনাক্ত পাঠান konten judol.\nমেসেজ মুছে ফেলা হয়েছে.",
    antijudolKick: "⚠ *AntiJudol* — @%user% কিক করা হয়েছে কারণ পাঠান konten judol.",
    antiphising:
      "⚠ *AntiPhishing* — @%user% শনাক্ত পাঠান konten phishing.\nমেসেজ মুছে ফেলা হয়েছে.",
    antiphisingKick:
      "⚠ *AntiPhishing* — @%user% কিক করা হয়েছে কারণ পাঠান konten phishing.",
    anticustom:
      "⚠ *AntiCustom* — @%user% melanggar rule custom *%rule%*.\nমেসেজ মুছে ফেলা হয়েছে.",
    anticustomKick:
      "⚠ *AntiCustom* — @%user% কিক করা হয়েছে কারণ melanggar rule custom *%rule%*.",
    antiviewonce: "👁️ *ViewOnce* — থেকে @%user%",
    antiremove: "🗑️ *AntiDelete* — @%user% মেসেজ মুছে দিয়েছে:",
    antihidetag: "⚠ *AntiHidetag* — Hidetag থেকে @%user% মুছে ফেলা হয়েছে.",
    notAdmin: "⚠ বট অ্যাডমিন নয়, পারছে না মেসেজ মুছে দিয়েছে.",
  };
  let text = config.groupProtection?.[key] || defaults[key] || "";
  for (const [k, v] of Object.entries(replacements)) {
    text = text.replace(new RegExp(`%${k}%`, "g"), v);
  }
  return text;
}

function cacheMessage(key, message, content) {
  messageCache.set(key, {
    message,
    content,
    timestamp: Date.now(),
  });

  if (messageCache.size > CACHE_MAX_SIZE) {
    const entries = [...messageCache.entries()].sort(
      (a, b) => a[1].timestamp - b[1].timestamp,
    );
    const toDelete = entries.slice(0, entries.length - CACHE_MAX_SIZE);
    for (const [k] of toDelete) messageCache.delete(k);
  }
}

function getCachedMessage(key) {
  const cached = messageCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CACHE_EXPIRY) {
    messageCache.delete(key);
    return null;
  }
  return cached;
}

function deleteCachedMessage(key) {
  messageCache.delete(key);
}

const LINK_REGEX =
  /(?:https?:\/\/)?(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b[-a-zA-Z0-9()@:%_\+.~#?&//=]*/gi;
const WA_LINK_REGEX =
  /(?:https?:\/\/)?(?:www\.)?(?:chat\.whatsapp\.com|wa\.me|api\.whatsapp\.com|whatsapp\.com\/channel|whatsapp\.com\/catalog|call\.whatsapp\.com)\/[A-Za-z0-9+_\-]{4,}/gi;
const LEET_CHAR_MAP = Object.freeze({
  0: "o",
  1: "i",
  2: "z",
  3: "e",
  4: "a",
  5: "s",
  6: "g",
  7: "t",
  8: "b",
  9: "g",
  "@": "a",
  $: "s",
  "!": "i",
  "+": "t",
});
const JUDOL_PATTERNS = [
  { pattern: /\bjud[iol]{1,4}\b/i, score: 3, label: "judi" },
  { pattern: /\bslot\b/i, score: 3, label: "slot" },
  { pattern: /\bgacor\b/i, score: 3, label: "gacor" },
  { pattern: /\bslot\s+gacor\b/i, score: 4, label: "slot gacor" },
  { pattern: /\bmax\s?win\b/i, score: 3, label: "maxwin" },
  { pattern: /\bscatter\b/i, score: 2, label: "scatter" },
  { pattern: /\btogel\b/i, score: 3, label: "togel" },
  { pattern: /\bcasino\b/i, score: 3, label: "casino" },
  { pattern: /\brtp\b/i, score: 2, label: "rtp" },
  { pattern: /\bpragmatic\b/i, score: 2, label: "pragmatic" },
  { pattern: /\bpg\s?soft\b/i, score: 2, label: "pgsoft" },
  {
    pattern: /\b(habanero|joker|spadegaming|microgaming)\b/i,
    score: 2,
    label: "provider",
  },
  { pattern: /\bjackpot\b/i, score: 2, label: "jackpot" },
  { pattern: /\bfree\s?spin\b/i, score: 2, label: "free spin" },
  { pattern: /\bspin\s?gratis\b/i, score: 2, label: "spin gratis" },
  { pattern: /\bpola\s?slot\b/i, score: 2, label: "pola slot" },
  { pattern: /\bdeposit\b/i, score: 1, label: "deposit" },
  { pattern: /\bdepo\b/i, score: 1, label: "depo" },
  { pattern: /\bwithdraw\b/i, score: 1, label: "withdraw" },
  { pattern: /\bwd\b/i, score: 1, label: "wd" },
  { pattern: /bonus\s+new\s+member/i, score: 2, label: "bonus new member" },
  {
    pattern: /bonus\s+(member|new\s*member)/i,
    score: 2,
    label: "bonus member",
  },
  { pattern: /link\s+alternatif/i, score: 2, label: "link alternatif" },
  { pattern: /bandar\s+(slot|togel|judi)/i, score: 2, label: "bandar" },
  { pattern: /\bbet\s?(kecil|besar)?\b/i, score: 1, label: "bet" },
  { pattern: /\btaruhan\b/i, score: 2, label: "taruhan" },
];
const JUDOL_COMPACT_KEYWORDS = [
  { keyword: "judi", score: 3, label: "judi" },
  { keyword: "judol", score: 3, label: "judol" },
  { keyword: "slot", score: 3, label: "slot" },
  { keyword: "gacor", score: 3, label: "gacor" },
  { keyword: "slotgacor", score: 4, label: "slot gacor" },
  { keyword: "maxwin", score: 3, label: "maxwin" },
  { keyword: "scatter", score: 2, label: "scatter" },
  { keyword: "togel", score: 3, label: "togel" },
  { keyword: "casino", score: 3, label: "casino" },
  { keyword: "rtp", score: 2, label: "rtp" },
  { keyword: "pragmatic", score: 2, label: "pragmatic" },
  { keyword: "pgsoft", score: 2, label: "pgsoft" },
  { keyword: "jackpot", score: 2, label: "jackpot" },
  { keyword: "freespin", score: 2, label: "free spin" },
  { keyword: "spingratis", score: 2, label: "spin gratis" },
  { keyword: "polaslot", score: 2, label: "pola slot" },
  { keyword: "bonusmember", score: 2, label: "bonus member" },
  { keyword: "bonusnewmember", score: 2, label: "bonus new member" },
  { keyword: "linkalternatif", score: 2, label: "link alternatif" },
  { keyword: "bandarslot", score: 2, label: "bandar slot" },
  { keyword: "bandartogel", score: 2, label: "bandar togel" },
  { keyword: "bandarjudi", score: 2, label: "bandar judi" },
];
const PHISHING_PATTERNS = [
  { pattern: /klik\s+(link|tautan)/i, score: 2, label: "klik link" },
  { pattern: /(tap|tekan)\s+(link|tautan)/i, score: 2, label: "tap link" },
  {
    pattern: /verifikasi\s+(akun|nomor|rekening|wallet|email|data)/i,
    score: 3,
    label: "verifikasi",
  },
  {
    pattern:
      /(login|log\s?in|signin|sign\s?in)\s+(disini|di\s+sini|sekarang|ulang)/i,
    score: 3,
    label: "login",
  },
  { pattern: /masuk\s+(disini|di\s+sini)/i, score: 2, label: "প্রবেশ করুন" },
  {
    pattern: /\b(otp|pin|password|passcode|kode\s?otp|kode\s?verifikasi)\b/i,
    score: 2,
    label: "credential",
  },
  {
    pattern: /akun\s+(dibatasi|terblokir|bermasalah|expired|kedaluwarsa)/i,
    score: 2,
    label: "akun",
  },
  {
    pattern: /klaim\s+(hadiah|saldo|voucher|bonus)/i,
    score: 2,
    label: "klaim",
  },
  {
    pattern: /(saldo|dana|ovo|gopay|shopeepay)\s+(gratis|kaget|masuk)/i,
    score: 2,
    label: "saldo",
  },
  { pattern: /hadiah\s+(gratis|menarik|langsung)/i, score: 1, label: "hadiah" },
  { pattern: /cek\s+(resi|paket|rekening)/i, score: 1, label: "চেক করুন" },
  { pattern: /reset\s+(password|akun)/i, score: 3, label: "reset" },
  { pattern: /pulihkan\s+akun/i, score: 3, label: "pulihkan akun" },
  {
    pattern: /update\s+(akun|rekening|wallet|data)/i,
    score: 2,
    label: "update akun",
  },
  {
    pattern: /konfirmasi\s+(akun|identitas|rekening|data)/i,
    score: 2,
    label: "konfirmasi",
  },
  { pattern: /isi\s+form(ulir)?/i, score: 2, label: "form" },
  { pattern: /akses\s+(sekarang|link)/i, score: 1, label: "অ্যাক্সেস" },
  { pattern: /hadiah\s+menanti/i, score: 1, label: "hadiah menanti" },
];
const PHISHING_COMPACT_KEYWORDS = [
  { keyword: "kliklink", score: 2, label: "klik link" },
  { keyword: "kliktautan", score: 2, label: "klik tautan" },
  { keyword: "taplink", score: 2, label: "tap link" },
  { keyword: "tekanlink", score: 2, label: "tekan link" },
  { keyword: "verifikasiakun", score: 3, label: "verifikasi akun" },
  { keyword: "verifikasinomor", score: 3, label: "verifikasi nomor" },
  { keyword: "verifikasirekening", score: 3, label: "verifikasi rekening" },
  { keyword: "verifikasiwallet", score: 3, label: "verifikasi wallet" },
  { keyword: "loginএখন", score: 3, label: "login sekarang" },
  { keyword: "logindisini", score: 3, label: "login disini" },
  { keyword: "masukdisini", score: 2, label: "masuk disini" },
  { keyword: "kodeotp", score: 2, label: "kode otp" },
  { keyword: "kodeverifikasi", score: 2, label: "kode verifikasi" },
  { keyword: "resetpassword", score: 3, label: "reset password" },
  { keyword: "resetakun", score: 3, label: "reset akun" },
  { keyword: "pulihkanakun", score: 3, label: "pulihkan akun" },
  { keyword: "klaimhadiah", score: 2, label: "klaim hadiah" },
  { keyword: "klaimsaldo", score: 2, label: "klaim saldo" },
  { keyword: "klaimbonus", score: 2, label: "klaim bonus" },
  { keyword: "saldogratis", score: 2, label: "saldo gratis" },
  { keyword: "saldokaget", score: 2, label: "saldo kaget" },
  { keyword: "updateakun", score: 2, label: "update akun" },
  { keyword: "updaterekening", score: 2, label: "update rekening" },
  { keyword: "konfirmasiakun", score: 2, label: "konfirmasi akun" },
  { keyword: "konfirmasiidentitas", score: 2, label: "konfirmasi identitas" },
  { keyword: "isiform", score: 2, label: "isi form" },
];
const SHORTENER_PATTERN =
  /(?:bit\.ly|tinyurl\.com|cutt\.ly|s\.id|t\.co|goo\.gl|is\.gd|rebrand\.ly|linktr\.ee)\//i;
const IP_URL_PATTERN =
  /(?:https?:\/\/)?(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:\/|\b)/i;
const AT_IN_URL_PATTERN = /https?:\/\/[^\s/]+@[^\s]+/i;
const PUNYCODE_PATTERN = /xn--[a-z0-9-]+/i;

function isAdminParticipant(participant) {
  if (!participant) return false;
  const values = [participant.admin, participant.role, participant.type];
  return (
    participant.admin === true ||
    participant.superadmin === true ||
    participant.owner === true ||
    values.some((value) =>
      ["admin", "superadmin", "owner"].includes(String(value || "").toLowerCase()),
    )
  );
}

function getParticipantIds(participant) {
  if (!participant) return [];
  return [
    participant.jid,
    participant.id,
    participant.lid,
    participant.phoneNumber,
    participant.pn,
  ].filter(Boolean);
}

function findGroupParticipant(participants, sender) {
  if (!sender || !Array.isArray(participants)) return null;
  const senderText = String(sender).trim();
  const senderNumber = senderText.replace(/[^0-9]/g, "");
  if (!senderText.includes("@") && senderNumber.length < 7) return null;

  const candidates = [senderText];
  if (isLid(senderText)) {
    candidates.push(
      lidToJidSafe(senderText),
      lidToJid(senderText),
      getCachedJid(senderText),
    );
  }

  for (const candidate of candidates.filter(Boolean)) {
    const found = participants.find((participant) =>
      getParticipantIds(participant).some((id) =>
        isSameParticipant(id, candidate),
      ),
    );
    if (found) return found;
  }
  return null;
}

function isAdminCheck(participants, sender) {
  const participant = findGroupParticipant(participants, sender);
  if (participant) return isAdminParticipant(participant);

  const senderNum = String(sender || "").replace(/[^0-9]/g, "");
  if (senderNum.length < 7) return false;

  return (participants || []).some((p) => {
    if (!isAdminParticipant(p)) return false;
    return getParticipantIds(p).some((id) => {
      const idNum = String(id).replace(/[^0-9]/g, "");
      return (
        idNum === senderNum ||
        (idNum.length >= 7 &&
          (idNum.endsWith(senderNum) || senderNum.endsWith(idNum)))
      );
    });
  });
}

function isBotAdminCheck(participants, botJid) {
  const participant = findGroupParticipant(participants, botJid);
  return Boolean(participant && isAdminParticipant(participant));
}

function resolveGroupSender(sender, participants) {
  const original = String(sender || "").trim();
  const entry = findGroupParticipant(participants, original);

  let resolved =
    entry?.jid ||
    entry?.phoneNumber ||
    getCachedJid(original) ||
    (isLid(original) ? lidToJidSafe(original) || lidToJid(original) : original);

  if (!resolved || String(resolved).endsWith("@lid")) {
    resolved =
      getCachedJid(original) ||
      lidToJidSafe(original) ||
      lidToJid(original) ||
      original;
  }

  return {
    originalSender: original,
    participant: entry,
    resolvedSender: normalizeComparableJid(resolved),
  };
}

function normalizeProtectionMode(mode, fallback = "remove") {
  const value = String(mode || fallback).toLowerCase();
  if (["kick", "remove", "delete"].includes(value)) {
    return value === "delete" ? "remove" : value;
  }
  return fallback;
}

function getProtectionText(m) {
  return String(m.body || m.text || "").trim();
}

function normalizeComparableJid(jid) {
  let value = String(jid || "").trim();
  if (!value) return "";

  if (isLid(value)) {
    const safe = lidToJidSafe(value);
    value = safe || lidToJid(value) || value;
  }

  if (value.includes(":") && value.endsWith("@s.whatsapp.net")) {
    value = `${value.split(":")[0]}@s.whatsapp.net`;
  }

  return value;
}

function isSameParticipant(left, right) {
  const leftJid = normalizeComparableJid(left);
  const rightJid = normalizeComparableJid(right);
  if (!leftJid || !rightJid) return false;
  if (leftJid === rightJid) return true;

  const leftNum = leftJid.replace(/[^0-9]/g, "");
  const rightNum = rightJid.replace(/[^0-9]/g, "");
  if (!leftNum || !rightNum) return false;

  return (
    leftNum === rightNum ||
    leftNum.endsWith(rightNum) ||
    rightNum.endsWith(leftNum)
  );
}

function resolveMessageSenderJid(key, sock) {
  const fallback = key?.fromMe ? sock.user?.id : key?.remoteJid;
  return normalizeComparableJid(key?.participant || fallback);
}

function normalizeProtectionText(text) {
  const value = String(text || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const mapped = [...value]
    .map((char) => LEET_CHAR_MAP[char] || char)
    .join("")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return mapped.replace(/\b(?:[a-z0-9]\s+){2,}[a-z0-9]\b/g, (fragment) =>
    fragment.replace(/\s+/g, ""),
  );
}

function buildProtectionTextVariants(text) {
  const raw = String(text || "")
    .toLowerCase()
    .trim();
  const normalized = normalizeProtectionText(text);
  const compact = normalized.replace(/[^a-z0-9]+/g, "");
  return [...new Set([raw, normalized, compact].filter(Boolean))];
}

function summarizeScoreHits(hits = []) {
  const uniqueHits = new Map();

  for (const hit of hits) {
    if (!hit?.label) continue;
    const current = uniqueHits.get(hit.label);
    if (!current || current.score < hit.score) {
      uniqueHits.set(hit.label, hit);
    }
  }

  const items = [...uniqueHits.values()];
  return {
    score: items.reduce((total, item) => total + (item.score || 0), 0),
    matches: items.map((item) => item.label),
  };
}

function scorePatterns(text, patterns = []) {
  const variants = Array.isArray(text)
    ? text.filter(Boolean)
    : [text].filter(Boolean);
  const hits = [];

  for (const item of patterns) {
    for (const variant of variants) {
      item.pattern.lastIndex = 0;
      if (item.pattern.test(variant)) {
        hits.push({
          label: item.label || item.pattern.source,
          score: item.score || 1,
        });
        break;
      }
    }
  }

  return summarizeScoreHits(hits);
}

function scoreKeywords(text, keywords = []) {
  const source = String(text || "");
  const hits = [];

  for (const item of keywords) {
    if (source.includes(item.keyword)) {
      hits.push({ label: item.label || item.keyword, score: item.score || 1 });
    }
  }

  return summarizeScoreHits(hits);
}

function detectJudol(text) {
  if (!text) return { matched: false, score: 0, matches: [] };
  const variants = buildProtectionTextVariants(text);
  const compact = variants[variants.length - 1] || "";
  const { hasLink } = containsAnyLink(text);
  const patternResult = scorePatterns(variants, JUDOL_PATTERNS);
  const compactResult = scoreKeywords(compact, JUDOL_COMPACT_KEYWORDS);
  const result = summarizeScoreHits([
    ...patternResult.matches.map((label) => ({ label, score: 0 })),
    ...compactResult.matches.map((label) => ({ label, score: 0 })),
  ]);
  const totalScore = patternResult.score + compactResult.score;
  const matched = totalScore >= 3 || (hasLink && totalScore >= 2);
  return { matched, hasLink, score: totalScore, matches: result.matches };
}

function detectPhishing(text) {
  if (!text) return { matched: false, score: 0, matches: [] };
  const variants = buildProtectionTextVariants(text);
  const compact = variants[variants.length - 1] || "";
  const { hasLink } = containsAnyLink(text);
  const patternResult = scorePatterns(variants, PHISHING_PATTERNS);
  const compactResult = scoreKeywords(compact, PHISHING_COMPACT_KEYWORDS);
  let score = patternResult.score + compactResult.score;
  const matches = [
    ...new Set([...patternResult.matches, ...compactResult.matches]),
  ];

  if (SHORTENER_PATTERN.test(text)) {
    score += 2;
    matches.push("shortener");
  }
  if (IP_URL_PATTERN.test(text)) {
    score += 2;
    matches.push("ip-url");
  }
  if (AT_IN_URL_PATTERN.test(text)) {
    score += 2;
    matches.push("url-userinfo");
  }
  if (PUNYCODE_PATTERN.test(text)) {
    score += 2;
    matches.push("punycode");
  }

  const matched = (hasLink && score >= 2) || score >= 3;
  return { matched, hasLink, score, matches: [...new Set(matches)] };
}

function findSwGcType(node, path = "message", seen = new WeakSet()) {
  if (!node || typeof node !== "object") return null;
  if (seen.has(node)) return null;
  seen.add(node);

  if (node.groupStatusMessage) {
    return `${path}.groupStatusMessage`;
  }
  if (node.groupStatusMessageV2) {
    return `${path}.groupStatusMessageV2`;
  }
  if (node.groupStatusMentionMessage) {
    return `${path}.groupStatusMentionMessage`;
  }
  if (node.groupMentionedMessage) {
    return `${path}.groupMentionedMessage`;
  }
  if (node.statusMentionMessage) {
    return `${path}.statusMentionMessage`;
  }
  if (node.contextInfo?.groupMentions?.length > 0) {
    return `${path}.contextInfo.groupMentions`;
  }

  for (const [key, value] of Object.entries(node)) {
    if (!value || typeof value !== "object") continue;
    const found = findSwGcType(value, `${path}.${key}`, seen);
    if (found) return found;
  }

  return null;
}

function detectSwGcType(rawMsg) {
  const msg = rawMsg?.message;
  if (!msg) return null;

  return findSwGcType(msg, "message");
}

function matchCustomRule(text, rules = []) {
  if (!text || !Array.isArray(rules) || rules.length === 0) return null;

  for (const rule of rules) {
    if (!rule || !rule.pattern) continue;

    if (rule.type === "regex") {
      try {
        const flags = rule.flags || "i";
        const regex = new RegExp(rule.pattern, flags);
        if (regex.test(text)) return rule;
      } catch {}
      continue;
    }

    if (text.toLowerCase().includes(String(rule.pattern).toLowerCase())) {
      return rule;
    }
  }

  return null;
}

async function executeProtectionAction({
  sock,
  chatId,
  keyId,
  sender,
  senderTag,
  mode,
  removeMessageKey,
  kickMessageKey = null,
  replacements = {},
  resolvedSender = sender,
}) {
  const eventId = String(keyId || '').trim();
  const eventType = `${removeMessageKey}:${mode}`;
  if (!claimProtectionEvent(eventId, eventType)) return false;

  const actionSender = resolvedSender || sender;

  // For LID messages, the original participant in the received key is often
  // required for deletion. Try it first, then the resolved phone JID.
  const deleteParticipants = [...new Set([sender, actionSender].filter(Boolean))];
  let deleted = false;
  let deleteError = null;

  for (const participant of deleteParticipants) {
    try {
      await sock.sendMessage(chatId, {
        delete: {
          remoteJid: chatId,
          fromMe: false,
          id: keyId,
          participant,
        },
      });
      deleted = true;
      break;
    } catch (error) {
      deleteError = error;
    }
  }

  if (!deleted) {
    protectionEventCache.delete(`${eventType}:${eventId}`);
    throw deleteError || new Error("Protection message delete failed");
  }

  if (mode === "kick") {
    try {
      await sock.groupParticipantsUpdate(chatId, [actionSender], "remove");
      if (kickMessageKey) {
        await sock.sendMessage(chatId, {
          text: gpMsg(kickMessageKey, { user: senderTag, ...replacements }),
          mentions: [actionSender],
        });
      }
      return true;
    } catch (error) {
      console.error(`[GROUP PROTECTION KICK ERROR] ${error.message}`);
    }
  }

  await sock.sendMessage(chatId, {
    text: gpMsg(removeMessageKey, { user: senderTag, ...replacements }),
    mentions: [actionSender],
  });
  return true;
}

async function handleTextProtection({
  m,
  sock,
  db,
  toggleKey,
  modeKey,
  removeMessageKey,
  kickMessageKey,
  detector,
  defaultMode = "remove",
  buildReplacements = () => ({}),
}) {
  if (!m.isGroup) return false;

  const group = db.getGroup(m.chat) || {};
  if (group[toggleKey] !== "on" && group[toggleKey] !== true) return false;

  const text = getProtectionText(m);
  const detected = detector(text, group, m);
  if (!detected?.matched) return false;

  const botNumber = normalizeComparableJid(
    sock.user?.id?.split(":")[0] + "@s.whatsapp.net",
  );
  const selfMode = db.setting("selfMode") === true;
  if (!selfMode && (m.fromMe || isSameParticipant(m.sender, botNumber))) return false;

  try {
    const groupMeta = await sock.groupMetadata(m.chat);
    const participants = groupMeta?.participants || [];
    const senderContext = resolveGroupSender(m.sender, participants);
    const sender = senderContext.resolvedSender || m.sender;
    const senderTag = sender.split("@")[0] || String(m.sender || "").split("@")[0];

    // Admin/owner: NEVER delete, warn, or kick.
    if (isAdminCheck(participants, sender) || isAdminCheck(participants, m.sender)) {
      return false;
    }

    if (!isBotAdminCheck(participants, botNumber)) return false;

    const mode = normalizeProtectionMode(group[modeKey], defaultMode);
    return executeProtectionAction({
      sock,
      chatId: m.chat,
      keyId: m.key.id || m.id,
      sender: m.sender,
      resolvedSender: sender,
      senderTag,
      mode,
      removeMessageKey,
      kickMessageKey,
      replacements: buildReplacements(detected, m),
    });
  } catch (error) {
    console.error(`[GROUP PROTECTION ERROR] ${error.message}`);
    return false;
  }
}
async function handleLinkProtection({
  m,
  sock,
  db,
  group,
  modeKey,
  removeMessageKey,
  kickMessageKey,
}) {
  const botNumber = normalizeComparableJid(
    sock.user?.id?.split(":")[0] + "@s.whatsapp.net",
  );
  const selfMode = db.setting("selfMode") === true;
  if (!selfMode && (m.fromMe || isSameParticipant(m.sender, botNumber))) return false;

  try {
    const groupMeta = await sock.groupMetadata(m.chat);
    const participants = groupMeta?.participants || [];
    const senderContext = resolveGroupSender(m.sender, participants);
    const sender = senderContext.resolvedSender || m.sender;
    const senderTag = sender.split("@")[0] || String(m.sender || "").split("@")[0];

    // Admin/owner: NEVER delete, warn, or kick.
    if (isAdminCheck(participants, sender) || isAdminCheck(participants, m.sender)) {
      return false;
    }

    if (!isBotAdminCheck(participants, botNumber)) return false;

    const mode = normalizeProtectionMode(group[modeKey], "remove");
    return executeProtectionAction({
      sock,
      chatId: m.chat,
      keyId: m.key.id || m.id,
      sender: m.sender,
      resolvedSender: sender,
      senderTag,
      mode,
      removeMessageKey,
      kickMessageKey,
    });
  } catch (error) {
    console.error(`[LINK PROTECTION ERROR] ${error.message}`);
    return false;
  }
}

async function handleAntilink(m, sock, db) {
  if (!m.isGroup) return false;
  const group = db.getGroup(m.chat) || {};
  if (group.antilink !== "on" && group.antilink !== true) return false;

  const text = m.body || "";
  LINK_REGEX.lastIndex = 0;
  WA_LINK_REGEX.lastIndex = 0;
  const hasLink =
    LINK_REGEX.test(text) ||
    ((WA_LINK_REGEX.lastIndex = 0), WA_LINK_REGEX.test(text));
  LINK_REGEX.lastIndex = 0;
  WA_LINK_REGEX.lastIndex = 0;
  if (!hasLink) return false;

  return handleLinkProtection({
    m,
    sock,
    db,
    group,
    modeKey: "antilinkMode",
    removeMessageKey: "antilink",
    kickMessageKey: "antilinkKick",
  });
}
async function handleAntiStatus(rawMsg, sock, db) {
  const key = rawMsg?.key;
  const originalKey = rawMsg?.__antiStatusOriginalKey || key;
  const chatId = key?.remoteJid || originalKey?.remoteJid;
  if (!chatId?.endsWith("@g.us")) return false;

  const group = db.getGroup(chatId) || {};
  const enabled = group.antistatus === "on" || group.antigroupstatus === "on";
  if (!enabled) return false;

  const msg = rawMsg?.message;
  if (!msg) return false;

  const findStatusType = (node, seen = new WeakSet()) => {
    if (!node || typeof node !== "object") return null;
    if (seen.has(node)) return null;
    seen.add(node);

    const directTypes = [
      "groupStatusMessage",
      "groupStatusMessageV2",
      "groupStatusMessageV3",
      "groupStatusMessageV4",
      "groupStatusMentionMessage",
      "groupStatusMentionMessageV2",
      "groupStatusMentionMessageV3",
      "statusMentionMessage",
      "statusMentionMessageV2",
      "statusMentionMessageV3",
      "groupMentionedMessage",
    ];
    for (const type of directTypes) {
      if (node[type]) return type;
    }
    if (node.contextInfo?.groupMentions?.length) return "groupMentions";

    for (const name of Object.keys(node)) {
      if (/^(?:group.*status.*message|status.*mention|mention.*status)$/i.test(name)) {
        return name;
      }
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === "object") {
        const found = findStatusType(value, seen);
        if (found) return found;
      }
    }
    return null;
  };

  const detectedType = findStatusType(msg);
  if (!detectedType) return false;

  const isRealGroupStatus = /^groupStatusMessage(?:V2|V3|V4)?$/i.test(detectedType);
  const isStatusMention = !isRealGroupStatus;

  const findSenderInNode = (node, seen = new WeakSet()) => {
    if (!node || typeof node !== "object") return null;
    if (seen.has(node)) return null;
    seen.add(node);

    const direct = [
      node.participant,
      node.senderPn,
      node.participantPn,
      node.participantAlt,
      node.sender,
      node.author,
      node.contextInfo?.participant,
      node.contextInfo?.participantPn,
      node.contextInfo?.senderPn,
      node.contextInfo?.participantAlt,
    ].find((v) => typeof v === "string" && v.includes("@"));
    if (direct) return direct;

    for (const [name, value] of Object.entries(node)) {
      if (!value || typeof value !== "object") continue;
      if (/participant|sender|author/i.test(name)) {
        const found = findSenderInNode(value, seen);
        if (found) return found;
      }
    }
    return null;
  };

  const rawSender =
    originalKey?.participant ||
    originalKey?.participantAlt ||
    originalKey?.senderPn ||
    originalKey?.participantPn ||
    key?.participant ||
    key?.participantAlt ||
    key?.senderPn ||
    key?.participantPn ||
    rawMsg?.participant ||
    rawMsg?.sender ||
    findSenderInNode(msg);

  if (key?.fromMe === true || originalKey?.fromMe === true) return false;
  if (!rawSender) return false;
  const antiStatusEventId = originalKey?.id || key?.id;

  try {
    const groupMeta = await sock.groupMetadata(chatId);
    const participants = groupMeta?.participants || [];
    if (!participants.length) return false;

    const senderEntry = findGroupParticipant(participants, rawSender);
    const resolvedSender =
      senderEntry?.jid && !String(senderEntry.jid).endsWith("@lid")
        ? senderEntry.jid
        : senderEntry?.phoneNumber && !String(senderEntry.phoneNumber).endsWith("@lid")
          ? senderEntry.phoneNumber
          : resolveAnyLidToJid(rawSender, participants) ||
            getCachedJid(rawSender) ||
            lidToJidSafe(rawSender) ||
            lidToJid(rawSender) ||
            rawSender;

    // Admin/owner messages are never touched.
    if (
      (senderEntry && isAdminParticipant(senderEntry)) ||
      isAdminCheck(participants, rawSender) ||
      isAdminCheck(participants, resolvedSender)
    ) return false;

    // Resolve bot identity using PN + LID forms before checking admin state.
    const botCandidates = [
      sock.user?.id,
      sock.user?.jid,
      sock.user?.phoneNumber,
      sock.user?.lid,
    ]
      .filter(Boolean)
      .flatMap((value) => {
        const out = [String(value)];
        try {
          const resolved = resolveAnyLidToJid(String(value), participants);
          if (resolved) out.push(resolved);
        } catch {}
        try {
          const cached = getCachedJid(String(value));
          if (cached) out.push(cached);
        } catch {}
        return out;
      });

    if (!botCandidates.some((candidate) => isBotAdminCheck(participants, candidate))) {
      return false;
    }

    if (!claimProtectionEvent(antiStatusEventId, isStatusMention ? "antistatus-mention" : "antistatus")) return false;

    const resolved = resolveAnyLidToJid(resolvedSender, participants) || resolvedSender;
    const participantCandidates = [
      rawSender,
      originalKey?.participant,
      originalKey?.participantAlt,
      originalKey?.senderPn,
      originalKey?.participantPn,
      key?.participant,
      key?.participantAlt,
      key?.senderPn,
      key?.participantPn,
      resolvedSender,
      resolved,
      getCachedJid(rawSender),
    ]
      .filter((v) => typeof v === "string" && v.includes("@"))
      .filter((v, i, arr) => arr.indexOf(v) === i);

    const deleteBase = originalKey?.id ? originalKey : key;
    const deleteKeys = [];

    // Keep the exact key first. Some WhatsApp Group Status events use
    // participantAlt/senderPn instead of participant, and Baileys can still
    // accept the original key. Never discard that key just because one field
    // is missing.
    if (deleteBase?.id) {
      deleteKeys.push({ ...deleteBase, remoteJid: chatId, fromMe: false });
    }

    // Try every known sender identity and explicitly populate both participant
    // and participantAlt variants. This is important for newer LID/PN events.
    for (const participant of participantCandidates) {
      deleteKeys.push({
        ...deleteBase,
        remoteJid: chatId,
        fromMe: false,
        id: deleteBase?.id || key?.id,
        participant,
      });
      deleteKeys.push({
        ...deleteBase,
        remoteJid: chatId,
        fromMe: false,
        id: deleteBase?.id || key?.id,
        participantAlt: participant,
      });
    }

    // Preserve identities already present on the original key.
    for (const field of ['participant', 'participantAlt', 'senderPn', 'participantPn']) {
      const value = deleteBase?.[field];
      if (typeof value === 'string' && value.includes('@')) {
        deleteKeys.push({ ...deleteBase, remoteJid: chatId, fromMe: false, id: deleteBase.id, [field]: value });
      }
    }

    let deleted = false;
    let deleteError = null;
    for (const deleteKey of deleteKeys) {
      if (!deleteKey?.id) continue;
      try {
        await sock.sendMessage(chatId, { delete: deleteKey });
        deleted = true;
        break;
      } catch (error) {
        deleteError = error;
      }
    }

    if (!deleted && deleteBase?.id) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      for (const participant of [resolved, rawSender].filter(Boolean)) {
        try {
          await sock.sendMessage(chatId, {
            delete: {
              ...deleteBase,
              remoteJid: chatId,
              fromMe: false,
              id: deleteBase.id,
              participant,
            },
          });
          deleted = true;
          break;
        } catch (error) {
          deleteError = error;
        }
      }
    }

    if (!deleted) {
      console.error(
        `[AntiStatus] delete failed for ${deleteBase?.id || "unknown"} in ${chatId}:`,
        deleteError?.message || deleteError || "unknown error",
      );
      // Do not send a false warning when WhatsApp rejected the delete.
      protectionEventCache.delete(`${isStatusMention ? "antistatus-mention" : "antistatus"}:${antiStatusEventId}`);
      return false;
    }

    // Status mentions/tags are delete-only. They must not count as warnings.
    if (isStatusMention) return true;

    // Real Group Status: exactly 3 strikes, then remove when kick is enabled.
    const warnings =
      group.antistatusWarnings && typeof group.antistatusWarnings === "object"
        ? { ...group.antistatusWarnings }
        : {};
    const warningKey = String(resolved || rawSender).replace(/[^0-9]/g, "") || String(rawSender);
    const current = Number(warnings[warningKey]) || 0;
    const count = Math.min(current + 1, 3);
    warnings[warningKey] = count;
    db.setGroup(chatId, { ...group, antistatusWarnings: warnings });

    const senderTag = String(resolved || rawSender).split("@")[0];

    if (count >= 3) {
      if (group.antistatusKick !== "off") {
        try {
          await sock.groupParticipantsUpdate(chatId, [resolved], "remove");
          await sock.sendMessage(chatId, {
            text: gpMsg("antistatusKick", { user: senderTag }),
            mentions: [resolved],
          }).catch(() => {});
          delete warnings[warningKey];
          db.setGroup(chatId, { ...group, antistatusWarnings: warnings });
        } catch {
          await sock.sendMessage(chatId, {
            text:
              `⚠ *AntiStatus* — @${senderTag} का 3/3 warning पूरा हो गया।\n` +
              `Member को remove नहीं किया जा सका। Bot को admin + Remove Members permission दें।`,
            mentions: [resolved],
          }).catch(() => {});
        }
      } else {
        await sock.sendMessage(chatId, {
          text: gpMsg("antistatusKick", { user: senderTag }),
          mentions: [resolved],
        }).catch(() => {});
        delete warnings[warningKey];
        db.setGroup(chatId, { ...group, antistatusWarnings: warnings });
      }
      return true;
    }

    await sock.sendMessage(chatId, {
      text: gpMsg("antistatus", { user: senderTag, count }),
      mentions: [resolved],
    }).catch(() => {});

    return true;
  } catch (error) {
    console.error(`[AntiStatus] handler error: ${error?.message || error}`);
    return false;
  }
}

async function handleAntiTagSW(rawMsg, sock, db) {
  const key = rawMsg.key;
  if (!key?.remoteJid) return false;

  const chatId = key.remoteJid;
  if (!chatId.endsWith("@g.us")) return false;

  const group = db.getGroup(chatId) || {};
  if (group.antitagsw !== "on") return false;

  const msg = rawMsg.message;
  if (!msg) return false;

  // Status-tag nodes are often nested inside ephemeral/view-once wrappers.
  // Only checking the top level makes AntiTagSW appear to be ON while it
  // silently misses the actual event. Scan the complete payload.
  const hasStatusTag = (() => {
    const seen = new WeakSet();
    const scan = (node) => {
      if (!node || typeof node !== "object" || seen.has(node)) return false;
      seen.add(node);
      for (const [name, value] of Object.entries(node)) {
        if (name === "groupMentions" && Array.isArray(value) && value.length) return true;
        if (value && typeof value === "object" && /^(?:groupStatusMentionMessage(?:V2|V3)?|statusMentionMessage(?:V2|V3)?|groupMentionedMessage)$/i.test(name)) return true;
        if (value && typeof value === "object" && /^(?:group.*status.*message|status.*mention.*message|mention.*status.*message)$/i.test(name)) return true;
      }
      return Object.values(node).some((value) => value && typeof value === "object" && scan(value));
    };
    return scan(msg);
  })();
  if (!hasStatusTag) return false;

  // Newer WhatsApp/LID messages may keep the sender in senderPn instead of
  // key.participant. Prefer every known sender field before falling back to
  // the group JID (which must never be treated as the member).
  const sender =
    key?.participant ||
    key?.senderPn ||
    key?.participantPn ||
    key?.sender ||
    rawMsg?.participant ||
    rawMsg?.sender ||
    null;
  const botNumber = normalizeComparableJid(
    sock.user?.id?.split(":")[0] + "@s.whatsapp.net",
  );
  if (isSameParticipant(sender, botNumber)) return false;

  try {
    const groupMeta = await sock.groupMetadata(chatId);
    const participants = groupMeta?.participants || [];
    const senderContext = resolveGroupSender(sender, participants);
    const resolvedSender = senderContext.resolvedSender || sender;
    const senderTag = resolvedSender.split("@")[0] || sender.split("@")[0];

    // Admin/owner: never delete their status tag.
    if (isAdminCheck(participants, resolvedSender) || isAdminCheck(participants, sender)) return false;
    if (!isBotAdminCheck(participants, botNumber)) {
      if (claimProtectionEvent(key.id, "antitagsw-notadmin")) {
        await sock.sendMessage(chatId, {
          text: gpMsg("notAdmin"),
          mentions: [resolvedSender],
        });
      }
      return true;
    }

    if (!claimProtectionEvent(key.id, "antitagsw")) return false;

    await sock.sendMessage(chatId, {
      delete: {
        remoteJid: chatId,
        fromMe: false,
        id: key.id,
        participant: resolvedSender,
      },
    });
    return true;
  } catch (error) {
    return false;
  }
}

async function handleAntiViewOnce(rawMsg, sock, db) {
  const key = rawMsg.key;
  if (!key?.remoteJid) return false;

  const chatId = key.remoteJid;
  if (!chatId.endsWith("@g.us")) return false;

  const group = db.getGroup(chatId) || {};
  if (group.antiviewonce !== "on") return false;

  const msg = rawMsg.message;
  if (!msg) return false;

  let innerMsg = null;
  if (msg.viewOnceMessage?.message) innerMsg = msg.viewOnceMessage.message;
  else if (msg.viewOnceMessageV2?.message)
    innerMsg = msg.viewOnceMessageV2.message;
  else if (msg.viewOnceMessageV2Extension?.message)
    innerMsg = msg.viewOnceMessageV2Extension.message;
  if (!innerMsg) return false;

  // Newer WhatsApp/LID messages may keep the sender in senderPn instead of
  // key.participant. Prefer every known sender field before falling back to
  // the group JID (which must never be treated as the member).
  const sender =
    key?.participant ||
    key?.senderPn ||
    key?.participantPn ||
    key?.sender ||
    rawMsg?.participant ||
    rawMsg?.sender ||
    null;
  const botNumber = normalizeComparableJid(
    sock.user?.id?.split(":")[0] + "@s.whatsapp.net",
  );
  if (isSameParticipant(sender, botNumber)) return false;

  try {
    const groupMeta = await sock.groupMetadata(chatId);
    const participants = groupMeta?.participants || [];
    const senderContext = resolveGroupSender(sender, participants);
    const resolvedSender = senderContext.resolvedSender || sender;

    // Admin/owner: never process their view-once media.
    if (isAdminCheck(participants, resolvedSender) || isAdminCheck(participants, sender)) return false;

    let mediaType = null;
    let mediaMsg = null;

    if (innerMsg.imageMessage) {
      mediaType = "image";
      mediaMsg = innerMsg.imageMessage;
    } else if (innerMsg.videoMessage) {
      mediaType = "video";
      mediaMsg = innerMsg.videoMessage;
    } else if (innerMsg.audioMessage) {
      mediaType = "audio";
      mediaMsg = innerMsg.audioMessage;
    }

    if (!mediaType || !mediaMsg) return false;

    const fakeMsg = { key, message: innerMsg };
    const mediaBuffer = await downloadMediaMessage(fakeMsg, "buffer", {});
    if (!mediaBuffer || mediaBuffer.length < 100) return false;

    const caption = mediaMsg.caption || "";
    const senderTag = resolvedSender.split("@")[0] || sender.split("@")[0];
    const headerText = gpMsg("antiviewonce", { user: senderTag });
    const fullCaption = caption ? `${headerText}\n${caption}` : headerText;

    const msgContent = { mentions: [resolvedSender] };

    if (mediaType === "image") {
      msgContent.image = mediaBuffer;
      msgContent.caption = fullCaption;
    } else if (mediaType === "video") {
      msgContent.video = mediaBuffer;
      msgContent.caption = fullCaption;
    } else if (mediaType === "audio") {
      msgContent.audio = mediaBuffer;
      msgContent.mimetype = "audio/mpeg";
    }

    await sock.sendMessage(chatId, msgContent);
    return true;
  } catch (error) {
    return false;
  }
}

async function handleAntiRemove(messageUpdate, sock, db) {
  try {
    const { key, update } = messageUpdate;
    if (!key?.remoteJid) return false;

    const chatId = key.remoteJid;
    if (!chatId.endsWith("@g.us")) return false;

    const group = db.getGroup(chatId) || {};
    if (group.antiremove !== "on") return false;

    const messageStubType = update?.messageStubType;
    if (messageStubType !== 1 && messageStubType !== 132) return false;

    const deletedMsgId = key.id;
    const cached = getCachedMessage(deletedMsgId);
    if (!cached) {
      const storeMsg = sock.store?.messages?.get?.(chatId)?.get?.(deletedMsgId);
      if (storeMsg?.message) {
        const storeData = {
          key: { ...storeMsg.key },
          message: JSON.parse(JSON.stringify(storeMsg.message)),
          messageTimestamp: storeMsg.messageTimestamp,
          pushName: storeMsg.pushName,
        };
        cacheMessage(deletedMsgId, storeData, null);
        return handleAntiRemove(messageUpdate, sock, db);
      }
      return false;
    }
    let originalSender =
      update?.key?.participant ||
      key.participant ||
      (key.fromMe ? sock.user?.id : chatId);
    if (isLid(originalSender)) {
      const safe = lidToJidSafe(originalSender);
      originalSender = safe || lidToJid(originalSender);
    }
    const senderTag = originalSender?.split("@")[0] || "Unknown";

    const headerText = gpMsg("antiremove", { user: senderTag });

    const headerMsg = await sock.sendMessage(chatId, {
      text: headerText,
      mentions: originalSender?.includes("@") ? [originalSender] : [],
    });

    try {
      const msgContent = cached.message?.message || cached.message;
      if (msgContent) {
        const contentKeys = Object.keys(msgContent).filter(
          (k) => k !== "messageContextInfo",
        );
        const msgType = contentKeys[0];

        if (
          msgType === "conversation" &&
          typeof msgContent.conversation === "string"
        ) {
          await sock.sendMessage(
            chatId,
            { text: msgContent.conversation },
            { quoted: headerMsg },
          );
        } else if (
          msgType === "extendedTextMessage" &&
          msgContent.extendedTextMessage?.text
        ) {
          const ext = msgContent.extendedTextMessage;
          await sock.sendMessage(
            chatId,
            { text: ext.text, contextInfo: ext.contextInfo },
            { quoted: headerMsg },
          );
        } else if (
          msgType === "imageMessage" ||
          msgType === "videoMessage" ||
          msgType === "documentMessage" ||
          msgType === "audioMessage" ||
          msgType === "stickerMessage"
        ) {
          const { downloadMediaMessage } = await import("@whiskeysockets/baileys");
          const fakeMsg = {
            key: cached.key,
            message: { [msgType]: msgContent[msgType] },
          };
          const buffer = await downloadMediaMessage(
            fakeMsg,
            "buffer",
            {},
            { logger: console, reuploadRequest: sock.updateMediaMessage },
          );
          if (buffer) {
            const sendContent = {};
            if (msgType === "imageMessage")
              Object.assign(sendContent, {
                image: buffer,
                caption: msgContent[msgType].caption || "",
              });
            else if (msgType === "videoMessage")
              Object.assign(sendContent, {
                video: buffer,
                caption: msgContent[msgType].caption || "",
              });
            else if (msgType === "documentMessage")
              Object.assign(sendContent, {
                document: buffer,
                fileName: msgContent[msgType].fileName || "file",
                mimetype: msgContent[msgType].mimetype,
              });
            else if (msgType === "audioMessage")
              Object.assign(sendContent, {
                audio: buffer,
                mimetype: msgContent[msgType].mimetype || "audio/mp3",
              });
            else if (msgType === "stickerMessage")
              Object.assign(sendContent, { sticker: buffer });
            await sock.sendMessage(chatId, sendContent, { quoted: headerMsg });
          }
        } else {
          const { generateWAMessageFromContent } = await import("@whiskeysockets/baileys");
          const cleanContent = {};
          for (const k of contentKeys) {
            if (typeof msgContent[k] === "object" && msgContent[k] !== null) {
              cleanContent[k] = msgContent[k];
            }
          }
          if (Object.keys(cleanContent).length > 0) {
            const forwarded = generateWAMessageFromContent(
              chatId,
              cleanContent,
              {
                userJid: sock.user?.id,
              },
            );
            await sock.relayMessage(chatId, forwarded.message, {
              messageId: forwarded.key.id,
            });
          }
        }
      }
    } catch (e) {
      try {
        const msgContent = cached.message?.message || cached.message;
        const msgType = Object.keys(msgContent || {}).filter(
          (k) => k !== "messageContextInfo",
        )[0];
        if (msgType === "conversation") {
          await sock.sendMessage(
            chatId,
            { text: msgContent.conversation },
            { quoted: headerMsg },
          );
        } else if (msgType === "extendedTextMessage") {
          await sock.sendMessage(
            chatId,
            {
              text: msgContent.extendedTextMessage?.text || "[deleted message]",
            },
            { quoted: headerMsg },
          );
        } else {
          await sock.sendMessage(
            chatId,
            { text: "[AntiDelete] মেসেজ মুছে ফেলা হয়েছে (tipe: " + msgType + ")" },
            { quoted: headerMsg },
          );
        }
      } catch (e2) {}
    }

    deleteCachedMessage(deletedMsgId);
    return true;
  } catch (error) {
    return false;
  }
}

async function handleAntiRemoveFromUpsert(msg, sock, db) {
  try {
    const chatId = msg.key?.remoteJid;
    if (!chatId?.endsWith("@g.us")) return false;

    const group = db.getGroup(chatId) || {};
    if (group.antiremove !== "on") return false;

    if (msg.messageStubType !== 1 && msg.messageStubType !== 132) return false;

    const deletedMsgId = msg.key?.id;
    if (!deletedMsgId) return false;

    const cached = getCachedMessage(deletedMsgId);
    if (!cached) return false;

    let deleterJid =
      msg.key?.participant || (msg.key?.fromMe ? sock.user?.id : chatId);
    if (isLid(deleterJid)) {
      const safe = lidToJidSafe(deleterJid);
      deleterJid = safe || lidToJid(deleterJid);
    }
    const deleterTag = deleterJid?.split("@")[0] || "Unknown";

    const headerText = gpMsg("antiremove", { user: deleterTag });

    const headerMsg = await sock.sendMessage(chatId, {
      text: headerText,
      mentions: deleterJid?.includes("@") ? [deleterJid] : [],
    });

    try {
      const msgContent = cached.message?.message || cached.message;
      if (msgContent) {
        const contentKeys = Object.keys(msgContent).filter(
          (k) => k !== "messageContextInfo",
        );
        const msgType = contentKeys[0];

        if (
          msgType === "conversation" &&
          typeof msgContent.conversation === "string"
        ) {
          await sock.sendMessage(
            chatId,
            { text: msgContent.conversation },
            { quoted: headerMsg },
          );
        } else if (
          msgType === "extendedTextMessage" &&
          msgContent.extendedTextMessage?.text
        ) {
          const ext = msgContent.extendedTextMessage;
          await sock.sendMessage(
            chatId,
            { text: ext.text, contextInfo: ext.contextInfo },
            { quoted: headerMsg },
          );
        } else if (
          msgType === "imageMessage" ||
          msgType === "videoMessage" ||
          msgType === "documentMessage" ||
          msgType === "audioMessage" ||
          msgType === "stickerMessage"
        ) {
          const { downloadMediaMessage } = await import("@whiskeysockets/baileys");
          const fakeMsg = {
            key: cached.key,
            message: { [msgType]: msgContent[msgType] },
          };
          const buffer = await downloadMediaMessage(
            fakeMsg,
            "buffer",
            {},
            { logger: console, reuploadRequest: sock.updateMediaMessage },
          );
          if (buffer) {
            const sendContent = {};
            if (msgType === "imageMessage")
              Object.assign(sendContent, {
                image: buffer,
                caption: msgContent[msgType].caption || "",
              });
            else if (msgType === "videoMessage")
              Object.assign(sendContent, {
                video: buffer,
                caption: msgContent[msgType].caption || "",
              });
            else if (msgType === "documentMessage")
              Object.assign(sendContent, {
                document: buffer,
                fileName: msgContent[msgType].fileName || "file",
                mimetype: msgContent[msgType].mimetype,
              });
            else if (msgType === "audioMessage")
              Object.assign(sendContent, {
                audio: buffer,
                mimetype: msgContent[msgType].mimetype || "audio/mp3",
              });
            else if (msgType === "stickerMessage")
              Object.assign(sendContent, { sticker: buffer });
            await sock.sendMessage(chatId, sendContent, { quoted: headerMsg });
          }
        } else {
          const { generateWAMessageFromContent } = await import("@whiskeysockets/baileys");
          const cleanContent = {};
          for (const k of contentKeys) {
            if (typeof msgContent[k] === "object" && msgContent[k] !== null) {
              cleanContent[k] = msgContent[k];
            }
          }
          if (Object.keys(cleanContent).length > 0) {
            const forwarded = generateWAMessageFromContent(
              chatId,
              cleanContent,
              { userJid: sock.user?.id },
            );
            await sock.relayMessage(chatId, forwarded.message, {
              messageId: forwarded.key.id,
            });
          }
        }
      }
    } catch (e) {}

    deleteCachedMessage(deletedMsgId);
    return true;
  } catch (error) {
    return false;
  }
}

async function cacheMessageForAntiRemove(m, sock, db) {
  if (!m.isGroup) return;

  const group = db.getGroup(m.chat) || {};
  if (group.antiremove !== "on") return;

  try {
    const msgType = m.type;
    if (!msgType) return;
    if (
      msgType.includes("protocolMessage") ||
      msgType.includes("senderKeyDistribution") ||
      msgType.includes("reactionMessage")
    )
      return;

    const msgId = m.key?.id;
    if (!msgId) return;

    const rawMsg = {
      key: { ...m.key },
      message: JSON.parse(JSON.stringify(m.message || {})),
      messageTimestamp: m.messageTimestamp,
      pushName: m.pushName,
    };

    cacheMessage(msgId, rawMsg, null);
  } catch {}
}

const WA_SPECIFIC_PATTERNS = [
  /chat\.whatsapp\.com\/[A-Za-z0-9]+/gi,
  /wa\.me\/[0-9+]+/gi,
  /whatsapp\.com\/channel\/[A-Za-z0-9]+/gi,
  /whatsapp\.com\/c\/[A-Za-z0-9]+/gi,
  /api\.whatsapp\.com\/send/gi,
];

const ALL_LINK_PATTERN =
  /(?:(?:https?:\/\/)|(?:www\.))?[^\s<>"{}|\\^`[\]]+\.(?:com|net|org|io|id|co|cc|me|ly|gg|gl|it|tv|ru|de|fr|uk|us|info|biz|xyz|top|site|online|store|app|dev|ai|link|click|fun|space|live|world|tech|digital|cloud|pro|vip|pw|tk|ml|ga|cf|gq|club|mobi|name|asia|tel|wang|win|bid|loan|ren|ink|art|shop|life|game|news|blog|design|studio|photo|press|media|social|group|team|community|domain)(?:\/[^\s<>"{}|\\^`[\]]*)?/gi;

function containsWaSpecificLink(text) {
  if (!text) return { hasLink: false, link: null };
  for (const pattern of WA_SPECIFIC_PATTERNS) {
    pattern.lastIndex = 0;
    const match = text.match(pattern);
    if (match) return { hasLink: true, link: match[0] };
  }
  return { hasLink: false, link: null };
}

function containsAnyLink(text) {
  if (!text) return { hasLink: false, link: null, links: [] };
  ALL_LINK_PATTERN.lastIndex = 0;
  const matches = text.match(ALL_LINK_PATTERN);
  if (matches && matches.length > 0) {
    return { hasLink: true, link: matches[0], links: matches };
  }
  return { hasLink: false, link: null, links: [] };
}

async function handleAntilinkGc(m, sock, db) {
  if (!m.isGroup) return false;
  const group = db.getGroup(m.chat) || {};
  if (group.antilinkgc !== "on") return false;

  const text = m.body || "";
  const { hasLink } = containsWaSpecificLink(text);
  if (!hasLink) return false;

  return handleLinkProtection({
    m,
    sock,
    db,
    group,
    modeKey: "antilinkgcMode",
    removeMessageKey: "antilinkGc",
    kickMessageKey: "antilinkGcKick",
  });
}
async function handleAntilinkAll(m, sock, db) {
  if (!m.isGroup) return false;
  const group = db.getGroup(m.chat) || {};
  if (group.antilinkall !== "on") return false;

  const text = m.body || "";
  const { hasLink } = containsAnyLink(text);
  if (!hasLink) return false;

  return handleLinkProtection({
    m,
    sock,
    db,
    group,
    modeKey: "antilinkallMode",
    removeMessageKey: "antilinkAll",
    kickMessageKey: "antilinkAllKick",
  });
}
async function handleAntiJudol(m, sock, db) {
  return handleTextProtection({
    m,
    sock,
    db,
    toggleKey: "antijudol",
    modeKey: "antijudolMode",
    removeMessageKey: "antijudol",
    kickMessageKey: "antijudolKick",
    detector: detectJudol,
  });
}

async function handleAntiPhising(m, sock, db) {
  return handleTextProtection({
    m,
    sock,
    db,
    toggleKey: "antiphishing",
    modeKey: "antiphishingMode",
    removeMessageKey: "antiphishing",
    kickMessageKey: "antiphishingKick",
    detector: detectPhishing,
  });
}

async function handleAntiCustom(m, sock, db) {
  if (!m.isGroup) return false;

  const group = db.getGroup(m.chat) || {};
  if (group.anticustom !== "on") return false;

  const text = getProtectionText(m);
  const rule = matchCustomRule(text, group.anticustomRules || []);
  if (!rule) return false;

  const botNumber = sock.user?.id?.split(":")[0] + "@s.whatsapp.net";
  const selfMode = db.setting("selfMode") === true;
  if (!selfMode && m.sender === botNumber) return false;

  try {
    const groupMeta = await sock.groupMetadata(m.chat);
    const participants = groupMeta?.participants || [];
    const senderContext = resolveGroupSender(m.sender, participants);
    const sender = senderContext.resolvedSender || m.sender;
    const senderTag = sender.split("@")[0] || String(m.sender || "").split("@")[0];

    if (isAdminCheck(participants, sender) || isAdminCheck(participants, m.sender)) return false;
    if (!isBotAdminCheck(participants, botNumber)) {
      await sock.sendMessage(m.chat, {
        text: gpMsg("notAdmin"),
        mentions: [sender],
      });
      return true;
    }

    const mode = normalizeProtectionMode(
      rule.action || group.anticustomMode,
      "remove",
    );
    return executeProtectionAction({
      sock,
      chatId: m.chat,
      keyId: m.key.id || m.id,
      sender: m.sender,
      resolvedSender: sender,
      senderTag,
      mode,
      removeMessageKey: "anticustom",
      kickMessageKey: "anticustomKick",
      replacements: {
        rule: rule.name || rule.pattern || "custom-rule",
      },
    });
  } catch {
    return false;
  }
}

async function handleAntiSwGc(rawMsg, sock, db) {
  const key = rawMsg?.key;
  const originalKey = rawMsg?.__antiSwGcOriginalKey || key;
  const chatId = key?.remoteJid || originalKey?.remoteJid;
  if (!chatId?.endsWith("@g.us")) return false;

  const group = db.getGroup(chatId) || {};
  if (group.antiswgc !== "on" && group.antiswgc !== true) return false;

  const detectedType = detectSwGcType(rawMsg);
  if (!detectedType) return false;
  const antiSwGcEventId = originalKey?.id || key?.id;

  /*
   * WhatsApp has started mixing PN/LID identities in Group Status events.
   * In some events key.participant is missing while senderPn/participantPn
   * or a nested contextInfo.participant contains the real sender.
   * Never fall back to the group JID as the sender: that makes delete fail.
   */
  const findSenderInNode = (node, seen = new WeakSet()) => {
    if (!node || typeof node !== "object") return null;
    if (seen.has(node)) return null;
    seen.add(node);

    const direct = [
      node.participant,
      node.senderPn,
      node.participantPn,
      node.sender,
      node.author,
      node.contextInfo?.participant,
      node.contextInfo?.participantPn,
      node.contextInfo?.senderPn,
    ].find((v) => typeof v === "string" && v.includes("@"));
    if (direct) return direct;

    for (const [name, value] of Object.entries(node)) {
      if (!value || typeof value !== "object") continue;
      if (/participant|sender|author/i.test(name)) {
        const found = findSenderInNode(value, seen);
        if (found) return found;
      }
    }
    return null;
  };

  const rawSender =
    originalKey?.participant ||
    originalKey?.participantAlt ||
    originalKey?.senderPn ||
    originalKey?.participantPn ||
    key?.participant ||
    key?.participantAlt ||
    key?.senderPn ||
    key?.participantPn ||
    rawMsg?.participant ||
    rawMsg?.sender ||
    findSenderInNode(rawMsg?.message);

  // fromMe must never be deleted by AntiSWGC.
  if (key?.fromMe === true) return false;
  if (!rawSender) return false;

  try {
    const groupMeta = await sock.groupMetadata(chatId);
    const participants = groupMeta?.participants || [];
    if (!participants.length) return false;

    // Cache LID -> phone mappings from the current metadata before resolving.
    const senderEntry = findGroupParticipant(participants, rawSender);
    const resolvedSender =
      senderEntry?.jid && !String(senderEntry.jid).endsWith("@lid")
        ? senderEntry.jid
        : senderEntry?.phoneNumber && !String(senderEntry.phoneNumber).endsWith("@lid")
          ? senderEntry.phoneNumber
          : resolveAnyLidToJid(rawSender, participants) ||
            getCachedJid(rawSender) ||
            lidToJidSafe(rawSender) ||
            lidToJid(rawSender) ||
            rawSender;

    const senderIsAdmin = senderEntry
      ? isAdminParticipant(senderEntry)
      : isAdminCheck(participants, rawSender) ||
        isAdminCheck(participants, resolvedSender);

    // Admin/owner messages are protected from AntiSWGC.
    if (senderIsAdmin) return false;

    // Resolve the bot identity using both PN and LID forms. The previous
    // code only checked sock.user.id, which can be a LID on newer accounts.
    const botCandidates = [
      sock.user?.id,
      sock.user?.jid,
      sock.user?.phoneNumber,
      sock.user?.lid,
    ]
      .filter(Boolean)
      .flatMap((value) => {
        const out = [String(value)];
        try {
          const resolved = resolveAnyLidToJid(String(value), participants);
          if (resolved) out.push(resolved);
        } catch {}
        try {
          const cached = getCachedJid(String(value));
          if (cached) out.push(cached);
        } catch {}
        return out;
      });

    const botIsAdmin = botCandidates.some((candidate) =>
      isBotAdminCheck(participants, candidate),
    );

    if (!botIsAdmin) {
      // Do not claim deletion happened when WhatsApp will reject it.
      return false;
    }

    if (!claimProtectionEvent(antiSwGcEventId, "antiswgc")) return false;

    const resolved = resolveAnyLidToJid(resolvedSender, participants) || resolvedSender;
    const participantCandidates = [
      rawSender,
      key?.participant,
      key?.senderPn,
      key?.participantPn,
      resolvedSender,
      resolved,
      getCachedJid(rawSender),
    ]
      .filter((v) => typeof v === "string" && v.includes("@"))
      .filter((v, i, arr) => arr.indexOf(v) === i);

    const deleteKeys = [];
    const deleteBase = originalKey?.id ? originalKey : key;

    // Exact ORIGINAL received key must be tried first. It may contain only
    // participantAlt/senderPn on newer WhatsApp LID events.
    if (deleteBase?.id) {
      deleteKeys.push({ ...deleteBase, remoteJid: chatId, fromMe: false });
    }

    for (const participant of participantCandidates) {
      deleteKeys.push({
        ...deleteBase,
        remoteJid: chatId,
        fromMe: false,
        id: deleteBase?.id || key?.id,
        participant,
      });
      deleteKeys.push({
        ...deleteBase,
        remoteJid: chatId,
        fromMe: false,
        id: deleteBase?.id || key?.id,
        participantAlt: participant,
      });
    }

    for (const field of ['participant', 'participantAlt', 'senderPn', 'participantPn']) {
      const value = deleteBase?.[field];
      if (typeof value === 'string' && value.includes('@')) {
        deleteKeys.push({ ...deleteBase, remoteJid: chatId, fromMe: false, id: deleteBase.id, [field]: value });
      }
    }

    let deleted = false;
    let deleteError = null;
    for (const deleteKey of deleteKeys) {
      if (!deleteKey?.id) continue;
      try {
        await sock.sendMessage(chatId, { delete: deleteKey });
        deleted = true;
        break;
      } catch (error) {
        deleteError = error;
      }
    }

    if (!deleted) {
      // Last fallback: Baileys accepts the compact delete object on some
      // versions. Still provide a real participant, never the group JID.
      const participant = resolved || rawSender;
      if (key?.id && participant && participant.includes("@")) {
        try {
          await sock.sendMessage(chatId, {
            delete: {
              ...deleteBase,
              remoteJid: chatId,
              fromMe: false,
              id: deleteBase.id,
              participant,
            },
          });
          deleted = true;
        } catch (error) {
          deleteError = error;
        }
      }
    }

    if (!deleted) {
      console.error(
        `[AntiSWGC] delete failed: ${deleteError?.message || "unknown error"}`,
      );
      protectionEventCache.delete(`antiswgc:${antiSwGcEventId}`);
      return false;
    }

    const senderTag = String(resolved || rawSender).split("@")[0];
    await sock.sendMessage(chatId, {
      text: gpMsg("antiswgc", { user: senderTag, type: detectedType }),
      mentions: resolved?.includes("@") ? [resolved] : [],
    }).catch(() => {});

    return true;
  } catch (error) {
    console.error(`[AntiSWGC] handler error: ${error?.message || error}`);
    return false;
  }
}

async function handleAntiHidetag(m, sock, db) {
  if (!m.isGroup) return false;

  const group = db.getGroup(m.chat) || {};
  if (group.antihidetag !== "on") return false;

  if (!m.mentionedJid || m.mentionedJid.length === 0) return false;

  try {
    const groupMetadata = await sock.groupMetadata(m.chat);
    const participants = groupMetadata.participants || [];

    if (m.mentionedJid.length < participants.length) return false;

    const botNumber = normalizeComparableJid(
      sock.user?.id?.split(":")[0] + "@s.whatsapp.net",
    );
    const senderContext = resolveGroupSender(m.sender, participants);
    const resolvedSender = senderContext.resolvedSender || m.sender;

    if (m.fromMe || isSameParticipant(resolvedSender, botNumber)) return false;
    if (isAdminCheck(participants, resolvedSender) || isAdminCheck(participants, m.sender)) return false;
    if (!isBotAdminCheck(participants, botNumber)) return false;

    await sock.sendMessage(m.chat, {
      delete: {
        remoteJid: m.chat,
        fromMe: false,
        id: m.key.id,
        participant: resolvedSender,
      },
    });

    const senderTag = resolvedSender.split("@")[0];
    await sock.sendMessage(m.chat, {
      text: gpMsg("antihidetag", { user: senderTag }),
      mentions: [resolvedSender],
    });

    return true;
  } catch (e) {
    return false;
  }
}

export {
  claimProtectionEvent,
  handleAntilink,
  handleAntiTagSW,
  handleAntiStatus,
  handleAntiSwGc,
  handleAntiJudol,
  handleAntiPhising,
  handleAntiCustom,
  handleAntiViewOnce,
  handleAntiRemove,
  handleAntiRemoveFromUpsert,
  cacheMessageForAntiRemove,
  handleAntilinkGc,
  handleAntilinkAll,
  handleAntiHidetag,
};
