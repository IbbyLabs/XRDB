# Stremio

XRDB ships its own Stremio addon, so it can be installed directly.

## Install

1. Open the **Configurator**, build your look, and save it as a profile with an
   alias under the **Profile** tab.
2. Go to the **Install** tab. Under *Stremio — install this profile directly*,
   click the arrow to hand the URL to Stremio, or copy it and paste it into
   Stremio's *Addons → Add addon* box.

The URL looks like:

```
https://your-xrdb-host/stremio/c/your-alias/manifest.json
```

Editing the profile updates the art in place. There is no need to reinstall.

## Where it sits in your addon list

XRDB's addon answers for the same titles as Cinemeta, and it supplies **poster
and background art only** — no description, cast, or episode list. Install it
*below* Cinemeta so Cinemeta still provides the metadata.

If you want logos and episode thumbnails as well, use
[AIOMetadata](aiometadata.md) instead: it takes XRDB's artwork URLs and keeps
full metadata alongside them.

## Nothing appears

- Stremio requires HTTPS unless the addon is on `localhost`. A bare-HTTP
  instance on a LAN address will fail silently.
- Stremio caches poster images for 24 to 48 hours regardless of what the server
  says. The install URL carries a version token that changes when you edit the
  profile, which is what forces a refresh.
