import yts from "yt-search";
import {
    generateWAMessageFromContent,
    proto
} from "@whiskeysockets/baileys";
import axios from "axios";
import sharp from "sharp";
import config from "../config.js";

import { Module } from "../lib/plugins.js";
import {
    makeLegacyMessage,
    runLegacyContext,
    getDatabase as getLegacyDatabase,
    withLegacySocket
} from "../lib/miku-legacy.js";

/* -------------------------------------------------------------------------- */
/* CONFIG                                                                     */
/* -------------------------------------------------------------------------- */

const pluginConfig = {
    name: "yts",
    alias: ["ytsearch", "youtubesearch"],
    category: "search",
    description: "Search videos on YouTube and show detailed results.",
    usage: ".yts <query>",
    example: ".yts song terbaru",
    isOwner: false,
    isPremium: false,
    isGroup: false,
    isPrivate: false,
    isAdmin: false,
    isBotAdmin: false,
    cooldown: 5,
    energi: 2,
    isEnabled: true
};

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

function getSearchText(m, text = "") {
    if (typeof text === "string" && text.trim()) {
        return text.trim();
    }

    if (Array.isArray(m?.args) && m.args.length) {
        return m.args
            .map(v => String(v || "").trim())
            .filter(Boolean)
            .join(" ")
            .trim();
    }

    if (typeof m?.args === "string" && m.args.trim()) {
        return m.args.trim();
    }

    if (typeof m?.text === "string" && m.text.trim()) {
        return m.text.trim();
    }

    return "";
}

function formatViews(views) {
    const number = Number(views || 0);

    if (!Number.isFinite(number) || number <= 0) {
        return "Tidak diketahui";
    }

    return number.toLocaleString("en-US");
}

async function getThumbnail(url) {
    try {
        const response = await axios.get(url, {
            responseType: "arraybuffer",
            timeout: 15000,
            maxContentLength: 10 * 1024 * 1024
        });

        return await sharp(response.data)
            .resize(640, 360, {
                fit: "cover"
            })
            .jpeg({
                quality: 85
            })
            .toBuffer();
    } catch (error) {
        console.error("YTS thumbnail error:", error);
        return null;
    }
}

/* -------------------------------------------------------------------------- */
/* HANDLER                                                                    */
/* -------------------------------------------------------------------------- */

async function handler(m, { sock, text }) {
    const query = getSearchText(m, text);

    if (!query) {
        return m.reply(
            "❌ *YouTube search keyword kosong!*\n\n" +
            "Masukkan judul atau kata kunci video.\n\n" +
            "Contoh:\n" +
            "`.yts lagu galau indonesia`"
        );
    }

    try {
        await m.react("🕕");
    } catch {}

    try {
        /* ------------------------------------------------------------------ */
        /* SEARCH                                                              */
        /* ------------------------------------------------------------------ */

        const searchResults = await yts(query);
        const videos = Array.isArray(searchResults?.videos)
            ? searchResults.videos
            : [];

        if (!videos.length) {
            try {
                await m.react("❌");
            } catch {}

            return m.reply(
                "⚠️ *Tidak menemukan hasil YouTube.*\n\n" +
                "Coba gunakan kata kunci yang lebih umum."
            );
        }

        const firstVideo = videos[0];

        /* ------------------------------------------------------------------ */
        /* BASIC DATA                                                          */
        /* ------------------------------------------------------------------ */

        const title = String(
            firstVideo.title || "YouTube Video"
        );

        const channel = String(
            firstVideo.author?.name || "Unknown"
        );

        const duration = String(
            firstVideo.timestamp || firstVideo.duration || "Unknown"
        );

        const views = formatViews(
            firstVideo.views
        );

        const uploaded = String(
            firstVideo.ago || "Unknown"
        );

        const videoUrl = String(
            firstVideo.url || ""
        );

        /* ------------------------------------------------------------------ */
        /* THUMBNAIL                                                           */
        /* ------------------------------------------------------------------ */

        const thumbnailBuffer =
            await getThumbnail(firstVideo.thumbnail);

        /* ------------------------------------------------------------------ */
        /* RESULT TEXT                                                         */
        /* ------------------------------------------------------------------ */

        const contentText =
`✨ *YOUTUBE SEARCH* ✨

🔎 *Keyword:* ${query}

🎬 *Title:* ${title}

📺 *Channel:* ${channel}

⏱️ *Duration:* ${duration}

👁️ *Views:* ${views}

📅 *Uploaded:* ${uploaded}

🔗 *URL:* ${videoUrl}

👇 *Choose an option below:*`;

        /* ------------------------------------------------------------------ */
        /* SEND RESULT                                                         */
        /* ------------------------------------------------------------------ */
        /*
         * FIX: the old code built a legacy `buttonsMessage` and relayed it.
         * WhatsApp no longer renders that format, so nothing appeared even
         * though the command "succeeded". Now:
         *   1) thumbnail + details are sent as a normal image message
         *      (always visible, with the .video / .song commands in text)
         *   2) tappable buttons are sent as a native-flow quick-reply
         *      message (bonus - if your WhatsApp doesn't show it, use the
         *      commands from the text).
         * Also: `.ytmp3` doesn't exist in this bot, so the audio button
         * now runs `.song <url>` and the video button runs `.video <url>`.
         */

        const quotedOpt = m.raw ? { quoted: m.raw } : {};

        const captionText =
            contentText.replace(
                "👇 *Choose an option below:*",
                `👇 *Download:*\n` +
                `🎥 \`.video ${videoUrl}\`\n` +
                `🎵 \`.song ${videoUrl}\``
            );

        if (thumbnailBuffer) {
            await sock.sendMessage(
                m.chat,
                { image: thumbnailBuffer, caption: captionText },
                quotedOpt
            );
        } else if (firstVideo.thumbnail) {
            try {
                await sock.sendMessage(
                    m.chat,
                    { image: { url: firstVideo.thumbnail }, caption: captionText },
                    quotedOpt
                );
            } catch {
                await m.reply(captionText);
            }
        } else {
            await m.reply(captionText);
        }

        /* tappable buttons (best effort, never breaks the command) */
        try {
            const btnMsg = generateWAMessageFromContent(
                m.chat,
                {
                    viewOnceMessage: {
                        message: {
                            messageContextInfo: {
                                deviceListMetadata: {},
                                deviceListMetadataVersion: 2
                            },
                            interactiveMessage: proto.Message.InteractiveMessage.create({
                                body: proto.Message.InteractiveMessage.Body.create({
                                    text: "👇 *Choose an option:*"
                                }),
                                footer: proto.Message.InteractiveMessage.Footer.create({
                                    text: config?.bot?.name || config?.info?.name || "VX MD BOT"
                                }),
                                header: proto.Message.InteractiveMessage.Header.create({
                                    title: title.slice(0, 60),
                                    hasMediaAttachment: false
                                }),
                                nativeFlowMessage:
                                    proto.Message.InteractiveMessage.NativeFlowMessage.create({
                                        buttons: [
                                            {
                                                name: "quick_reply",
                                                buttonParamsJson: JSON.stringify({
                                                    display_text: "🎥 Download Video",
                                                    id: `.video ${videoUrl}`
                                                })
                                            },
                                            {
                                                name: "quick_reply",
                                                buttonParamsJson: JSON.stringify({
                                                    display_text: "🎵 Download Audio",
                                                    id: `.song ${videoUrl}`
                                                })
                                            }
                                        ]
                                    })
                            })
                        }
                    }
                },
                { userJid: sock?.user?.id || m?.conn?.user?.id }
            );

            await sock.relayMessage(m.chat, btnMsg.message, {
                messageId: btnMsg.key.id,
                additionalNodes: [
                    {
                        tag: "biz",
                        attrs: {},
                        content: [
                            {
                                tag: "interactive",
                                attrs: { type: "native_flow", v: "1" },
                                content: [
                                    { tag: "native_flow", attrs: { v: "9", name: "mixed" } }
                                ]
                            }
                        ]
                    }
                ]
            });
        } catch (buttonError) {
            console.warn("YTS button send failed:", buttonError?.message || buttonError);
        }

        try {
            await m.react("✅");
        } catch {}

    } catch (error) {
        console.error(
            "YTS command error:",
            error
        );

        try {
            await m.react("❌");
        } catch {}

        return m.reply(
            "😔 *YouTube search में समस्या आ गई।*\n\n" +
            "थोड़ी देर बाद दोबारा कोशिश करें।"
        );
    }
}

/* -------------------------------------------------------------------------- */
/* EXPORT                                                                     */
/* -------------------------------------------------------------------------- */

export {
    pluginConfig as config,
    handler
};

/* -------------------------------------------------------------------------- */
/* LEGACY / MODULE BRIDGE                                                     */
/* -------------------------------------------------------------------------- */

const __meta = {
    command: "yts",
    aliases: [
        "ytsearch",
        "youtubesearch"
    ],
    package: "search",
    description:
        "Search videos on YouTube and show detailed results.",
    isOwner: false,
    isGroup: false,
    isAdmin: false,
    isBotAdmin: false
};

async function __runLegacy(
    message,
    args = ""
) {
    const sock =
        withLegacySocket(message.conn);

    const rawCommand =
        String(message.body || "")
            .trim()
            .replace(/^\./, "")
            .split(/\s+/)[0]
            .toLowerCase();

    /* ---------------------------------------------------------------------- */
    /* NORMALIZE ARGUMENTS                                                     */
    /* ---------------------------------------------------------------------- */

    const argumentText =
        Array.isArray(args)
            ? args.join(" ").trim()
            : String(args || "").trim();

    const lm = makeLegacyMessage(
        message,
        argumentText,
        rawCommand || __meta.command
    );

    /* ---------------------------------------------------------------------- */
    /* ALWAYS KEEP ARGS AS ARRAY                                               */
    /* ---------------------------------------------------------------------- */

    if (!Array.isArray(lm.args)) {
        lm.args = argumentText
            .split(/\s+/)
            .filter(Boolean);
    }

    /* ---------------------------------------------------------------------- */
    /* GROUP INFO                                                              */
    /* ---------------------------------------------------------------------- */

    if (lm.isGroup) {
        try {
            await lm.loadGroupInfo();
        } catch {}
    }

    /* ---------------------------------------------------------------------- */
    /* PERMISSIONS                                                             */
    /* ---------------------------------------------------------------------- */

    if (
        __meta.isOwner &&
        !lm.isOwner
    ) {
        return lm.reply(
            "❌ Owner only."
        );
    }

    if (
        __meta.isGroup &&
        !lm.isGroup
    ) {
        return lm.reply(
            "❌ This command can only be used in groups."
        );
    }

    if (
        __meta.isAdmin &&
        !lm.isAdmin &&
        !lm.isOwner
    ) {
        return lm.reply(
            "❌ Only group admins can use this command."
        );
    }

    if (
        __meta.isBotAdmin &&
        !lm.isBotAdmin
    ) {
        return lm.reply(
            "❌ Bot must be a group admin to use this command."
        );
    }

    /* ---------------------------------------------------------------------- */
    /* RUN HANDLER                                                             */
    /* ---------------------------------------------------------------------- */

    return runLegacyContext(
        lm,
        () =>
            handler(lm, {
                sock,
                db: getLegacyDatabase(lm),
                text: argumentText
            })
    );
}

/* -------------------------------------------------------------------------- */
/* REGISTER                                                                   */
/* -------------------------------------------------------------------------- */

Module(__meta)(
    async (
        message,
        args = ""
    ) => __runLegacy(message, args)
);
