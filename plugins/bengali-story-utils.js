/* বাংলা গল্প ফিচারের সাধারণ helper — সব গল্প text-only, sticker নয়। */

const lastIndexByGroup = new Map();

export function pickNewStory(message, stories) {
  if (!Array.isArray(stories) || !stories.length) return "আজকের জন্য কোনো গল্প পাওয়া গেল না।";

  const key = String(message?.from || "global");
  const previous = lastIndexByGroup.get(key);
  let index = Math.floor(Math.random() * stories.length);

  if (stories.length > 1 && index === previous) {
    index = (index + 1 + Math.floor(Math.random() * (stories.length - 1))) % stories.length;
  }

  lastIndexByGroup.set(key, index);
  return stories[index];
}

export function storyReply(title, story, searchTerm) {
  const q = encodeURIComponent(searchTerm || title);
  const more = `https://bn.wikipedia.org/w/index.php?search=${q}`;
  return `╭━━━〔 📖 ${title} 〕━━━╮\n\n${story}\n\n🔎 আরও পড়ুন: ${more}\n╰━━━━━━━━━━━━━━━━━━╯`;
}

export async function groupOnly(message) {
  if (!message.isGroup) {
    await message.send("❌ এই গল্পের ফিচারটি শুধু গ্রুপে ব্যবহার করা যাবে।");
    return false;
  }
  return true;
}
