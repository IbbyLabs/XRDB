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
| `XRDB_DEGRADED_CACHE_TTL_MINUTES` | `20` | How long a render missing a rating badge stays cached, in minutes. A source that is rate-limited or erroring drops its badge from the render; the short window lets that render redo itself once the source recovers rather than holding the gap for the full cache TTL. Capped at `XRDB_CACHE_TTL_HOURS`; `0` disables it and leaves such renders on the normal TTL. |
| `XRDB_HELD_OUT_CACHE_TTL_HOURS` | `3` | How long a render stays cached when its only missing badge was held back by this instance rather than lost to a failure, in hours (fractions allowed). Covers the daily-allowance reserve and the request-pacing queues, where nothing went wrong and the render is complete apart from a source that was not asked. Such renders are stored and served with normal freshness headers; a render that lost a source to a refusal or an error is still never stored and carries `no-store`. Capped at `XRDB_CACHE_TTL_HOURS`. |
| `XRDB_QUEUE_HELD_CACHE_TTL_MINUTES` | `15` | How long a render stays cached when a badge was held back by one of this instance's request queues rather than by the daily allowance reserve, in minutes. A queue clears in seconds where the reserve stands for hours, so these are kept only long enough to spare the repeat work. A render that hit both takes this shorter window. Capped at `XRDB_CACHE_TTL_HOURS`. |
| `XRDB_RENDER_CAP_PER_MINUTE` | `30` | How many fresh posters one caller may ask for each minute. Counted against both the profile it names and the address it must receive the answer on, so minting a new profile does not buy a second allowance. A burst of twice the rate is allowed at once, so a page loading many posters passes while a sustained crawl does not. Cheaper surfaces cost less of it: a thumbnail is a quarter of a poster, because a grid of them is more tiles per screen while asking for less work. Size does not change the price, so a 4K caller is refused no sooner than anyone else. Cache hits are never counted. `0` disables the cap. |
| `XRDB_SHARED_PROFILE_ALIASES` | `aios,cimofam` | Comma-separated profiles that several unrelated people use. These are capped by address only, since a per-profile limit on a shared profile lands on a crowd rather than on one caller. |
| `XRDB_DEFAULT_PROFILE` | unset | The profile a request carrying no `config` of its own resolves to, given by id or alias. Unset serves the stock look. A `config` named in the URL still wins, so this changes only what a bare render returns. The profile is capped by address rather than as a profile, the way a shared alias is, so an instance does not hold all of its traffic in one allowance. Its provider keys answer every bare request, which is the point on an instance run for a group and is worth knowing before setting it. Pointing it at a different profile misses the cache for all unconfigured traffic at once. |
| `XRDB_<SOURCE>_PROXY` | unset | Reach one source through a proxy, named after it: `XRDB_TMDB_PROXY`, `XRDB_MDBLIST_PROXY`. Takes a full URL, `http://host:port` or with credentials. Named per source rather than as one proxy with exclusions, because a proxy is worth its latency for a source that is blocked or limited by address and not for the rest, and an exclusion list needs editing every time a source is added. `HTTP_PROXY` and friends still apply to everything else; this overrides them for the named source, which gets its own connection pool. The URL is redacted wherever it is logged. |
| `XRDB_<SOURCE>_MIN_INTERVAL_SECONDS` | per source | The smallest gap between two requests to one source, named after it: `XRDB_MAL_MIN_INTERVAL_SECONDS`, `XRDB_TRAKT_MIN_INTERVAL_SECONDS`. The built-in intervals protect the *host* a source talks to — MAL is held to one request a second because the public service bans on sustained overuse — and a host is movable: `XRDB_JIKAN_URL` points the MAL source at your own Jikan, where that reasoning does not apply. This is how the pacing follows. Sources with no built-in interval, TMDB among them, are unpaced by default and take one when set. Accepts `0.05` to `10`; a value outside that is logged and ignored, leaving the built-in one. |
| `XRDB_MDBLIST_SWEEP_RESERVE_PCT` | `40` | The share of MDBList's daily allowance a catalogue sweep may not spend, as a percentage. A pre-warm of a large library can spend a day's allowance in one run and leave nothing for the renders people are waiting on; past the cut-off a sweep is served the rating it was last given rather than asking again, and interactive renders keep the remainder. `0` lets sweeps spend all of it. A render carrying the owner's own MDBList key is unaffected, since it has its own allowance. **Not the same as `XRDB_MDBLIST_RESERVE_PCT`**, which slows every caller as the allowance runs down; this one holds sweeps off it and leaves interactive renders at full speed. The default is deliberately higher than that one's, so sweeps stop while 40% of the allowance remains and the rate floor is a last resort at 25% rather than firing at the same moment. |
| `XRDB_MDBLIST_DAILY_LIMIT` | reported | MDBList's daily allowance, which the reserve above is a share of. Normally unset: every MDBList response carries `x-ratelimit-limit` and that is the only place your plan's number appears, so it is read from there and corrected whenever it changes. Set this only for an instance whose responses carry no allowance headers, where the reserve would otherwise hold against a placeholder. |
| `XRDB_RATINGS_CACHE_TTL_HOURS` | `24` | How long one rating source's answer for one title is reused, in hours (fractions allowed). Ratings depend on the title rather than the render config, so this spares a repeat lookup when the same title is rendered under a different config. `0` disables it. The cache holds up to 300,000 answers, one per source per title, which is roughly 245 MB once a large library has been rendered. `0` is the only way to bound it. |
| `XRDB_STREAM_ADDON_URL` | `https://comet.stremio.ru` | Stremio stream addon asked which qualities a title is actually available in, so a quality badge stands for a release that exists rather than a label that was ticked. Takes a base URL or a full `/manifest.json` install link. Defaults to a public Comet instance so the check holds without configuration; point it at your own (`http://comet:2020`) to keep the lookups local, or set `off` to skip the check and draw the picked badges as they are. Comet aggregates Torrentio and its own sources, so it sees more than Torrentio alone — and because the check *drops* a badge it cannot find, a thinner source removes badges that are true. A configured link carrying a debrid token narrows the answer to that account, so it is treated as a secret and only its host is ever logged. |
| `XRDB_STREAM_TIMEOUT_MS` | `4000` | How long to wait on the stream addon. The call runs alongside the rating sources, so this bounds the render rather than adding to it. Past it the picked badges are drawn unverified and the render takes the degraded TTL. |
| `XRDB_STREAM_CACHE_TTL_HOURS` | `24` | How long a title's detected qualities are reused, in hours (fractions allowed). What a title is available in moves over weeks, so only the first render of a title pays for the lookup. `0` disables it. |
| `XRDB_RENDER_CONCURRENCY` | `2x CPU cores` | Maximum simultaneous renders. Bounds memory when a client loads a full catalogue at once; lower it on memory-constrained hosts. |
| `XRDB_MEMORY_LIMIT_MB` | unset | Soft heap limit in MiB (`debug.SetMemoryLimit`). Set to roughly the container memory limit so the runtime GCs before a kernel OOM-kill. `GOMEMLIMIT` also works. It does not bound the ratings cache: a soft limit makes the GC work harder and cannot free entries the cache still references. |
| `XRDB_LOG_LEVEL` | `info` | Log verbosity: `debug`, `info`, `warn`, or `error`. Logs are structured JSON on stdout: startup config, per-request access lines, and provider/render warnings. `debug` adds per-request and per-provider detail. Sets the starting level only — the admin dashboard (Admin → Logs) changes it on the running server without a restart, and that choice persists and overrides this variable until cleared. |

## Security

| Variable | Default | Description |
|---|---|---|
| `XRDB_ADMIN_KEY` | _(unset)_ | Protects the Admin and Integrations areas and `/api/admin/*`. **Set this on any public instance** — without it, admin pages are open to everyone. |
| `XRDB_API_KEY` | _(unset)_ | When set, every render request must carry it (`Authorization: Bearer …` or `?key=`). Leave unset for public artwork URLs. |
| `XRDB_TRUSTED_PROXIES` | loopback + private ranges | Comma-separated CIDRs or addresses whose `X-Forwarded-*` and `CF-Connecting-IP` headers are believed. Setting this replaces the defaults. |
| `XRDB_TRUST_PROXY_HEADERS` | `false` | Believe forwarded headers from any peer. Needed when the proxy address is unpredictable; makes the client address spoofable. |

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

## Rating badge bloom

| Variable | Default | Description |
|---|---|---|
| `ratingBadgeBorderGlow` | off | Config key, not an environment variable. Blooms the badge outline outward instead of drawing a hard edge, so an outline tinted per rating site reads as a halo around the badge. |
| `ratingBadgeBorderGlowStrength` | `0` | Config key. How far the bloom reaches and how strongly it reads, 1-100. `0` keeps the built-in default; reach and intensity move together, so a higher value is a wider halo rather than a denser one. |

## IMDb dataset refresh

| Variable | Default | Description |
|---|---|---|
| `XRDB_IMDB_REFRESH_HOURS` | `168` (7 days) | How often the local IMDb ratings index is rebuilt while the process runs. The dataset's own age check is only consulted on the first lookup, so without this a long-running container serves whatever it downloaded at startup and drifts further from IMDb the longer uptime is good. The rebuild happens in the background and the live index is only swapped once the replacement has parsed; a failed refresh leaves the previous copy serving. `0` turns it off. |

## Top-rated ranking

| Variable | Default | Description |
|---|---|---|
| `XRDB_IMDB_TOP_RATED` | `false` | Build a top-rated film ranking for the badge. Requires `XRDB_IMDB_DATASET_DIR`. Streams IMDb's title-basics dataset on each refresh to restrict the ranking to films, so it costs a large download; the ranking is XRDB's own, not IMDb's published list. |

## Folder writing

Writes rendered artwork into the media library for clients that cannot take a
remote URL. Off unless enabled — this is the only feature that modifies files
on disk. See [docs/setup/folder-writing.md](docs/setup/folder-writing.md).

| Variable | Default | Description |
|---|---|---|
| `XRDB_FOLDER_WRITER` | `false` | Enable writing artwork into the library. |
| `XRDB_LIBRARY_ROOTS` | _(unset)_ | Comma-separated directories to walk. Required when the folder writer is on. |
| `XRDB_FOLDER_WRITER_PROFILE` | _(unset)_ | Profile id or alias whose look library artwork takes. Unset uses the defaults. |
| `XRDB_FOLDER_WRITER_SURFACES` | `poster,backdrop` | Which artwork to write. `poster` → `poster.jpg`, `backdrop` → `fanart.jpg`, `logo` → `clearlogo.png`. |
| `XRDB_FOLDER_WRITER_OVERWRITE` | `false` | Replace artwork already present. Off keeps posters curated by hand. |
| `XRDB_FOLDER_WRITER_PACE_MS` | `250` | Delay between titles, so a first pass does not saturate the rating sources. |
| `XRDB_FOLDER_WRITER_INTERVAL_H` | `0` | Re-run the pass every N hours. `0` disables the schedule; a manual trigger still works. |

A title is only written when a `.nfo` beside it carries an IMDb or TMDB id.
Anything else is reported and skipped rather than guessed at.

## MDBList daily allowance

MDBList meters by the day, not by the second. The allowance goes by plan —
1,000/day free, up to 250,000 on the top tier — and every response reports what
is left of it. XRDB reads those headers and paces itself to spend
what is left evenly over the rest of the day, holding a reserve back so an
unusual burst — a cache invalidation, a catalogue crawl — does not finish the
day's budget. Short bursts still go straight out; only a sustained flood is
paced. Once the reserve is reached the rate drops to a floor of 0.2/s rather
than stopping.

| Variable | Default | Description |
|---|---|---|
| `XRDB_MDBLIST_RESERVE_PCT` | `25` | Percentage of the daily allowance held back as headroom, governing the **rate** every caller is paced at: as the remainder approaches this share, requests slow toward a floor so the allowance lasts the day. On a 100,000/day plan that keeps 25,000 spare. **Not the same as `XRDB_MDBLIST_SWEEP_RESERVE_PCT`**, which holds catalogue sweeps off a share of the allowance and leaves interactive renders at full speed. Set that one if a pre-warm is spending what your renders need. |
| `XRDB_MDBLIST_MAX_RPS` | `5` | Ceiling on the paced rate. Self-imposed rather than published: MDBList documents a daily allowance and no per-second rate, but its edge protection answers a fast burst with a 429. |
| `XRDB_MDBLIST_BURST` | `30` | How many requests may go out at once before pacing applies, so a catalogue page of a few dozen titles is not spread over minutes. |

## SIMKL daily allowance

SIMKL meters by the day against the application rather than the key, so every
caller draws on one pool and the badge disappears for all of them once it is
spent. XRDB keeps a reserve that only interactive callers may spend. A caller is
bulk only when it identifies itself as sweeping the catalogue; one that does not
identify itself counts as interactive, because overspending is visible and a
missing badge is not.

| Variable | Default | Description |
|---|---|---|
| `XRDB_SIMKL_DAILY_LIMIT` | `15000` | The day's allowance. |
| `XRDB_SIMKL_BULK_RESERVE` | `6000` | How much of the allowance is kept for interactive callers. Setting it to the limit holds bulk callers off SIMKL entirely. |

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
