# XRDB

XRDB is a self hosted artwork and metadata toolkit for Stremio users who want full control over posters, backdrops, logos, badges, and provider ratings. It runs as a single Next.js service with a configurator, API routes, optional proxy mode, and profile persistence.

## What To Do First

1. Open the live configurator at `https://extendedratings.com` to test options.
2. Follow the quick self host steps below to run your own instance.
3. Use the docs links section for advanced settings and deep reference details.

## Live Preview Gallery

These are live requests against production so readers can see current poster, backdrop, and logo output directly inside GitHub.

### Posters

<table>
  <tr>
    <td><strong>Attack on Titan</strong><br>Japanese text, TMDB / MyAnimeList / AniList / Kitsu, top and bottom rows</td>
    <td><strong>Dune Part Two</strong><br>Square ratings, TMDB / Rotten Tomatoes / Metacritic / Letterboxd, clean text, split side layout</td>
    <td><strong>Stranger Things</strong><br>French text, glass ratings, TMDB / IMDb / Rotten Tomatoes / Metacritic User, stream badges, bottom row layout</td>
    <td><strong>Game of Thrones</strong><br>Plain ratings, TMDB / IMDb / Trakt / Metacritic, split side layout, detached age rating</td>
  </tr>
  <tr>
    <td><a href="https://extendedratings.com/preview/attack-on-titan-poster?cb=readme-preview-attack-on-titan-poster-v2-0-0"><img src="https://extendedratings.com/preview/attack-on-titan-poster?cb=readme-preview-attack-on-titan-poster-v2-0-0" alt="Attack on Titan poster live preview" width="220"></a></td>
    <td><a href="https://extendedratings.com/preview/dune-part-two-poster?cb=readme-preview-dune-part-two-poster-v2-0-0"><img src="https://extendedratings.com/preview/dune-part-two-poster?cb=readme-preview-dune-part-two-poster-v2-0-0" alt="Dune Part Two poster live preview" width="220"></a></td>
    <td><a href="https://extendedratings.com/preview/stranger-things-poster?cb=readme-preview-stranger-things-poster-v2-0-0"><img src="https://extendedratings.com/preview/stranger-things-poster?cb=readme-preview-stranger-things-poster-v2-0-0" alt="Stranger Things poster live preview" width="220"></a></td>
    <td><a href="https://extendedratings.com/preview/game-of-thrones-poster?cb=readme-preview-game-of-thrones-poster-v2-0-0"><img src="https://extendedratings.com/preview/game-of-thrones-poster?cb=readme-preview-game-of-thrones-poster-v2-0-0" alt="Game of Thrones poster live preview" width="220"></a></td>
  </tr>
</table>

### Backdrops

<table>
  <tr>
    <td><strong>Attack on Titan</strong><br>Japanese text, TMDB / MyAnimeList / AniList / Kitsu, centered stack</td>
    <td><strong>The Boys</strong><br>Plain ratings, TMDB / IMDb / Trakt / Roger Ebert, centered stack, original text</td>
    <td><strong>Stranger Things</strong><br>Square ratings, TMDB / Rotten Tomatoes / Metacritic / Letterboxd, stream badges, right side stack</td>
  </tr>
  <tr>
    <td><a href="https://extendedratings.com/preview/attack-on-titan-backdrop?cb=readme-preview-attack-on-titan-backdrop-v2-0-0"><img src="https://extendedratings.com/preview/attack-on-titan-backdrop?cb=readme-preview-attack-on-titan-backdrop-v2-0-0" alt="Attack on Titan backdrop live preview" width="320"></a></td>
    <td><a href="https://extendedratings.com/preview/the-boys-backdrop?cb=readme-preview-the-boys-backdrop-v2-0-0"><img src="https://extendedratings.com/preview/the-boys-backdrop?cb=readme-preview-the-boys-backdrop-v2-0-0" alt="The Boys backdrop live preview" width="320"></a></td>
    <td><a href="https://extendedratings.com/preview/stranger-things-backdrop?cb=readme-preview-stranger-things-backdrop-v2-0-0"><img src="https://extendedratings.com/preview/stranger-things-backdrop?cb=readme-preview-stranger-things-backdrop-v2-0-0" alt="Stranger Things backdrop live preview" width="320"></a></td>
  </tr>
</table>

### Logos

<table>
  <tr>
    <td><strong>Stranger Things</strong><br>Dark canvas, square ratings, TMDB / Rotten Tomatoes / Metacritic User / Letterboxd</td>
    <td><strong>Attack on Titan</strong><br>Japanese text, TMDB / MyAnimeList / AniList / Kitsu, transparent canvas</td>
    <td><strong>Game of Thrones</strong><br>French text, plain ratings, TMDB / IMDb / Trakt / Metacritic, transparent canvas</td>
  </tr>
  <tr>
    <td><a href="https://extendedratings.com/preview/stranger-things-logo?cb=readme-preview-stranger-things-logo-v2-0-0"><img src="https://extendedratings.com/preview/stranger-things-logo?cb=readme-preview-stranger-things-logo-v2-0-0" alt="Stranger Things logo live preview" width="320"></a></td>
    <td><a href="https://extendedratings.com/preview/attack-on-titan-logo?cb=readme-preview-attack-on-titan-logo-v2-0-0"><img src="https://extendedratings.com/preview/attack-on-titan-logo?cb=readme-preview-attack-on-titan-logo-v2-0-0" alt="Attack on Titan logo live preview" width="320"></a></td>
    <td><a href="https://extendedratings.com/preview/game-of-thrones-logo?cb=readme-preview-game-of-thrones-logo-v2-0-0"><img src="https://extendedratings.com/preview/game-of-thrones-logo?cb=readme-preview-game-of-thrones-logo-v2-0-0" alt="Game of Thrones logo live preview" width="320"></a></td>
  </tr>
</table>
## Rendering Option Comparisons

These screenshots were regenerated from the local May 19, 2026 codebase.

For side by side rendering mode examples, see:
- [Poster style comparisons](public/assets/readme-poster-comparison-board.png)
- [Backdrop style comparisons](public/assets/readme-backdrop-comparison-board.png)
- [Logo style comparisons](public/assets/readme-logo-comparison-board.png)
- [Thumbnail style comparisons](public/assets/readme-thumbnail-comparison-board.png)

## Quick Self Host

### 1. Copy environment template

```bash
cp env.template .env
```

### 2. Set required values in `.env`

| Variable | Required | Purpose |
| --- | --- | --- |
| `XRDB_HOSTNAME` | Yes | Public hostname users visit |
| `TMDB_KEY` | Yes | TMDB API key used for artwork and metadata |
| `MDBLIST_KEY` | Optional | Adds extra rating sources |
| `ADMIN_USERNAME` | Yes | Admin dashboard login username |
| `ADMIN_PASSWORD` | Yes | Admin dashboard login password |
| `XRDB_CONFIG_ENCRYPTION_KEY` | Yes | 32+ character secret for stored config encryption |

Generate a strong encryption key:

```bash
openssl rand -base64 32
```

### 3. Start XRDB

Use one of these deployment paths.

```bash
# Standalone local path
nocorrect docker compose -f local-compose.yaml up -d --build

# Shared stack path
nocorrect docker compose -f compose.yaml up -d --build xrdb
```

If startup reports data-directory permission issues in non-default Docker uid/gid environments, set optional `PUID` and `PGID` in `.env` to match the host owner of your mounted data folder.

### 4. Open the app

- Main UI: `http://localhost:3000` or your configured hostname
- Reference page: `/reference`
- Configurator: `/{type}` where type is `poster`, `backdrop`, `logo`, or `thumbnail`
- Health check: `/api/health`

### 5. Metadata base URL behavior

XRDB resolves metadata base URL at runtime for Open Graph, Twitter card, and icon links.

Resolution order:
1. `X-Forwarded-Host` and `X-Forwarded-Proto` when `XRDB_TRUST_PROXY_HEADERS=true`
2. `Host` header from the incoming request
3. `NEXT_PUBLIC_APP_URL` fallback
4. `http://localhost:3000` default

For reverse-proxy deployments, enable `XRDB_TRUST_PROXY_HEADERS=true`.
If you need an explicit fixed fallback, set `NEXT_PUBLIC_APP_URL=https://your-domain` in `.env`.

## API Quick Reference

### Render routes

- `GET /poster/:id.jpg`
- `GET /backdrop/:id.jpg`
- `GET /logo/:id.png`
- `GET /thumbnail/:id.jpg`

### Utility routes

- `GET /api/health`
- `GET /api/providers`
- `POST /api/config-profile/login`
- `POST /api/config-profile/save`

Use `id` formats like `tt0133093`, `tmdb:603`, or `tmdb:movie:603`.

AIOMetadata export patterns are available from the configurator export flow and can be copied directly from the Save and Proxy surfaces.

## Docs Links

- [Reference page](app/reference/page.tsx)
- [Runtime variables](variables.md)
- [Advanced self host settings](docs/self-host-advanced.md)
- [Compose stacks](compose.yaml)
- [Standalone compose](local-compose.yaml)
- [Environment template](env.template)
- [Changelog](CHANGELOG.md) (latest: [v2.0.0](CHANGELOG.md#v2-0-0))
## Documentation Image Index

- `docs/images/demo-videos/poster-workspace.png`
- `docs/images/demo-videos/proxy-workspace.png`
- `docs/images/metadata-translation/proxy-translation-anime-fallback-en-gb.png`
- `docs/images/metadata-translation/proxy-translation-fill-missing-movie-fr.png`
- `docs/images/metadata-translation/proxy-translation-prefer-language-show-fr-be.png`
- `docs/images/render-comparisons/anime-logo-comparison.png`
- `docs/images/render-comparisons/badge-style-comparison.png`
- `docs/images/render-comparisons/movie-poster-comparison.png`
- `docs/images/render-comparisons/show-backdrop-comparison.png`

## Notes For Existing Deployments

- Keep your current `.env` values when updating.
- Pull latest code, rebuild the image, and restart the container.
- If behavior changes after update, check [CHANGELOG.md](CHANGELOG.md) first.

## License

Licensed under the ISC License. See [LICENSE](LICENSE).
