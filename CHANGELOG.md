# Changelog

<a id="v1-0-0"></a>

<a id="v1-0-1"></a>

<a id="v1-0-2"></a>

<a id="v1-0-3"></a>

<a id="v1-0-4"></a>

<a id="v1-0-5"></a>

<a id="v1-0-6"></a>

<a id="v1-1-0"></a>

## [v1.1.0] - 01/04/2026

### Added
* FR 17 add OMDb poster source support
  
  Add OMDb as a poster only artwork source across the runtime and configurator.
  
  • add OMDb server key and base URL support plus cached OMDb poster lookups
  • wire omdb through poster selection, proxy exports, and AIOMetadata patterns
  • keep backdrop and logo normalization on supported artwork sources only
  • shared cache OMDb Amazon poster assets and cover the flow with focused tests
* FR 19 add Allociné provider support
  
  Add Allociné audience and press providers with native /5 display handling, aliases, and embedded brand assets.
  
  Implement cached Allociné search and detail page scraping for movie and TV ratings, then wire those values into provider resolution and render TTL tracking.
  
  Expand targeted coverage for provider normalization, rating display, icon assets, external fetch parsing, and provider resolution.
* FR 21 add optional bottom ratings rows
  
  Add separate backdrop and logo bottom row settings to the configurator and persisted workspace state.
  
  Keep config string and AIOMetadata exports lean by omitting overridden backdrop layout and side placement params while the bottom row override is enabled.
  
  Cover the new request parsing, render seed, layout, and export behavior with targeted tests.

### Fixed
* align episode provider rating inputs
  
  Add the missing episode field to the provider rating resolver input type.
  
  Pass episode through prepared media when resolving provider ratings so the production build and CI type checks stay green.
* BUG 32 use episode ratings for thumbnails
  
  Default thumbnail requests back to the dedicated TMDB and IMDb stack when thumbnail ratings are not explicitly provided.
  Resolve episode IMDb dataset ratings for episodic requests and use TMDB episode vote averages for thumbnail backdrops instead of the parent show score.
  
  Verification:
  • npx eslint lib/imageRouteRequestState.ts lib/imageRouteProviderRatings.ts lib/imageRoutePreparedMedia.ts tests/image route request state.test.mjs tests/image route provider ratings.test.mjs tests/image route prepared media.test.mjs
  • node experimental strip types test tests/image route request state.test.mjs tests/image route provider ratings.test.mjs tests/image route prepared media.test.mjs
* FR 19 update Allocine brand artwork
  
  Replace the temporary Allocine inline SVG with the provided brand image.
  Keep the press provider on the same artwork with a readable badge overlay.
  
  Verification:
  • npx eslint lib/ratingProviderBrandAssets.ts tests/rating provider icons.test.mjs
  • node experimental strip types test tests/rating provider icons.test.mjs
* FR 21 normalize Bottom Row copy
  
  Capitalize the Bottom Row label for the backdrop and logo FR 21 controls.
  
  Replace the old single bottom row wording in helper copy and workspace summary text so the setting reads as a cleaner shared term across the configurator.
* split overflow release note posts
  
  Keep the first Discord release message as the summary post and retain the role mention there.
  
  Send overflow changelog sections as continuation embeds with versioned titles and disabled mentions.
  
  Add regression coverage for multi message payload generation.

### Documentation
* FR 17 FR 19 FR 21 BUG 32 align public docs
  
  Align the README and in app docs with OMDb poster source support, AlloCiné ratings, Bottom Row controls, and episode thumbnail routing and rating behavior.
  
  Update the docs page route examples, correct the README preview backdrop layout example, and document thumbnailRatings plus the dedicated thumbnail route shape for addon and AIOMetadata integrations.
* FR 17 align OMDb artwork docs
  
  Update the README artwork source and environment sections to match the shipped OMDb poster support.
  
  • document poster OMDb support and the server side OMDb key names
  • align poster, backdrop, and logo artwork source lists with runtime support
  • add OMDb base URL and cache TTL entries to the environment reference

## [v1.0.6] - 01/04/2026

### Fixed
* BUG 23 recompute split anime badges after mapping
  
  Resolve poster genre families from the current anime mapping state instead of the initial prepared media snapshot.
  
  Rebuild the resolved genre badge after provider rating lookups can confirm anime mappings for IMDb and TMDB inputs.
  
  Add a prepared media regression that simulates late anime mapping confirmation for split grouping.
* BUG 24 trim poster touchup logo padding
  
  Measure poster touchup logo overlays from trimmed visible artwork instead of padded source bounds.
  
  Resize the trimmed logo asset directly so centered poster branding stays correctly scaled and positioned.
  
  Add a regression that fails if the overlay path falls back to untrimmed logo sizing again.
* BUG 25 correct XRDB logo sizing from visible artwork ratio
  
  Measure logo aspect ratios from the visible trimmed artwork instead of relying on raw source metadata so XRDB logo canvases do not end up excessively wide and look undersized inside AIOM.
  
  Update TMDB logo selection to prefer the measured visible ratio, add regressions for transparent border trimming and TMDB logo ratio resolution, and keep the fix scoped to XRDB behavior.
* BUG 30 refresh vertical stacked badge design
  
  Refine the stacked badge chrome used in vertical rating columns with a calmer body surface, gradient accent cap, lifted icon plate, and a dedicated score shelf for clearer scan hierarchy.
  
  Extend the badge svg regression to cover the new stacked rail and score shelf gradients so the refreshed vertical treatment stays locked in.
* BUG 31 ignore zero value provider payloads
  
  Treat zero and rounded zero provider ratings as missing data during shared normalization so phantom scores do not enter resolved provider maps or aggregate calculations.
  
  Add regressions for shared rating normalization, MDBList provider payload filtering, and Trakt zero value responses.

## [v1.0.5] - 01/04/2026

### Fixed
* invalidate stale finals on release
  
  Bump the final image render cache version to clear stale cached poster outputs that could hide non IMDb and TMDB providers.
  
  Automate future cache version bumps in the release flow, add focused regression coverage, and document the release behavior in the README.
* restore Discord role mentions
  
  Wire release notifications to mention the configured Discord role in the webhook content.
  
  Quote the workflow role id so GitHub Actions preserves the full snowflake value and send explicit role allowlists without the conflicting parse field.
* 'revert:' messages not showing in changelog'

## [v1.0.4] - 01/04/2026

### Fixed
* resolve mdblist backed sources after imdb lookup
  
  Resolve IMDb dependent provider fetches after the route can hydrate external_ids from the bundled TMDB details response.
  
  This restores MDBList backed sources such as Rotten Tomatoes, Letterboxd, Metacritic, Roger Ebert, and the MDBList aggregate for inputs that do not start with a direct IMDb id on the media record. It also adds regression coverage for bundled external id resolution so the provider stack stays available when the route must discover IMDb ids before fetching dependent ratings.
* source service badges from tmdb watch providers
  
  Use tmdb watch provider results for movie and TV service badges instead of relying only on TV network metadata.
  
  Keep Torrentio focused on quality badges, add regression coverage for provider name normalization and region selection, and align the UI config round trip test with the current default quality badge preferences so CI matches the shipped defaults.
* hide sticky rail toggle on mobile
  
  Only show the sticky rail control at the xl breakpoint and above where the sticky preview mode can actually apply.
  
  This removes a dead mobile control without changing the saved sticky preference for desktop users.
* restore desktop sticky preview rails
  
  Move sticky positioning onto the live preview rail instead of clipping it inside nested scroll containers.
  
  Keep vertical overflow available for the page and preview accordion so showcase, preview, and guide can follow the viewport again on desktop layouts.
* restore anime ratings and stream badges
  
  Send browser like headers for anime rating requests so public instances keep resolving MAL, AniList, Kitsu, and Jikan responses more reliably.
  
  Include supported network badges in the default quality badge set and add regression coverage for anime provider mapping and default stream badge rendering.

### Reverted
* revert release 1.0.4
  
  This reverts commit 90405bcb5202183aeefeae981bf8908a74b69093.

## [v1.0.3] - 01/04/2026

### Fixed
* rebalance workspace layout at desktop widths
  
  Keep the side rail below the primary workspace until very wide screens.
  Move sticky preview behavior to 2xl so the center stage content does not clip.
  Stack AIOMetadata source panels vertically so the right rail stays readable.
* rename Discord release embed branding
  
  Update the Discord release embed author label to XRDB, eXtended Ratings DataBase.
  
  Keep the release notification tests aligned so the old project name does not return in future release posts.

## [v1.0.2] - 31/03/2026

### Fixed
* restore mobile nav and remove repo status copy
  
  Remove the leftover active repository status copy from the public site and README surfaces.
  
  Add a shared mobile aware nav for the home and docs pages so the menu works on small screens.
  
  Show both Live and Latest deployment pills in the shared nav to match the deployment status layout.

## [v1.0.1] - 31/03/2026

### Documentation
* align XRDB repo copy with active status
  
  Remove archived handoff wording from the standalone XRDB repository.
  
  Update the README, shared status notice, and metadata copy so the new repo reads as the active project.

## [v1.0.0] - 31/03/2026

### Added

* publish the first standalone XRDB release
* ship the XRDB configurator, docs, proxy routes, and image generation workflow as the initial public snapshot
* include the deployment files, release automation, and Docker publishing setup used by the active XRDB repo
