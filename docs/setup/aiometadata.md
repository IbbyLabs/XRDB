# AIOMetadata

AIOMetadata is the fullest way to use XRDB with Stremio: it keeps Cinemeta's
metadata and swaps in XRDB's artwork, including logos and episode thumbnails.

## One-click

1. Save a profile with an alias in the **Configurator**.
2. Open the **Install** tab and fill in your AIOMetadata instance, profile UUID
   and password.
3. Press **Install to AIOMetadata**. XRDB writes its artwork URL patterns into
   your AIOMetadata profile and hands back a Stremio install link.

Your AIOMetadata credentials go straight to the instance you chose. XRDB does
not store them.

## By hand

Set AIOMetadata's poster provider to **custom** and paste these into its custom
artwork fields, replacing the host and alias:

```
https://your-xrdb-host/poster/{id}?config=your-alias
https://your-xrdb-host/backdrop/{id}?config=your-alias
https://your-xrdb-host/logo/{id}?config=your-alias
https://your-xrdb-host/thumbnail/{id}:{season}:{episode}?config=your-alias
```

Use `{id}` rather than `{imdb_id}`. Anime and TVDB-sourced catalogues give
their items ids like `kitsu:123`, leaving `{imdb_id}` empty, and AIOMetadata
drops the whole URL when a placeholder it references has no value, so those
titles keep their plain artwork. XRDB reads `tt`, `tmdb:`, `tvdb:`, `kitsu:`,
`mal:` and `anilist:` ids.

The **Install** tab shows these ready to copy, with your alias already in place
and a version token appended so an edit is picked up.

If your instance sets `XRDB_API_KEY`, enter it at the top of the Install tab so
it is woven into the patterns; AIOMetadata fetches server-side and cannot send
a header.
