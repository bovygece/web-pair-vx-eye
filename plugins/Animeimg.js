import axios from "axios";
import { Module } from "../lib/plugins.js";

const WAIFU = "https://api.waifu.pics/sfw";
const WAIFU_IM = "https://api.waifu.im/images";
const ANIMECHAN = "https://api.animechan.io/v1";
const JIKAN = "https://api.jikan.moe/v4";

async function getJson(url, options = {}, retries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await axios.get(url, {
        timeout: 20000,
        headers: { "User-Agent": "VX-MD-BOT/1.0" },
        ...options,
      });
      return response.data;
    } catch (error) {
      lastError = error;
      const status = error?.response?.status;
      if (![408, 429, 500, 502, 503, 504].includes(status)) break;
      await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function sendImage(message, url, caption) {
  if (!url) throw new Error("No image URL returned");
  return message.conn.sendMessage(message.from, {
    image: { url },
    caption,
  });
}

async function waifuImage(category) {
  const data = await getJson(`${WAIFU}/${encodeURIComponent(category)}`);
  if (!data?.url) throw new Error(`No ${category} image returned`);
  return data.url;
}

async function waifuImImage(tag) {
  const data = await getJson(WAIFU_IM, {
    params: {
      IncludedTags: tag,
      IsNsfw: "False",
      PageSize: 1,
    },
  });
  const url = data?.items?.[0]?.url;
  if (!url) throw new Error(`No ${tag} image returned`);
  return url;
}

async function sendAnimeApiError(message, error) {
  const status = error?.response?.status;
  const detail =
    error?.response?.data?.message ||
    error?.response?.data?.detail ||
    error?.message ||
    "Unknown error";
  console.error("[anime]", error);
  await message.send(
    status
      ? `❌ Anime API error (${status}): ${detail}`
      : `❌ Anime service unavailable: ${detail}`
  );
}

// SFW anime image. Kept under the old command name for compatibility.
Module({
  command: "loli",
  package: "anime",
  description: "Get a SFW anime image",
})(async (message) => {
  try {
    const url = await waifuImage("waifu");
    await sendImage(message, url, "> SFW anime image 💫");
  } catch (e) {
    await sendAnimeApiError(message, e);
  }
});

Module({
  command: "waifu",
  package: "anime",
  description: "Download Waifu Anime Images",
})(async (message) => {
  try {
    const url = await waifuImage("waifu");
    await sendImage(message, url, "> Here is your waifu anime image! 💫");
  } catch (e) {
    await sendAnimeApiError(message, e);
  }
});

Module({
  command: "neko",
  package: "anime",
  description: "Download Neko Anime Images",
})(async (message) => {
  try {
    const url = await waifuImage("neko");
    await sendImage(message, url, "> Here is your neko anime image! 🐱");
  } catch (e) {
    await sendAnimeApiError(message, e);
  }
});

Module({
  command: "megumin",
  package: "anime",
  description: "Download Megumin Anime Images",
})(async (message) => {
  try {
    const url = await waifuImage("megumin");
    await sendImage(message, url, "> Here is your Megumin anime image! 💫");
  } catch (e) {
    await sendAnimeApiError(message, e);
  }
});

Module({
  command: "maid",
  package: "anime",
  description: "Download SFW Maid Anime Images",
})(async (message) => {
  try {
    const url = await waifuImImage("maid");
    await sendImage(message, url, "> Here is your maid anime image! 💫");
  } catch (e) {
    // Waifu.im is used for maid because its current API supports tag filtering.
    // Fall back to a general SFW waifu image if the tag is temporarily empty.
    try {
      const url = await waifuImage("waifu");
      await sendImage(message, url, "> Maid image unavailable, here is a SFW anime image 💫");
    } catch (fallbackError) {
      await sendAnimeApiError(message, fallbackError);
    }
  }
});

Module({
  command: "aquote",
  package: "anime",
  description: "Get Random Anime Quote",
})(async (message) => {
  try {
    const data = await getJson(`${ANIMECHAN}/quotes/random`);
    const quote = data?.data;
    if (!quote?.content) throw new Error("No anime quote returned");

    await message.send(
      `💬 *Quote:* "${quote.content}"\n\n` +
      `👤 *Character:* ${quote.character?.name || "Unknown"}\n` +
      `📺 *Anime:* ${quote.anime?.name || "Unknown"}`
    );
  } catch (e) {
    await sendAnimeApiError(message, e);
  }
});

Module({
  command: "achar",
  package: "anime",
  description: "Search Anime Character Information",
})(async (message, match) => {
  try {
    if (!match) return await message.sendReply("usage: achar <character name>");
    const query = match.trim();
    const data = await getJson(
      `${JIKAN}/characters?q=${encodeURIComponent(query)}&limit=1`
    );
    const char = data?.data?.[0];
    if (!char) return await message.sendReply("Character not found!");

    const about = char.about
      ? char.about.replace(/\s+/g, " ").slice(0, 500)
      : "No information available";
    const imageUrl = char.images?.jpg?.image_url || char.images?.webp?.image_url;

    if (imageUrl) {
      await sendImage(
        message,
        imageUrl,
        `👤 *Name:* ${char.name}\n📝 *About:* ${about}${char.url ? `\n🔗 *URL:* ${char.url}` : ""}`
      );
    } else {
      await message.send(`👤 *${char.name}*\n📝 ${about}`);
    }
  } catch (e) {
    await sendAnimeApiError(message, e);
  }
});

Module({
  command: "asearch",
  package: "anime",
  description: "Search for Anime Information",
})(async (message, match) => {
  try {
    if (!match) return await message.sendReply("usage: asearch <anime name>");
    const query = match.trim();
    const data = await getJson(
      `${JIKAN}/anime?q=${encodeURIComponent(query)}&limit=1`
    );
    const anime = data?.data?.[0];
    if (!anime) return await message.sendReply("Anime not found!");

    const genres = (anime.genres || []).map((g) => g.name).join(", ") || "N/A";
    const text =
      `📺 *Title:* ${anime.title}\n` +
      `⭐ *Rating:* ${anime.score || "N/A"}\n` +
      `🎬 *Episodes:* ${anime.episodes || "Unknown"}\n` +
      `📡 *Status:* ${anime.status || "Unknown"}\n` +
      `📅 *Year:* ${anime.year || "Unknown"}\n` +
      `🎭 *Genres:* ${genres}\n` +
      `📝 *Synopsis:* ${(anime.synopsis || "No synopsis available").slice(0, 500)}...\n` +
      `🔗 *URL:* ${anime.url || "N/A"}`;

    const imageUrl = anime.images?.jpg?.image_url || anime.images?.webp?.image_url;
    if (imageUrl) await sendImage(message, imageUrl, text);
    else await message.send(text);
  } catch (e) {
    await sendAnimeApiError(message, e);
  }
});

Module({
  command: "arecommend",
  package: "anime",
  description: "Get Top Anime Recommendations",
})(async (message) => {
  try {
    const data = await getJson(`${JIKAN}/top/anime?limit=5`);
    const list = data?.data || [];
    if (!list.length) throw new Error("No recommendations returned");

    const recText =
      "🌟 *TOP ANIME RECOMMENDATIONS:*\n\n" +
      list
        .map(
          (anime, index) =>
            `${index + 1}. *${anime.title}*\n` +
            `⭐ Rating: ${anime.score || "N/A"}\n` +
            `📺 Episodes: ${anime.episodes || "Unknown"}\n` +
            `🎭 ${(anime.genres || []).slice(0, 3).map((g) => g.name).join(", ") || "N/A"}\n`
        )
        .join("\n") +
      "> Use .asearch [anime name] for more details!";

    await message.send(recText);
  } catch (e) {
    await sendAnimeApiError(message, e);
  }
});

Module({
  command: "shinobu",
  package: "anime",
  description: "Download Shinobu Anime Images",
})(async (message) => {
  try {
    const url = await waifuImage("shinobu");
    await sendImage(message, url, "> Here is your Shinobu anime image! 🦋");
  } catch (e) {
    await sendAnimeApiError(message, e);
  }
});
