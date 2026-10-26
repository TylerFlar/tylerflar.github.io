---
title: "MineCord Link"
summary: "A Minecraft server plugin that links the game's chat and events to a Discord channel, downloaded 510 times."
image: /assets/images/projects/minecord-link/cover.jpg
date: 2024-09-04
cv: project/minecord
category: software
role: "Personal project"
links:
    - { label: Code, href: "https://github.com/TylerFlar/minecord-link" }
    - { label: Modrinth, href: "https://modrinth.com/plugin/minecord-link" }
---

MineCord Link is a plugin for Spigot and Paper Minecraft servers that links the game to one Discord channel. I wrote it in Java over summer 2024, growing it out of a smaller chat bridge I'd made the year before.

## What it does

- **Game to Discord.** Chat goes to Discord through a webhook, under each player's name and head as the avatar. Joins, leaves, deaths, advancements and the server starting and stopping post as embeds.
- **Discord to game.** A bot built on JDA relays Discord messages into the game.
- **Slash commands.** Six in Discord: anyone can list the online players or toggle the chat bridge, and admins on an allowlist can set the plugin up or run a console command on the server.
- **Linked accounts.** A player links their Discord account with a six-character code that expires after five minutes. After that their chat shows their Discord nickname, and their events mention them.
- **Running it.** Each event type can be turned off, a config migration adds new settings without touching the ones you set, and the plugin checks GitHub for new releases.

GitHub Actions builds and publishes a release whenever the version goes up. It shipped eight releases between August and September 2024 and has been downloaded 510 times on Modrinth.

## What didn't work

Three bugs made it into the last release. Redeeming a link code from Discord fails, because the in-game command it looks up was renamed. The setting to turn off update checks reads the wrong key, so it does nothing. And the chat-bridge toggle skips the allowlist check its README promises. The updater also swaps in the new jar without checking a signature.
