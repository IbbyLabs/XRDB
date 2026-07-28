# Product context

The prose half of the summary the XRDB community bot answers from. A generator
reads this file, appends the parts it can derive from the code, and writes
`public/product-context.json`; the bot fetches that from the newest tag.

Edit the wording here. Do not add config options or environment variables by
hand — those sections are generated from `imageconfig.Config` and `variables.md`
so they cannot drift from what the build actually accepts.

Each `##` heading becomes a section and each `-` bullet a line. Anything else is
ignored, so this header text costs nothing.

## What XRDB is

- XRDB renders poster, backdrop, logo and episode-thumbnail artwork on demand, drawing ratings and metadata onto the image.
- It is used mainly through Stremio-style addons, and also writes artwork to folders for Plex and Jellyfin.
- A render is described entirely by its config, so the same title can look different in two libraries at once.
- Renders are cached; a render missing a badge because a source failed is cached only briefly so it corrects itself once the source recovers.

## Ratings

- Ratings come from IMDb, TMDB, MDBList, OMDb, Trakt, SIMKL, MyAnimeList, AniList, Kitsu, AlloCiné and Filmweb.
- Only the sources a config actually asks for are fetched, which is what keeps a cold render fast.
- Anime titles resolve through MAL, AniList and Kitsu ids, so anime keeps its ratings.
- A source that is rate-limited or erroring falls back to its last good answer rather than dropping its badge.

## Quality badges

- Quality badges are labels the user picks: 4K, HD, HDR, HDR10, HDR10+, Dolby Vision, DTS, Atmos, IMAX, Blu-ray, Remux and BD Remux.
- Turning on "Only show what's available" checks each title against a stream addon and drops the badges it has no release in.
- The check filters and never adds. The chips stay the user's pick, so it cannot introduce a badge nobody chose, and picking nothing still draws nothing.
- It needs a stream addon configured on the server. Without one the switch does nothing.
- Worked example: Oppenheimer keeps 4K, IMAX, DTS and Remux because it genuinely has all four; Citizen Kane drops IMAX and keeps the rest.
- Detection on its own would be useless: almost every popular title has some release in every format, so "show what exists" would paint every badge on everything. The user's pick is what gives the row meaning.
- Any older answer saying XRDB is handed a title and cannot know what quality exists is out of date.

## Other overlays

- Age rating, release status, top-rated rank, genre, trending and streaming-provider chips are each their own switch.
- Position, scale, style and a per-overlay cap are configurable, and a hidden switch turns a row off without losing the selection.
- Artwork can come from TMDB, Fanart, Cinemeta or the anime sources, with a fallback order so a surface missing from one is filled from another.
- Artwork language can be set per render, including `original` for the title's own language.

## Migrating from v2

- v2 profiles import and keep every original key; anything that cannot be translated is carried rather than dropped.
- v2's `streamBadges` becomes the quality availability check. It previously turned on the streaming-service chips instead, so an imported profile could gain service logos nobody chose.
- v2's "glass" rating style is XRDB's Pill.
- v2 spellings of config keys are still accepted on import.

## Answering questions

- Check the running version at `https://extendedratings.com/healthz` before telling anyone a fix is live.
- The developer build is `https://dev.extendedratings.com` and moves ahead of the stable one.
- Point bug reports at `/bug report` and feature requests at `/feat submit` rather than collecting them in chat.
