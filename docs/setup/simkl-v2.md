# SIMKL v2 client ids

A SIMKL client id registered for auth v2 answers every request without a user
token with `401 user_token_required`. XRDB can send a token for you once you
link a SIMKL account. Instances using a v1 client id (`XRDB_SIMKL_CLIENT_ID`)
need nothing here.

## Configure

```sh
XRDB_SIMKL_V2_CLIENT_ID=...
XRDB_SIMKL_V2_CLIENT_SECRET=...
XRDB_ADMIN_KEY=...             # the link endpoint is an admin route
```

The cache directory (`XRDB_CACHE_DIR`) must persist across restarts: the token
is kept there in `simkl-v2-token.json`, readable only by the XRDB user.

Until the account is linked, XRDB keeps using `XRDB_SIMKL_CLIENT_ID` when it is
set, and skips SIMKL when it is not. Every other source works as usual.

## Link

```sh
curl -X POST -H "Authorization: Bearer $XRDB_ADMIN_KEY" \
  https://your-xrdb-host/api/admin/simkl/link
```

The reply holds a `user_code`, a `verification_uri` and `expires_in` seconds.
Open the address, sign in to SIMKL and enter the code. XRDB polls in the
background and saves the tokens when you approve.

```sh
curl -H "Authorization: Bearer $XRDB_ADMIN_KEY" \
  https://your-xrdb-host/api/admin/simkl/link
# {"linked":true,"expires_at":"...","pending":false}
```

## Keeping it linked

XRDB refreshes the token on its own, a day before it expires or after a 401.
SIMKL rotates the refresh token on each use and XRDB saves the new pair. If a
refresh is refused, for example after a long outage or a revoked app, the log
shows one `Simkl needs relinking` warning, and XRDB falls back to
`XRDB_SIMKL_CLIENT_ID` (or skips SIMKL without one) until you run the link step
again.
