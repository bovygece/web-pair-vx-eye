import { Module } from "../lib/plugins.js";

function getTarget(message) {
  return (
    message?.mentions?.[0] ||
    message?.quoted?.participant ||
    message?.quoted?.sender ||
    message?.quoted?.key?.participant ||
    null
  );
}

Module({
  command: "pp",
  aliases: ["p", "profilepic"],
  package: "media",
  description: "Send a member's profile picture",
})(async (message) => {
  try {
    const target = getTarget(message);
    if (!target) {
      return message.reply("❌ কোনো member-এর message-এ reply করে `.ht` লিখুন।");
    }

    const url = await message.conn.profilePictureUrl(target, "image").catch(() => null);
    if (!url) return message.reply("❌ এই member-এর profile picture পাওয়া যাচ্ছে না।");

    return message.send({
      image: { url },
      caption: `📸 *Profile Picture*\n👤 @${String(target).split("@")[0]}`,
      mentions: [target],
    });
  } catch (error) {
    console.error("[pp] error:", error?.message || error);
    return message.reply("❌ Profile picture পাঠাতে সমস্যা হয়েছে।");
  }
});

Module({
  command: "click",
  aliases: ["tap"],
  package: "media",
  description: "React to the replied message/image",
})(async (message) => {
  try {
    if (!message.quoted) {
      return message.reply("❌ কোনো message/image-এ reply করে `.ht` লিখুন।");
    }

    if (typeof message.react === "function") {
      await message.react("👆");
      return;
    }

    return message.reply("👆 Click");
  } catch (error) {
    console.error("[click] error:", error?.message || error);
    return message.reply("❌ Click action failed.");
  }
});

// View-once messages are intentionally not copied/downloaded by this plugin.
// The sender's view-once privacy control must remain respected.
Module({
  command: "vv",
  aliases: ["viewonce"],
  package: "media",
  description: "View-once privacy notice",
})(async (message) => {
  return message.reply(
    "🔒 *View Once protected আছে।*\n\n" +
    "আমি view-once media bypass করে full photo/video বের করার command যোগ করি না।\n" +
    "যদি normal image/photo হয়, তাহলে সেটিতে reply করে `.pp` (profile picture) অথবা `.click` ব্যবহার করতে পারেন।"
  );
});
