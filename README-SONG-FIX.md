# Song / Play fix + Group Safety

- `.song .music .audio .गाना ...`  -> plugins/song.js (audio only, MP3)
- `.play .ytplay`                  -> plugins/play.js (Now-Playing card + MP3), shares the engine of song.js
- Engine: search -> download audio buffer (5 public APIs in parallel, SaveTube, yt-dlp, YouTube.js, Piped) -> ffmpeg to MP3 -> send.
- Optional (recommended on Railway): set `YT_COOKIES` (Netscape cookies text) or `YT_COOKIES_FILE` so yt-dlp works when YouTube blocks datacenter IPs.

New: plugins/groupsafety.js  ->  .safety .mute .unmute .mutelist .slowmode .lockdown .unlockdown .antiraid .antifake .blacklist .report
