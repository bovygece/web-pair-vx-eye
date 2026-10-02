# VX MD BOT — Group Gaming

Gaming is now a per-group ON/OFF feature.

## Admin
- `.gaming on`
- `.gaming off`
- `.gaming`

## Games
- `.game`
- `.game search`
- `.game rps`
- `.game quiz`
- `.game math`
- `.game guess`
- `.game dice`
- `.game word`
- `.game join`
- `.game stop`

### Natural triggers
When Gaming is ON, members can also type `game`, `gaming`, `rps`, `quiz`, `dice`, `word game`, etc. without the dot prefix.

The setting is stored in the bot database per bot + group. Active rounds are runtime state and are cleared on restart or when Gaming is turned OFF.
