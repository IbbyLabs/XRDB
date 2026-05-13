# XRDB Environment Variable Reference

This file documents every supported environment variable. Normal self-hosted deployments only need the values in `env.template`. The sections below cover advanced tuning, operator controls, and internal override hooks that are intentionally kept out of the main setup template.

All cache TTL values are in **milliseconds**.

---

## Core runtime

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `production` | Runtime mode. Use `production` for servers. |
| `XRDB_LOG_LEVEL` | `info` | Server log threshold. `debug`/`info` → STDOUT, `warn`/`error` → STDERR. |
| `XRDB_REQUEST_LOG_LEVEL` | `off` | Routine image request log level. Accepted: `off`, `debug`, `info`, `warn`, `error`. |

---

## Deployment

| Variable | Default | Description |
|---|---|---|
| `XRDB_HOSTNAME` | — | Public hostname for compose.yaml and Traefik router rule. |
| `XRDB_IMAGE_TAG` | `latest` | Docker image tag used by compose.yaml. Set `dev` to follow the development channel. |
| `XRDB_PORT` | `3000` | Host port for local-compose.yaml. Container always listens on 3000 internally. |
| `XRDB_DATA_DIR` | `./data` | Local data folder mounted into `/app/data` by local-compose.yaml. |
| `DOCKER_DATA_DIR` | `./data` | Stack data root for compose.yaml. Mounts `${DOCKER_DATA_DIR}/xrdb` into `/app/data`. |
| `DOCKER_NETWORK` | `aio_default` | Docker network name used by the stack compose file. |
| `DOCKER_NETWORK_EXTERNAL` | `true` | Set `true` when the Docker network already exists outside this repo. |
| `XRDB_PREVIEW_ORIGIN` | `http://127.0.0.1:3000` | Internal origin used by `/preview/[slug]` when the app calls itself. Also accepted: `PREVIEW_INTERNAL_ORIGIN`. |
| `XRDB_TRAEFIK_ENTRYPOINTS` | `websecure` | Traefik entrypoints for the stack compose file. |
| `XRDB_TRAEFIK_CERTRESOLVER` | `letsencrypt` | Traefik certificate resolver for the stack compose file. |
| `HTTP_PROXY` | — | Optional outbound HTTP proxy. |
| `HTTPS_PROXY` | — | Optional outbound HTTPS proxy. |

---

## Access and security

| Variable | Default | Description |
|---|---|---|
| `XRDB_TRUST_PROXY_HEADERS` | — | Trust forwarded host/protocol headers from a reverse proxy. |
| `XRDB_REQUEST_API_KEY` | — | Single shared key for render and proxy access. |
| `XRDB_REQUEST_API_KEYS` | — | Comma-separated list of valid request keys. |
| `XRDB_PARTNER_ACCESS_KEYS` | — | Signed partner access profiles. Format: `partnerId:secret:perMinute:burst`, comma/semicolon/newline-separated. Example: `partner:super-secret:1200:300`. |
| `XRDB_PARTNER_KEYS` | — | Legacy alias for `XRDB_PARTNER_ACCESS_KEYS`. |
| `XRDB_PROXY_ALLOWED_ORIGINS` | `*` | CORS allowlist for proxy responses. |
| `XRDB_CONFIG_ENCRYPTION_KEY` | auto-generated | 64 hex-character string (32 bytes) used to encrypt saved config profiles at rest. Losing this key makes existing profiles unreadable. Generate: `openssl rand -hex 32`. |
| `XRDB_INACTIVE_CONFIG_PRUNE_DAYS` | `-1` | Days of inactivity before a saved config profile is deleted on startup. `-1` disables pruning. |
| `ADMIN_KEY` | — | Enables the admin dashboard at `/admin` when set. Generate: `openssl rand -hex 32`. |

---

## Instance customization

| Variable | Default | Description |
|---|---|---|
| `XRDB_INSTANCE_HTML` | — | Raw HTML injected above the mode cards on the entry page. |
| `XRDB_DEFAULT_EPISODE_PROFILE_ID` | — | UUID of the saved config profile applied to episode thumbnail requests when no explicit `?config=` is present. |
| `WEBHOOK_URL` | — | Optional release webhook target used by release tooling. |
| `NEXT_PUBLIC_DEPLOYMENT_VERSION` | package version | Version string shown in the UI. Set this to override the package-derived version label. |

---

## Provider credentials

| Variable | Aliases | Description |
|---|---|---|
| `XRDB_TMDB_READ_ACCESS_TOKEN` | `TMDB_READ_ACCESS_TOKEN` | Preferred TMDB read access token. |
| `XRDB_TMDB_API_KEY` | `TMDB_API_KEY`, `TMDB_KEY` | TMDB v3 API key fallback. |
| `MDBLIST_API_KEY` | — | MDBList key used as a server-side fallback for rating aggregation. |
| `MDBLIST_API_KEYS` | — | Comma-separated pool of MDBList keys for larger shared hosts. |
| `XRDB_MAL_CLIENT_ID` | `MAL_CLIENT_ID` | MyAnimeList v2 client id. Falls back to Jikan when blank. |
| `XRDB_TRAKT_CLIENT_ID` | `TRAKT_CLIENT_ID` | Trakt client id for direct rating lookups. |
| `OMDB_KEY` | `XRDB_OMDB_API_KEY`, `OMDB_API_KEY` | OMDb API key for poster lookups when `posterArtworkSource=omdb`. |
| `XRDB_FANART_API_KEY` | `FANART_API_KEY` | Fanart API key used as a fallback when the user does not supply `fanartKey`. |
| `XRDB_FANART_CLIENT_KEY` | `FANART_CLIENT_KEY` | Fanart client key. |
| `SIMKL_CLIENT_ID` | — | SIMKL client id for direct rating lookups. |
| `XRDB_SIMKL_APP_NAME` | — | App name sent to SIMKL in required request params. Default: `xrdb`. |
| `XRDB_SIMKL_APP_VERSION` | — | App version sent to SIMKL in required request params. Default: `1.0`. |
| `XRDB_README_PREVIEW_TMDB_KEY` | — | Dedicated TMDB key for fixed README preview routes. |
| `XRDB_README_PREVIEW_MDBLIST_KEY` | — | Dedicated MDBList key for fixed README preview routes. |

---

## Upstream API base URL overrides

These are internal override hooks. Leave them unset in normal deployments. Useful for testing, unusual network environments, or internal debugging.

| Variable | Default |
|---|---|
| `XRDB_TMDB_API_BASE_URL` | `https://api.themoviedb.org/3` |
| `XRDB_ANILIST_GRAPHQL_URL` | `https://graphql.anilist.co` |
| `XRDB_ANIME_MAPPING_BASE_URL` | `https://animemapping.stremio.dpdns.org` |
| `XRDB_KITSU_API_BASE_URL` | `https://kitsu.io/api/edge` |
| `XRDB_MAL_API_BASE_URL` | `https://api.myanimelist.net/v2` |
| `XRDB_JIKAN_API_BASE_URL` | `https://api.jikan.moe/v4` |
| `XRDB_TRAKT_API_BASE_URL` | `https://api.trakt.tv` |
| `XRDB_OMDB_API_BASE_URL` | `https://www.omdbapi.com` |

---

## Cache TTLs

| Variable | Default | Range | Description |
|---|---|---|---|
| `XRDB_TMDB_CACHE_TTL_MS` | `259200000` (3 days) | 10 min – 30 days | TMDB metadata cache duration. |
| `XRDB_MDBLIST_CACHE_TTL_MS` | `259200000` (3 days) | 10 min – 30 days | MDBList ratings cache duration. Primary lever for reducing API hits. |
| `XRDB_MDBLIST_OLD_MOVIE_CACHE_TTL_MS` | `604800000` (7 days) | 1 hr – 30 days | Extended MDBList cache for older titles. Only effective when higher than `XRDB_MDBLIST_CACHE_TTL_MS`. |
| `XRDB_MDBLIST_OLD_MOVIE_AGE_DAYS` | `365` | 30 – 3650 | Age threshold in days for the extended MDBList cache. |
| `XRDB_MDBLIST_RATE_LIMIT_COOLDOWN_MS` | `86400000` (1 day) | 30 sec – 7 days | Cooldown after MDBList rate limiting. |
| `XRDB_KITSU_CACHE_TTL_MS` | `259200000` (3 days) | 10 min – 30 days | Kitsu metadata cache duration. |
| `XRDB_OMDB_CACHE_TTL_MS` | `259200000` (3 days) | 10 min – 30 days | OMDb poster lookup cache duration. |
| `XRDB_SIMKL_CACHE_TTL_MS` | `259200000` (3 days) | 10 min – 30 days | SIMKL metadata cache duration. |
| `XRDB_SIMKL_ID_CACHE_TTL_MS` | `15552000000` (180 days) | 10 min – 365 days | SIMKL id resolution cache duration. |
| `XRDB_SIMKL_ID_EMPTY_CACHE_TTL_MS` | `86400000` (1 day) | 10 min – 30 days | Cache duration for empty SIMKL id results. |
| `XRDB_TORRENTIO_CACHE_TTL_MS` | `21600000` (6 hrs) | 10 min – 7 days | Torrentio badge cache duration. |
| `XRDB_PROVIDER_ICON_CACHE_TTL_MS` | `604800000` (7 days) | 1 hr – 30 days | Rating provider icon cache duration. |
| `XRDB_IMDB_DATASET_CACHE_TTL_MS` | `604800000` (7 days) | 1 hr – 365 days | Local IMDb dataset cache duration. |

---

## Stream badges

| Variable | Default | Description |
|---|---|---|
| `XRDB_TORRENTIO_BASE_URL` | `https://torrentio.strem.fun` | Base URL for Torrentio badge lookups. Leave unset for default. Set to blank to disable. |
| `XRDB_TORRENTIO_FALLBACK_BASE_URL` | `https://torrentio.stremio.ru` | Fallback Torrentio instance when the primary times out. Set to blank to disable. |
| `XRDB_TORRENTIO_CONCURRENCY` | `2` | Max concurrent Torrentio badge lookups. |
| `XRDB_TORRENTIO_TIMEOUT_MS` | `4000` | Per-request timeout for Torrentio fetches. |
| `XRDB_TORRENTIO_RATE_LIMIT_COOLDOWN_MS` | `900000` (15 min) | Cooldown after Torrentio rate limiting. Range: 1 min – 1 day. |
| `XRDB_TORRENTIO_BYPASS_PROXY` | `false` | When true, Torrentio fetches skip shared proxy routing and connect directly. |
| `XRDB_TORRENTIO_DIRECT_CANDIDATE_BASE_URL` | `https://torrentio.stremio.ru` | Expected direct-host candidate used as the default fallback URL. |

---

## Adaptive stream cache TTL

| Variable | Default | Description |
|---|---|---|
| `XRDB_TORRENTIO_ADAPTIVE_CACHE_ENABLED` | `false` | Select stream cache TTL based on content recency instead of a single fixed TTL. |
| `XRDB_TORRENTIO_FRESH_WINDOW_MS` | `28800000` (8 hrs) | Age below which content is classified as fresh. Range: 1 min – 7 days. |
| `XRDB_TORRENTIO_WARM_WINDOW_MS` | `172800000` (48 hrs) | Age below which content is classified as warm. Range: 1 min – 30 days. |
| `XRDB_TORRENTIO_FRESH_TTL_MS` | `1800000` (30 min) | Stream cache TTL for fresh content. Range: 1 min – 6 hrs. |
| `XRDB_TORRENTIO_WARM_TTL_MS` | `21600000` (6 hrs) | Stream cache TTL for warm content. Range: 1 min – 1 day. |
| `XRDB_TORRENTIO_STABLE_TTL_MS` | `604800000` (7 days) | Stream cache TTL for stable content. Range: 1 hr – 30 days. |

---

## Cache hardening

Enable individual features by setting `CACHE_HARDENING_ENABLED=true` first.

| Variable | Default | Description |
|---|---|---|
| `CACHE_HARDENING_ENABLED` | `false` | Global kill switch. All hardening features below require this to be `true`. |
| `CACHE_HARDENING_NEGATIVE_CACHE` | `false` | Cache empty stream results with a short TTL to reduce retry storms. |
| `XRDB_TORRENTIO_NEGATIVE_CACHE_TTL_MS` | `300000` (5 min) | TTL for negative stream results. Range: 30 sec – 30 min. |
| `CACHE_HARDENING_SWR` | `false` | Serve stale cache entries within the SWR window while a background refresh runs. |
| `XRDB_TORRENTIO_SWR_WINDOW_MS` | `3600000` (1 hr) | Stale-while-revalidate eligibility window after cache expiry. Range: 1 min – 1 day. |
| `CACHE_HARDENING_CIRCUIT_BREAKER` | `false` | Open a circuit and skip a host during cooldown after repeated failures. |
| `XRDB_TORRENTIO_CIRCUIT_FAILURE_THRESHOLD` | `5` | Failures within the rolling window before the circuit opens. Range: 1 – 50. |
| `XRDB_TORRENTIO_CIRCUIT_WINDOW_MS` | `300000` (5 min) | Rolling failure count window. Range: 10 sec – 1 hr. |
| `XRDB_TORRENTIO_CIRCUIT_COOLDOWN_MS` | `120000` (2 min) | Duration the circuit stays open after tripping. Range: 10 sec – 1 hr. |
| `CACHE_HARDENING_PROVIDER_BUDGETS` | `false` | Enforce per-provider request budgets within a sliding time window. |
| `XRDB_TORRENTIO_BUDGET_REQUESTS_PER_WINDOW` | `200` | Max upstream Torrentio requests per budget window. Range: 1 – 10000. |
| `XRDB_TORRENTIO_BUDGET_WINDOW_MS` | `60000` (1 min) | Budget window duration. Range: 10 sec – 1 hr. |
| `CACHE_HARDENING_PREWARM_POPULARITY` | `false` | Sort prewarm targets by recent demand before scheduling. |
| `CACHE_HARDENING_SNAPSHOT_RESTORE` | `false` | Persist the warm target set at the end of each run and restore on startup. |
| `CACHE_HARDENING_AUTO_TUNE` | `false` | Log observe-only auto-tuning recommendations every 10 min. No config is changed automatically. |
| `CACHE_HARDENING_SINGLEFLIGHT` | — | Informational. Request coalescing via singleflight is pre-existing behavior. |
| `CACHE_HARDENING_JITTER` | — | Informational. TTL jitter is pre-existing behavior via deterministic jitter. |

---

## Poster cache warming

| Variable | Default | Description |
|---|---|---|
| `XRDB_POSTER_WARM_ENABLED` | `true` | Enable scheduled poster cache warming when a source is configured. |
| `XRDB_POSTER_WARM_SOURCE` | — | Inline comma- or newline-separated poster targets. Supports explicit IDs or full poster URLs. |
| `XRDB_POSTER_WARM_SOURCE_FILE` | — | Optional file path for warming targets. Merged with `XRDB_POSTER_WARM_SOURCE`. |
| `XRDB_POSTER_WARM_TMDB_ENABLED` | `false` | Fetch fresh TMDB popular and now-playing IDs (6 endpoints) before each warm pass. |
| `XRDB_POSTER_WARM_TMDB_LIMIT` | `100` | Max TMDB IDs to merge per warm pass. |
| `XRDB_POSTER_WARM_MDBLIST_ENABLED` | `false` | Fetch fresh MDBList trending IDs before each warm pass. No API key required. |
| `XRDB_POSTER_WARM_MDBLIST_LIMIT` | `200` | Max MDBList IDs to merge per warm pass. |
| `XRDB_POSTER_WARM_IMDB_ENABLED` | `false` | Merge top-voted IMDb titles into each warm pass. Requires IMDb dataset on disk. |
| `XRDB_POSTER_WARM_IMDB_LIMIT` | `500` | Max IMDb top-rated IDs to merge per warm pass. |
| `XRDB_POSTER_WARM_RECENT_ENABLED` | `false` | Record recently served requests in a ring buffer and replay them during the next warm pass. Resets on restart. |
| `XRDB_POSTER_WARM_RECENT_LIMIT` | `500` | Max recent requests to replay per warm pass. |
| `XRDB_POSTER_WARM_INTERVAL_MS` | `21600000` (6 hrs) | Intended cadence for warming runs. |
| `XRDB_POSTER_WARM_CHECK_INTERVAL_MS` | `900000` (15 min) | How often XRDB checks whether a warming run is due. |
| `XRDB_POSTER_WARM_CONCURRENCY` | `2` | Max concurrent poster warm jobs. |
| `XRDB_POSTER_WARM_LOG` | `false` | Enable summary logging for warming runs. |

---

## Local IMDb datasets

| Variable | Default | Description |
|---|---|---|
| `XRDB_IMDB_DATASET_AUTO_DOWNLOAD` | `true` | Automatically download IMDb datasets when missing or stale. |
| `XRDB_IMDB_DATASET_AUTO_IMPORT` | `true` | Automatically import downloaded datasets into the local SQLite store. |
| `XRDB_IMDB_DATASET_REFRESH_MS` | `259200000` (3 days) | How often datasets are refreshed. |
| `XRDB_IMDB_DATASET_CHECK_INTERVAL_MS` | `900000` (15 min) | How often XRDB checks whether a dataset refresh is due. |
| `XRDB_IMDB_DATASET_BASE_URL` | `https://datasets.imdbws.com` | Base URL for IMDb dataset downloads. |
| `XRDB_IMDB_RATINGS_DATASET_PATH` | `./data/imdb/title.ratings.tsv.gz` | Local file path for the ratings dataset. |
| `XRDB_IMDB_EPISODES_DATASET_PATH` | `./data/imdb/title.episode.tsv.gz` | Local file path for the episode dataset. |
| `XRDB_IMDB_RATINGS_DATASET_URL` | `https://datasets.imdbws.com/title.ratings.tsv.gz` | Download URL override for the ratings dataset. |
| `XRDB_IMDB_EPISODES_DATASET_URL` | `https://datasets.imdbws.com/title.episode.tsv.gz` | Download URL override for the episode dataset. |
| `XRDB_IMDB_DATASET_IMPORT_BATCH` | `5000` | SQLite import batch size during dataset loads. |
| `XRDB_IMDB_DATASET_IMPORT_PROGRESS` | `0` | Optional saved progress marker for resumable imports. |
| `XRDB_IMDB_DATASET_LOG` | `false` | Enable verbose IMDb dataset sync logging. |

---

## Sharp rendering

Raise these carefully on stronger hosts.

| Variable | Default | Description |
|---|---|---|
| `XRDB_SHARP_CONCURRENCY` | `4` | Max Sharp worker threads for rendering. |
| `XRDB_SHARP_CACHE_MEMORY_MB` | `512` | Sharp cache memory limit in MB. |
| `XRDB_SHARP_CACHE_ITEMS` | `2000` | Max cached Sharp items. |
| `XRDB_SHARP_CACHE_FILES` | `20000` | Max cached Sharp file handles. |

Suggested profiles:

| Profile | Concurrency | Memory | Items | Files |
|---|---|---|---|---|
| Small host | `2` | `128` | `512` | `2000` |
| Medium host | `4` | `512` | `2000` | `20000` |
| Large host | `8` | `1024` | `4000` | `50000` |

---

## V2 renamed and removed variables

The following variables were changed in XRDB V2. Update your `.env` before upgrading.

| Old name | New name / status | Notes |
|---|---|---|
| `XRDB_EPISODE_CONFIG_PROFILE_ID` | `XRDB_DEFAULT_EPISODE_PROFILE_ID` | Clean rename. No legacy alias. |
| `NEXT_PUBLIC_BRAND_GITHUB_URL` | Removed | Hard baked in source. Setting this has no effect. |
| `NEXT_PUBLIC_BRAND_GITHUB_LABEL` | Removed | Hard baked in source. |
| `NEXT_PUBLIC_BRAND_SUPPORT_URL` | Removed | Hard baked in source. |
| `NEXT_PUBLIC_BRAND_UPTIME_URL` | Removed | Hard baked in source. |
| `NEXT_PUBLIC_BRAND_DISCORD_AIO_URL` | Removed | Hard baked in source. |
| `NEXT_PUBLIC_BRAND_DISCORD_AIO_LABEL` | Removed | Hard baked in source. |
| `NEXT_PUBLIC_BRAND_DISCORD_OFFICIAL_URL` | Removed | Hard baked in source. |
| `NEXT_PUBLIC_BRAND_DISCORD_OFFICIAL_LABEL` | Removed | Hard baked in source. |
| `NEXT_PUBLIC_BRAND_DISCORD_DM_URL` | Removed | Hard baked in source. |
| `NEXT_PUBLIC_BRAND_DISCORD_DM_HANDLE` | Removed | Hard baked in source. |
| `BRAND_DISCORD_AIO_GUILD_ID` | Removed | Hard baked in source. |
