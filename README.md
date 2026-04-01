# XRDB: eXtended Ratings DataBase

XRDB, eXtended Ratings DataBase, generates poster, backdrop, thumbnail, and logo artwork with dynamic ratings, quality badges, and export ready integrations.

> [!NOTE]
> XRDB, eXtended Ratings DataBase, is built by IbbyLabs for artwork workflows, media tools, and addon integrations.

<!-- changelog-links:start -->

> [!TIP]
> **Changelog:** read the [full changelog](CHANGELOG.md) or jump straight to the [latest entry](CHANGELOG.md#v1-0-6).

<!-- changelog-links:end -->

## Priorities

Current priorities for XRDB, eXtended Ratings DataBase:

1. Better quality badges from more providers, not only one source.
2. Smarter fallback so images still load when one provider is slow or down.
3. UUID account saves with password login so settings can be restored on any device.
4. Cache warming for startup and background updates so popular content is ready faster.
5. Poster cache warming controls to reduce first load delay.
6. More control for output sizes for poster backdrop and logo.
7. Ongoing speed and reliability work for public and private setups.

### Release approach

1. Release work in clear stages.
2. Use safe rollout switches for risky changes.
3. Verify both movie and series flows before release.
4. Track speed and error rates after each stage.
5. Keep rollback paths simple.

## Quick Start

## Install From GitHub

```bash
git clone https://github.com/IbbyLabs/XRDB
cd XRDB
```

Use Node 22.x locally. The repo now includes `.nvmrc` and `.node-version` so native packages such as `better-sqlite3` stay aligned with CI and release scripts.

1. Install dependencies: `sudo npm install`
2. Build: `npm run build`
3. Start the app: `npm run start`
4. App available at `http://localhost:3000`

## Stateless Architecture & API Keys (BYOK)

XRDB is designed with a **Bring Your Own Key (BYOK)** stateless architecture.
This means that the XRDB server itself does not permanently store or centrally manage your TMDB, MDBList, or optional Fanart API keys. Instead:

1. Keys are saved locally in your browser's `localStorage` when using the configurator UI.
2. Keys are embedded directly into your generated URLs (`tmdbKey=...&mdblistKey=...&fanartKey=...`) and Addon proxy Base64 configurations when present.
3. The server solely reads these keys from incoming requests to fetch source addon metadata on the fly.

This intentional design allows you to host public XRDB proxy instances without paying for massive shared API usage, as every connected addon or user brings their own API key and rate limits. The visibility of keys in URLs and the configurator UI is expected behavior.

The configurator includes an AIOMetadata export section that generates ready to use URL patterns for custom art override fields in AIOMetadata compatible addons. The `Hide credentials` toggle masks exported AIOMetadata patterns with placeholders without changing live XRDB request URLs. The `Poster ID source` selector controls whether poster URLs use auto mode (typed TMDB IDs for the broadest coverage), explicit TMDB, or IMDb IDs for compatibility. Background and logo patterns always use type aware TMDB IDs, and episode thumbnails use IMDb IDs with season and episode placeholders.

Optional server side client ids can extend a few providers beyond the BYOK flow. `XRDB_MAL_CLIENT_ID` enables the official MyAnimeList API path for direct `myanimelist` ratings, `XRDB_TRAKT_CLIENT_ID` enables direct `trakt` ratings, and `SIMKL_CLIENT_ID` (or `XRDB_SIMKL_CLIENT_ID`) enables direct `simkl` ratings server wide. A user supplied `simklClientId` query parameter takes precedence over the server key for SIMKL. When the MAL client id is not configured, XRDB falls back to Jikan for direct `myanimelist` lookups before falling back to MDBList whenever a `mdblistKey` is present. Fanart backed artwork can also use a server fallback key from `XRDB_FANART_API_KEY` or `FANART_API_KEY`, but a user supplied `fanartKey` is preferred when available.

For `simkl`, XRDB resolves a Simkl item id using `https://api.simkl.com/redirect` and then loads the summary from `https://api.simkl.com/movies/{id}`, `https://api.simkl.com/tv/{id}`, or `https://api.simkl.com/anime/{id}` based on media type hints. Every Simkl request includes `client_id`, `app-name`, and `app-version` query parameters, plus `simkl-api-key` and a browser style `User-Agent` header.

## Live Preview Gallery

These are live requests against production so readers can see current poster, backdrop, and logo output directly inside GitHub.

The gallery is intended to use the optional server side preview env vars `XRDB_README_PREVIEW_TMDB_KEY` and `XRDB_README_PREVIEW_MDBLIST_KEY` so the README does not need to expose a raw API key.

Each preview URL includes a `cb` cache buster token. The release flow refreshes those tokens automatically so GitHub fetches a fresh set of live previews on each tagged release.

### Posters

<table>
  <tr>
    <td><strong>The Boys</strong><br>Glass ratings, stream badges, original text</td>
    <td><strong>Dune Part Two</strong><br>Square ratings, clean text, compact layout</td>
    <td><strong>Attack on Titan</strong><br>Japanese text, anime ratings, poster stack</td>
  </tr>
  <tr>
    <td><a href="https://xrdb.ibbylabs.dev/preview/the-boys-poster?cb=readme-preview-the-boys-poster-v1-0-6"><img src="https://xrdb.ibbylabs.dev/preview/the-boys-poster?cb=readme-preview-the-boys-poster-v1-0-6" alt="The Boys poster live preview" width="220"></a></td>
    <td><a href="https://xrdb.ibbylabs.dev/preview/dune-part-two-poster?cb=readme-preview-dune-part-two-poster-v1-0-6"><img src="https://xrdb.ibbylabs.dev/preview/dune-part-two-poster?cb=readme-preview-dune-part-two-poster-v1-0-6" alt="Dune Part Two poster live preview" width="220"></a></td>
    <td><a href="https://xrdb.ibbylabs.dev/preview/attack-on-titan-poster?cb=readme-preview-attack-on-titan-poster-v1-0-6"><img src="https://xrdb.ibbylabs.dev/preview/attack-on-titan-poster?cb=readme-preview-attack-on-titan-poster-v1-0-6" alt="Attack on Titan poster live preview" width="220"></a></td>
  </tr>
</table>

### Backdrops

<table>
  <tr>
    <td><strong>Game of Thrones</strong><br>French backdrop, right side ratings</td>
    <td><strong>Stranger Things</strong><br>Square ratings, stream badges, left side stack</td>
  </tr>
  <tr>
    <td><a href="https://xrdb.ibbylabs.dev/preview/game-of-thrones-backdrop?cb=readme-preview-game-of-thrones-backdrop-v1-0-6"><img src="https://xrdb.ibbylabs.dev/preview/game-of-thrones-backdrop?cb=readme-preview-game-of-thrones-backdrop-v1-0-6" alt="Game of Thrones backdrop live preview" width="320"></a></td>
    <td><a href="https://xrdb.ibbylabs.dev/preview/stranger-things-backdrop?cb=readme-preview-stranger-things-backdrop-v1-0-6"><img src="https://xrdb.ibbylabs.dev/preview/stranger-things-backdrop?cb=readme-preview-stranger-things-backdrop-v1-0-6" alt="Stranger Things backdrop live preview" width="320"></a></td>
  </tr>
</table>

### Logos

<table>
  <tr>
    <td><strong>The Boys</strong><br>Dark canvas, glass ratings, quality badges</td>
    <td><strong>Attack on Titan</strong><br>Japanese logo with anime ratings and quality badges</td>
  </tr>
  <tr>
    <td><a href="https://xrdb.ibbylabs.dev/preview/the-boys-logo?cb=readme-preview-the-boys-logo-v1-0-6"><img src="https://xrdb.ibbylabs.dev/preview/the-boys-logo?cb=readme-preview-the-boys-logo-v1-0-6" alt="The Boys logo live preview" width="320"></a></td>
    <td><a href="https://xrdb.ibbylabs.dev/preview/attack-on-titan-logo?cb=readme-preview-attack-on-titan-logo-v1-0-6"><img src="https://xrdb.ibbylabs.dev/preview/attack-on-titan-logo?cb=readme-preview-attack-on-titan-logo-v1-0-6" alt="Attack on Titan logo live preview" width="320"></a></td>
  </tr>
</table>


## Rendering Option Comparisons

These static comparison boards highlight the newer rendering controls that are easier to evaluate side by side than in a single live card. They cover `logoBackground`, `logoRatingsMax`, `posterQualityBadgesMax`, `backdropQualityBadgesMax`, and a few layout and style combinations from the local March 27, 2026 build.

The current quality badge behavior uses local asset based artwork for 4K, Bluray, HDR10, Dolby Vision, and Dolby Atmos. Certification badges also include a small `AGE` label above the rating so age ratings read more clearly at a glance.

Transparent provider icons now stay transparent across every badge style. In `glass`, icons with transparency such as Kitsu render on a neutral inner chip with an accent ring so the accent color does not bleed through the icon cutouts.

### Movie Poster Options

<p align="center">
  <img src="docs/images/render-comparisons/movie-poster-comparison.png" alt="Movie poster comparison showing glass, square, and plain badge styles with different limits" width="920">
</p>

### Show Backdrop Options

<p align="center">
  <img src="docs/images/render-comparisons/show-backdrop-comparison.png" alt="Show backdrop comparison showing center, right vertical, and right layouts with different quality badge limits" width="920">
</p>

### Anime Logo Options

<p align="center">
  <img src="docs/images/render-comparisons/anime-logo-comparison.png" alt="Anime logo comparison showing transparent plain, transparent glass with a neutral Kitsu chip, and dark square settings" width="920">
</p>

## Scalability & Docker

The repo now ships two Docker entrypoints:

- [compose.yaml](/Users/ibby/Applications/xrdb/compose.yaml) is the VPS stack file. It matches the style used by popular Traefik based stacks much more closely: prebuilt GHCR image, `env_file: .env`, `expose`, Traefik labels, profiles, and a shared external Docker network.
- [local-compose.yaml](/Users/ibby/Applications/xrdb/local-compose.yaml) is the local source build file. It keeps the simpler direct port mapping path for local testing.

Sources:
- https://github.com/Viren070/docker-compose-template
- https://raw.githubusercontent.com/Viren070/docker-compose-template/main/apps/aiometadata/compose.yaml
- https://raw.githubusercontent.com/Viren070/docker-compose-template/main/apps/aiostreams/compose.yaml
- https://raw.githubusercontent.com/Viren070/docker-compose-template/main/apps/stremio-ai-search/compose.yaml
- https://raw.githubusercontent.com/Viren070/docker-compose-template/main/apps/mediaflow-proxy/compose.yaml

## Releases & Packages

Pushing a version tag that matches `v*` now starts two independent workflows:

- publishes a GitHub release with notes sourced from the matching changelog entry
- pushes a multi architecture container image to GHCR as `ghcr.io/ibbylabs/xrdb`

The GitHub release is no longer blocked on the Docker publish job finishing.

Pull examples:

```bash
docker pull ghcr.io/ibbylabs/xrdb:latest
docker pull ghcr.io/ibbylabs/xrdb:v1.0.0
```

Release flow:

```bash
npm run release:patch
```

The release flow also bumps `FINAL_IMAGE_RENDERER_CACHE_VERSION` automatically so each new release invalidates stale final image renders on first request.

Store `XRDB_README_PREVIEW_TMDB_KEY` and `XRDB_README_PREVIEW_MDBLIST_KEY` in local `.env` or `.env.local` if you want the release/doc asset scripts to pick them up automatically. Shell exported vars still win if both are set.

If the GHCR package already existed before it was linked to this repository, open the package in GitHub and:

1. connect it to `IbbyLabs/XRDB`
2. allow the package to follow repository permissions
3. set visibility to public if you want anonymous pulls

## Recommended Requirements

For high performance (on the fly image rendering), a server with a strong CPU and plenty of RAM is recommended.

Minimum recommended:
- CPU: 4 vCPU
- RAM: 4 GB

Local source build:
```bash
npm run docker:up
```

Explicit local source build:
```bash
npm run docker:up:local
```

VPS stack start:
```bash
npm run docker:up:stack
```

The VPS stack file expects Traefik or another external reverse proxy in front of it. It uses the published image and does not bind a public port directly.

If you use a Traefik style stack, set:

```env
XRDB_HOSTNAME=xrdb.example.com
DOCKER_NETWORK=aio_default
DOCKER_NETWORK_EXTERNAL=true
DOCKER_DATA_DIR=/opt/docker/data
```

That makes the VPS file mount `/opt/docker/data/xrdb` into `/app/data`, which is closer to the template repo shape.

If you route XRDB through gluetun in your own stack, set:

```env
HTTP_PROXY=http://gluetun:8080
HTTPS_PROXY=http://gluetun:8080
```

The repo compose file does not hard wire a `gluetun` dependency because that service usually lives in the surrounding VPS stack instead of the app repo itself.

Local custom port:
```bash
XRDB_PORT=4000 docker compose -f local-compose.yaml up -d --build
```

### Public Fast Preset

If you run a shared or public XRDB host, start from a lighter profile before
adding more providers or Torrentio badges. This keeps cold renders and Stremio
catalog bursts predictable.

Host env preset:

```env
XRDB_SHARP_CONCURRENCY=4
XRDB_SHARP_CACHE_MEMORY_MB=512
XRDB_SHARP_CACHE_ITEMS=2000
XRDB_SHARP_CACHE_FILES=20000
XRDB_TORRENTIO_CACHE_TTL_MS=43200000
XRDB_TORRENTIO_CONCURRENCY=3
```

Recommended proxy or addon settings:

| Setting | Recommended Value | Why |
|---------|-------------------|-----|
| `posterRatings` | `imdb,tmdb,mdblist` | Good coverage without fetching a long tail of providers on every poster. |
| `backdropRatings` | `imdb,tmdb,mdblist` | Same tradeoff as posters. |
| `logoRatings` | `imdb,tmdb` | Logos usually benefit less from a dense rating stack. |
| `posterStreamBadges` | `off` | Torrentio calls are one of the largest latency spikes on public instances. |
| `backdropStreamBadges` | `off` | Same reason as posters. |
| `translateMeta` | `true` | Keeps proxy metadata improvements on. |
| `translateMetaMode` | `fill-missing` | Conservative proxy behavior that usually helps more than it hurts. |
| `debugMetaTranslation` | `false` | Debug provenance is useful for troubleshooting, but not for normal public traffic. |

If you want the absolute fastest public profile, drop `mdblist` too and keep
the ratings list to `imdb,tmdb`.

## API Usage

Main endpoint:
`GET /{type}/{id}.jpg?ratings={providers}&lang={lang}&ratingStyle={style}...`

Response format note:
- Poster and backdrop responses are returned as JPEG.
- Logo requests keep the `.jpg` route shape but may return PNG when transparency is preserved.

### Examples
- **Poster with IMDb and TMDB**: `/poster/tt0133093.jpg?ratings=imdb,tmdb&lang=en`
- **Plain backdrop**: `/backdrop/tmdb:movie:603.jpg?ratings=mdblist&style=plain&backdropRatingsLayout=right vertical`

### Supported Query Parameters

| Parameter | Description | Supported Values | Default |
|-----------|-------------|------------------|---------|
| `type` | Image type (Path) | `poster`, `backdrop`, `logo` | - |
| `id` | Media ID (Path) | IMDb (`tt...`), TMDB (`tmdb:id`, `tmdb:movie:id`, `tmdb:tv:id`), Kitsu (`kitsu:id`), anime IDs such as `anilist:123`, `mal:456`, `tvdb:12345`, or `anidb:6789` | - |
| `tmdbIdScope` | TMDB ID collision handling mode | `soft`, `strict` | `soft` |
| `lang` | Image language | Any TMDB ISO 639-1 code (e.g. `it`, `en`, `es`, `fr`, `de`, `ru`, `ja`) | `en` |
| `genreBadge` | Genre badge mode (global fallback) | `off`, `text`, `icon`, `both` | `off` |
| `posterGenreBadge` | Poster genre badge mode | `off`, `text`, `icon`, `both` | `off` |
| `backdropGenreBadge` | Backdrop genre badge mode | `off`, `text`, `icon`, `both` | `off` |
| `logoGenreBadge` | Logo genre badge mode | `off`, `text`, `icon`, `both` | `off` |
| `genreBadgeStyle` | Genre badge style (global fallback) | `glass`, `square`, `plain` | `glass` |
| `posterGenreBadgeStyle` | Poster genre badge style | `glass`, `square`, `plain` | `glass` |
| `backdropGenreBadgeStyle` | Backdrop genre badge style | `glass`, `square`, `plain` | `glass` |
| `logoGenreBadgeStyle` | Logo genre badge style | `glass`, `square`, `plain` | `glass` |
| `genreBadgePosition` | Genre badge anchor (global fallback) | `topLeft`, `topCenter`, `topRight`, `bottomLeft`, `bottomCenter`, `bottomRight` | `topLeft` |
| `posterGenreBadgePosition` | Poster genre badge anchor | `topLeft`, `topCenter`, `topRight`, `bottomLeft`, `bottomCenter`, `bottomRight` | `topLeft` |
| `backdropGenreBadgePosition` | Backdrop genre badge anchor | `topLeft`, `topCenter`, `topRight`, `bottomLeft`, `bottomCenter`, `bottomRight` | `topLeft` |
| `logoGenreBadgePosition` | Logo genre badge anchor | `topLeft`, `topCenter`, `topRight`, `bottomLeft`, `bottomCenter`, `bottomRight` | `topLeft` |
| `genreBadgeScale` | Genre badge scale (global fallback) | Number (`70-160`) | `100` |
| `posterGenreBadgeScale` | Poster genre badge scale | Number (`70-160`) | `100` |
| `backdropGenreBadgeScale` | Backdrop genre badge scale | Number (`70-160`) | `100` |
| `logoGenreBadgeScale` | Logo genre badge scale | Number (`70-160`) | `100` |
| `streamBadges` | Quality badges via Torrentio (global fallback) | `auto`, `on`, `off` | `auto` |
| `posterStreamBadges` | Poster quality badges | `auto`, `on`, `off` | `auto` |
| `backdropStreamBadges` | Backdrop quality badges | `auto`, `on`, `off` | `auto` |
| `qualityBadgesSide` | Quality badges side (poster `top bottom` layout only) | `left`, `right` | `left` |
| `posterQualityBadgesPosition` | Quality badges side for poster `top` or `bottom` layouts | `auto`, `left`, `right` | `auto` |
| `qualityBadgesStyle` | Quality badges style (global fallback) | `glass`, `square`, `plain`, `media` | `glass` |
| `posterQualityBadgesStyle` | Poster quality badges style | `glass`, `square`, `plain`, `media` | `glass` |
| `backdropQualityBadgesStyle` | Backdrop quality badges style | `glass`, `square`, `plain`, `media` | `glass` |
| `posterQualityBadgesMax` | Poster quality badge limit | Number (1-20) | `auto` |
| `backdropQualityBadgesMax` | Backdrop quality badge limit | Number (1-20) | `auto` |
| `ratingPresentation` | Rating presentation mode (global fallback) | `standard`, `minimal`, `average`, `dual`, `blockbuster`, `none` | `standard` |
| `aggregateRatingSource` | Aggregate source for `minimal` and `average` (global fallback) | `overall`, `critics`, `audience` | `overall` |
| `aggregateAccentMode` | Aggregate accent source | `source`, `genre`, `custom` | `source` |
| `aggregateAccentColor` | Aggregate accent color when `aggregateAccentMode=custom` | Hex color | `#a78bfa` |
| `aggregateAccentBarOffset` | Average badge accent bar offset | Number (-12 to 12) | `0` |
| `ratings` | Rating providers (global fallback) | `tmdb, mdblist, imdb, tomatoes, tomatoesaudience, letterboxd, metacritic, metacriticuser, trakt, simkl, rogerebert, myanimelist, anilist, kitsu` | `all` |
| `posterRatings` | Poster rating providers | `tmdb, mdblist, imdb, tomatoes, tomatoesaudience, letterboxd, metacritic, metacriticuser, trakt, simkl, rogerebert, myanimelist, anilist, kitsu` | `all` |
| `backdropRatings` | Backdrop rating providers | `tmdb, mdblist, imdb, tomatoes, tomatoesaudience, letterboxd, metacritic, metacriticuser, trakt, simkl, rogerebert, myanimelist, anilist, kitsu` | `all` |
| `logoRatings` | Logo rating providers | `tmdb, mdblist, imdb, tomatoes, tomatoesaudience, letterboxd, metacritic, metacriticuser, trakt, simkl, rogerebert, myanimelist, anilist, kitsu` | `all` |
| `ratingValueMode` | Rating display scaling | `native`, `normalized`, `normalized100` | `native` |
| `ratingStyle` (or `posterRatingStyle` / `backdropRatingStyle` / `logoRatingStyle`, or `style` legacy) | Badge style | `glass` (Pill), `square` (Dark), `plain` (No BG) | `glass` (poster/backdrop), `plain` (logo) |
| `tmdbKey` | TMDB v3 API Key (Stateless) | String (e.g. `your_key`) | **Required** |
| `mdblistKey` | MDBList API Key (Stateless) | String (e.g. `your_key`) | Required for MDBList backed ratings |
| `fanartKey` | Fanart API Key for fanart poster, backdrop, and logo sources | String (e.g. `your_key`) | Server fallback when available |
| `simklClientId` | SIMKL client id for direct SIMKL ratings | String (e.g. `your_client_id`) | None |
| `imageText` | Image text (poster/backdrop only) | `original`, `clean`, `alternative` | `original` (poster), `clean` (backdrop) |
| `posterArtworkSource` | Poster artwork source | `tmdb`, `fanart` | `tmdb` |
| `backdropArtworkSource` | Backdrop artwork source | `tmdb`, `fanart` | `tmdb` |
| `posterRatingsLayout` | Poster layout | `top`, `bottom`, `left`, `right`, `top bottom`, `left right` | `top bottom` |
| `posterRatingsMaxPerSide` | Max badges per side | Number (1+) | `auto` |
| `backdropRatingsLayout` | Backdrop layout | `center`, `right`, `right vertical` | `center` |
| `logoRatingsMax` | Logo badge limit | Number (1+) | `auto` |
| `logoBackground` | Logo canvas background | `transparent`, `dark` | `transparent` |
| `logoArtworkSource` | Logo artwork source | `tmdb`, `fanart` | `tmdb` |

In the configurator UI, `minimal` is labeled as `Compact Average`, `average` is labeled as `Labeled Average`, and `dual` is labeled as `Critics + Audience`. The underlying query values stay `minimal`, `average`, and `dual`.

RPDB compatibility aliases are accepted where they map cleanly in XRDB: `order`/`ratingOrder` (rating provider order), `ratingBarPos` (mapped to poster/backdrop layout + side position), `fontScale` (mapped to rating badge scale), `imageSize=verylarge` (mapped to `posterImageSize=4k`), and `textless`/`posterType=textless-*` (mapped to clean poster text mode).

`myanimelist` and `trakt` can render directly when the server has `XRDB_MAL_CLIENT_ID` or `XRDB_TRAKT_CLIENT_ID`. Without the MAL client id, XRDB falls back to Jikan for direct `myanimelist` ratings. When direct lookups are unavailable, XRDB still falls back to MDBList when `mdblistKey` is present.

`tmdbIdScope=soft` is the default for compatibility and accepts bare `tmdb:id`. Set `tmdbIdScope=strict` to require `tmdb:movie:id` or `tmdb:tv:id` for backdrop and logo requests to avoid movie versus TV collisions.

Transparent provider icons stay transparent across `glass`, `square`, and `plain`. In `glass`, XRDB switches icons with transparency such as Kitsu to a neutral inner chip with an accent ring to avoid accent color bleed through.

Genre badges resolve from a curated family set instead of trying to icon map every TMDB genre. Strong buckets such as horror, comedy, drama, sci fi, fantasy, crime, documentary, animation, and anime render. When a title mixes drama with a stronger supported family, XRDB still prefers the more specific bucket.

`fanartKey` is optional. If present, XRDB uses your key first for fanart requests. If it is blank, XRDB falls back to `XRDB_FANART_API_KEY` or `FANART_API_KEY` when the server has one.

Poster `posterArtworkSource=fanart` uses fanart.tv poster art for `original`, `clean`, and `alternative`. Original and clean use the top ranked fanart image. Alternative uses the next ranked fanart image when one exists.

Backdrop `backdropArtworkSource=fanart` uses fanart.tv `moviebackground` or `showbackground` art for `original`, `clean`, and `alternative`. Original and clean use the top ranked fanart image. Alternative uses the next ranked fanart image when one exists. `logoArtworkSource=fanart` uses fanart.tv HD or clear logo assets for logo output.

Future work: season aware fanart support is a strong next step for TV because fanart.tv exposes `seasonposter` and `seasonthumb` assets.

Rendered ratings keep provider native scales by default. Set `ratingValueMode=normalized` to convert everything to a 0 to 10 display scale, or `ratingValueMode=normalized100` to convert everything to a rounded whole number out of 100. Providers that already use `/10` are shown without the suffix in ten point mode, percentage sources are converted to decimal (`69%` -> `6.9`) or whole number (`69`), `/5` sources are doubled (`4.2/5` -> `8.4`) or multiplied by twenty (`84`), and `/4` sources are multiplied by `2.5` (`3.5/4` -> `8.8` or `88`).

When no explicit max is set, XRDB now renders all badges that fit the layout instead of applying a fixed poster or logo badge cap. Use the max params only when you want to intentionally tighten the visible badge count.

### Supported ID Formats

XRDB supports multiple formats to identify media:

- **IMDb**: `tt0133093` (standard `tt` + numbers)
- **TMDB**: `tmdb:603` or explicit `tmdb:movie:603` / `tmdb:tv:1399`
- **Kitsu**: `kitsu:1` (prefix `kitsu:` followed by the ID)
- **Anime Mappings**: `provider:id` (e.g. `anilist:123`, `myanimelist:456`)

## Addon Developer Guide

To integrate XRDB into your addon:

1. **Config String**: use a single `xrdbConfig` string (base64url) generated by the XRDB configurator. It contains `baseUrl`, `tmdbKey`, `mdblistKey`, optional `fanartKey`, the per type style/text/layout fields, and any optional overrides currently enabled. Defaults are usually omitted.
2. **Addon UI**: show ONLY the toggles to enable/disable `poster`, `backdrop`, `logo`. No modal and no extra settings panels.
3. **Fallback**: if a type is disabled, keep the original artwork (do not call XRDB for that type).
4. **Decode**: decode `xrdbConfig` (base64url -> JSON) once and reuse it.
5. **URL build**: start with `{baseUrl}/{type}/{id}.jpg`, add `tmdbKey` and `mdblistKey`, then pass through any optional XRDB fields present in `cfg` such as `fanartKey`, `ratings`, `posterRatings`, `backdropRatings`, `logoRatings`, `lang`, `ratingValueMode`, `genreBadge`, `genreBadgeStyle`, `genreBadgePosition`, `genreBadgeScale`, `posterGenreBadge`, `backdropGenreBadge`, `logoGenreBadge`, `posterGenreBadgeStyle`, `backdropGenreBadgeStyle`, `logoGenreBadgeStyle`, `posterGenreBadgePosition`, `backdropGenreBadgePosition`, `logoGenreBadgePosition`, `posterGenreBadgeScale`, `backdropGenreBadgeScale`, `logoGenreBadgeScale`, `streamBadges`, `posterStreamBadges`, `backdropStreamBadges`, `qualityBadgesSide`, `posterQualityBadgesPosition`, `qualityBadgesStyle`, `posterQualityBadgesStyle`, `backdropQualityBadgesStyle`, `posterQualityBadgesMax`, `backdropQualityBadgesMax`, `ratingPresentation`, `aggregateRatingSource`, `posterRatingsLayout`, `posterRatingsMaxPerSide`, `backdropRatingsLayout`, `logoRatingsMax`, `logoBackground`, `posterArtworkSource`, `backdropArtworkSource`, and `logoArtworkSource`. Then apply the per type config fields:
   - `poster`: `posterRatingStyle`, `posterImageText`
   - `poster artwork source`: `posterArtworkSource`
   - `backdrop`: `backdropRatingStyle`, `backdropImageText`
   - `backdrop artwork source`: `backdropArtworkSource`
   - `logo`: `logoRatingStyle`, `logoBackground`, `logoArtworkSource` (omit `imageText`)

The generated configurator payload usually emits the per type fields and omits unchanged defaults. Global fallback params such as `ratings`, `streamBadges`, or `qualityBadgesStyle` are still supported if you build configs manually.

### AI Integration Prompt

If you are using an AI agent such as Claude or ChatGPT to build an addon, copy this prompt:

```text
Act as an expert addon developer. Implement the XRDB Stateless API in a media center addon.

--- CONFIG INPUT ---
Add a single text field called "xrdbConfig" (base64url). The user will paste it from the XRDB site after configuring there.
Do NOT hardcode API keys or base URL. Always use cfg.baseUrl from xrdbConfig.

--- DECODE ---
Node/JS: const cfg = JSON.parse(Buffer.from(xrdbConfig, 'base64url').toString('utf8'));

--- FULL API REFERENCE ---
Endpoint: GET /{type}/{id}.jpg?...queryParams

Parameter               | Values                                                              | Default
type (path)             | poster, backdrop, logo                                               | -
id (path)               | IMDb (tt...), TMDB (tmdb:id / tmdb:movie:id / tmdb:tv:id), Kitsu (kitsu:id), AniList, MAL                            | -
tmdbIdScope             | soft, strict                                                                                                           | soft
ratings                 | tmdb, mdblist, imdb, tomatoes, tomatoesaudience, letterboxd,         | all
                        | metacritic, metacriticuser, trakt, simkl, rogerebert, myanimelist,   |
                        | anilist, kitsu (global fallback)                                     |
posterRatings           | tmdb, mdblist, imdb, tomatoes, tomatoesaudience, letterboxd,         | all
                        | metacritic, metacriticuser, trakt, simkl, rogerebert, myanimelist,   |
                        | anilist, kitsu (poster only)                                         |
backdropRatings         | tmdb, mdblist, imdb, tomatoes, tomatoesaudience, letterboxd,         | all
                        | metacritic, metacriticuser, trakt, simkl, rogerebert, myanimelist,   |
                        | anilist, kitsu (backdrop only)                                       |
logoRatings             | tmdb, mdblist, imdb, tomatoes, tomatoesaudience, letterboxd,         | all
                        | metacritic, metacriticuser, trakt, simkl, rogerebert, myanimelist,   |
                        | anilist, kitsu (logo only)                                           |
lang                    | Any TMDB ISO 639-1 code (en, it, fr, es, de, ja, ko, etc.)            | en
genreBadge             | off, text, icon, both (global fallback)                              | off
posterGenreBadge       | off, text, icon, both (poster only)                                  | off
backdropGenreBadge     | off, text, icon, both (backdrop only)                                | off
logoGenreBadge         | off, text, icon, both (logo only)                                    | off
streamBadges            | auto, on, off (global fallback)                                      | auto
posterStreamBadges      | auto, on, off (poster only)                                          | auto
backdropStreamBadges    | auto, on, off (backdrop only)                                        | auto
qualityBadgesSide       | left, right (poster top bottom layout only)                          | left
posterQualityBadgesPosition | auto, left, right (poster top or bottom only)                    | auto
qualityBadgesStyle      | glass, square, plain, media (global fallback)                        | glass
posterQualityBadgesStyle| glass, square, plain, media (poster only)                            | glass
backdropQualityBadgesStyle| glass, square, plain, media (backdrop only)                        | glass
posterQualityBadgesMax  | Number (1+)                                                          | auto
backdropQualityBadgesMax| Number (1+)                                                          | auto
ratingPresentation      | standard, minimal, average, blockbuster, none                        | standard
aggregateRatingSource   | overall, critics, audience                                           | overall
ratingStyle             | glass, square, plain                                                 | glass
imageText               | original, clean, alternative                                         | original
posterArtworkSource     | tmdb, fanart                                                         | tmdb
backdropArtworkSource   | tmdb, fanart                                                         | tmdb
posterRatingsLayout     | top, bottom, left, right, top bottom, left right                     | top bottom
posterRatingsMaxPerSide | Number (1+)                                                          | auto
backdropRatingsLayout   | center, right, right vertical                                        | center
logoRatingsMax          | Number (1+)                                                          | auto
logoBackground          | transparent, dark                                                    | transparent
logoArtworkSource       | tmdb, fanart                                                         | tmdb
tmdbKey (REQUIRED)      | Your TMDB v3 API Key                                                 | -
mdblistKey (REQUIRED)   | Your MDBList.com API Key                                             | -
fanartKey               | Your Fanart API Key (used first for fanart sources)                  | server fallback when available
simklClientId           | Your SIMKL client id for direct SIMKL ratings                        | -

TMDB NOTE: Default tmdbIdScope=soft keeps compatibility and accepts tmdb:id. Set tmdbIdScope=strict to require tmdb:movie:id or tmdb:tv:id for backdrop and logo.
STYLE NOTE: Transparent provider icons stay transparent in every style. In glass, icons with transparency such as Kitsu render on a neutral inner chip with an accent ring to avoid accent color bleed through.
FANART NOTE: fanartKey is optional. If present, XRDB uses your key first for fanart poster, backdrop, and logo requests. If fanartKey is blank, XRDB falls back to XRDB_FANART_API_KEY or FANART_API_KEY when the server has one.
POSTER NOTE: posterArtworkSource=fanart uses fanart.tv poster art for original, clean, and alternative poster modes when a fanart key is available. Original and clean use the top ranked fanart image. Alternative uses the next ranked fanart image when one exists.
BACKDROP NOTE: backdropArtworkSource=fanart uses fanart.tv moviebackground or showbackground art for original, clean, and alternative backdrop modes when a fanart key is available. Original and clean use the top ranked fanart image. Alternative uses the next ranked fanart image when one exists.
LOGO NOTE: logoArtworkSource=fanart uses fanart.tv HD or clear logo assets when a fanart key is available.
FUTURE NOTE: season aware fanart support is a good next step for TV because fanart.tv exposes seasonposter and seasonthumb assets.

--- INTEGRATION REQUIREMENTS ---
1. Use ONLY the "xrdbConfig" field (no modal and no extra settings panels).
2. Add toggles to enable/disable: poster, backdrop, logo.
3. If a type is disabled, keep the original artwork (do not call XRDB for that type).
4. Build XRDB URLs using the decoded config and inject them into both catalog and meta responses.

--- PER TYPE SETTINGS ---
poster   -> ratingStyle = cfg.posterRatingStyle, imageText = cfg.posterImageText
poster artwork source -> use cfg.posterArtworkSource for poster original, clean, or alternative
backdrop -> ratingStyle = cfg.backdropRatingStyle, imageText = cfg.backdropImageText
backdrop artwork source -> use cfg.backdropArtworkSource for backdrop original, clean, or alternative
logo     -> ratingStyle = cfg.logoRatingStyle, logoBackground = cfg.logoBackground, logoArtworkSource = cfg.logoArtworkSource
all      -> genreBadge = cfg.genreBadge, genreBadgeStyle = cfg.genreBadgeStyle, genreBadgePosition = cfg.genreBadgePosition, genreBadgeScale = cfg.genreBadgeScale (optional global fallbacks)
poster   -> genreBadge = cfg.posterGenreBadge, genreBadgeStyle = cfg.posterGenreBadgeStyle, genreBadgePosition = cfg.posterGenreBadgePosition, genreBadgeScale = cfg.posterGenreBadgeScale
backdrop -> genreBadge = cfg.backdropGenreBadge, genreBadgeStyle = cfg.backdropGenreBadgeStyle, genreBadgePosition = cfg.backdropGenreBadgePosition, genreBadgeScale = cfg.backdropGenreBadgeScale
logo     -> genreBadge = cfg.logoGenreBadge, genreBadgeStyle = cfg.logoGenreBadgeStyle, genreBadgePosition = cfg.logoGenreBadgePosition, genreBadgeScale = cfg.logoGenreBadgeScale
Ratings providers can be set per type via cfg.posterRatings / cfg.backdropRatings / cfg.logoRatings (fallback to cfg.ratings).
Rating presentation can be set per type via cfg.posterRatingPresentation / cfg.backdropRatingPresentation / cfg.logoRatingPresentation (fallback to cfg.ratingPresentation).
Aggregate source can be set per type via cfg.posterAggregateRatingSource / cfg.backdropAggregateRatingSource / cfg.logoAggregateRatingSource (fallback to cfg.aggregateRatingSource).
Use cfg.aggregateAccentMode to keep source colours, match the genre badge, or force a custom aggregate accent through cfg.aggregateAccentColor.
Use cfg.aggregateAccentBarOffset to nudge the average badge accent bar up or down a few pixels in compact, labeled, and dual aggregate layouts.
Quality badges can be set per type via cfg.posterStreamBadges / cfg.backdropStreamBadges (fallback to cfg.streamBadges).
Use cfg.qualityBadgesSide for poster top bottom layouts and cfg.posterQualityBadgesPosition for poster top or bottom layouts.
Quality badges style/max can be set per type via cfg.posterQualityBadgesStyle / cfg.backdropQualityBadgesStyle and cfg.posterQualityBadgesMax / cfg.backdropQualityBadgesMax.

--- URL BUILD ---
const typeRatingStyle = type === 'poster' ? cfg.posterRatingStyle : type === 'backdrop' ? cfg.backdropRatingStyle : cfg.logoRatingStyle;
const typeImageText = type === 'backdrop' ? cfg.backdropImageText : cfg.posterImageText;
${cfg.baseUrl}/${type}/${id}.jpg?tmdbKey=${cfg.tmdbKey}&mdblistKey=${cfg.mdblistKey}&fanartKey=${cfg.fanartKey}&ratings=${cfg.ratings}&posterRatings=${cfg.posterRatings}&backdropRatings=${cfg.backdropRatings}&logoRatings=${cfg.logoRatings}&lang=${cfg.lang}&genreBadge=${cfg.genreBadge}&genreBadgeStyle=${cfg.genreBadgeStyle}&genreBadgePosition=${cfg.genreBadgePosition}&genreBadgeScale=${cfg.genreBadgeScale}&posterGenreBadge=${cfg.posterGenreBadge}&backdropGenreBadge=${cfg.backdropGenreBadge}&logoGenreBadge=${cfg.logoGenreBadge}&posterGenreBadgeStyle=${cfg.posterGenreBadgeStyle}&backdropGenreBadgeStyle=${cfg.backdropGenreBadgeStyle}&logoGenreBadgeStyle=${cfg.logoGenreBadgeStyle}&posterGenreBadgePosition=${cfg.posterGenreBadgePosition}&backdropGenreBadgePosition=${cfg.backdropGenreBadgePosition}&logoGenreBadgePosition=${cfg.logoGenreBadgePosition}&posterGenreBadgeScale=${cfg.posterGenreBadgeScale}&backdropGenreBadgeScale=${cfg.backdropGenreBadgeScale}&logoGenreBadgeScale=${cfg.logoGenreBadgeScale}&streamBadges=${cfg.streamBadges}&posterStreamBadges=${cfg.posterStreamBadges}&backdropStreamBadges=${cfg.backdropStreamBadges}&qualityBadgesSide=${cfg.qualityBadgesSide}&posterQualityBadgesPosition=${cfg.posterQualityBadgesPosition}&qualityBadgesStyle=${cfg.qualityBadgesStyle}&posterQualityBadgesStyle=${cfg.posterQualityBadgesStyle}&backdropQualityBadgesStyle=${cfg.backdropQualityBadgesStyle}&posterQualityBadgesMax=${cfg.posterQualityBadgesMax}&backdropQualityBadgesMax=${cfg.backdropQualityBadgesMax}&ratingPresentation=${cfg.ratingPresentation}&aggregateRatingSource=${cfg.aggregateRatingSource}&aggregateAccentMode=${cfg.aggregateAccentMode}&aggregateAccentColor=${cfg.aggregateAccentColor}&aggregateAccentBarOffset=${cfg.aggregateAccentBarOffset}&ratingStyle=${typeRatingStyle}&imageText=${typeImageText}&posterArtworkSource=${cfg.posterArtworkSource}&backdropArtworkSource=${cfg.backdropArtworkSource}&posterRatingsLayout=${cfg.posterRatingsLayout}&posterRatingsMaxPerSide=${cfg.posterRatingsMaxPerSide}&backdropRatingsLayout=${cfg.backdropRatingsLayout}&logoRatingsMax=${cfg.logoRatingsMax}&logoBackground=${cfg.logoBackground}&logoArtworkSource=${cfg.logoArtworkSource}

Omit imageText when type=logo.

Skip any params that are undefined. Keep empty ratings/posterRatings/backdropRatings/logoRatings to disable providers.
```

---

## Proxy for Stremio

XRDB can act as a proxy for any Stremio addon and always replace images
(poster, background, logo) with the ones generated by XRDB.

### Manifest Proxy (Stremio)

Stremio does not use query params here. **Generate the link from the XRDB site** using the "Proxy Manifest" section:

```text
https://YOUR_XRDB_HOST/proxy/{config}/manifest.json
```

`{config}` is created automatically by the site based on the inserted parameters.

### Direct Query Proxy Mode (Advanced)

For scripts, testing, or non generated integrations, XRDB also exposes a direct manifest route:

```text
https://YOUR_XRDB_HOST/proxy/manifest.json?url={manifestUrl}&tmdbKey=...&mdblistKey=...&fanartKey=...
```

The matching query based passthrough routes live under `/proxy/catalog/...`, `/proxy/meta/...`, and the other addon resource paths and accept the same query config. The encoded `/proxy/{config}/manifest.json` form is still the normal Stremio install URL.

### Notes
- The proxy routes `meta.poster`, `meta.background`, and `meta.logo` through XRDB URLs.
- The `url` field must point to the original addon's `manifest.json`.
- `tmdbKey` is required.
- `mdblistKey` is required for MDBList backed ratings and broad fallback coverage.
- `fanartKey` is optional and is recommended when you use fanart sources. When it is missing, XRDB can fall back to the server key if one exists.
- For shared/public XRDB instances, start with the Public Fast preset above before enabling long rating lists or Torrentio stream badges.
- Optional proxy metadata translation can localize `meta.name` / `meta.description` and episode text.
- `translateMetaMode=fill-missing` is the safe default: keep good addon text and only backfill blanks or placeholders.
- `translateMetaMode=prefer-source` keeps any source addon text that is present, even placeholders like `N/A`.
- `translateMetaMode=prefer-requested-language` replaces source addon text only when TMDB has an exact translation for the requested language; anime native fallback can still fill missing fields.
- `translateMetaMode=prefer-tmdb` prefers TMDB text whenever it is available.
- When `debugMetaTranslation=true`, the proxy adds an `_xrdbMetaTranslation` object to returned metas so you can inspect field provenance.

### Metadata Translation Guide

Metadata translation only changes text in the proxied addon metadata:

- series and movie titles
- descriptions / overviews
- episode titles and descriptions

It does **not** change how artwork is rendered. Posters, backdrops, and logos still follow the normal XRDB image settings.

#### Recommended Starting Setup

If you just want a sensible default, use this:

| Setting | Recommended Value | Why |
|---------|-------------------|-----|
| Language (`lang`) | Your actual viewing language, such as `en`, `it`, `fr`, or `fr-BE` | This tells XRDB which language to look for when translating text. |
| Translate metadata in the proxy (`translateMeta`) | On | Turns on metadata translation for the proxy. |
| Merge mode (`translateMetaMode`) | `fill-missing` | Best default for most people. It fixes empty, blank, or placeholder text without overwriting good text from the addon. |
| Attach debug provenance (`debugMetaTranslation`) | Off | Keep this off unless you are testing or troubleshooting. |

If you only want one recommendation: use `fill-missing`. It is the safest option because it improves bad metadata without being aggressive.

#### What Each Setting Does

| Setting | What It Does | How To Use It | Recommended For |
|---------|--------------|---------------|-----------------|
| Language (`lang`) | Chooses the language XRDB tries to use for translated metadata. | Set this to the language you actually want to read in Stremio. If you want wording for a specific region, use a regional code like `en-GB` or `fr-BE` instead of just `en` or `fr`. | Anyone using metadata translation. |
| Translate metadata in the proxy (`translateMeta`) | Turns metadata translation on or off for the proxy. | Enable it if you want XRDB to improve titles, descriptions, and episode text coming from another addon. Leave it off if you want to preserve the addon text exactly as it arrives. | Most users should turn it on. |
| Merge mode (`translateMetaMode`) | Controls how careful or aggressive XRDB should be when deciding whether to replace addon text. | Pick the mode based on whether you want to preserve existing addon wording, prefer exact localized text, or prefer TMDB as the main source. | See the merge mode table below. |
| Attach debug provenance (`debugMetaTranslation`) | Adds a debug object to each proxied item showing where the final text came from. | Use it when checking whether text came from the addon itself, TMDB, AniList, or Kitsu. Turn it back off for normal use. | Testing, debugging, and comparing behavior. |

#### Merge Mode Guide

| Mode | What It Feels Like | Best When | Less Ideal When |
|------|--------------------|-----------|-----------------|
| `fill-missing` | Conservative and practical. Keeps good addon text, but replaces blanks, empty fields, and obvious placeholders like `N/A`. | You want the safest behavior for general use. | You want TMDB wording to win even when the addon already has decent text. |
| `prefer-source` | Very conservative. If the addon already sent text, XRDB keeps it. | You trust the source addon and only want help when a field is truly absent. | The addon often sends weak placeholders like `N/A`, `unknown`, or `tbd`, because this mode keeps them. |
| `prefer-requested-language` | Puts language matching first. XRDB replaces existing text only when it finds an exact match for your requested language, then still fills gaps when needed. | You want stronger localization without replacing text with the wrong regional variant. | You want the most aggressive TMDB based behavior, or you do not care about exact language matching. |
| `prefer-tmdb` | Most opinionated. If TMDB has text, XRDB usually uses it. | You want one consistent source and prefer TMDB wording over addon wording. | You like the addon's custom descriptions, naming, or editorial style. |

Example: if you request `fr-BE`, `prefer-requested-language` will not treat `fr-FR` as the same thing when deciding whether to replace existing text.

#### Which Mode Should You Pick?

| If You Want... | Use This Mode | Why |
|----------------|---------------|-----|
| The safest overall default | `fill-missing` | It improves bad metadata without unnecessarily replacing good text. |
| To keep the source addon mostly untouched | `prefer-source` | XRDB only fills fields that are actually missing. |
| Better localization with strict language matching | `prefer-requested-language` | It only replaces text when the requested language is a real match, which helps avoid awkward regional substitutions. |
| TMDB wording whenever possible | `prefer-tmdb` | It gives you the most consistent TMDB based result. |

#### Simple Advice

- For most users: turn on metadata translation and leave Merge mode on `fill-missing`
- For people who mainly care about exact localized wording: `prefer-requested-language`
- For people who trust the source addon more than TMDB: `prefer-source`
- For people who want TMDB to be the main voice everywhere: `prefer-tmdb`

Anime gets extra fallback help when possible. If TMDB is missing good text, XRDB can still use anime mapping plus AniList or Kitsu data to fill gaps.

### Metadata Translation In Action

These screenshots were regenerated from the local March 27, 2026 codebase using deterministic proxy fixtures.

To make each merge mode visible on demand, a local fixture addon returned controlled source addon metadata for three real IDs:

1. `tt0133093` (`The Matrix`) with placeholder movie text (`N/A`, blank overview)
2. `tt0944947` (`Game of Thrones`) with good top level source addon text plus mixed episode text
3. `mal:16498` (`Attack on Titan`) with blank anime text so TMDB and anime fallback behavior are both observable

The fixture environment also mocked the TMDB, anime mapping, AniList, and Kitsu lookups needed for those cases so the screenshots stay reproducible and do not expose live API keys in the captured output.

#### Settings Panel

![Proxy metadata translation settings](docs/images/metadata-translation/proxy-translation-settings-panel.png)

Fill Missing in French (France) replaces placeholder movie fields with TMDB French text.

![Fill missing movie example in French](docs/images/metadata-translation/proxy-translation-fill-missing-movie-fr.png)

Prefer Requested Language in French (Belgium) preserves good source addon series text when TMDB does not have an exact regional match, while still filling missing episode fields.

![Prefer requested language show example in French Belgium](docs/images/metadata-translation/proxy-translation-prefer-language-show-fr-be.png)

Anime fallback in English (United Kingdom): Prefer Requested Language falls back to anime native text when TMDB only has exact English (United States), and provenance records the fallback source.

![Anime fallback example in English United Kingdom](docs/images/metadata-translation/proxy-translation-anime-fallback-en-gb.png)

Production validation for this feature covered French (France), French (Belgium), English (United States), and English (United Kingdom).

## Environment Variables

Copy `env.template` to `.env` and adjust as needed. All cache TTL values are in **milliseconds**.

### Proxy & Security

| Variable | Default | Description |
|----------|---------|-------------|
| `XRDB_TRUST_PROXY_HEADERS` | `false` | Trust `x-forwarded-host` / `x-forwarded-proto` when behind a reverse proxy |
| `XRDB_PROXY_ALLOWED_ORIGINS` | (empty) | Comma separated CORS allowlist. Empty = `*` |
| `XRDB_PREVIEW_ORIGIN` | `http://127.0.0.1:3000` | Preview fetch origin used by `/preview/{slug}` before falling back to the container hostname and public origin |
| `XRDB_PORT` | `3000` | Host port used by `local-compose.yaml` |
| `XRDB_DATA_DIR` | `./data` | Host path mounted to `/app/data` by `local-compose.yaml` |
| `DOCKER_DATA_DIR` | `./data` | Root host data path used by `compose.yaml`, which mounts `${DOCKER_DATA_DIR}/xrdb` into `/app/data` |
| `DOCKER_NETWORK` | `aio_default` | Docker network name used by `compose.yaml` |
| `DOCKER_NETWORK_EXTERNAL` | `true` | Marks `DOCKER_NETWORK` as an external network for the VPS stack file |
| `XRDB_HOSTNAME` | required for `compose.yaml` | Host rule value used by the Traefik labels |
| `XRDB_TRAEFIK_ENTRYPOINTS` | `websecure` | Traefik entrypoints label value |
| `XRDB_TRAEFIK_CERTRESOLVER` | `letsencrypt` | Traefik certresolver label value |
| `XRDB_README_PREVIEW_TMDB_KEY` | (empty) | Optional dedicated TMDB key for the fixed README preview gallery route |
| `XRDB_README_PREVIEW_MDBLIST_KEY` | (empty) | Optional dedicated MDBList key for the fixed README preview gallery route |
| `XRDB_TMDB_API_BASE_URL` | `https://api.themoviedb.org/3` | Optional TMDB API base URL override used by image rendering and proxy translation |
| `XRDB_ANILIST_GRAPHQL_URL` | `https://graphql.anilist.co` | Optional AniList GraphQL endpoint override |
| `XRDB_ANIME_MAPPING_BASE_URL` | `https://animemapping.stremio.dpdns.org` | Optional anime mapping service base URL override used by image rendering and proxy translation |
| `XRDB_KITSU_API_BASE_URL` | `https://kitsu.io/api/edge` | Optional Kitsu API base URL override used by image rendering and proxy translation |
| `XRDB_MAL_CLIENT_ID` | (empty) | Optional MyAnimeList v2 client id used for direct `myanimelist` ratings |
| `XRDB_TRAKT_CLIENT_ID` | (empty) | Optional Trakt client id used for direct `trakt` ratings |
| `SIMKL_CLIENT_ID` | (empty) | Optional SIMKL client id used for direct `simkl` ratings (also `XRDB_SIMKL_CLIENT_ID`) |
| `XRDB_SIMKL_APP_NAME` | `xrdb` | Simkl app name sent in required `app-name` query parameter |
| `XRDB_SIMKL_APP_VERSION` | `1.0` | Simkl app version sent in required `app-version` query parameter |
| `XRDB_MAL_API_BASE_URL` | `https://api.myanimelist.net/v2` | Optional MyAnimeList API base URL override |
| `XRDB_JIKAN_API_BASE_URL` | `https://api.jikan.moe/v4` | Optional Jikan API base URL override for unauthenticated MAL fallback |
| `XRDB_TRAKT_API_BASE_URL` | `https://api.trakt.tv` | Optional Trakt API base URL override |

### Cache TTLs

When these vars are unset, XRDB uses the runtime defaults shown below. The
bundled `docker compose` setup now defers to those app defaults instead of
hardcoding separate cache TTL values.

| Variable | Default | Min | Max | Description |
|----------|---------|-----|-----|-------------|
| `XRDB_TMDB_CACHE_TTL_MS` | 3 days | 10 min | 30 days | TMDB metadata |
| `XRDB_MDBLIST_CACHE_TTL_MS` | 3 days | 10 min | 30 days | MDBList ratings |
| `XRDB_KITSU_CACHE_TTL_MS` | 3 days | 10 min | 30 days | Kitsu anime |
| `XRDB_SIMKL_CACHE_TTL_MS` | 3 days | 10 min | 30 days | SIMKL ratings |
| `XRDB_SIMKL_ID_CACHE_TTL_MS` | 30 days | 10 min | 30 days | Simkl id resolution cache |
| `XRDB_SIMKL_ID_EMPTY_CACHE_TTL_MS` | 1 day | 10 min | 30 days | Simkl empty id lookup cache |
| `XRDB_TORRENTIO_CACHE_TTL_MS` | 6 hours | 10 min | 7 days | Torrentio stream badges |
| `XRDB_PROVIDER_ICON_CACHE_TTL_MS` | 7 days | 1 hour | 30 days | Rating provider icons |
| `XRDB_IMDB_DATASET_CACHE_TTL_MS` | 7 days | 1 hour | 365 days | Local IMDb dataset |
| `XRDB_MDBLIST_OLD_MOVIE_CACHE_TTL_MS` | 7 days | 1 hour | 30 days | Extended cache for old media |
| `XRDB_MDBLIST_OLD_MOVIE_AGE_DAYS` | 365 | 30 | 3,650 | Age threshold for "old media" logic |
| `XRDB_MDBLIST_RATE_LIMIT_COOLDOWN_MS` | 1 day | 30 sec | 7 days | Cooldown after MDBList rate limit |

### IMDb Dataset Sync

| Variable | Default | Description |
|----------|---------|-------------|
| `XRDB_IMDB_DATASET_AUTO_DOWNLOAD` | `true` | Automatically download the IMDb ratings dataset when it is missing or stale |
| `XRDB_IMDB_DATASET_AUTO_IMPORT` | `true` | Automatically import downloaded IMDb ratings into the local SQLite cache |
| `XRDB_IMDB_RATINGS_DATASET_PATH` | `./data/imdb/title.ratings.tsv.gz` | Local path for the IMDb ratings dataset |
| `XRDB_IMDB_DATASET_REFRESH_MS` | `259200000` | Refresh interval for the IMDb dataset sync job |
| `XRDB_IMDB_DATASET_CHECK_INTERVAL_MS` | `900000` | Poll interval used to decide whether a refresh is due |
| `XRDB_IMDB_DATASET_BASE_URL` | `https://datasets.imdbws.com` | Base URL used for ratings dataset downloads |
| `XRDB_IMDB_RATINGS_DATASET_URL` | `https://datasets.imdbws.com/title.ratings.tsv.gz` | Override URL for the IMDb ratings dataset |
| `XRDB_IMDB_DATASET_IMPORT_BATCH` | `5000` | Batch size used during SQLite imports |
| `XRDB_IMDB_DATASET_IMPORT_PROGRESS` | `0` | Optional persisted import progress marker for resumable imports |
| `XRDB_IMDB_DATASET_LOG` | `false` | Enable verbose IMDb dataset sync logging |

### Torrentio

| Variable | Default | Description |
|----------|---------|-------------|
| `XRDB_TORRENTIO_BASE_URL` | `https://torrentio.strem.fun` | Custom Torrentio instance URL |
| `XRDB_TORRENTIO_CONCURRENCY` | `2` | Max parallel Torrentio badge fetches. Higher can improve throughput, but also increases the chance of source rate limiting. |
| `XRDB_TORRENTIO_RATE_LIMIT_COOLDOWN_MS` | `900000` | Cooldown window after Torrentio responds with rate limiting. |

> **Note:** Torrentio requests use `HTTP_PROXY` / `HTTPS_PROXY` env vars (via `undici ProxyAgent`) when set.

### Sharp Rendering (advanced)

When the Sharp env vars are unset, XRDB currently applies conservative
app defaults instead of deferring to Sharp's own library defaults:
concurrency `2`, cache memory `128 MB`, cache items `100`, and cache files `200`.

| Variable | Default | Description |
|----------|---------|-------------|
| `XRDB_SHARP_CONCURRENCY` | `2` | Max Sharp threads |
| `XRDB_SHARP_CACHE_MEMORY_MB` | `128` | Memory (MB) for the Sharp cache |
| `XRDB_SHARP_CACHE_ITEMS` | `100` | Max cached items |
| `XRDB_SHARP_CACHE_FILES` | `200` | Max cached files/handles |

## Live Demo Cards

<table>
  <tr>
    <td><strong>Live Configurator Workspace</strong><br>The current configurator and preview workspace running on `xrdb.ibbylabs.dev`.</td>
    <td><strong>Live Proxy Workspace</strong><br>The current proxy panel and export flow running on `xrdb.ibbylabs.dev`.</td>
  </tr>
  <tr>
    <td><a href="https://xrdb.ibbylabs.dev/#preview"><img src="docs/images/demo-videos/configurator-live-demo.png" alt="Open the live XRDB configurator workspace" width="420"></a></td>
    <td><a href="https://xrdb.ibbylabs.dev/#proxy"><img src="docs/images/demo-videos/addon-proxy-live-demo.png" alt="Open the live XRDB proxy workspace" width="304"></a></td>
  </tr>
</table>

© 2026 XRDB Project
