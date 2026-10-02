import { Module, commands } from "../lib/plugins.js";

Module({
  command: "setmention",
  aliases: ["setmentionstatus"],
  package: "owner",
  description: "Toggle bot auto-mention feature",
})(async (message, match = "") => {
  const target = commands.get("mention");
  if (!target?.exec) return message.send("❌ Mention module is not available.");
  return target.exec(message, match);
});
