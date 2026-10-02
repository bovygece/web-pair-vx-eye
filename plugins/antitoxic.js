import { getDatabase } from "../lib/miku-legacy.js"
import config from "../config.js"
import { Module } from "../lib/plugins.js"
import {
    makeLegacyMessage,
    runLegacyContext,
    getDatabase as getLegacyDatabase,
    withLegacySocket
} from "../lib/miku-legacy.js"

/* -------------------------------------------------------------------------- */
/* CONFIG                                                                     */
/* -------------------------------------------------------------------------- */

const pluginConfig = {
    name: "antitoxic",
    alias: ["toxic", "antitoxik"],
    category: "group",
    description: "Mengatur antitoxic di grup",
    usage: ".antitoxic <on/off/warn/metode>",
    example: ".antitoxic on",
    isOwner: false,
    isPremium: false,
    isGroup: true,
    isPrivate: false,
    isAdmin: true,
    isBotAdmin: true,
    cooldown: 5,
    energi: 0,
    isEnabled: true
}

/* -------------------------------------------------------------------------- */
/* DEFAULT TOXIC WORDS                                                        */
/* -------------------------------------------------------------------------- */

const DEFAULT_TOXIC_WORDS = [
    "anjing",
    "bangsat",
    "kontol",
    "memek",
    "ngentot",
    "babi",
    "tolol",
    "goblok",
    "idiot",
    "bodoh",
    "kampret",
    "asu",
    "jancok",
    "bajingan",
    "keparat",
    "setan",
    "iblis",
    "tai",
    "brengsek",
    "sialan"
]

/* -------------------------------------------------------------------------- */
/* ARGUMENT NORMALIZER                                                        */
/* -------------------------------------------------------------------------- */

function getArgs(m) {
    if (Array.isArray(m?.args)) {
        return m.args
            .map(v => String(v ?? "").trim())
            .filter(Boolean)
    }

    if (typeof m?.args === "string") {
        return m.args
            .trim()
            .split(/\s+/)
            .filter(Boolean)
    }

    if (typeof m?.text === "string" && m.text.trim()) {
        return m.text
            .trim()
            .split(/\s+/)
            .filter(Boolean)
    }

    return []
}

/* -------------------------------------------------------------------------- */
/* SAVE GROUP DATA WITHOUT OVERWRITING OTHER SETTINGS                         */
/* -------------------------------------------------------------------------- */

function saveGroup(db, chat, changes) {
    const current = db.getGroup(chat) || {}
    const updated = {
        ...current,
        ...changes
    }

    db.setGroup(chat, updated)

    try {
        if (typeof db.save === "function") {
            db.save()
        }
    } catch {}

    return updated
}

/* -------------------------------------------------------------------------- */
/* TOXIC DETECTOR                                                             */
/* -------------------------------------------------------------------------- */

function isToxic(text, toxicList) {
    if (!text || typeof text !== "string") {
        return {
            toxic: false,
            word: null
        }
    }

    const lowerText = text.toLowerCase().trim()

    if (!lowerText) {
        return {
            toxic: false,
            word: null
        }
    }

    const words =
        Array.isArray(toxicList) && toxicList.length > 0
            ? toxicList
            : DEFAULT_TOXIC_WORDS

    for (const word of words) {
        if (!word) continue

        const lowerWord = String(word).toLowerCase().trim()

        if (!lowerWord) continue

        const escapedWord = lowerWord.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
        )

        const regex = new RegExp(
            `(^|\\s|[^a-zA-Z0-9])${escapedWord}($|\\s|[^a-zA-Z0-9])`,
            "i"
        )

        if (regex.test(lowerText)) {
            return {
                toxic: true,
                word: String(word)
            }
        }
    }

    return {
        toxic: false,
        word: null
    }
}

/* -------------------------------------------------------------------------- */
/* PROTECTION MESSAGE                                                         */
/* -------------------------------------------------------------------------- */

function gpMsg(key, replacements = {}) {
    const defaults = {
        antitoxicWarn:
            "⚠️ @%user% ne oleng telah menggunakan kata toxic.\n" +
            "Peringatan: %warn%/%max%.\n" +
            "Pelanggaran berikutnya akan mendapat tindakan *%method%*.",

        antitoxicAction:
            "🚫 @%user% mendapat tindakan *%method%* karena toxic.\n" +
            "Peringatan: %warn%/%max%."
    }

    let text =
        config?.groupProtection?.[key] ||
        defaults[key] ||
        ""

    for (const [keyName, value] of Object.entries(replacements)) {
        text = text.replace(
            new RegExp(`%${keyName}%`, "g"),
            String(value)
        )
    }

    return text
}

/* -------------------------------------------------------------------------- */
/* HANDLE TOXIC MESSAGE                                                       */
/* -------------------------------------------------------------------------- */

async function handleToxicMessage(m, sock, db, toxicWord = null) {
    if (!m?.chat || !m?.sender) {
        return false
    }

    const groupData = db.getGroup(m.chat) || {}

    if (!groupData.antitoxic) {
        return false
    }

    const maxWarn = Math.max(
        1,
        Math.min(
            10,
            Number(groupData.toxicMaxWarn || 3)
        )
    )

    const method =
        groupData.toxicMethod === "delete"
            ? "delete"
            : "kick"

    if (!groupData.toxicWarns) {
        groupData.toxicWarns = {}
    }

    const oldWarn = Number(
        groupData.toxicWarns[m.sender] || 0
    )

    const warnCount = oldWarn + 1

    groupData.toxicWarns[m.sender] = warnCount

    saveGroup(db, m.chat, groupData)

    /* ---------------------------------------------------------------------- */
    /* DELETE TOXIC MESSAGE                                                   */
    /* ---------------------------------------------------------------------- */

    try {
        if (m.key) {
            await sock.sendMessage(m.chat, {
                delete: m.key
            })
        }
    } catch {}

    const senderTag =
        String(m.sender)
            .split("@")[0]
            .split(":")[0]

    /* ---------------------------------------------------------------------- */
    /* MAX WARNING REACHED                                                    */
    /* ---------------------------------------------------------------------- */

    if (warnCount >= maxWarn) {

        if (method === "kick") {
            try {
                if (typeof sock.groupParticipantsUpdate === "function") {
                    await sock.groupParticipantsUpdate(
                        m.chat,
                        [m.sender],
                        "remove"
                    )
                }
            } catch {}
        }

        /*
         * Reset warnings after action.
         */
        groupData.toxicWarns[m.sender] = 0

        saveGroup(db, m.chat, groupData)

        try {
            await sock.sendMessage(m.chat, {
                text: gpMsg("antitoxicAction", {
                    user: senderTag,
                    warn: String(warnCount),
                    max: String(maxWarn),
                    method
                }),
                mentions: [m.sender]
            })
        } catch {}

        return true
    }

    /* ---------------------------------------------------------------------- */
    /* WARNING                                                                 */
    /* ---------------------------------------------------------------------- */

    try {
        await sock.sendMessage(m.chat, {
            text: gpMsg("antitoxicWarn", {
                user: senderTag,
                warn: String(warnCount),
                max: String(maxWarn),
                method
            }),
            mentions: [m.sender]
        })
    } catch {}

    return true
}

/* -------------------------------------------------------------------------- */
/* COMMAND HANDLER                                                            */
/* -------------------------------------------------------------------------- */

async function handler(m, { db }) {
    const database = db || getDatabase()

    const args = getArgs(m)

    const subCommand =
        String(args[0] || "")
            .toLowerCase()
            .trim()

    const groupData =
        database.getGroup(m.chat) || {}

    /* ---------------------------------------------------------------------- */
    /* STATUS                                                                  */
    /* ---------------------------------------------------------------------- */

    if (!subCommand) {
        const status =
            groupData.antitoxic
                ? "✅ ON"
                : "❌ OFF"

        const toxicCount =
            Array.isArray(groupData.toxicWords) &&
            groupData.toxicWords.length > 0
                ? groupData.toxicWords.length
                : DEFAULT_TOXIC_WORDS.length

        const maxWarn =
            Number(groupData.toxicMaxWarn || 3)

        const method =
            groupData.toxicMethod === "delete"
                ? "delete"
                : "kick"

        const txt =
`🛡️ *ᴀɴᴛɪᴛᴏxɪᴄ*

> Status: *${status}*
> Kata: *${toxicCount}*
> Max Warn: *${maxWarn}*
> Metode: *${method}*

*COMMAND:*
> \`.antitoxic on\`
> \`.antitoxic off\`
> \`.antitoxic warn <1-10>\`
> \`.antitoxic metode kick\`
> \`.antitoxic metode delete\`
> \`.addtoxic <kata>\`
> \`.deltoxic <kata>\`
> \`.listtoxic\``

        await m.reply(txt)
        return
    }

    /* ---------------------------------------------------------------------- */
    /* ON                                                                      */
    /* ---------------------------------------------------------------------- */

    if (subCommand === "on") {
        saveGroup(database, m.chat, {
            antitoxic: true
        })

        try {
            await m.react("✅")
        } catch {}

        await m.reply(
            "✅ *Antitoxic diaktifkan*"
        )

        return
    }

    /* ---------------------------------------------------------------------- */
    /* OFF                                                                     */
    /* ---------------------------------------------------------------------- */

    if (subCommand === "off") {
        saveGroup(database, m.chat, {
            antitoxic: false
        })

        try {
            await m.react("❌")
        } catch {}

        await m.reply(
            "❌ *Antitoxic dinonaktifkan*"
        )

        return
    }

    /* ---------------------------------------------------------------------- */
    /* WARNING COUNT                                                           */
    /* ---------------------------------------------------------------------- */

    if (subCommand === "warn") {
        const count = Number(args[1])

        if (
            !Number.isInteger(count) ||
            count < 1 ||
            count > 10
        ) {
            return m.reply(
                "❌ Masukkan angka 1-10.\n" +
                "> Contoh: `.antitoxic warn 5`"
            )
        }

        saveGroup(database, m.chat, {
            toxicMaxWarn: count
        })

        try {
            await m.react("✅")
        } catch {}

        await m.reply(
            `✅ *Max peringatan diubah menjadi ${count}*`
        )

        return
    }

    /* ---------------------------------------------------------------------- */
    /* METHOD                                                                  */
    /* ---------------------------------------------------------------------- */

    if (
        subCommand === "metode" ||
        subCommand === "method" ||
        subCommand === "mode"
    ) {
        const method =
            String(args[1] || "")
                .toLowerCase()
                .trim()

        if (
            !method ||
            !["kick", "delete"].includes(method)
        ) {
            return m.reply(
                "❌ Pilih metode: *kick* atau *delete*.\n" +
                "> Contoh: `.antitoxic metode kick`"
            )
        }

        saveGroup(database, m.chat, {
            toxicMethod: method
        })

        try {
            await m.react("✅")
        } catch {}

        await m.reply(
            `✅ *Metode diubah ke ${method}*`
        )

        return
    }

    /* ---------------------------------------------------------------------- */
    /* DIRECT METHOD                                                          */
    /* ---------------------------------------------------------------------- */

    if (subCommand === "kick") {
        saveGroup(database, m.chat, {
            toxicMethod: "kick",
            antitoxic: true
        })

        try {
            await m.react("✅")
        } catch {}

        return m.reply(
            "✅ *Antitoxic aktif — metode KICK*"
        )
    }

    if (
        subCommand === "delete" ||
        subCommand === "remove"
    ) {
        saveGroup(database, m.chat, {
            toxicMethod: "delete",
            antitoxic: true
        })

        try {
            await m.react("✅")
        } catch {}

        return m.reply(
            "✅ *Antitoxic aktif — metode DELETE*"
        )
    }

    /* ---------------------------------------------------------------------- */
    /* INVALID COMMAND                                                        */
    /* ---------------------------------------------------------------------- */

    return m.reply(
        "❌ Sub-command tidak valid.\n" +
        "> Ketik `.antitoxic` untuk melihat daftar command."
    )
}

/* -------------------------------------------------------------------------- */
/* EXPORT                                                                     */
/* -------------------------------------------------------------------------- */

export {
    pluginConfig as config,
    handler,
    isToxic,
    handleToxicMessage,
    DEFAULT_TOXIC_WORDS
}

/* -------------------------------------------------------------------------- */
/* LEGACY / MODULE BRIDGE                                                     */
/* -------------------------------------------------------------------------- */

const __meta = {
    command: "antitoxic",
    aliases: ["toxic", "antitoxik"],
    package: "group",
    description: "Mengatur antitoxic di grup",
    isOwner: false,
    isGroup: true,
    isAdmin: true,
    isBotAdmin: true
}

async function __runLegacy(message, args = "") {
    const sock = withLegacySocket(message.conn)

    const rawCommand =
        String(message.body || "")
            .trim()
            .replace(/^\./, "")
            .split(/\s+/)[0]
            .toLowerCase()

    /*
     * Normalize arguments before creating legacy message.
     */
    const argumentText = Array.isArray(args)
        ? args.join(" ")
        : String(args || "")

    const lm = makeLegacyMessage(
        message,
        argumentText,
        rawCommand || __meta.command
    )

    /*
     * Make sure lm.args is always an array.
     */
    if (!Array.isArray(lm.args)) {
        lm.args = argumentText
            .trim()
            .split(/\s+/)
            .filter(Boolean)
    }

    if (lm.isGroup) {
        try {
            await lm.loadGroupInfo()
        } catch {}
    }

    if (__meta.isOwner && !lm.isOwner) {
        return lm.reply(
            "❌ Owner only."
        )
    }

    if (__meta.isGroup && !lm.isGroup) {
        return lm.reply(
            "❌ This command can only be used in groups."
        )
    }

    if (
        __meta.isAdmin &&
        !lm.isAdmin &&
        !lm.isOwner
    ) {
        return lm.reply(
            "❌ Only group admins can use this command."
        )
    }

    if (
        __meta.isBotAdmin &&
        !lm.isBotAdmin
    ) {
        return lm.reply(
            "❌ Bot must be a group admin to use this command."
        )
    }

    return runLegacyContext(
        lm,
        () =>
            handler(lm, {
                sock,
                db: getLegacyDatabase(lm),
                text: argumentText
            })
    )
}

Module(__meta)(
    async (message, args = "") =>
        __runLegacy(message, args)
)
