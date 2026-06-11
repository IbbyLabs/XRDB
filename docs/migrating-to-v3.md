# Migrating from XRDB v2 to v3

v3 is a ground-up rewrite: a single Go binary with the web UI embedded,
replacing the v2 Next.js monolith. Same job — ratings overlays and artwork
for your media library — substantially faster renders, one container, and a
simpler configurator.

## What changed

| | v2 | v3 |
|---|---|---|
| Containers | App (+ optional extras) | **One** — UI and API on one port |
| Image | `ghcr.io/ibbylabs/xrdb:v2…` | `ghcr.io/ibbylabs/xrdb:latest` |
| Port | `3000` | `8787` (`XRDB_ADDR`) |
| Data volume | `/app/data` | `/data` (SQLite + render cache) |
| Render stack | Node.js + Sharp | Pure Go |
| Config identity | UUID config string | Profile **ID or alias** (`?config=…`) |

## Step by step

1. **Pull the v3 image** and point your compose file at it:

   ```yaml
   services:
     xrdb:
       image: ghcr.io/ibbylabs/xrdb:latest
       ports: ["8787:8787"]
       volumes: ["xrdb-data:/data"]
       environment:
         XRDB_ADMIN_KEY: "choose-a-strong-key"   # protects admin + integrations
   ```

2. **Map your environment variables** (full v3 reference: [variables.md](../variables.md)):

   | v2 | v3 |
   |---|---|
   | `TMDB_READ_ACCESS_TOKEN` / `XRDB_TMDB_READ_ACCESS_TOKEN` | `XRDB_TMDB_READ_TOKEN` |
   | `TMDB_API_KEY` / `XRDB_TMDB_API_KEY` | `XRDB_TMDB_API_KEY` |
   | `MDBLIST_API_KEY` | `XRDB_MDBLIST_API_KEY` |
   | `OMDB_KEY` / `XRDB_OMDB_API_KEY` | `XRDB_OMDB_API_KEY` |
   | `FANART_API_KEY` / `XRDB_FANART_API_KEY` | `XRDB_FANART_API_KEY` |
   | `XRDB_TRAKT_CLIENT_ID` | `XRDB_TRAKT_CLIENT_ID` (unchanged) |
   | `SIMKL_CLIENT_ID` | `XRDB_SIMKL_CLIENT_ID` |
   | `ADMIN_KEY` | `XRDB_ADMIN_KEY` |
   | `XRDB_REQUEST_API_KEY(S)` | `XRDB_API_KEY` |
   | `XRDB_DATA_DIR` | `XRDB_DB` + `XRDB_CACHE_DIR` |
   | `XRDB_PORT` | `XRDB_ADDR` |

   Keys can also be entered in the UI (**Integrations**) instead of env vars.
   v2 variables without a v3 row (poster warming schedules, proxy origins,
   partner access keys, config encryption, prune schedules, …) belong to
   features that don't exist in v3 — see the parity section below.

3. **Migrate profiles.** Export your v2 profiles, then convert and import:

   ```sh
   go run ./cmd/migrate -input legacy-profiles.json
   # writes output/migration/migrated-profiles.json + a per-profile report
   curl -X POST http://localhost:8787/profile/import \
     -H "Content-Type: application/json" \
     -d @output/migration/migrated-profiles.json
   ```

   v2 settings that have no v3 equivalent are dropped and listed in the
   migration report. Open each migrated profile in the configurator to
   confirm the result, and consider giving it an **alias** — a memorable
   handle that works anywhere the ID does.

4. **Update your artwork URLs.** The URL shape changed:

   ```text
   v2: https://host/poster/imdb:{imdb_id}.jpg?<long query>
   v3: https://host/poster/{imdb_id}?config=<profile-id-or-alias>
   ```

   AIOMetadata users: open **Configurator → Install** and run the one-click
   setup again (or copy the four URL patterns into AIOM's custom-art fields).

## Feature parity

Carried over (often improved): all four output families, 12 rating sources
with official provider logos, quality/age/genre/streaming badges, aggregate
score bar, trending tag, templates, profiles (now with aliases, generated
IDs, and password-protected editing), Stremio addon endpoints, render cache
with per-provider TTLs, IMDb local dataset, AIOMetadata install, admin
metrics/cache/warm panel.

New in v3: title search, trending shuffle, pinned preview items, badge
styles (pill/square/glass) and dark/light badge themes, six switchable UI
themes, one-command install, and markedly faster rendering.

Not carried over (by design — the v3 configurator stays simple):

- **Per-output-type configuration** — v2 let poster/backdrop/thumbnail/logo
  each have their own sources, layouts, and styles; v3 applies one config to
  all four. The most-requested v2 depth; planned as profiles-per-type if
  demand returns.
- **Fine-grained badge geometry** — per-badge scales, pixel offsets, border
  widths, custom tile colors, provider appearance overrides.
- **Random-poster filters** (min votes/size/fallback), `blackbar`/OMDB
  artwork sources, episode-still thumbnail modes.
- **Stremio proxy with catalog rules and metadata translation** — v3 ships
  plain addon endpoints instead.
- **Partner signed access, poster warming schedules, config encryption,
  inactive-config pruning** — operational features from the hosted v2.

If one of these blocks your migration, open an issue:
https://github.com/IbbyLabs/XRDB/issues

## Reporting problems

Include your `/healthz` version, the full artwork URL (minus any keys), and
the title's IMDb ID. Renders are cached — append a throwaway query param
(`&t=1`) to bypass the cache when retesting.
