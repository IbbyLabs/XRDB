# Advanced Self Host Settings

This page keeps advanced operator details out of the main README while preserving all user relevant setup options.

## Optional Runtime Variables

See the full canonical table in [variables.md](../variables.md).

Common advanced toggles:

- `XRDB_PUBLIC_INSTANCE`
- `XRDB_PRIVATE_INSTANCE`
- `XRDB_INSTANCE_NAME`
- `XRDB_INSTANCE_DESCRIPTION`
- `XRDB_INSTANCE_ABOUT`
- `XRDB_REQUEST_KEY`
- `XRDB_API_KEY`
- `XRDB_CONFIG_STORE`
- `XRDB_DATA_DIR`
- `XRDB_DB_PATH`
- `XRDB_PORT`
- `XRDB_NODE_ENV`

## Compose And Reverse Proxy Notes

- Standalone path: [local-compose.yaml](../local-compose.yaml)
- Stack path: [compose.yaml](../compose.yaml)
- Security labels and access rules: [authelia-rules.template.yaml](../authelia-rules.template.yaml)

## Public Fast Preset

For a fast public setup, combine these options in `.env`:

```env
XRDB_PUBLIC_INSTANCE=true
XRDB_PRIVATE_INSTANCE=false
XRDB_REQUEST_KEY=generated-strong-key
XRDB_API_KEY=
XRDB_CONFIG_STORE=memory
```

This keeps requests gated while avoiding persistent server side profile storage.

## Private Persisted Preset

For private or invite-only setups with saved profiles:

```env
XRDB_PUBLIC_INSTANCE=false
XRDB_PRIVATE_INSTANCE=true
XRDB_CONFIG_STORE=db
XRDB_DATA_DIR=/data/xrdb
XRDB_CONFIG_ENCRYPTION_KEY=replace-with-32-plus-char-secret
```

## Admin Access

Admin routes are under `/admin`.

Set:

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace-with-strong-password
```

If credentials are missing, XRDB will block admin login setup and show guidance in the admin login route.

## Troubleshooting

1. If images fail to render, confirm `TMDB_KEY` is valid.
2. If ratings are missing, confirm `MDBLIST_KEY` or provider-specific keys.
3. If admin login fails, re-check `ADMIN_USERNAME` and `ADMIN_PASSWORD` values and restart the container.
4. If profile save fails in DB mode, confirm data directory permissions and writable mounts.
