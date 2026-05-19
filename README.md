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
    <td><strong>Anime poster profile</strong><br>Japanese text, TMDB / MyAnimeList / AniList / Kitsu, top and bottom rows</td>
    <td><strong>Cinema poster profile</strong><br>Square ratings, TMDB / Rotten Tomatoes / Metacritic / Letterboxd, clean text, split side layout</td>
    <td><strong>Compact poster profile</strong><br>Minimal overlays, readable text lane, reduced badge footprint</td>
  </tr>
  <tr>
    <td><a href="https://extendedratings.com/preview/attack-on-titan-poster"><img src="https://extendedratings.com/preview/attack-on-titan-poster" alt="Anime poster preview" width="360"></a></td>
    <td><a href="https://extendedratings.com/preview/dune-part-two-poster"><img src="https://extendedratings.com/preview/dune-part-two-poster" alt="Cinema poster preview" width="360"></a></td>
    <td><a href="https://extendedratings.com/preview/the-boys-poster"><img src="https://extendedratings.com/preview/the-boys-poster" alt="Compact poster preview" width="360"></a></td>
  </tr>
</table>

### Backdrops

<table>
  <tr>
    <td><strong>Backdrop profile</strong><br>Centered score row with restrained overlays</td>
    <td><strong>Minimal backdrop profile</strong><br>Primary title and score only</td>
  </tr>
  <tr>
    <td><a href="https://extendedratings.com/preview/game-of-thrones-backdrop"><img src="https://extendedratings.com/preview/game-of-thrones-backdrop" alt="Backdrop preview" width="500"></a></td>
    <td><a href="https://extendedratings.com/preview/interstellar-backdrop"><img src="https://extendedratings.com/preview/interstellar-backdrop" alt="Minimal backdrop preview" width="500"></a></td>
  </tr>
</table>

### Logos

<table>
  <tr>
    <td><strong>Logo profile</strong><br>Provider badges and quality badges tuned for logo layouts</td>
    <td><strong>Minimal logo profile</strong><br>Sparse overlays for cleaner title focus</td>
  </tr>
  <tr>
    <td><a href="https://extendedratings.com/preview/the-boys-logo"><img src="https://extendedratings.com/preview/the-boys-logo" alt="Logo preview" width="500"></a></td>
    <td><a href="https://extendedratings.com/preview/arcane-logo"><img src="https://extendedratings.com/preview/arcane-logo" alt="Minimal logo preview" width="500"></a></td>
  </tr>
</table>

## Rendering Option Comparisons

These screenshots were regenerated from the local May 18, 2026 codebase.

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
- [Changelog](CHANGELOG.md) (latest: [v1.25.1](CHANGELOG.md#v1-25-1))
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
