# Folder writing

Some clients cannot be pointed at a remote artwork URL. For those, XRDB can
write the rendered image next to the media, which every media server
understands.

This is the only part of XRDB that modifies your files, so it is **off unless
you turn it on**.

## Enable it

```sh
XRDB_FOLDER_WRITER=true
XRDB_LIBRARY_ROOTS=/media/movies,/media/tv
XRDB_FOLDER_WRITER_PROFILE=your-alias      # optional; omit for the defaults
XRDB_FOLDER_WRITER_SURFACES=poster,backdrop
XRDB_FOLDER_WRITER_INTERVAL_H=24           # 0 disables the schedule
XRDB_FOLDER_WRITER_OVERWRITE=false         # true replaces artwork already there
XRDB_FOLDER_WRITER_PACE_MS=250             # gap between titles
```

The container needs the library mounted, and write access to it.

## Run it

```sh
# What would change — writes nothing
curl -X POST -H "Authorization: Bearer $XRDB_ADMIN_KEY" \
  https://your-xrdb-host/api/admin/folder-writer

# Actually write
curl -X POST -H "Authorization: Bearer $XRDB_ADMIN_KEY" \
  "https://your-xrdb-host/api/admin/folder-writer?apply=true"
```

A manual trigger is a dry run unless you pass `apply=true`. Start there: the
report tells you what it found, what it would write, and what it could not
identify.

With an interval set, the pass repeats on its own, so editing your profile
updates the files on disk without you doing anything.

## Which files it writes

Only these, and nothing else is created, moved or deleted:

| Surface | Filename |
|---|---|
| poster | `poster.jpg` |
| backdrop | `fanart.jpg` |
| logo | `clearlogo.png` |

Artwork already in place is left alone unless `OVERWRITE` is on, so posters you
curated yourself are safe.

## "It skipped most of my library"

A title is only written when a `.nfo` beside it gives a definite IMDb or TMDB
id. XRDB does not guess from folder names: a skipped title is easy to fix,
whereas the wrong film's poster written into your library is not.

The report lists every directory it passed over and why. If most of them say
*no .nfo*, run a metadata refresh in your media manager with NFO writing
enabled — Kodi, Jellyfin, Emby, Sonarr and Radarr can all produce them — then
run the pass again.
