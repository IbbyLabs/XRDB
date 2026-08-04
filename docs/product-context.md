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
- `ratingsMovie`, `ratingsSeries` and `ratingsAnime` override the rating sources for that kind of title, so a film can show IMDb and Rotten Tomatoes while an anime shows MAL and AniList in the same config. An anime override wins over the series one. Leaving them empty keeps the single `ratings` list for everything, so nothing changes for a config that does not use them.
- Only the sources a config actually asks for are fetched, which is what keeps a cold render fast.
- Anime titles resolve through MAL, AniList and Kitsu ids, so anime keeps its ratings.
- A source that is rate-limited or erroring falls back to its last good answer rather than dropping its badge.
- MDBList meters by the day, so XRDB paces it from the allowance MDBList reports on every response: what is left is spread evenly over the rest of the day, with a quarter of the day's budget held in reserve so a catalogue crawl or a mass re-render cannot finish it. A page of a few dozen titles still goes out at once; only a sustained flood is paced. `XRDB_MDBLIST_RESERVE_PCT`, `XRDB_MDBLIST_MAX_RPS` and `XRDB_MDBLIST_BURST` tune it. Any older answer saying MDBList is paced at a fixed 10 requests a second is out of date.
- The RPDB-compatible route (`/{key}/imdb/...`) caps its output size, `small` by default via `XRDB_RPDB_MAX_SIZE`, because Stremio caps a meta poster at 100KB and a 4K one is roughly ten times that. A profile set to 4K still renders at 4K on its own URLs. That route also answers HEAD now, so a client checking whether a poster exists no longer gets a 405. Any older answer saying the RPDB route serves whatever size the profile asks for is out of date.
- Renders are weighted by output size, so a burst of 4K posters cannot take every render slot at the price of one. Ordinary renders are unaffected.
- A title with no artwork at all is remembered for a minute, so a catalogue of one does not re-ask every provider per episode. Artwork added upstream appears on the next render after that, not up to a full cache TTL later. Self-hosters can change it with `XRDB_NOT_FOUND_TTL_SECONDS`, or set 0 to switch it off.
- Sources scored out of five or four carry their scale on the badge: Letterboxd and AlloCine draw as `4.2/5`, Roger Ebert as `3.5/4`. Sources already out of ten, and percentages, are unmarked. Set the rating value mode to one of the normalized options to put every source on ten instead. Any older answer saying a Letterboxd score is drawn bare, or that its scale is only distinguishable by knowing the source, is out of date.
- A film Roger Ebert wrote a Great Movies essay on draws a gold mark in place of the plain Roger Ebert logo. The essay earns it, not the score, so a film he gave three and a half stars can carry the mark while a four-star film he never wrote up does not. The list closed when he died in 2013 and ships with the build, so it costs no request and never goes stale. It is keyed on IMDb ids, so a title identified only by a TMDB id keeps the plain mark. Any older answer saying every Roger Ebert badge draws the same logo, or that the mark tracks the star rating, is out of date.
- The order the rating sources are listed in is the order they draw, and the row cap keeps the first ones, so reordering changes which ratings appear. Reordering a saved profile now returns new artwork. Any older answer saying order is cosmetic, or that a reordered profile keeps showing the same image, is out of date.
- The title logo is never drawn over artwork that already has the title printed on it, whichever setting asked for it. Backdrop logo therefore draws nothing on a poster whose art carries its own title, and still draws on backdrops and on textless poster art, which is what it is for. Any older answer saying Backdrop logo always composites a logo is out of date.
- The shading behind a clean-poster title logo fades smoothly to its peak instead of turning at it, so it no longer draws a horizontal line across pale artwork. `logoScrimSize` sets how far it reaches past the logo and `logoScrimOpacity` how dark it gets, both under Title logo in Fine tuning as "Shadow spread" and "Shadow strength". Any older answer saying the shading is fixed, or that the line through bright posters cannot be helped, is out of date.
- The title logo's shadow has three looks, set by `logoShadowStyle`: `shadow` is a soft drop shadow, `extrude` a solid 3D stack behind the letters, `gel` a raised edge with a lit highlight like a moulded number plate, `emboss` a carved look that lights the letters' own edges from one side and shadows the other, drawn over the mark rather than behind it. `logoShadowOffsetX` and `logoShadowOffsetY` move it any number of pixels, negative for left and up, and `logoShadowColor` tints it, so a coloured glow is a setting rather than a request. All four sit under Title logo in Fine tuning. Any older answer saying the shadow is always a soft black one below the mark, or that its direction and colour are fixed, is out of date.
- Each rating provider's logo can carry a traced outline, `iconOutlineColor` with `iconOutlineWidth`, for artwork the mark would otherwise disappear into. It follows the logo's own shape rather than boxing it, and sits under Rating badges in Fine tuning as "Logo outline". Any older answer saying only the text of plain badges can be outlined is out of date.
- Rating badges take `ratingBadgeDensity`, a percent controlling the padding inside each badge and the gap to its logo. Lower hugs the contents, which is what makes v2's badges narrower than v3's defaults; the logo and the value keep their size either way.
- `ratingBadgeBorderColor` with `ratingBadgeBorderOpacity` traces the badge capsule on any style, including the solid ones that draw no border of their own. Any older answer saying a capsule outline is impossible without the Glass style is out of date.
- The compact rating ring takes `ringScale`, a percent of its default size, and the number inside grows with it. It sits under Rating badges with Fine tuning switched on, as "Ring size". Any older answer saying the ring cannot be resized, or that its size is fixed, is out of date.
- A badge cap left blank means no cap, and a stored zero is read the same way. Any older answer telling someone to set the cap to 20 to get their rating badges back is out of date; that was a workaround for a saved profile drawing no rating badges at all.
- The minimal, average, dual and dual-minimal presentations draw score pills rather than the badge row. They take the rating scale and offsets like every other overlay, and `aggregatePillPos` anchors them to any of the six positions. Any older answer saying the fine tuning cannot reach them is out of date.
- Left unplaced, a dual pair keeps one pill against the top edge and one against the bottom. Setting a position stacks the pair together at that corner, critics above audience, which is the v2 layout.
- Separate critics and audience colours exist as `aggregateCriticsAccentColor` and `aggregateAudienceAccentColor`. The configurator shows the pickers once the accent mode is set to Custom.
- Where the pill controls live: Ratings tab, with Fine tuning switched on. Presentation, Pill position and scale sit under Rating badges; accent source, the critics and audience colours, Fill by score, Accent rail and Accent shape sit under Score colours just below. Any older answer telling someone to enable the Aggregate bar first, or describing that as a workaround, is out of date — the colour controls no longer live inside the bar's own group. Only Bar style, Bar offset and the scorebar bands do.
- An accent colour fills the block behind the label when the presentation has one. On the label-less presentations, minimal and dual-minimal, it marks the capsule itself, so a dual pair can carry one colour per role. Any older answer saying accent colours do nothing on those styles, or that a coloured outline with a dark body is impossible, is out of date.
- `aggregateAccentShape` picks how it is marked: `outline` traces the pill and keeps the body dark, `strip` draws a centred bar along the top edge. Outline is the default.
- `aggregateAccentWidth` sets how thick that outline is drawn, in pixels. Any older answer saying its thickness is fixed is out of date.
- Turning the accent rail off drops that outline too, and Fill by score puts the colour in the body instead, so the three treatments do not stack.
- The badge outline controls under Rating badges reach the pill presentations as well as the per-source badges: `ratingBadgeBorderColor`, `ratingBadgeBorderWidth`, `ratingBadgeBorderOpacity` and the source tint all draw on the capsule, so an outline set on Standard follows when the presentation changes. Any older answer saying those four do nothing on minimal, average or dual, or offering an accent colour as the way to outline a pill, is out of date.
- Picking an accent source and leaving its colour unset colours by score band, red below 5 and green from 8, rather than doing nothing. That applies to Custom with no colour chosen, By score with no stops set, and any mode whose lookup finds nothing. Choosing no accent source at all still leaves the capsule plain. Any older answer saying Custom needs a colour before Fill by score, Body tint, Accent rail or Accent shape will do anything, or that those controls are only live once a hex is entered, is out of date.
- On a label-less pill the accent and the outline want the same edge, and a typed outline colour wins it. The accent then draws as a strip along the top instead of as the ring, so a By-score colour still tracks the score and is still on the pill. Setting an outline colour therefore changes a By-score ring into a strip; clearing it puts the ring back.

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
- `metaLine` draws one centred line at the foot of the artwork carrying the age rating, year and a genre, over a gradient that fades upward, the way the streaming apps present it. `metaLineScale` sizes it. It is off by default.
- The trending badge draws for a title addressed by either an IMDb or a TMDB id. Any older answer saying it works only for TMDB ids, or that a tt request has nothing to match against, is out of date.
- Position, scale, style and a per-overlay cap are configurable, and a hidden switch turns a row off without losing the selection.
- Provider chips and quality tiles scale to 400 percent, matching the rating badges. Any older answer capping them at 200 is out of date; 200 was too small to read on a large or 4k poster.
- That includes the Where to watch chips: `providersPos`, `providerBadgeScale` and `providerBadgeOffsetX`/`Y` size and place them like any other badge. Left alone they stay a wide strip centred along the bottom edge. Any older answer saying the chips cannot be resized or moved, and that only country and tile colour are configurable, is out of date.
- Artwork can come from TMDB, Fanart, Cinemeta or the anime sources, with a fallback order so a surface missing from one is filled from another.
- Clean artwork is the textless poster with the title logo drawn back on. When no source has a textless poster for a title, the logo is no longer drawn, because compositing it onto art that already carries its title printed the title twice. Any older answer saying to use textless as the workaround for a doubled title is out of date; clean now falls back to the art as-is.
- Artwork language can be set per render, including `original` for the title's own language.
- `fallbackLanguage` names a second language to try when a title has no artwork in the first, before the English or canonical pick. It takes a region tag such as `pt-BR` and reduces it the same way. Any older answer saying the only fallback is English is out of date.
- A region-qualified tag such as `fr-FR`, `pt-BR` or `zh-TW` is reduced to its base language, which is what the artwork sources tag images with. A migrated v2 profile carrying a region now gets that language rather than falling back to English. Regional variants are not distinguishable: the sources tag a Québécois and a French logo alike as `fr`.
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
