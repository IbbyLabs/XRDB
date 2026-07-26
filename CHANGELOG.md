# Changelog

All notable changes to XRDB are documented here.

## [3.6.0](https://github.com/IbbyLabs/XRDB/compare/v3.5.4...v3.6.0) (2026-07-26)


### Added

* **compose:** colour the aggregate rating pill by its score ([d5b8b25](https://github.com/IbbyLabs/XRDB/commit/d5b8b255375194b1b3dd76d34d7b09a74e962b3d))


### Fixed

* **compose:** give the square and clean genre styles their own look ([2eba985](https://github.com/IbbyLabs/XRDB/commit/2eba9852c9853d37517332e61cb9c5c609bf52ee))
* **config:** fall back to the poster surface, not stock defaults ([1bed50c](https://github.com/IbbyLabs/XRDB/commit/1bed50c0f0c340b6d2398883d4cba526ea67ccb1))
* **migrate:** map v2's glass rating style onto pill ([1494b73](https://github.com/IbbyLabs/XRDB/commit/1494b73920d759d0305b7e9e8464bf8a3162cb9c))
* **web:** name the right surfaces in the scope notice ([92764fe](https://github.com/IbbyLabs/XRDB/commit/92764fe26637ac1dce458cf78c3961e39a1c96b7))
* **web:** preview thumbnails as an episode ([58d3817](https://github.com/IbbyLabs/XRDB/commit/58d38176fa2184e5718a5c60120efe4f6f565b4f)), closes [#65](https://github.com/IbbyLabs/XRDB/issues/65)

## [3.5.4](https://github.com/IbbyLabs/XRDB/compare/v3.5.3...v3.5.4) (2026-07-26)


### Fixed

* **compose:** draw the trending badge only for trending titles ([7f2ae1a](https://github.com/IbbyLabs/XRDB/commit/7f2ae1a28802490f66f58a7d421951223cc02fbb))

## [3.5.3](https://github.com/IbbyLabs/XRDB/compare/v3.5.2...v3.5.3) (2026-07-26)


### Fixed

* **config:** read the v2 credential names as a fallback ([f97cdf7](https://github.com/IbbyLabs/XRDB/commit/f97cdf7d5d58c00a445e3ec3d095e545273688a9))

## [3.5.2](https://github.com/IbbyLabs/XRDB/compare/v3.5.1...v3.5.2) (2026-07-25)


### Fixed

* **compose:** resolve non-IMDb ids before asking rating sources ([22f548c](https://github.com/IbbyLabs/XRDB/commit/22f548ca496b76ae48601ce71246f8895bc805ba))
* **server:** surface AIOMetadata credential errors ([c37e755](https://github.com/IbbyLabs/XRDB/commit/c37e7554d5af25b36d69efceb4f8a5ec8e2db4fb))

## [3.5.1](https://github.com/IbbyLabs/XRDB/compare/v3.5.0...v3.5.1) (2026-07-25)


### Fixed

* **compose:** size corner overlays to the canvas ([7d3432e](https://github.com/IbbyLabs/XRDB/commit/7d3432ed3ee3dd9a5177598d4627a3357f63d0c3))
* **web:** make the SIMKL source logo visible on the dark panel ([4608369](https://github.com/IbbyLabs/XRDB/commit/4608369d852d5a317162d585b1cdc980731ee610))

## [3.5.0](https://github.com/IbbyLabs/XRDB/compare/v3.4.0...v3.5.0) (2026-07-25)


### Added

* **compose:** order ratings and size badges to the canvas ([6a0928b](https://github.com/IbbyLabs/XRDB/commit/6a0928b60b8489e324714aee170ff1623b9eeb31))


### Fixed

* **build:** restore the internal/ui/dist placeholder ([5642e76](https://github.com/IbbyLabs/XRDB/commit/5642e76882473ae9de9b296ab0f8163aaf825e45))
* **web:** name the configured quality-badge position in the hint ([612a399](https://github.com/IbbyLabs/XRDB/commit/612a399415b9d25fdb23cfbe1d6276065677f87b))

## [3.4.0](https://github.com/IbbyLabs/XRDB/compare/v3.3.1...v3.4.0) (2026-07-25)


### Added

* **render:** raise the badge scale ceiling and add two stacked toggles ([dce16e1](https://github.com/IbbyLabs/XRDB/commit/dce16e1defcffd2b4a7100b3103482a68c1d01ca)), closes [#8](https://github.com/IbbyLabs/XRDB/issues/8)
* **web:** make the keys page per-user and move server keys into admin ([84cfc48](https://github.com/IbbyLabs/XRDB/commit/84cfc48377eb9b77093695714d713aed0bd39565))


### Fixed

* **web:** point non-admins at their own profile API keys ([e01fd82](https://github.com/IbbyLabs/XRDB/commit/e01fd822ab11485f87663ea009b693b02c9264a5))

## [3.3.1](https://github.com/IbbyLabs/XRDB/compare/v3.3.0...v3.3.1) (2026-07-25)


### Fixed

* **config:** read a v2 badge list as tiles plus its features ([da77888](https://github.com/IbbyLabs/XRDB/commit/da778886262c9a6f78dc3dbe09c70255358e8e00))

## [3.3.0](https://github.com/IbbyLabs/XRDB/compare/v3.2.0...v3.3.0) (2026-07-25)


### Added

* **profile:** encrypt provider keys at rest and check them on save ([e9194a0](https://github.com/IbbyLabs/XRDB/commit/e9194a0e685735baa10cb6f4cd4f1700f4c9f808))
* **profile:** let an owner supply their own provider API keys ([128d8df](https://github.com/IbbyLabs/XRDB/commit/128d8df47ebf476e712b6161d89f055ca64d2e0e))
* **render:** add the no-background and tile rating badge styles ([082c017](https://github.com/IbbyLabs/XRDB/commit/082c0179694af8bab04e4c04a1af3de10050478b))
* **render:** add the stacked rating badge style ([b5afd47](https://github.com/IbbyLabs/XRDB/commit/b5afd47e748f66eda188d4971b08d36b0b28ce15))
* **render:** draw the left, right and top-bottom rating layouts ([92630d4](https://github.com/IbbyLabs/XRDB/commit/92630d45fe8c3f0e9c94559d773b2878feb1c71d))


### Fixed

* **config:** accept the badge placement spellings a v2 config uses ([236de0e](https://github.com/IbbyLabs/XRDB/commit/236de0e2fb2c992a991aae7d2c55db3aaa070f47))
* **config:** honour more v2 rating and badge settings ([2097c86](https://github.com/IbbyLabs/XRDB/commit/2097c8660ff4deac952b8e5223245fa3cd968e06))
* **config:** let an empty rating selection mean no rating badges ([d3764e1](https://github.com/IbbyLabs/XRDB/commit/d3764e199ef4f2dcf78603c1bb3ed1029feee863))
* **config:** map the remaining v2 enum spellings ([9d0d883](https://github.com/IbbyLabs/XRDB/commit/9d0d883540f6f06fcf08958cb1a778e0ffe08a99))
* **migrate:** carry an empty v2 list as an empty selection ([caf0fab](https://github.com/IbbyLabs/XRDB/commit/caf0fabf47d50d05de19ad6398f3bae9952f9291))
* **server:** accept v2-shaped artwork ids ([26efe14](https://github.com/IbbyLabs/XRDB/commit/26efe144b444dd83c705a9b567280a6e0211cc94))
* **server:** capitalize a refused-save message for display ([3dd7f80](https://github.com/IbbyLabs/XRDB/commit/3dd7f807fc7461f6f24ff429cc121a4784b20a87))
* **web:** mark quality badges a higher format already covers ([be96161](https://github.com/IbbyLabs/XRDB/commit/be9616121d0465b382b992e9975cecea33414431))

## [3.2.0](https://github.com/IbbyLabs/XRDB/compare/v3.1.0...v3.2.0) (2026-07-25)


### Added

* **web,server:** convert a v2 config from the configurator ([5624b2d](https://github.com/IbbyLabs/XRDB/commit/5624b2dd216e128e1a60c17097ae3789c951e205))


### Fixed

* **ci:** tag :latest during the release build ([3ba8948](https://github.com/IbbyLabs/XRDB/commit/3ba89484541d7530f5995c8382f2bf00d053dbb3))
* **migrate:** read v2 values that were stored as strings ([878f297](https://github.com/IbbyLabs/XRDB/commit/878f297c931a8cffe62dc0a224c80b42f4833485))

## [3.1.0](https://github.com/IbbyLabs/XRDB/compare/v3.0.0...v3.1.0) (2026-07-25)


### Changed

* Releases are now cut automatically from conventional commits, so the version
  and this changelog no longer need writing by hand ([5dd39c0](https://github.com/IbbyLabs/XRDB/commit/5dd39c0afaa5a673bc66e44089511c98c23b7f84))

## [Unreleased]

<a id="v3-0-0"></a>

## [v3.0.0] - 2026-07-25

v3 is a ground-up rewrite. It is a single Go binary with the configurator
embedded, replacing the v2 stack, and it listens on port **8787** rather than
3000. Profiles do not carry over automatically — see the
[migration guide](docs/migrating-to-v3.md).

### Breaking

- Artwork is served as **JPEG** by default instead of PNG, at a smaller default
  size. A poster is roughly 38 KB rather than 2 MB, which brings it inside
  Stremio's 100 KB limit and under its 50 KB recommendation. Logos stay PNG so
  transparency is preserved. The previous dimensions remain available as the
  `normal`, `large` and `4k` size tiers.
- The container listens on `8787` and stores data under `/data`.
- Forwarded headers (`X-Forwarded-*`, `CF-Connecting-IP`) are now only believed
  from a trusted proxy. The default covers loopback and the private ranges, so
  an ordinary reverse-proxy setup is unaffected; see `XRDB_TRUSTED_PROXIES`.


### Added

- Official rating-provider logos on badges, with pill/square/glass styles and dark/light badge themes
- Six switchable UI themes (Midnight, Violet, Emerald, Ember, Crimson, Slate)
- Title search, trending shuffle, and pinned preview items in the configurator
- Profile aliases (memorable lowercase handles), server-generated IDs, and password-protected editing
- One-click AIOMetadata install plus manual URL patterns (Install tab)
- Cinemeta artwork provider (no key required) and WebP source decoding
- Artwork language / text-preference selection (TMDB + Fanart) and large/4K output sizes
- Per-output-size badge scaling and multi-row badge wrapping
- Admin key gate for the Admin and Integrations pages
- Title search/trending/lookup and AIOMetadata install API endpoints; permissive CORS
- `make dev` one-command local stack; environment reference (`variables.md`), `env.template`, and v2→v3 migration guide
- Stremio addon that can be installed against a saved profile
  (`/stremio/c/{profile}/manifest.json`), with the install URL shown in the
  configurator
- RPDB-compatible artwork URLs, so moving from RPDB is a hostname swap
- Folder-writer mode: writes `poster.jpg`, `fanart.jpg` and `clearlogo.png` next
  to your media for Plex, Jellyfin, Emby and Kodi. Off by default, with a dry
  run and an optional schedule
- Jellyfin image-provider plugin, offering artwork by URL with nothing written
  into the library
- Top-rated film ranking badge, computed locally from the IMDb dataset (opt-in)
- Vote counts alongside rating badges, where the source reports them
- Per-source health at `GET /api/admin/sources`, showing when a rating source is
  degraded and being served from cache
- Cache invalidation: `DELETE /api/admin/cache`, all entries or one
- `Cache-Control` and `ETag` on renders, with `If-None-Match` answered as 304
- A profile version token in artwork URLs, so editing a profile refreshes art in
  clients that cache images regardless of TTL
- Per-client setup guides, a contributing guide, and issue templates

### Fixed

- Anime ratings (MyAnimeList, AniList, Kitsu) never rendered: the pipeline
  passed IMDb/TMDB IDs straight to the anime providers, which only accept
  their own ID space. A new anime ID mapper translates IDs via a disk-cached
  [Fribb/anime-lists](https://github.com/Fribb/anime-lists) dataset with a
  live API fallback — replacing the v2 approach that depended on a single
  third-party mapping host (now offline with a DNS failure)
- Fanart.tv rejected IMDb tt-IDs (every configurator render) and misrouted movie backdrops
- Thumbnails now prefer backdrop artwork over center-cropped posters
- Overlay metadata (age/genre/providers) backfills from TMDB when the artwork source lacks it
- Hydration mismatch from storage reads during first render (React #418)
- Dev-mode builds no longer break on the Go-embed `distDir`
- Rate-limited rating sources are retried with backoff and paced per source,
  instead of silently disappearing from the badge row
- A rating source that breaks or returns nothing now falls back to its last
  known good result rather than dropping its badge

<a id="v3-0-0-beta"></a>

## [v3.0.0-beta] - 2026-06-09

### Added

- Pure-Go image render pipeline (poster, backdrop, thumbnail, logo families)
- SQLite-backed profile store with full CRUD, export, and import
- Two-tier render cache (hot + disk, 72h TTL) with admin visibility
- TMDB provider with mutex-safe concurrency
- Migration tool for importing profiles from previous XRDB installations
- REST API: render, profile management, admin metrics, cache stats
- Next.js 15 configurator with live preview, display config, and profile management
- Admin panel with request metrics, latency percentiles, and cache diagnostics
- Dark OKLCH design system, WCAG AA accessible throughout
- Docker Compose deployment with named volume for data persistence
- Multi-platform Docker images (amd64/arm64) published to GHCR
