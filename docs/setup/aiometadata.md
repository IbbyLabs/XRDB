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

## Self-hosting XRDB on your own domain

AIOMetadata caches the artwork it fetches, and it applies a per-domain policy to
decide for how long. It ships one for `extendedratings.com` and cannot know
about your host, so an unlisted domain falls to its default and your edits can
sit behind an image AIOMetadata is still holding.

Add your XRDB hostname under **your domains** in AIOMetadata's poster cache
policies and set it to **Follow source**. XRDB sends `cache-control: public,
max-age=<seconds>` on every render, counted from `XRDB_CACHE_TTL_HOURS` — the
default 72 hours reads as `max-age=259199`. AIOMetadata then expires its copy in
step with yours.

Purge the poster cache once after adding it, to clear what was stored under the
old policy.

If a poster still looks stale, the three-way check tells you which cache holds
it. Request the same title directly from XRDB, then again with `&cb=1`, then
through AIOMetadata:

```
direct old, direct+cb new   XRDB's render cache
direct new, via AIOM old    AIOMetadata's poster cache
all three new               the client's own cache
```

If your instance sets `XRDB_API_KEY`, enter it at the top of the Install tab so
it is woven into the patterns; AIOMetadata fetches server-side and cannot send
a header.
