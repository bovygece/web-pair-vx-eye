/**
 * Common handler for single-prefix text.
 *
 * Unknown single-dot input is treated as normal text instead of being
 * converted into a sticker. Double-prefix input is filtered by the client
 * dispatcher and never reaches this helper.
 */
export async function handleCommonDotText(message, text) {
  const value = String(text || "").trim();
  if (!value) return;
  return message.send(value);
}
