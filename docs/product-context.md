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
- The minimal, average, dual and dual-minimal presentations draw score pills rather than the badge row. They take the rating scale and offsets like every other overlay, and `aggregatePillPos` anchors them to any of the six positions. Any older answer saying the fine tuning cannot reach them is out of date.
- Left unplaced, a dual pair keeps one pill against the top edge and one against the bottom. Setting a position stacks the pair together at that corner, critics above audience, which is the v2 layout.
- Separate critics and audience colours exist as `aggregateCriticsAccentColor` and `aggregateAudienceAccentColor`. The configurator shows the pickers once the accent mode is set to Custom.
- Where the pill controls live: Ratings tab, with Fine tuning switched on. Presentation, Pill position and scale sit under Rating badges; accent source, the critics and audience colours, Fill by score, Accent rail and Accent shape sit under Score colours just below. Any older answer telling someone to enable the Aggregate bar first, or describing that as a workaround, is out of date — the colour controls no longer live inside the bar's own group. Only Bar style, Bar offset and the scorebar bands do.
- An accent colour fills the block behind the label when the presentation has one. On the label-less presentations, minimal and dual-minimal, it marks the capsule itself, so a dual pair can carry one colour per role. Any older answer saying accent colours do nothing on those styles, or that a coloured outline with a dark body is impossible, is out of date.
- `aggregateAccentShape` picks how it is marked: `outline` traces the pill and keeps the body dark, `strip` draws a centred bar along the top edge. Outline is the default.
- Turning the accent rail off drops that outline too, and Fill by score puts the colour in the body instead, so the three treatments do not stack.

## Quality badges

- Quality badges are formats the user picks: 4K, HD, HDR, HDR10, HDR10+, Dolby Vision, DTS, Atmos, IMAX, Blu-ray, Remux and BD Remux.
- Each picked badge is drawn on a title only when that title is actually available in that format. There is no switch for this and it cannot be turned off per render: a badge that is not true of the title is decoration.
- The check filters and never adds. The chips stay the user's pick, so it cannot introduce a badge nobody chose, and picking nothing still draws nothing.
- Worked example: Oppenheimer keeps 4K, IMAX, DTS and Remux because it genuinely has all four; Citizen Kane drops IMAX and keeps the rest.
- Checking means asking a stream addon. One is configured by default (a public Comet instance), so this holds without any setup; an operator can point `XRDB_STREAM_ADDON_URL` at their own or set it to `off`.
- If the addon is unreachable the picks are drawn unchecked rather than blanked, and that render is cached only briefly so it corrects itself.
- Detecting without picking would be useless: almost every popular title has some release in every format, so "show everything that exists" paints every badge on everything. The pick is what gives the row meaning.
- Any older answer saying XRDB is handed a title and cannot know what quality exists is out of date, as is any answer describing an "Only show what's available" toggle.

## Other overlays

- Age rating, release status, top-rated rank, genre, trending and streaming-provider chips are each their own switch.
- The trending badge draws for a title addressed by either an IMDb or a TMDB id. Any older answer saying it works only for TMDB ids, or that a tt request has nothing to match against, is out of date.
- Position, scale, style and a per-overlay cap are configurable, and a hidden switch turns a row off without losing the selection.
- That includes the Where to watch chips: `providersPos`, `providerBadgeScale` and `providerBadgeOffsetX`/`Y` size and place them like any other badge. Left alone they stay a wide strip centred along the bottom edge. Any older answer saying the chips cannot be resized or moved, and that only country and tile colour are configurable, is out of date.
- Artwork can come from TMDB, Fanart, Cinemeta or the anime sources, with a fallback order so a surface missing from one is filled from another.
- Clean artwork is the textless poster with the title logo drawn back on. When no source has a textless poster for a title, the logo is no longer drawn, because compositing it onto art that already carries its title printed the title twice. Any older answer saying to use textless as the workaround for a doubled title is out of date; clean now falls back to the art as-is.
- Artwork language can be set per render, including `original` for the title's own language.
- Under `original`, the logo now matches the title's own language on English-original titles too. It previously took the highest-voted logo in any language for those, so an English show could render a Portuguese or Chinese wordmark. A language-neutral logo is preferred over one tagged for a language nobody asked for.
- The title logo drawn on clean posters and on a backdrop-as-poster takes `logoWidth`, `logoHeight` and `logoPos` as percentages, plus `logoAnchor: bottom`. Any older answer saying its size and position are fixed is out of date. `logoPos` is where the logo's centre sits, so resizing does not also move it; the bottom anchor pins the lower edge instead so a larger logo grows upward. Aspect ratio is always preserved — the logo fits inside the box and never stretches, so no separate control is needed for that. These are per surface, like every other config key.

## Migrating from v2

- v2 profiles import and keep every original key; anything that cannot be translated is carried rather than dropped.
- v2's `streamBadges` switched its torrent-index lookup on and off. There is no equivalent here because the check is not optional, so the key is carried but no longer drives anything. It used to be read as the streaming-service chips, which gave imported profiles service logos nobody chose.
- v2's "glass" rating style is XRDB's Pill.
- v2 spellings of config keys are still accepted on import.

## Answering questions

- Check the running version at `https://extendedratings.com/healthz` before telling anyone a fix is live.
- The developer build is `https://dev.extendedratings.com` and moves ahead of the stable one.
- Point bug reports at `/bug report` and feature requests at `/feat submit` rather than collecting them in chat.
