# XRDB release checklist

Run on dev before a release goes to main. "Script" means a command checks it; "Look" means someone checks the images.

1. **Suite (script).** `go test ./...` from the repo root, then grep the output for `FAIL`: there must be none.
2. **Posters render (script + look).** Render a movie and a series poster from a real config on dev. Both answer 200 as
   images, and the badges look right at phone size.
3. **Backdrops and logos (script).** One backdrop and one logo URL each answer 200 with an image.
4. **Stremio meta (script).** `/stremio/meta/movie/<tt id>.json` answers 200, and its poster URL renders. The URL
   carries no `key=` parameter.
5. **Profiles (script).** Create a test profile with a password, read it back with the password, and confirm a read or
   delete without the password is refused. Then delete it.
6. **Admin routes (script).** An admin route without the bearer key answers 401.
7. **Memory after a render burst (script).** After 50 mixed renders, the container's memory is back under its usual
   level within 5 minutes.
8. **Cross-origin preview keys (script).** A render with a spoofed `Sec-Fetch-Site: same-origin` and another profile's `pk=`, or a forged `pkt=`, does not use that profile's keys.
