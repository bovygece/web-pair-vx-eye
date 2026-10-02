import { Module } from "../lib/plugins.js";

const botStartTime = Date.now();

Module({
  command: "ping",
  package: "mics",
  description: "Replies with the bot latency and uptime",
})(async (message) => {
  const start = Date.now();

  const emojis = [
    "⛅", "👻", "⛄", "👀", "🪁", "🪃", "🎳", "🎀",
    "🌸", "🍥", "🍓", "🍡", "💗", "🦋", "💫", "💀",
    "☁️", "🌨️", "🌧️", "🌦️", "🌥️", "⚡", "🌟",
    "🎐", "🏖️", "🌊", "🐚", "🪸", "🍒", "🍇",
    "🍉", "🌻", "🎢", "🚀", "🍫", "💎", "🌋",
    "🏔️", "⛰️", "🌙", "🪐", "🌲", "🍃", "🍂",
    "🍁", "🪵", "🍄", "🌿", "🐞", "🐍", "🕊️",
    "🎃", "🏟️", "🎡", "🥂", "🗿", "⛩️",
  ];

  const emoji = emojis[Math.floor(Math.random() * emojis.length)];

  await message.react(emoji);

  const latency = Date.now() - start;

  // Bot uptime
  const uptime = Date.now() - botStartTime;

  const seconds = Math.floor(uptime / 1000) % 60;
  const minutes = Math.floor(uptime / (1000 * 60)) % 60;
  const hours = Math.floor(uptime / (1000 * 60 * 60)) % 24;
  const days = Math.floor(uptime / (1000 * 60 * 60 * 24));

  await message.conn.sendMessage(
    message.from,
    {
      text: `*${emoji} ᎮoŇᎶ: ${latency} ๓Ş*

*⏱️ Uptime: ${days} দিন ${hours} ঘণ্টা ${minutes} মিনিট ${seconds} সেকেন্ড*`,
      contextInfo: {
        mentionedJid: [message.sender],
      },
    },
    { quoted: message.gift }
  );
});
