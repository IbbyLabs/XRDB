# Jellyfin

There are two ways round, and the plugin is the nicer one.

## Plugin (artwork by URL)

The [XRDB plugin](../../clients/jellyfin/README.md) adds XRDB to Jellyfin's own
image picker, so nothing is written into your library and a profile edit is
picked up on the next fetch.

It is written against the Jellyfin 10.10 plugin API and built in CI, but has
not yet been verified against a running server, so treat the first install as
a trial.

## Folder writing (artwork on disk)

The alternative, and the one to use if you would rather have the files
locally. Set up [folder writing](folder-writing.md) first.

## Steps

1. Make sure your Jellyfin library has NFO files. In Jellyfin, go to
   **Dashboard → Libraries → your library → Manage Library**, enable
   **Nfo** under metadata savers, and run a metadata refresh. XRDB uses the ids
   in those files to know which title is which.
2. Enable folder writing in XRDB with your library paths, and run a dry run to
   confirm it identifies your titles.
3. Run it with `apply=true`.
4. In Jellyfin, **Scan All Libraries**. It picks up `poster.jpg` and
   `fanart.jpg` as local artwork.

## Keeping it that way

Jellyfin can overwrite local images when it refreshes metadata from an online
source. Under **Manage Library**, turn off **Replace existing images** for the
image fetchers, or set image fetching to local only.

With `XRDB_FOLDER_WRITER_INTERVAL_H` set, XRDB re-runs the pass on its own, so
anything Jellyfin does replace comes back.
