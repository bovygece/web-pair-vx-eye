STATUS FIX - install
====================
Copy these 6 files into your bot's  plugins/  folder (replace when asked):
  groupstatus.js   (shared engine - REQUIRED, all commands use it)
  gstatus.js       (.gstatus / .gcstatus / .gs / .groupstatus)
  swgc.js
  swgcall.js
  swgcv2all.js
  gstory.js        (NEW command)
No other file is changed. No new npm package needed (ffmpeg is already in your Dockerfile).
Restart the bot after replacing.

Optional Railway variables
  GSTATUS_DEBUG=1        detailed logs for every status (use this if a media status still does not show)
  GSTATUS_MEDIA_HINT=0   turn off the media stanza hint (only for testing)

Usage
  .gcstatus Hello                     text status, new colour every time
  .gcstatus #ff0000 Hello             own colour   (also: bg:red, bg:laal, font:2)
  reply photo/video/audio + .gcstatus [caption]
  .swgc Hello  -> list -> .swgc 3  or  .swgc 1,4,7
  .swgcall Hello -> .swgcall --yes  (cancel: .swgcall --cancel)
  .swgcv2all Hello   (direct, no confirmation)
  .gstory Hello | Kaise ho | Bye      colourful multi-card story
  .gstory shayari / love 3 / rainbow Jai Ho / all good morning / list
