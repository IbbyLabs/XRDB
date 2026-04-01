# Changelog

<a id="v1-0-0"></a>

<a id="v1-0-1"></a>

<a id="v1-0-2"></a>

<a id="v1-0-3"></a>

<a id="v1-0-4"></a>

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
