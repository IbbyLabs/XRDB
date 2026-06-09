# Changelog

All notable changes to XRDB are documented here.

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
