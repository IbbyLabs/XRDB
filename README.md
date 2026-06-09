# XRDB

Artwork and metadata overlays for your media library. Configure ratings badges, posters, backdrops, and thumbnails — served by a pure-Go render pipeline built for speed.

## Running with Docker

```sh
docker compose up --build
```

- API: `http://localhost:8787`
- Web: `http://localhost:3001`

Data (SQLite + render cache) is stored in a named volume so it survives restarts.

## Running locally

**API**

```sh
go run ./cmd/api
```

Binds to `:8787` by default. Set `XRDB_ADDR` to change the port.

**Web**

```sh
cd web && npm install && npm run dev
```

Opens on `http://localhost:3001`.

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
