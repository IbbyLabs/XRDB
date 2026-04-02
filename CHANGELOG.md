# Changelog

> [!NOTE]
> This changelog may contain duplicate entries for certain changes. This occurs when an upstream commit is followed by a corresponding conventional commit used for release management and repository standards.

<a id="v1-2-2"></a>

<a id="v1-2-3"></a>

## [v1.2.3] - 03/04/2026

### Fixed
* restore docs capture quality badge typing
  
  Type the docs capture quality badge preference constant as MediaFeatureBadgeKey[] so the workspace runtime setters match their state shape during production type checking.
  
  This restores Next.js build validation in CI without changing runtime behavior.
* FR-27 keep Normalised to Ten scores on one decimal place
  
  Render Normalised to Ten values with a fixed single decimal so whole scores display as 8.0 and 4.0 instead of collapsing to integers.
  
  Add regression coverage for whole number normalized outputs while keeping native and normalized hundred displays unchanged.
* BUG-40 remap anime episode thumbnails to TMDB episode targets
  
  Use reverse mapping payload episode context for MAL and AniList episode requests so later anime seasons resolve the correct TMDB episode number before artwork selection.
  
  Parse TMDB episode targets from anime mapping responses, thread episode query params into reverse mapping requests, and cover the remap flow with payload, request, and media target regressions.
* speed up asset refresh captures
  
  Run the temporary docs refresh Next servers with Turbopack so the first capture no longer stalls on long webpack cold compiles.
  
  Disable unrelated configurator remote lookups during docs capture, trim docs preview providers to TMDB only, bound latest release fetch timeouts, and refresh the generated doc assets.
* BUG-39 center rating badge values and align aggregate accents
  
  Center shared badge values within their rendered slots for standard and summary variants so provider and aggregate scores stop hugging the right edge.
  
  Refactor aggregate accent rail placement through one centered helper so plain average, plain minimal, and minimal glass treatments stay visually consistent while keeping the AUDIENCE overline aligned above its label.
  
  Add focused badge SVG regressions for centered values, plain summary overlines, and minimal accent centering, and verify the change with eslint, focused badge tests, and fresh localhost renders.
* preserve BUG-{ID} and FR-{ID} in release notes
  
  Keep BUG-{ID} and FR-{ID} tokens hyphenated through commit display normalization while removing all other user facing hyphens.
  
  Update Discord release parsing to accept the hyphenated tracking ids, rebuild CHANGELOG.md with the corrected formatting, and refresh coverage for both the new default and legacy spaced release items.

## [v1.2.2] - 02/04/2026

### Fixed
* BUG-22 preserve dark square plates for custom provider icons
  
  Carry an explicit custom icon override flag into badge rendering so
  provider specific Rotten Tomatoes square plate styling is only used
  for the built in artwork.
  
  Keep custom SVG provider icons on the normal dark square plate and add
  regression coverage for both override propagation and badge SVG output.
* BUG-24 tighten poster badge polish
  
  Normalize critics and audience summary badge sizing so paired poster
  badges render with consistent chip widths and spacing.
  
  Raise the bottom poster quality row slightly off the frame edge and add
  regression coverage for the updated poster badge metrics.
* BUG-33 center icon only genre badges
  
  Center icon only genre badge artwork from the computed badge width
  instead of reusing text oriented horizontal padding.
  
  Keep text and mixed icon plus text badge layouts unchanged and add
  regression coverage for icon only badge alignment.
* BUG-36 prevent plain network badge clipping
  
  Widen long text only network quality badges in plain and silver styles
  so logos and text no longer clip at larger badge sizes.
  
  Add regression coverage around rendered badge width and right edge
  breathing room for long provider labels.
* BUG-17 remove redundant poster TMDB mode
  
  Collapse the separate AIOMetadata poster TMDB option into auto mode
  because both paths generated the same typed TMDB poster pattern.
  
  Keep backward compatibility by normalizing legacy tmdb poster mode
  inputs to auto and update the export copy to describe the real
  behavior difference between auto and IMDb modes.

<a id="v1-2-1"></a>

## [v1.2.1] - 02/04/2026

### Fixed
* BUG-37 improve Allocine lookup coverage
  
  Switch Allocine title discovery from the legacy HTML search pages to the current autocomplete endpoint so localized series labels still resolve by original title.
  
  Update the default Allocine provider artwork to the new logo and add focused regression coverage for the reported series case and embedded icon asset.
* wait for webhook posts before continuations
  
  Force Discord webhook execute calls to append wait=true so the summary message is confirmed before continuation embeds are posted.
  
  Preserve existing webhook query parameters such as thread_id and add focused regression coverage for the webhook URL normalization helper.
  
  Verified with: node test tests/discord release payload.test.mjs

### Documentation
* harden generated doc asset verification
  
  Track the README image outputs in a manifest and verify them in tests, release hooks, and CI before changes ship.
  
  Add a deterministic localhost docs capture path for the configurator and proxy screenshots, refresh the checked in XRDB screenshot assets, and use a local mock manifest so the proxy panel capture stays stable.
  
  Also fix the proxy metadata verification script so it can use private local fixtures during tests and match the current translation debug field source naming.

<a id="v1-2-0"></a>

## [v1.2.0] - 02/04/2026

### Added
* add thumbnail configurator controls
  
  Add thumbnail as a first class configurator target with dedicated AIOMetadata and query export support.
  
  Expose thumbnail specific artwork, badge sizing, ratings layout, and episode artwork controls across workspace state, outputs, and appearance panels.
  
  Update config schema and request parsing so thumbnail settings remain type scoped and preserve compatibility fallbacks.
  
  Expand tests for UI config normalization and thumbnail specific rating param handling.
* split episode thumbnail and backdrop artwork modes
  
  Add type scoped thumbnailEpisodeArtwork and backdropEpisodeArtwork settings through request parsing, config export, render seeding, artwork selection, and configurator export controls.
  
  Keep thumbnail defaults on episode stills, keep episodic backdrop defaults on series backdrops, and add regression coverage for request state, render seeds, artwork selection, and AIOMetadata output scoping.

### Fixed
* align thumbnail docs and export copy
  
  Update README guidance so episode thumbnails are documented as thumbnail scoped settings rather than backdrop scoped behavior.
  
  Refresh AIOMetadata export copy to mention thumbnail specific ratings, artwork, text, and layout settings.
  
  Leave the local rule and support context updates out of git as local only guidance.
* keep thumbnail AIOMetadata export type scoped
  
  Restrict the episode thumbnail URL pattern to thumbnail specific and shared query params so poster, backdrop, and logo settings do not leak into the export.
  
  Add assertions covering thumbnail specific URL pattern content and exclusion of poster, backdrop, logo, and quality side params.
* target updates role for release notifications
  
  Point automated and manual Discord release notifications at the Updates role instead of the previous role mention.
  
  Keep both release workflows aligned so publish and replay paths notify the same audience.
* order discord release notes by section
  
  Keep Discord release posts ordered end to end so Added content appears first, Fixed content follows, and the remaining sections come after that across continuation embeds.
  
  Preserve nested changelog detail inside each top level entry instead of flattening those lines into a mixed stream, and prioritize tracked FR and BUG entries within their matching sections.
  
  Add regression coverage for ordered detailed continuation payloads and the updated multi message release flow.

<a id="v1-1-0"></a>

## [v1.1.0] - 01/04/2026

### Added
* FR-17 add OMDb poster source support
  
  Add OMDb as a poster only artwork source across the runtime and configurator.
  
  • add OMDb server key and base URL support plus cached OMDb poster lookups
  • wire omdb through poster selection, proxy exports, and AIOMetadata patterns
  • keep backdrop and logo normalization on supported artwork sources only
  • shared cache OMDb Amazon poster assets and cover the flow with focused tests
* FR-19 add Allociné provider support
  
  Add Allociné audience and press providers with native /5 display handling, aliases, and embedded brand assets.
  
  Implement cached Allociné search and detail page scraping for movie and TV ratings, then wire those values into provider resolution and render TTL tracking.
  
  Expand targeted coverage for provider normalization, rating display, icon assets, external fetch parsing, and provider resolution.
* FR-21 add optional bottom ratings rows
  
  Add separate backdrop and logo bottom row settings to the configurator and persisted workspace state.
  
  Keep config string and AIOMetadata exports lean by omitting overridden backdrop layout and side placement params while the bottom row override is enabled.
  
  Cover the new request parsing, render seed, layout, and export behavior with targeted tests.

### Fixed
* align episode provider rating inputs
  
  Add the missing episode field to the provider rating resolver input type.
  
  Pass episode through prepared media when resolving provider ratings so the production build and CI type checks stay green.
* BUG-32 use episode ratings for thumbnails
  
  Default thumbnail requests back to the dedicated TMDB and IMDb stack when thumbnail ratings are not explicitly provided.
  Resolve episode IMDb dataset ratings for episodic requests and use TMDB episode vote averages for thumbnail backdrops instead of the parent show score.
  
  Verification:
  • npx eslint lib/imageRouteRequestState.ts lib/imageRouteProviderRatings.ts lib/imageRoutePreparedMedia.ts tests/image route request state.test.mjs tests/image route provider ratings.test.mjs tests/image route prepared media.test.mjs
  • node experimental strip types test tests/image route request state.test.mjs tests/image route provider ratings.test.mjs tests/image route prepared media.test.mjs
* FR-19 update Allocine brand artwork
  
  Replace the temporary Allocine inline SVG with the provided brand image.
  Keep the press provider on the same artwork with a readable badge overlay.
  
  Verification:
  • npx eslint lib/ratingProviderBrandAssets.ts tests/rating provider icons.test.mjs
  • node experimental strip types test tests/rating provider icons.test.mjs
* FR-21 normalize Bottom Row copy
  
  Capitalize the Bottom Row label for the backdrop and logo FR-21 controls.
  
  Replace the old single bottom row wording in helper copy and workspace summary text so the setting reads as a cleaner shared term across the configurator.
* split overflow release note posts
  
  Keep the first Discord release message as the summary post and retain the role mention there.
  
  Send overflow changelog sections as continuation embeds with versioned titles and disabled mentions.
  
  Add regression coverage for multi message payload generation.

### Documentation
* FR-17 FR-19 FR-21 BUG-32 align public docs
  
  Align the README and in app docs with OMDb poster source support, AlloCiné ratings, Bottom Row controls, and episode thumbnail routing and rating behavior.
  
  Update the docs page route examples, correct the README preview backdrop layout example, and document thumbnailRatings plus the dedicated thumbnail route shape for addon and AIOMetadata integrations.
* FR-17 align OMDb artwork docs
  
  Update the README artwork source and environment sections to match the shipped OMDb poster support.
  
  • document poster OMDb support and the server side OMDb key names
  • align poster, backdrop, and logo artwork source lists with runtime support
  • add OMDb base URL and cache TTL entries to the environment reference

<a id="v1-0-6"></a>

## [v1.0.6] - 01/04/2026

### Fixed
* BUG-23 recompute split anime badges after mapping
  
  Resolve poster genre families from the current anime mapping state instead of the initial prepared media snapshot.
  
  Rebuild the resolved genre badge after provider rating lookups can confirm anime mappings for IMDb and TMDB inputs.
  
  Add a prepared media regression that simulates late anime mapping confirmation for split grouping.
* BUG-24 trim poster logo padding
  
  Reduce excess poster logo padding in the touch up path so the title
  lockup sits more cleanly within the available poster safe area.
  
  Keep the change isolated to the poster touch up rendering path to avoid
  changing backdrop or logo composition behavior.
* BUG-25 correct XRDB logo sizing from visible artwork ratio
  
  Measure logo aspect ratios from the visible trimmed artwork instead of relying on raw source metadata so XRDB logo canvases do not end up excessively wide and look undersized inside AIOM.
  
  Update TMDB logo selection to prefer the measured visible ratio, add regressions for transparent border trimming and TMDB logo ratio resolution, and keep the fix scoped to XRDB behavior.
* BUG-30 refresh vertical stacked badge design
  
  Refine the stacked badge chrome used in vertical rating columns with a calmer body surface, gradient accent cap, lifted icon plate, and a dedicated score shelf for clearer scan hierarchy.
  
  Extend the badge svg regression to cover the new stacked rail and score shelf gradients so the refreshed vertical treatment stays locked in.
* BUG-31 ignore zero value provider payloads
  
  Treat zero and rounded zero provider ratings as missing data during shared normalization so phantom scores do not enter resolved provider maps or aggregate calculations.
  
  Add regressions for shared rating normalization, MDBList provider payload filtering, and Trakt zero value responses.

<a id="v1-0-5"></a>

## [v1.0.5] - 01/04/2026

### Fixed
* invalidate stale finals on release
  
  Bump the final image render cache version to clear stale cached poster outputs that could hide non IMDb and TMDB providers.
  
  Automate future cache version bumps in the release flow, add focused regression coverage, and document the release behavior in the README.
* restore Discord role mentions
  
  Wire release notifications to mention the configured Discord role in the webhook content.
  
  Quote the workflow role id so GitHub Actions preserves the full snowflake value and send explicit role allowlists without the conflicting parse field.
* 'revert:' messages not showing in changelog'

<a id="v1-0-4"></a>

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

<a id="v1-0-3"></a>

## [v1.0.3] - 01/04/2026

### Fixed
* rebalance workspace layout at desktop widths
  
  Keep the side rail below the primary workspace until very wide screens.
  Move sticky preview behavior to 2xl so the center stage content does not clip.
  Stack AIOMetadata source panels vertically so the right rail stays readable.
* rename Discord release embed branding
  
  Update the Discord release embed author label to XRDB, eXtended Ratings DataBase.
  
  Keep the release notification tests aligned so the old project name does not return in future release posts.

<a id="v1-0-2"></a>

## [v1.0.2] - 31/03/2026

### Fixed
* restore mobile nav and remove repo status copy
  
  Remove the leftover active repository status copy from the public site and README surfaces.
  
  Add a shared mobile aware nav for the home and docs pages so the menu works on small screens.
  
  Show both Live and Latest deployment pills in the shared nav to match the deployment status layout.

<a id="v1-0-1"></a>

## [v1.0.1] - 31/03/2026

### Documentation
* align XRDB repo copy with active status
  
  Remove archived handoff wording from the standalone XRDB repository.
  
  Update the README, shared status notice, and metadata copy so the new repo reads as the active project.

<a id="v1-0-0"></a>

## [v1.0.0] - 31/03/2026

### Added
* initial XRDB release
  
  Publish the first release of XRDB
  
  Include the current app, docs, release workflow, and deployment setup.

