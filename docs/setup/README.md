# Setting up XRDB with your media app

There are two ways XRDB can reach a client, and which one you need depends
entirely on the client.

**By URL.** The app asks XRDB for an image and XRDB renders it on request.
Nothing is written to disk, and a profile edit shows up everywhere at once.
This is the better option wherever it is available.

**By file.** XRDB writes `poster.jpg` and `fanart.jpg` next to your media, and
the app picks them up the way it picks up any local artwork. Needed for clients
that cannot be pointed at a remote URL. It is off by default; see
[folder writing](folder-writing.md).

| Client | Method | Guide |
|---|---|---|
| Stremio | URL | [stremio.md](stremio.md) |
| AIOMetadata | URL | [aiometadata.md](aiometadata.md) |
| Jellyfin | File | [jellyfin.md](jellyfin.md) |
| Emby | File | [emby.md](emby.md) |
| Kodi | File | [kodi.md](kodi.md) |
| Plex | File | [plex.md](plex.md) |

Every guide assumes you have already built a look in the **Configurator** and
saved it as a profile with an alias. The alias is what appears in URLs and in
the folder-writer settings.
