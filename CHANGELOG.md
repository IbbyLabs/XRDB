# Changelog

All notable changes to XRDB are documented here.

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
