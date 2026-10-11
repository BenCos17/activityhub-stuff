# ActivityHub games

This repository contains a ready-to-load ActivityHub game cog: `signalsprint/`.

## Signal Sprint

Signal Sprint is a 30-second arcade game. Move the beacon with `A` / `D` or the arrow keys and dodge falling interference. The browser preview keeps a local best score; inside Discord, the cog stores each player's best score through ActivityHub.

### Install

Copy `signalsprint/` into your Red bot's cogs directory, then load it after ActivityHub:

```text
[p]load activityhub
[p]load signalsprint
```

Open the ActivityHub preview or Discord Activity menu to launch the game.

## RuneScape companion client

`runescape-client/` is a standalone JavaScript companion interface. Open `runescape-client/index.html` in a browser, or serve the repository with any static web server. Its login button opens the official RuneScape site in a new tab; it does not collect, proxy, or inspect credentials. Player names are optional and stored only in the browser's local storage.

