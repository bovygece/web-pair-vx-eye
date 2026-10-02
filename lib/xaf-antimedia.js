import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB = path.join(__dirname, '../data/userGroupData.json');

function load() {
  try {
    if (!fs.existsSync(DB)) return {};
    return JSON.parse(fs.readFileSync(DB, 'utf8')) || {};
  } catch (_) {
    return {};
  }
}

function save(data) {
  fs.mkdirSync(path.dirname(DB), { recursive: true });
  fs.writeFileSync(DB, JSON.stringify(data, null, 2));
}

function setAntiMedia(groupId, enabled) {
  const data = load();

  if (!data.antimedia) {
    data.antimedia = {};
  }

  data.antimedia[groupId] = !!enabled;

  save(data);
  return true;
}

function isAntiMediaOn(groupId) {
  const data = load();
  return data.antimedia?.[groupId] === true;
}

function getMessageContent(message) {
  let content = message?.message || {};

  for (let i = 0; i < 5; i++) {
    if (content.ephemeralMessage?.message) {
      content = content.ephemeralMessage.message;
    } else if (content.viewOnceMessage?.message) {
      content = content.viewOnceMessage.message;
    } else if (content.viewOnceMessageV2?.message) {
      content = content.viewOnceMessageV2.message;
    } else if (content.documentWithCaptionMessage?.message) {
      content = content.documentWithCaptionMessage.message;
    } else {
      break;
    }
  }

  return content;
}

function isProtectedMediaMessage(message) {
  const content = getMessageContent(message);

  if (!content) return false;

  // 📷 PHOTO
  if (content.imageMessage) {
    return {
      type: 'photo',
      warning:
        '📷 *ছবি পাঠাবেন না, এই গ্রুপে ছবি পাঠানো অনুমতি নেই*'
    };
  }

  // 🎥 VIDEO
  if (content.videoMessage) {
    return {
      type: 'video',
      warning:
        '🎥 *ভিডিও পাঠাবেন না, এই গ্রুপে ভিডিও পাঠানো অনুমতি নেই*'
    };
  }

  // 🧩 STICKER
  if (content.stickerMessage) {
    return {
      type: 'sticker',
      warning:
        '🧩 *স্টিকার পাঠাবেন না, এই গ্রুপে স্টিকার পাঠানো অনুমতি নেই*'
    };
  }

  // 🎵 AUDIO
  if (content.audioMessage) {
    return {
      type: 'audio',
      warning:
        '🎵 *অডিও/মিডিয়া পাঠাবেন না, এই গ্রুপে মিডিয়া পাঠানো অনুমতি নেই*'
    };
  }

  // 📄 DOCUMENT
  if (content.documentMessage) {
    return {
      type: 'document',
      warning:
        '📄 *ডকুমেন্ট/মিডিয়া পাঠাবেন না, এই গ্রুপে মিডিয়া পাঠানো অনুমতি নেই*'
    };
  }

  // 🎞️ GIF
  if (content.gifMessage) {
    return {
      type: 'gif',
      warning:
        '🎞️ *GIF/মিডিয়া পাঠাবেন না, এই গ্রুপে মিডিয়া অনুমতি নেই*'
    };
  }

  return false;
}

async function handleAntiMedia(sock, message) {
  const groupId = message?.key?.remoteJid;

  if (!groupId?.endsWith('@g.us')) {
    return false;
  }

  if (message?.key?.fromMe) {
    return false;
  }

  if (!isAntiMediaOn(groupId)) {
    return false;
  }

  const detected = isProtectedMediaMessage(message);

  if (!detected) {
    return false;
  }

  try {
    // Reply/quote the original media message so the warning is tappable and
    // clearly points to the member who sent the forbidden media.
    const sender = message.key.participant || message.participant || '';
    const mention = sender ? `\n👤 @${sender.split('@')[0]}` : '';
    await sock.sendMessage(groupId, {
      text: `${detected.warning}${mention}`,
      mentions: sender ? [sender] : []
    }, { quoted: message }).catch(() => {});

    // Delete the protected media after the warning is posted.
    await sock.sendMessage(groupId, {
      delete: message.key
    });

    return true;

  } catch (error) {
    console.error(
      `Anti-media delete failed (${detected.type}):`,
      error?.message || error
    );

    return false;
  }
}

export {
  setAntiMedia,
  isAntiMediaOn,
  isProtectedMediaMessage,
  handleAntiMedia
};
