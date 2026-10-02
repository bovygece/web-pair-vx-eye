# VX MD BOT — Stable Hosting Build

## Hosting stability
This build uses a small foreground supervisor (`runner.js`). The supervisor does **not** daemonize the bot. It keeps the Pterodactyl/Bot-Hosting container alive and automatically starts the Node bot again if the bot process exits unexpectedly.

Temporary WhatsApp disconnects are handled separately by the WhatsApp session manager with unlimited reconnect attempts by default.

## Hosting commands
```bash
npm install
npm start
```

Recommended Pterodactyl startup command:
```bash
npm start
```

Do not use `pm2 start ...` as the hosting startup command.

## Automatic recovery
- Unexpected Node process exit → supervisor restarts it after 3 seconds.
- Temporary WhatsApp disconnect → session reconnects without deleting valid credentials.
- Repeated WhatsApp reconnect failures → retries continue; the session is not automatically logged out.
- HTTP health endpoint is checked periodically; repeated unhealthy checks restart the bot process.
- SIGTERM/SIGINT from the hosting panel is treated as a real shutdown and is not fought by the supervisor.

## Important limitation
No application can prevent the hosting provider itself from terminating/suspending a container because of account limits, quota, manual stop, or infrastructure failure. If the panel kills the entire container rather than the Node process, that requires a hosting-side fix/plan. The supervisor specifically fixes application-process crashes/exits.


## Environment variables

Keep credentials out of Git. Configure these in the hosting provider when needed:

- `FDOWNLOADER_K_TOKEN` — optional Facebook downloader token
- `FIREBASE_API_KEY` — optional Firebase API key
- `YT_COOKIES` or `YT_COOKIES_FILE` — optional YouTube cookies; never commit cookie files
