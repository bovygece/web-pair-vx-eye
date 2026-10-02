import { Module } from "../lib/plugins.js";
import Translator from "../lib/Class/translate.js";

function cleanLanguage(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z-]/g, "")
    .slice(0, 12);
}

function getQuotedText(message) {
  const quoted = message?.quoted;
  if (!quoted) return "";

  const text = String(quoted.body || "").trim();
  return text;
}

Module({
  command: "tr",
  aliases: ["translate", "trans"],
  package: "tools",
  description: "Translate a selected/replied message",
  usage: ".tr [language] (reply to a message)",
})(async (message, match) => {
  try {
    const input = String(match || "").trim();
    const parts = input ? input.split(/\s+/) : [];

    // Default target language is Bengali. Change it by using .tr en, .tr hi, etc.
    let targetLanguage = cleanLanguage(parts[0] || "bn");
    let text = "";

    // If the first argument looks like a language code, translate the quoted text.
    // Otherwise, translate the supplied text directly using Bengali as the target.
    const looksLikeLanguage = /^[a-z]{2,3}(?:-[a-z]{2,4})?$/i.test(parts[0] || "");

    if (message?.quoted) {
      text = getQuotedText(message);
      if (!text) {
        return await message.send(
          "❌ *এই message-এ text পাওয়া যায়নি।*\n\n" +
          "কোনো text message-এ reply/select করে তারপর `.tr` পাঠান।\n" +
          "Language পরিবর্তন করতে হলে: `.tr en` / `.tr hi` / `.tr bn`"
        );
      }

      if (!looksLikeLanguage) targetLanguage = "bn";
    } else {
      if (!input) {
        return await message.send(
          "❌ *কোনো message-এ reply/select করুন।*\n\n" +
          "Examples:\n" +
          "• `.tr` → Bengali\n" +
          "• `.tr en` → English\n" +
          "• `.tr hi` → Hindi\n" +
          "• `.tr bn hello` → Bengali-তে hello"
        );
      }

      if (looksLikeLanguage) {
        text = parts.slice(1).join(" ").trim();
        if (!text) {
          return await message.send(
            "❌ *Text message-এ reply/select করুন অথবা text দিন।*\n\nExample: .tr " + targetLanguage + " hello"
          );
        }
      } else {
        targetLanguage = "bn";
        text = input;
      }
    }

    await message.react("🌐").catch(() => {});

    const translator = new Translator();
    const result = await translator.translate(text, targetLanguage);

    if (!result || result.status !== 200 || !result.data?.translatedText) {
      throw new Error(result?.error || "Translation failed");
    }

    const sourceLanguage = result.data.sourceLanguage || "auto";
    const translatedText = result.data.translatedText.trim();

    await message.send(
      `🌐 *Translation*\n` +
      `╭──────────────\n` +
      `│ 🔤 From: *${sourceLanguage}*\n` +
      `│ 🎯 To: *${targetLanguage}*\n` +
      `╰──────────────\n\n` +
      `${translatedText}`
    );

    await message.react("✅").catch(() => {});
  } catch (error) {
    await message.react("❌").catch(() => {});
    await message.send(
      `❌ *Translation failed*\n\n${String(error?.message || error).slice(0, 500)}`
    );
  }
});
