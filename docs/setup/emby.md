# Emby

Emby reads artwork from the media folder, so XRDB reaches it by writing files.
Set up [folder writing](folder-writing.md) first.

## Steps

1. Enable NFO saving for the library: **Settings → Library → your library →
   Metadata savers → Nfo**, then refresh metadata. XRDB uses the ids in those
   files to identify each title.
2. Enable folder writing in XRDB with your library paths and run a dry run.
3. Run it with `apply=true`.
4. Refresh the library in Emby.

## Keeping it that way

In the library's image-fetcher settings, turn off downloading images that
already exist locally, so an online fetcher does not replace what XRDB wrote.
