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

## Flight Sim

Flight Sim is a cockpit-inspired 60-second flight activity. Steer with `A` / `D` or the arrow keys, manage the takeoff and cruise phases, and bring the aircraft back to the runway for a landing score.

Copy `flightsim/` into your Red bot's cogs directory, then run:

```text
[p]load activityhub
[p]load flightsim
```

The game will appear in the ActivityHub menu as **Flight Sim**.

To enable live Airplanes.Live traffic, the bot owner can run `[p]flightsimkey <uuid-key>` with the key provided by Airplanes.Live. Run `[p]flightsimkey` without a key to check whether one is configured. Flight Sim queries a 40 nautical mile circle around KDCA through the backend, caches the result for 15 seconds, and never sends the key to players' browsers. Without a key, the simulator still works with live traffic marked offline.

## RuneScape companion client

`runescapeclient/` is an installable ActivityHub cog. Its login button opens the official RuneScape site in a new tab; it does not collect, proxy, or inspect credentials. Player names are optional and stored only in the browser's local storage.

Copy the `runescapeclient/` folder into your Red bot's cogs directory, then run:

```text
[p]load activityhub
[p]load runescapeclient
```

The companion will appear in the ActivityHub menu as **RuneScape Companion**.

The original `runescape-client/` folder remains available as a standalone browser preview.

