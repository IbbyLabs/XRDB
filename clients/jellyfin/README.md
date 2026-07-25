# XRDB plugin for Jellyfin

Adds XRDB as an image provider, so its renders appear in Jellyfin's own image
picker and in automatic image fetching. Artwork arrives by URL and nothing is
written into your media library.

This is the better of the two ways to use XRDB with Jellyfin. The other is
[folder writing](../../docs/setup/folder-writing.md), which suits anyone who
would rather have the files on disk.

## Status

Written against the Jellyfin 10.10 plugin API and built in CI, but **not yet
verified against a running Jellyfin server**. Treat the first install as a
trial and please report anything that misbehaves.

## Build

```sh
dotnet publish Jellyfin.Plugin.Xrdb -c Release -o out
```

Copy `out/Jellyfin.Plugin.Xrdb.dll` into a `plugins/XRDB` folder inside your
Jellyfin data directory and restart the server.

## Configure

**Dashboard → Plugins → XRDB**:

- **Server URL** — where your XRDB instance is reachable from Jellyfin.
- **Profile alias** — the saved profile whose look the artwork takes. Leave it
  empty for the instance defaults.
- **API key** — only if your instance sets `XRDB_API_KEY`. Jellyfin fetches
  server-side and cannot send a header, so the key travels in the URL.

Then, on a library: **Edit → Metadata**, and move XRDB above the other image
fetchers so its artwork is preferred.

## What it needs from an item

An IMDb or TMDB id, which Jellyfin's normal metadata providers already supply.
An item with neither is skipped rather than guessed at.
