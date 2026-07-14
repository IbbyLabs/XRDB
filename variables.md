# XRDB v3 — Environment Variables

Every variable the server reads. All are optional unless noted; defaults suit
the single-container Docker setup. API keys set here can be overridden at
runtime from the **Integrations** page (values saved there live in the
settings store and take precedence on restart).

## Server

| Variable | Default | Description |
|---|---|---|
| `XRDB_ADDR` | `:8787` | Listen address for the combined UI + API server. |
| `XRDB_VERSION` | `dev` | Version label reported by `/healthz` and shown in the UI badge. Release images set this from the git tag. |
| `XRDB_DB` | `xrdb.db` | SQLite database path for profiles. Use `/data/xrdb.db` in Docker. A `<path>.settings` sidecar holds integration keys saved via the UI. |
| `XRDB_CACHE_DIR` | `xrdb-cache` | Directory for the rendered-image disk cache. Use `/data/cache` in Docker. |
| `XRDB_CACHE_TTL_HOURS` | `72` | Default time rendered images stay cached, in hours (fractions allowed). |
| `XRDB_RENDER_CONCURRENCY` | `2x CPU cores` | Maximum simultaneous renders. Bounds memory when a client loads a full catalogue at once; lower it on memory-constrained hosts. |
| `XRDB_MEMORY_LIMIT_MB` | unset | Soft heap limit in MiB (`debug.SetMemoryLimit`). Set to roughly the container memory limit so the runtime GCs before a kernel OOM-kill. `GOMEMLIMIT` also works. |

## Security

| Variable | Default | Description |
|---|---|---|
| `XRDB_ADMIN_KEY` | _(unset)_ | Protects the Admin and Integrations areas and `/api/admin/*`. **Set this on any public instance** — without it, admin pages are open to everyone. |
| `XRDB_API_KEY` | _(unset)_ | When set, every render request must carry it (`Authorization: Bearer …` or `?key=`). Leave unset for public artwork URLs. |

Profile passwords are separate: set per profile in the configurator, they
protect editing that profile (rendering with a profile stays public).

## Providers

| Variable | Used for |
|---|---|
| `XRDB_TMDB_READ_TOKEN` | TMDB v4 read token (preferred). Artwork, metadata, genres, age ratings, watch providers, title search. |
| `XRDB_TMDB_API_KEY` | TMDB v3 key (legacy alternative to the read token). |
| `XRDB_MDBLIST_API_KEY` | MDBList — IMDb, Rotten Tomatoes, Metacritic, Letterboxd, Trakt scores in one call. |
| `XRDB_OMDB_API_KEY` | OMDB supplemental ratings. |
| `XRDB_FANART_API_KEY` | Fanart.tv HD artwork and logos. |
| `XRDB_TRAKT_CLIENT_ID` | Trakt community ratings. |
| `XRDB_SIMKL_CLIENT_ID` | SIMKL community ratings. |
| `XRDB_IMDB_DATASET_DIR` | Directory for the local IMDb ratings dataset; unset disables it. |

No key is required for: Cinemeta artwork (Stremio/metahub), MyAnimeList,
AniList, and Kitsu ratings — those work out of the box.

## Anime ID mapping

Anime ratings need the render ID (IMDb/TMDB) translated to MAL/AniList/Kitsu
IDs. XRDB downloads the community
[Fribb/anime-lists](https://github.com/Fribb/anime-lists) dataset (~6 MB) into
`XRDB_CACHE_DIR` on first use, refreshes it weekly, and keeps serving the
cached copy if the source is unreachable. Titles missing from the dataset fall
back to a live per-ID lookup.

| Variable | Default | Description |
|---|---|---|
| `XRDB_ANIME_MAP_URL` | Fribb anime-lists (GitHub raw, jsDelivr mirror) | Override the primary mapping dataset URL. **Note:** The mapper uses a hard-coded jsDelivr/GitHub raw mirror as fallback when the primary source is unreachable. For self-hosted or air-gapped deployments requiring full URL control, the mirror must be changed in the mapper source code. |
| `XRDB_ANIME_MAP_FALLBACK_URL` | `https://arm.haglund.dev/api/v2` | Live per-ID mapping API for titles the dataset misses. Set to `off` to disable. |
| `XRDB_ANIME_MAP_REFRESH_HOURS` | `168` (7 days) | How old the cached dataset may get before a background re-download. Refreshes never block renders; a failed refresh keeps the existing copy. |

## Cache tuning

| Variable | Default | Description |
|---|---|---|
| `XRDB_TTL_<PROVIDER>` | global TTL | Per-provider cache TTL in hours. A render is cached for the *minimum* TTL among the providers that contributed to it. Providers: `TMDB`, `MDBLIST`, `OMDB`, `FANART`, `TRAKT`, `SIMKL`, `MAL`, `ANILIST`, `KITSU`, `IMDBLOCAL`. Example: `XRDB_TTL_MDBLIST=4`. |

## Web (build/dev only)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | API origin the web app calls. Unset in the single-container image (same origin). Set for split deployments or local dev (`http://localhost:8787`). |
| `XRDB_API_PORT` / `XRDB_WEB_PORT` | Ports used by `make dev` (defaults `8787` / `3001`). |

Migrating from v2? Variable names changed — see
[docs/migrating-to-v3.md](docs/migrating-to-v3.md) for the mapping.
