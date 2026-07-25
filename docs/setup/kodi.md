# Kodi

Kodi has read local artwork from the media folder for as long as it has
existed, so it needs no plugin. Set up [folder writing](folder-writing.md)
first.

## Steps

1. Kodi writes NFO files itself when **Settings → Media → Videos → Export
   library** is used, or you can let Sonarr, Radarr or tinyMediaManager
   produce them. XRDB needs the ids in those files.
2. Enable folder writing in XRDB and run a dry run to check it finds your
   titles.
3. Run it with `apply=true`.
4. In Kodi, **Update library**. If posters do not change, **Clean library**
   first: Kodi caches artwork by path in its texture database.

Kodi picks up `poster.jpg`, `fanart.jpg` and `clearlogo.png` under those exact
names, which is what XRDB writes.
