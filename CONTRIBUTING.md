# Contributing

Thanks for looking. Issues and pull requests are both welcome.

For "how do I ..." questions, [Discord](https://discord.gg/wPY2pcqjmm) is
usually faster than an issue.

## Getting it running

You need Go 1.25+ and Node 22+.

```sh
make dev          # API on :8787, web on :3001, Ctrl-C stops both
```

`make dev` reads keys from `.env`. TMDB is the only one you need to see
artwork at all; everything else adds rating sources.

```sh
XRDB_TMDB_API_KEY=...        # required for artwork
XRDB_MDBLIST_API_KEY=...     # unlocks RT, Metacritic, Letterboxd in one call
```

The web UI is a static export embedded into the binary, so a change under
`web/` needs `make build-web` before it shows up in a `go run ./cmd/api`.

## Before opening a pull request

```sh
make test                    # go test ./...
golangci-lint run            # CI runs this; go vet alone does not catch it
cd web && npx tsc --noEmit   # the web build will not fail on type errors, this will
```

CI runs the same checks. `golangci-lint` catches things `go vet` does not, so
running it locally saves a round trip.

## What tends to matter in review

- **Renders are cached on config content.** Anything that changes pixels has to
  reach `imageconfig.CacheKey`, or two different looks will share one cached
  image. The canonical struct there is maintained by hand.
- **Badges are drawn on a shared canvas** via the occupancy tracker, so a new
  badge should place itself through `occ.place` rather than picking coordinates.
- **Nothing is written into the user's media library** unless they have turned
  folder-writer mode on. This is deliberate and worth preserving.
- **Rating sources fail quietly.** Five of them are read from public pages with
  no API, so a markup change looks like a successful empty response. Fetch paths
  go through the health tracker so a degraded source falls back to its last good
  answer instead of vanishing.
- **Secrets never get logged.** Query strings are redacted; keep it that way.

## Adding a rating source

1. Implement `provider.Provider` in `internal/provider/`.
2. Implement `RatingSourcer` too, so the render path can skip it when none of
   its sources are selected. A source that costs a page fetch should not be
   fetched on every render just to be discarded.
3. Register it in `cmd/api/main.go`.
4. Add its logo to `web/public/rating-logos/` and wire it into the UI's source
   list.
5. If the API publishes a rate limit, add it to `rateLimits` in
   `internal/provider/ratelimit.go`.

## Commits

Conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
The type is not decoration — the release version and the changelog are derived
from it:

- `fix:` → patch
- `feat:` → minor
- `feat!:` or a `BREAKING CHANGE:` footer → major

Keep the message to what changed. A `commit-msg` hook rejects long subjects,
long bodies, first person, and `Co-Authored-By` lines.

## Releases

Nothing is released by hand. Release Please watches `main` and keeps a
`chore: release X.Y.Z` pull request up to date with the version it has worked
out and the changelog it has written.

Merging that pull request tags the version, publishes the GitHub release, and
triggers the image build. `:latest` follows once the build succeeds, provided
the new tag is the highest.

If the changelog in that pull request needs a human touch — wording, or a
change that landed and was reverted before release — edit the pull request
before merging it.
