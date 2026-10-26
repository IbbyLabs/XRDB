# SIMKL v2 client ids

A SIMKL client id registered for auth v2 works without a user token for
everything XRDB needs: ratings, and mapping an IMDb id to a SIMKL id. Linking a
SIMKL account is optional. XRDB sends the account's token once it is linked.
Instances using a v1 client id (`XRDB_SIMKL_CLIENT_ID`) need nothing here.

## Configure

```sh
XRDB_SIMKL_V2_CLIENT_ID=...
XRDB_SIMKL_V2_CLIENT_SECRET=...
XRDB_ADMIN_KEY=...             # the link endpoint is an admin route
```

The cache directory (`XRDB_CACHE_DIR`) must persist across restarts: the token
is kept there in `simkl-v2-token.json`, readable only by the XRDB user.

Until the account is linked, XRDB keeps using `XRDB_SIMKL_CLIENT_ID` when it is
set, and sends the v2 id without a token when it is not.

If SIMKL ever refuses a v2 request, the log shows a `Simkl refused a V2 request`
warning naming the endpoint, at most once an hour for each one.

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
`XRDB_SIMKL_CLIENT_ID` (or the v2 id without a token) until you run the link
step again.
