# XRDB

Artwork and metadata overlays for your media library. Configure ratings badges, posters, backdrops, and thumbnails — served by a pure-Go render pipeline built for speed.

## Running with Docker

One container — the web UI is embedded in the Go binary and served on the same port as the API.

```sh
docker compose up --build
```

- UI + API: `http://localhost:8787`

Data (SQLite + render cache) is stored in a named volume so it survives restarts.

## Running locally

```sh
make dev
```

Starts the API on `http://localhost:8787` and the web dev server on `http://localhost:3001` (provider keys are read from `.env`). Or run them individually:

```sh
go run ./cmd/api                  # API on :8787 (XRDB_ADDR to change)
cd web && npm ci && npm run dev   # web on :3001
```

## Migrating profiles from a previous install

```sh
go run ./cmd/migrate -input fixtures/migration/sample-legacy-profiles.json
```

## API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/{type}/{id}` | Render image (`poster`, `backdrop`, `thumbnail`, `logo`) |
| `GET` | `/profile` | List all profiles |
| `POST` | `/profile` | Create a profile |
| `GET` | `/profile/{id}` | Get a profile |
| `PUT` | `/profile/{id}` | Update a profile |
| `GET` | `/profile/{id}/export` | Export a profile as JSON |
| `POST` | `/profile/import` | Import profiles from JSON |
| `GET` | `/healthz` | Health check |
| `GET` | `/api/admin/metrics` | Request metrics |
| `GET` | `/api/admin/cache` | Cache stats |

## Development

```sh
make test       # run all tests
make bench      # render benchmarks
make build      # compile binaries
```
