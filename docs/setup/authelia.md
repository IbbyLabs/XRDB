# Authelia and other auth proxies

Put XRDB behind Authelia and your media clients stop working. Stremio,
AIOMetadata, AIOStreams and Jellyfin fetch artwork over plain HTTP with no
browser and no session, so they cannot complete a login flow. They get the
Authelia portal instead of an image.

The fix is a bypass rule covering the paths a client actually fetches. The
paths a person uses, the Configurator and the admin API, stay behind auth,
because a browser can log in.

## The rules

Two rules, and the order matters. Authelia takes the first rule that matches,
so the deny has to come first.

```yaml
access_control:
  rules:
    ## Never bypassable, whatever follows.
    - domain: 'xrdb.example.com'
      resources:
        - '^/api/admin(/.*)?$'
      policy: 'two_factor'

    ## What a media client fetches.
    - domain: 'xrdb.example.com'
      resources:
        # Artwork
        - '^/poster/[^/]+$'
        - '^/backdrop/[^/]+$'
        - '^/thumbnail/[^/]+$'
        # v2 addressed an episode still with the season and episode in a second
        # segment, and clients configured then still send it.
        - '^/thumbnail/[^/]+/[Ss][0-9]+[Ee][0-9]+(\.(jpg|jpeg|png|webp))?$'
        - '^/logo/[^/]+$'
        # Stremio addon
        - '^/stremio/manifest\.json$'
        - '^/stremio/meta/.*$'
        - '^/stremio/c/[^/]+/manifest\.json$'
        - '^/stremio/c/[^/]+/meta/.*$'
        # RPDB compatibility, used by AIOStreams
        - '^/[^/]+/(imdb|tmdb)/[^/]+/[^/]+$'
        - '^/[^/]+/isValid$'
        # Health checks
        - '^/healthz$'
        - '^/readyz$'
      policy: 'bypass'
```

Replace `xrdb.example.com` with your XRDB hostname. If your Authelia config is
templated, that is whatever variable holds it.

Authelia matches `resources` against the path **and** the query string, which
is why the artwork patterns end in `[^/]+$` rather than a bare `$`. A query has
no slashes in it, so it falls inside that last segment.

## Do not bypass a whole first path segment

The rule to avoid, which circulates because it is the obvious way to allow
RPDB's URLs:

```yaml
- '^/[a-zA-Z0-9_-]+(/.*)?$'
```

RPDB puts the API key in the first path segment and the key differs per user,
so "any first segment" looks like the only option. It is not, and it opens
everything:

```
/api/admin/cache      matches
/api/admin/settings   matches
/profile/import       matches
```

Authelia is written in Go, so its regex engine has no negative lookahead. You
cannot write "any segment except `api`". You do not need to: XRDB's RPDB routes
always have a literal `imdb` or `tmdb` as their **second** segment, which is
what the two patterns above anchor on. Nothing that starts `/api/` can reach
them.

## Why the admin deny is separate

With `XRDB_ADMIN_KEY` unset, which is the default, part of the admin API has no
second gate:

| Open with no admin key | Closed with no admin key |
|---|---|
| `GET /api/admin/metrics` | writes to `/log-level` |
| `GET`, `DELETE /api/admin/cache` | writes to `/memory-limit` |
| `GET /api/admin/sources` | writes to `/ttls` |
| `GET`, `POST /api/admin/folder-writer` | writes to `/settings` |
| `GET /api/admin/settings` (values masked) | `POST /api/admin/warm` |
| `GET /api/admin/log-level`, `/memory-limit`, `/ttls` | |

`DELETE /api/admin/cache` drops every rendered image. Worse if you have turned
the folder writer on: `POST /api/admin/folder-writer?apply=true` writes artwork
into your media library, and with no admin key nothing authenticates it. That
route answers `409` unless `XRDB_FOLDER_WRITER=true` and `XRDB_LIBRARY_ROOTS`
are both set, so it is only reachable on an instance that deliberately enabled
it — which is exactly the instance with something to lose.

Set `XRDB_ADMIN_KEY` as well as writing the deny rule. Either alone leaves a
gap: the key is unset by default, and a bypass list is one broad line away from
covering the admin API by accident.

## A narrower option

Setting `XRDB_API_KEY` puts XRDB's own gate on the artwork routes, accepted as
`Authorization: Bearer` or `?key=`. Clients that fetch server-side, including
AIOMetadata, can carry it. Stremio cannot send a header, so it needs the query
form.

This does not replace the bypass. Authelia still answers first, so the paths
still have to be bypassed for XRDB to see the request at all.

## Checking it

From outside your network, with no Authelia session:

```
curl -sI https://xrdb.example.com/poster/tt0110912?config=your-alias
curl -sI https://xrdb.example.com/api/admin/cache
```

The first should be `200` and `image/*`. The second should be a redirect to
Authelia or a `403`. If the second returns JSON, the deny rule is not matching
or is below the bypass.
