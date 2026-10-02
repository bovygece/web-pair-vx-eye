import { Module } from "../lib/plugins.js";
import {
  setAntiStatus,
  isAntiStatusOn,
  setAntiStatusKick,
  isAntiStatusKickOn,
  handleAntiStatus,
  isBotAdmin,
} from "../lib/xaf-antistatus.js";

/*
 * ============================================================================
 * ANTI GROUP STATUS
 * ============================================================================
 *
 * Group admins can enable this protection with:
 *
 *   .antigroupstatus on
 *   .antigroupstatus off
 *   .antigroupstatus kick on
 *   .antigroupstatus kick off
 *
 * Also supported:
 *
 *   .antistatus on/off
 *   .antistatus kick on/off
 *
 * Behaviour:
 *   1. A member's Status/Story mention message in the group is deleted.
 *   2. The member receives warning 1/3.
 *   3. Second attempt -> warning 2/3.
 *   4. Third attempt -> warning 3/3 and, when Kick is ON, the member is removed.
 *   5. Warning count is kept per group/member and resets on a new day.
 *
 * IMPORTANT:
 * WhatsApp does not give the bot permission to delete a person's actual
 * WhatsApp Status globally. This protection deletes the Status/Story mention
 * message that was posted into the group.
 * ============================================================================
 */

async function requireGroupAdmin(message) {
  if (!message.isGroup) {
    await message.send("❌ This command can only be used in groups.");
    return false;
  }

  await message.loadGroupInfo();

  if (!message.isAdmin && !message.isFromMe) {
    await message.send("❌ Only group admins can use this command.");
    return false;
  }

  return true;
}

Module({
  command: "antigroupstatus",
  aliases: ["antigcstatus"],
  package: "group",
  description: "Delete group Status/Story mentions; warn 3 times and optionally kick",
})(async (message, args = "") => {
  if (!(await requireGroupAdmin(message))) return;

  const input = String(args).trim().toLowerCase();
  const [sub, value] = input.split(/\s+/);

  if (sub === "on") {
    if (!(await isBotAdmin(message.conn, message.from))) {
      return message.send("❌ Bot group admin নেই। প্রথমে bot কে Admin তৈরি করুন, তারপর Anti Group Status ON করুন।");
    }
    setAntiStatus(message.from, true);
    return message.send(
      "🛡️ *ANTI GROUP STATUS ON*\n\n" +
      "🗑️ Status/Story mention messages will be deleted.\n" +
      "⚠️ Member gets 3 warnings.\n" +
      `👢 Kick: ${isAntiStatusKickOn(message.from) ? "ON" : "OFF"}`
    );
  }

  if (sub === "off") {
    setAntiStatus(message.from, false);
    return message.send("❌ *ANTI GROUP STATUS OFF*");
  }

  if (sub === "kick" && /^(on|off)$/.test(value)) {
    if (value === "on" && !(await isBotAdmin(message.conn, message.from))) {
      return message.send("❌ Bot group admin নেই। প্রথমে bot কে Admin তৈরি করুন, তারপর Kick ON করুন।");
    }
    setAntiStatusKick(message.from, value === "on");
    return message.send(
      `👢 *ANTI STATUS KICK ${value === "on" ? "ON" : "OFF"}*\n\n` +
      (value === "on"
        ? "After 3 warnings, the member will be removed if the bot is an admin."
        : "Three warnings will be given, but the member will not be removed automatically.")
    );
  }

  return message.send(
    `🛡️ *ANTI GROUP STATUS*\n\n` +
    `Status: ${isAntiStatusOn(message.from) ? "ON" : "OFF"}\n` +
    `Kick after 3 warnings: ${isAntiStatusKickOn(message.from) ? "ON" : "OFF"}\n\n` +
    `Use:\n` +
    `.antigroupstatus on\n` +
    `.antigroupstatus off\n` +
    `.antigroupstatus kick on\n` +
    `.antigroupstatus kick off`
  );
});

/*
 * Message-level protection.
 * xaf-antistatus.js performs detection, deletion, warning counting and
 * optional 3-warning kick.
 */
Module({
  on: "message",
  name: "anti-group-status-protection",
  package: "protection",
  description: "Delete Status/Story mentions and enforce 3 warnings",
})(async (message) => {
  if (message.isGroup) {
    await handleAntiStatus(message.conn, message.raw);
  }
});
