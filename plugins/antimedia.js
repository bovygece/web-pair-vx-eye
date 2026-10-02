import { Module } from "../lib/plugins.js";
import {
  setAntiMedia,
  isAntiMediaOn,
  handleAntiMedia
} from "../lib/xaf-antimedia.js";

// Group admin check
async function admin(m) {
  if (!m.isGroup) {
    await m.send('❌ This command can only be used in groups.');
    return false;
  }

  await m.loadGroupInfo();

  if (!m.isAdmin && !m.isFromMe) {
    await m.send('❌ Only group admins can use this command.');
    return false;
  }

  return true;
}

// ===============================
// ANTI MEDIA COMMAND
// ===============================
Module({
  command: 'antimedia',
  aliases: ['antimediagroup'],
  package: 'group',
  description: 'Block photo, video, sticker, document and audio'
})(async (m, args = '') => {

  if (!(await admin(m))) return;

  const a = String(args).trim().toLowerCase();

  if (a === 'on') {
    setAntiMedia(m.from, true);

    return m.send(
      '🛡️ Anti Media ON\n\n' +
      '📷 Photo • 🎥 Video • 🧩 Sticker • 📄 Document • 🎵 Audio\n' +
      'will be deleted with a warning.'
    );
  }

  if (a === 'off') {
    setAntiMedia(m.from, false);

    return m.send('❌ Anti Media OFF');
  }

  return m.send(
    `🛡️ Anti Media: ${isAntiMediaOn(m.from) ? 'ON' : 'OFF'}\n\n` +
    'Use:\n' +
    '.antimedia on\n' +
    '.antimedia off'
  );
});


// ===============================
// ANTI MEDIA PROTECTION
// ===============================
Module({
  on: 'message',
  name: 'anti-media-protection',
  package: 'protection',
  description: 'Anti media handler'
})(async (m) => {

  // Group में ही काम करेगा
  if (!m.isGroup) return;

  // Group information load करें
  try {
    await m.loadGroupInfo();
  } catch (e) {
    return;
  }

  // ==========================================
  // IMPORTANT:
  // BOT ADMIN नहीं है तो कुछ भी मत करो
  // ना delete, ना warning, ना message
  // ==========================================
  if (!m.isBotAdmin && !m.isFromMe) return;

  // Anti Media OFF है तो कुछ नहीं करना
  if (!isAntiMediaOn(m.from)) return;

  // Supported media types
  const mediaTypes = [
    'imageMessage',
    'videoMessage',
    'stickerMessage',
    'audioMessage',
    'documentMessage',
    'gifMessage'
  ];

  // Media नहीं है तो कुछ नहीं करना
  if (!mediaTypes.includes(m.type)) return;

  // ==========================================
  // BOT ADMIN है + ANT MEDIA ON है
  // तभी delete/warning handler चलेगा
  // ==========================================
  try {
    await handleAntiMedia(m.conn, m.raw);
  } catch (e) {
    console.error('[AntiMedia Error]', e);
  }
});
