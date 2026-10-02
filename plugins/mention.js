import { Module } from "../lib/plugins.js";
import { db } from "../lib/client.js";

/*
|--------------------------------------------------------------------------
| MENTION SONG LIST
|--------------------------------------------------------------------------
| Bot কে @mention করলে পরের song পাঠানো হবে।
|
| url    = Audio URL
| title  = Song name
| artist = Artist name
| thumb  = Song DP / thumbnail
|--------------------------------------------------------------------------
*/

const SONGS = [
  {
    url: "https://files.catbox.moe/004ilx.ogg",
    title: "Tum Hi Ho",
    artist: "Arijit Singh",
    thumb: "https://files.catbox.moe/5u80sj.jpg",
  },

  // অন্য valid song এখানে দিন
  // {
  //   url: "https://example.com/song2.ogg",
  //   title: "Song 2",
  //   artist: "Artist 2",
  //   thumb: "https://example.com/song2.jpg",
  // },

  // তৃতীয় valid song এখানে দিন
  // {
  //   url: "https://example.com/song3.ogg",
  //   title: "Song 3",
  //   artist: "Artist 3",
  //   thumb: "https://example.com/song3.jpg",
  // },
];


/*
|--------------------------------------------------------------------------
| NORMALIZE JID
|--------------------------------------------------------------------------
*/

function normalizeJid(jid) {
  if (!jid) return "";

  return String(jid)
    .trim()
    .replace(/:\d+(?=@)/, "")
    .toLowerCase();
}


/*
|--------------------------------------------------------------------------
| GET BOT JIDS
|--------------------------------------------------------------------------
*/

function getBotJids(conn) {
  const user = conn?.user || {};

  return [
    user.id,
    user.jid,
    user.lid,
    user.phoneNumber,
  ]
    .filter(Boolean)
    .map(normalizeJid)
    .filter(Boolean);
}


/*
|--------------------------------------------------------------------------
| GET BOT NUMBER
|--------------------------------------------------------------------------
*/

function getBotNumber(conn) {
  const jids = getBotJids(conn);

  if (!jids.length) {
    return "unknown";
  }

  const jid = jids[0];

  return jid.split("@")[0].split(":")[0];
}


/*
|--------------------------------------------------------------------------
| GET MESSAGE TEXT
|--------------------------------------------------------------------------
*/

function getMessageText(message) {
  const raw = message?.raw || message;

  return (
    raw?.message?.conversation ||
    raw?.message?.extendedTextMessage?.text ||
    raw?.message?.imageMessage?.caption ||
    raw?.message?.videoMessage?.caption ||
    raw?.message?.documentMessage?.caption ||
    raw?.msg?.conversation ||
    raw?.msg?.extendedTextMessage?.text ||
    raw?.text ||
    message?.text ||
    ""
  );
}


/*
|--------------------------------------------------------------------------
| FIND MESSAGE CONTENT RECURSIVELY
|--------------------------------------------------------------------------
|
| WhatsApp অনেক সময় message কে wrappers এর মধ্যে ঢুকিয়ে দেয়:
|
| ephemeralMessage
| viewOnceMessage
| editedMessage
| documentWithCaptionMessage
| etc.
|
|--------------------------------------------------------------------------
*/

function collectMentionedJids(obj, result = []) {
  if (!obj || typeof obj !== "object") {
    return result;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      collectMentionedJids(item, result);
    }

    return result;
  }

  if (Array.isArray(obj.mentionedJid)) {
    result.push(...obj.mentionedJid);
  }

  if (Array.isArray(obj.mentionedJids)) {
    result.push(...obj.mentionedJids);
  }

  for (const [key, value] of Object.entries(obj)) {
    if (
      key === "mentionedJid" ||
      key === "mentionedJids"
    ) {
      continue;
    }

    if (
      value &&
      typeof value === "object"
    ) {
      collectMentionedJids(value, result);
    }
  }

  return result;
}


/*
|--------------------------------------------------------------------------
| CHECK BOT MENTION
|--------------------------------------------------------------------------
*/

function isBotMentioned(message) {

  /*
   * First: serializer property
   */
  if (message?.isMentioned === true) {
    return true;
  }


  /*
   * Get bot JIDs
   */
  const botJids = getBotJids(message?.conn);

  if (!botJids.length) {
    console.log(
      "[mention] Bot JID not available"
    );

    return false;
  }


  /*
   * Get raw message
   */
  const raw =
    message?.raw ||
    message;


  /*
   * Search all nested mentionedJid fields
   */
  const mentionedJids =
    collectMentionedJids(raw);


  /*
   * Compare JIDs
   */
  for (const jid of mentionedJids) {
    const normalized =
      normalizeJid(jid);

    if (
      normalized &&
      botJids.includes(normalized)
    ) {
      return true;
    }
  }


  /*
   * Some serializers don't expose
   * mentionedJid properly.
   *
   * Fallback: check @number in text.
   */
  const text =
    getMessageText(message);


  if (text && botJids.length) {

    const botNumbers =
      botJids
        .map((jid) =>
          jid.split("@")[0].split(":")[0]
        )
        .filter(Boolean);

    for (const number of botNumbers) {

      if (
        text.includes(`@${number}`) ||
        text.includes(number)
      ) {
        return true;
      }
    }
  }


  return false;
}


/*
|--------------------------------------------------------------------------
| SONG ROTATION
|--------------------------------------------------------------------------
*/

const songIndexes = new Map();


function getNextSong(chatId) {

  if (!SONGS.length) {
    return null;
  }

  const currentIndex =
    songIndexes.get(chatId) || 0;

  const song =
    SONGS[currentIndex];

  const nextIndex =
    (currentIndex + 1) % SONGS.length;

  songIndexes.set(
    chatId,
    nextIndex
  );

  return song;
}


/*
|--------------------------------------------------------------------------
| MENTION MODULE
|--------------------------------------------------------------------------
*/

Module({
  on: "text",
  package: "general",
  description: "Send rotating song when bot is mentioned",
})(async (message) => {

  try {

    /*
    |--------------------------------------------------------------------------
    | CHECK MENTION
    |--------------------------------------------------------------------------
    */

    const mentioned =
      isBotMentioned(message);

    if (!mentioned) {
      return;
    }


    console.log(
      `[mention] Bot mentioned in ${message.from}`
    );


    /*
    |--------------------------------------------------------------------------
    | GET BOT NUMBER
    |--------------------------------------------------------------------------
    */

    const botNumber =
      getBotNumber(message.conn);


    console.log(
      `[mention] Bot number: ${botNumber}`
    );


    /*
    |--------------------------------------------------------------------------
    | CHECK SETTING
    |--------------------------------------------------------------------------
    */

    let enabled = false;

    try {

      enabled = Boolean(
        db.get(
          botNumber,
          "mention",
          false
        )
      );

    } catch (dbError) {

      console.error(
        "[mention] Database error:",
        dbError
      );

      return;
    }


    if (!enabled) {

      console.log(
        `[mention] Feature OFF for ${botNumber}`
      );

      return;
    }


    /*
    |--------------------------------------------------------------------------
    | CHECK SONG LIST
    |--------------------------------------------------------------------------
    */

    if (!Array.isArray(SONGS) || !SONGS.length) {

      console.error(
        "[mention] SONGS list is empty."
      );

      return;
    }


    /*
    |--------------------------------------------------------------------------
    | GET NEXT SONG
    |--------------------------------------------------------------------------
    */

    const song =
      getNextSong(message.from);

    if (!song?.url) {

      console.error(
        "[mention] Invalid song configuration:",
        song
      );

      return;
    }


    console.log(
      `[mention] Sending: ${song.title}`
    );


    /*
    |--------------------------------------------------------------------------
    | SEND AUDIO
    |--------------------------------------------------------------------------
    */

    await message.conn.sendMessage(
      message.from,
      {
        audio: {
          url: song.url,
        },

        mimetype:
          "audio/ogg; codecs=opus",

        ptt: true,

        contextInfo: {
          externalAdReply: {
            title:
              song.title ||
              "Unknown Song",

            body:
              song.artist ||
              "Unknown Artist",

            thumbnailUrl:
              song.thumb ||
              "",

            mediaUrl:
              song.url,

            mediaType: 2,

            renderLargerThumbnail: true,

            showAdAttribution: false,
          },
        },
      },
      {
        quoted: message.key
          ? {
              key: message.key,
              message:
                message.message || {},
            }
          : undefined,
      }
    );


    /*
    |--------------------------------------------------------------------------
    | SUCCESS LOG
    |--------------------------------------------------------------------------
    */

    console.log(
      `[mention] Successfully sent "${song.title}" to ${message.from}`
    );

  } catch (error) {

    console.error(
      "[mention] Runtime error:",
      error?.stack ||
        error?.message ||
        error
    );

  }

});
