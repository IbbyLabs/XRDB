# Plex

Plex is the awkward one. Its standard TMDB and TVDB agents cannot be pointed at
a remote artwork URL — that is a limitation of the agents, not of XRDB, and it
is why tools in this space are upload or file-based rather than URL-based.

The reliable route is [folder writing](folder-writing.md).

## Steps

1. Enable **Local Media Assets** for the library: **Settings → Libraries → your
   library → Edit → Advanced**, and make sure it is high in the agent order.
2. Your library needs NFO files carrying the IMDb or TMDB id. Plex does not
   write these, so use Radarr, Sonarr or tinyMediaManager to produce them.
   Without them XRDB will skip the title rather than guess.
3. Enable folder writing in XRDB with your library paths and run a dry run.
4. Run it with `apply=true`, then refresh metadata on the library in Plex.

## Keeping it that way

Plex re-fetches posters when it refreshes metadata and can put its own back.
Setting `XRDB_FOLDER_WRITER_INTERVAL_H` means XRDB restores yours on the next
pass.

Nothing XRDB writes is destructive: it only ever creates `poster.jpg`,
`fanart.jpg` and `clearlogo.png`, and leaves existing files alone unless you
turn overwrite on.
