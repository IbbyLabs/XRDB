# Changelog

> [!NOTE]
> This changelog may contain duplicate entries for certain changes. This occurs when an upstream commit is followed by a corresponding conventional commit used for release management and repository standards.

<a id="v1-2-2"></a>

<a id="v1-2-3"></a>

<a id="v1-3-0"></a>

<a id="v1-4-0"></a>

<a id="v1-4-1"></a>

<a id="v1-4-2"></a>

<a id="v1-5-0"></a>

<a id="v1-6-0"></a>

<a id="v1-7-0"></a>

<a id="v1-7-1"></a>

<a id="v1-8-0"></a>

<a id="v1-8-1"></a>

<a id="v1-8-2"></a>

<a id="v1-8-3"></a>

<a id="v1-8-4"></a>

<a id="v1-9-0"></a>

<a id="v1-10-0"></a>

<a id="v1-10-1"></a>

<a id="v1-11-0"></a>

<a id="v1-12-0"></a>

<a id="v1-13-0"></a>

<a id="v1-13-1"></a>

<a id="v1-14-0"></a>

<a id="v1-15-0"></a>

<a id="v1-15-1"></a>

<a id="v1-16-0"></a>

<a id="v1-16-1"></a>

<a id="v1-17-0"></a>

<a id="v1-17-1"></a>

<a id="v1-17-2"></a>

<a id="v1-18-0"></a>

<a id="v1-18-1"></a>

<a id="v1-18-2"></a>

<a id="v1-19-0"></a>

## [v1.19.0] - 15/04/2026

### Added
* shift to server managed provider keys
  
  Remove provider key entry fields from configurator access keys and surface server credential status in the UI.
  
  Use server TMDB and MDBList fallbacks across search, preview, proxy, and export payload generation while keeping optional per request overrides.
  
  Update docs and env template for XRDB_TMDB_API_KEY support and add regression coverage for credential omission and server key detection.

### Fixed
* BUG-96 fallback to server MDBList keys
  
  Retry provider rating resolution with the server MDBList key pool when a manual MDBList key returns no data.
  
  Add regression coverage for manual key failure so preview badges keep rendering from fallback data.
* BUG-95 genre badge respects selected position in blockbuster mode
  
  In blockbuster poster mode, the collision avoidance loop was pushing the
  genre badge away from all blockbuster overlay elements (score tiles,
  callout tiles, rating badges, strip), ignoring the user's chosen position
  entirely. The badge could end up halfway down the poster regardless of
  what genreBadgePosition was set to.
  
  Fix: pass empty collisionRects for blockbuster poster mode in
  imageRouteRenderer so the collision loop exits immediately and the badge
  renders at the user selected offset. Non blockbuster posters and
  backdrops continue to use full collision avoidance as before.
  
  Also refreshed doc static assets and README capture date.
* BUG-92 accept all config profile ID formats in link import
  
  Configurator link import validated config IDs with a UUID only pattern, which caused encrypted xrc_ IDs and legacy xr_ IDs to be rejected during parse. When those URLs were imported, configProfileId was dropped and the saved profile binding was silently lost.
  
  This commit replaces the UUID only matcher with a unified CONFIG_PROFILE_ID_RE that accepts all supported profile ID families: UUID v4, xrc_<16 hex>, and xr_<8 hex>. The parsing path now preserves profile IDs consistently across import flows without changing merge precedence behavior.
  
  Regression coverage includes explicit xrc_ and xr_ parser tests plus request state tests validating UUID profile resolution, explicit URL parameter precedence over saved profile parameters, and parity between generated inline URLs and ?config URLs across poster, backdrop, logo, and thumbnail routes.
* BUG-89 skip clean style scrim when background opacity is 0
  
  Clean genre badge rendering still produced the clean style scrim when background opacity was explicitly set to 0, which made fully transparent clean badges impossible and caused a mismatch between requested opacity and rendered output.
  
  This commit updates the clean style rendering path so the scrim/background layer is skipped when effective clean background opacity resolves to zero, while preserving existing clean text treatment, shadow behavior, and non zero opacity rendering.
  
  The change keeps clean style visuals deterministic across inline URLs and saved profile URLs where genreBadgeBackgroundOpacity is set to 0.
* BUG-88 enforce clean text only constraints
  
  Clean style behavior drifted across configurator state, URL generation, and runtime normalization. Icon and both modes could leak into clean style and non bottom center positions could persist, which produced inconsistent output between saved settings, generated links, and rendered images.
  
  This commit centralizes clean style coercion through shared helpers so clean style resolves to text mode and bottom center placement unless genre badge mode is explicitly off. The coercion is applied across configurator props normalization, output query generation, runtime request state parsing, and renderer badge building to keep behavior consistent on poster, backdrop, thumbnail, and logo routes.
  
  Regression coverage was expanded in genre badge, request state, image route badge, and ui config suites to lock clean style mode and placement coercion and ensure clean output remains text only across parsing and rendering paths.
* BUG-87 prevent clean genre title overlap
  
  Clean genre badges could overlap the poster title area on some output sizes because clean mode placement short circuited before collision avoidance and because the renderer did not reserve space using the actual clean badge footprint.
  
  This commit removes the clean mode early return in genre placement so collision rect solving always runs, clamps placement using dynamic min inset, computes clean poster reserved bottom height from the rendered clean badge SVG height, and tracks the clean overlay collision rectangle so later overlays cannot collide into it.
  
  Coverage was added with a multi size poster placement regression test to verify clean genre badges do not overlap the title region across normal, large, and 4k poster outputs.
* BUG-86 keep poster genre and clean logo scaling proportional
  
  Adjust poster genre badge auto scaling to keep normalized visual proportions more stable across normal, large, and 4K outputs while preserving user scale compounding behavior.
  
  Update poster clean overlay logo sizing so small source logos can upscale proportionally for higher resolution poster renders, preventing undersized 4K logo output.
  
  Add focused regression coverage for poster genre normalized ratio consistency and 4K clean logo upscale behavior across rendering paths.
* BUG-80 harden AIOMetadata TV poster target resolution
  
  Harden AIOMetadata TV export target resolution so poster URLs consistently resolve the correct media target and avoid ambiguous poster selection behavior.
  
  Align export view and config profile client state handling with the normalized media target path so generated patterns and saved state stay consistent.
  
  Add targeted regression tests for config profile client state, media target normalization, and UI config serialization to lock the BUG-80 behavior in place.
* stabilize side placement and grouped age rating behavior
  
  Allow grouped age rating placement to participate correctly on supported poster side layouts while preserving the intended quality badge side behavior.
  
  Update poster display preference resolution and quality badge placement controls so grouped certification output does not overlap or drift when side positions are selected.
  
  Refresh supporting docs and visual reference assets, and add regression coverage for display preference resolution, age rating extraction behavior, quality badge control normalization, and UI config payload handling.

### Documentation
* refresh static doc assets

## [v1.18.2] - 13/04/2026

### Fixed
* BUG-91 prevent server key exposure and allow tmdb only profile save with server mdb fallback
  
  Hide server side Fanart, MDBList, and Simkl credential values from configurator env access responses while keeping non sensitive availability flags.
  
  Decouple profile save gating from config string generation so profile create/update/migrate only require TMDB when server MDBList is configured.
  
  Add legacy MDBLIST_KEY alias support for server availability checks and update regression tests.

### Documentation
* refresh static doc assets

## [v1.18.1] - 13/04/2026

### Fixed
* BUG-90 prevent login overwrite of unsaved config
  
  Add login conflict handling so profile reveal does not silently replace active local configurator edits.
  
  Introduce explicit conflict resolution actions for loading profile values or keeping web changes.
  
  Add and update config profile client state tests for conflict detection behavior.
  
  Verification: pnpm run lint && pnpm run test && pnpm run build

### Documentation
* refresh static doc assets

## [v1.18.0] - 13/04/2026

### Added
* FR-39 clean bottom genre shadow overlay
  
  • add clean genre bottom priority overlay behavior with full width dark to light bottom shadow
  
  • force clean genre badge to bottom center and move competing bottom layout elements away
  
  • wire configurable clean background opacity through UI, config payloads, and proxy/query parsing
  
  • update request/render placement logic and regression coverage

### Fixed
* refine clean bottom fade and placement
* enforce language first logo selection for tmdb and fanart
  
  Update logo selection to prevent localized logo fallbacks when requested language assets are expected.
  
  TMDB logo selection now prefers requested language, then fallback language, then neutral, and does not fall back to arbitrary language logos.
  
  Fanart logo selection now restricts deterministic picks to the highest priority language bucket resolved for the request, instead of selecting across mixed language logo candidates.
  
  Result: requests such as logoArtworkSource=fanart&lang=en return English logos when English fanart logos exist for the title.
  
  Validation: pnpm run lint && pnpm run test && pnpm run build; manual checks on tmdb:movie:177572 and tmdb:movie:412656 with logoArtworkSource=fanart&lang=en.

### Documentation
* refresh static doc assets
* FR-39 add genreBadgeBorderWidth and posterNoBackground outline params to README and product context
  
  Add 7 missing genre badge parameters to the README parameter table, AI Integration
  Prompt parameter block, per type settings section, and URL build template:
  
  • genreBadgeBorderWidth (global fallback, 0 to 10, default 1.4)
  • posterGenreBadgeBorderWidth (default 1.4)
  • backdropGenreBadgeBorderWidth (default 1.5)
  • thumbnailGenreBadgeBorderWidth (default 1.5)
  • logoGenreBadgeBorderWidth (default 1.4)
  • posterNoBackgroundBadgeOutlineColor (hex, default #000000)
  • posterNoBackgroundBadgeOutlineWidth (0 to 10, default 0)
  
  All params were already implemented in code. This commit closes the documentation
  gap identified in Group 2 of the fr-39-genre badge OpenSpec change.
  
  Regenerate public/product context.json to include the new param descriptions.
  
  Gate: lint clean, 766/766 tests pass, build clean.

## [v1.17.2] - 12/04/2026

### Fixed
* BUG-85 preserve thumbnail genre badge off on profile update

### Documentation
* refresh static doc assets

## [v1.17.1] - 12/04/2026

### Fixed
* BUG-82 BUG-84 harden release gates
  
  Ensure doc refresh and release scripts run TypeScript imports with Node type stripping.
  
  Seed configurator env defaults from a runtime API endpoint so standalone production builds do not freeze build time env values.
  
  Prepare standalone static and public assets before local pnpm start so production verification matches the Docker runtime layout.
  
  Refresh generated README doc assets and extend configurator env access key coverage.
* BUG-82 BUG-83 BUG-84 resolve regressions
  
  Treat a blank Torrentio base URL as disabled while preserving the default for unset configuration.
  
  Seed configurator access key fields from server environment defaults without overwriting saved user values.
  
  Make ratingPresentation=none suppress rating overlays and stream badges across poster and non poster outputs.
  
  Update docs and add targeted regression coverage for the affected behaviors.
* BUG-81 preserve unlocked saved profile updates
  
  Add schema driven saved profile verification coverage and a dedicated release gate.
  
  Persist protected profile unlock sessions across remounts and restore saved snapshots so configure to export updates keep their diff baseline.
  
  Validated with focused client state tests, full lint/test/build, and manual browser verification of the protected update flow.

### Documentation
* refresh static doc assets

## [v1.17.0] - 12/04/2026

### Added
* FR-68 add console log levels
  
  Add a shared server logger with debug, info, warn, and error levels.
  
  Keep request logging disabled by default, add XRDB_REQUEST_LOG_LEVEL for opt in request visibility, and route info output to stdout while warnings and errors stay on stderr.
  
  Migrate runtime logging call sites, add focused logger tests, and document the new env vars in the runtime docs.
* prioritize uuid saved profile portability
  
  Promote protected UUID profiles to the primary Import/Export workflow and add a first class restore path for opening an existing saved profile on another device.
  
  Recognize ?config=<uuid> links in configurator import and URL hydration, surface restore prompts in Configure and Import/Export, and default AIOMetadata exports to config mode URLs unless the user explicitly switches back to inline.
  
  Refresh README, reference copy, and generated doc assets to match the saved profile first workflow, and cover the new mode selection and config link parsing behavior with focused tests.

### Fixed
* FR-67 scope link imports by type
  
  Refactor configurator link import parsing into scoped visual patches instead of full workspace replacement.
  
  Add import review UI for shared visual settings and cross type destination selection, and merge selected patches onto current profile params.
  
  Expand focused import regression coverage for same type preservation, excluded non visual values, shared setting prompts, and compatible cross type mapping.
* restore password visibility toggles
  
  Add eye toggles back to saved profile password inputs in the export view.
  
  Keep matching password and confirm password fields in sync when revealing sensitive values.
* BUG-79 clarify saved profile update scope
  
  Extract shared config profile fingerprint helpers for saved profile dirty state.
  
  Clarify that export only controls stay local to the browser and do not affect Update saved profile.
  
  Add focused regression tests for persisted setting changes versus local only controls.

### Documentation
* refresh static doc assets

## [v1.16.1] - 11/04/2026

### Fixed
* preserve unlock state and addon source fetches
  
  Move protected profile unlock state into the shared workspace runtime so Export route navigation keeps the active management session.
  
  Apply revealed profile settings to the live workspace immediately and keep persisted config aligned with the in memory state.
  
  Fix the safe source lookup callback so public addon manifests such as Cinemeta resolve through the proxy fetch path.
* BUG-77 restore hosted manifest proxy flows
  
  Build proxy reference URLs from the public request context so hosted deployments no longer emit internal bind hosts.
  
  Honor outbound proxy environment settings for safe source manifest fetches while preserving source validation.
  
  Keep generated proxy links visible in the addon view even when catalog manifest introspection fails.

### Documentation
* refresh static doc assets

## [v1.16.0] - 11/04/2026

### Added
* protect saved config and proxy references
  
  • store saved configs and proxy payloads as encrypted UUID backed records
  • require password unlock flows for saved profile reveal, update, rotation, and deletion
  • preserve runtime UUID config resolution and legacy migration support
  • harden preview origin trust and proxy connection time source validation
  • refresh docs, tests, and product context for the new security model

### Documentation
* refresh static doc assets

## [v1.15.1] - 11/04/2026

### Fixed
* BUG-75 preserve saved profile alias round trips
  
  Decode saved profile wire aliases before shared settings normalization so saved profile diff and revert rebuild the same canonical settings shape.
  
  • restore quality badge alias params and providerAppearance through the shared uiConfig decode path
  
  • keep canonical keys authoritative when both canonical and alias forms are present
  
  • add round trip and precedence regression coverage for saved profile params

### Documentation
* refresh static doc assets

## [v1.15.0] - 11/04/2026

### Added
* FR-64 add compact ring source priorities
  
  Add configurable Compact Ring center and progress sources for overall, critics, audience, and lane specific priority modes.
  
  Wire the new ring source settings through request parsing, configurator state, URL exports, render seeding, fallback resolution, public docs, and focused regression tests.

### Documentation
* refresh static doc assets

## [v1.14.0] - 10/04/2026

### Added
* add cross type settings sync
  
  Add cross type sync actions in configurator with diff confirmation before apply, including sync to all and pull from flows.
  
  Introduce shared sync helpers and tests for extraction, application, coercion, filtering, and diff computation.
  
  Keep the sync flyout viewport safe by clamping horizontal position, flipping when needed, and reserving bottom nav safe space.
* type presentation compatibility gating
  
  Filter ring, editorial, and blockbuster from the presentation grid for
  backdrop, thumbnail, and logo types. All three are poster only at the
  render layer (finalImageRenderSeed.ts bypasses them for non poster
  output) so showing them in the UI was misleading.
  
  Changes:
  • Add getPresentationOrderForType helper in configuratorPageOptions.ts
    that strips ring, editorial, and blockbuster for non poster types
  • Wire configuratorPageProps.ts to use it instead of the static order
  • Add coerceNonPosterPresentation in uiConfig.ts that collapses any
    stale ring, editorial, or blockbuster value to standard on load for
    backdrop, thumbnmail, and logo settings
  • Wrap thumbnailRatingPreferences normalization in an IIFE with an
    empty intersection fallback to defaults so a fully invalid provider
    list does not produce a blank badge output
  • Remove the non poster fallback hint text from the appearance sections
    and simplify the Blockbuster hint copy
  • Update full stack preset: backdropRatingPresentation now standard
    (was blockbuster, which was already silently falling back at render
    time); update preset description to reflect this
  • Add 8 unit tests covering coercion and provider fallback cases
  • Update configurator presets test fixture to match corrected preset

### Fixed
* BUG-69 suppress compact ring when configured provider has no data
  
  When resolveCompactRingBadge was called with a specific provider source
  that had no score for the current media, it silently fell through to the
  reduce max path and returned the highest available score from any other
  enabled provider. This produced inflated numbers and ring arcs with no
  indication that the displayed score was from a different source.
  
  Fix: add return null inside the if (requestedSource !== 'highest') block
  after the exact match check fails, so a missing specific provider exits
  with null instead of falling through to the reduce.
  
  Also remove the valueRingBadge || progressRingBadge composition fallback
  at the call site. When the value source returns null the ring now
  suppresses entirely rather than substituting the progress source score
  as a silent replacement value. The || fallback was a second silent
  substitution with no user intent behind it.
  
  The 'highest' path is unchanged and continues returning the max
  available score by design.
  
  Updated the existing test that was asserting the old fallback behavior
  to assert the correct suppression behavior instead.
* BUG-76 snap dynamic accent color to displayed rating precision
  
  The dynamic accent color was resolved using the raw floating point average
  (e.g. 7.9501) while the badge text was rounded to one decimal (e.g. 8.0).
  This caused titles displaying the same score to land on different color stops
  depending on whether their raw average was just above or below a boundary.
  
  Fix: both the aggregate badge path and the compact ring path now round the
  normalized score to one decimal before multiplying by 10 for stop lookup,
  matching the precision of the displayed value so color and badge are always
  consistent.
* BUG-75 preserve profile ring sources and stop false unsaved diffs
  
  • add profile load normalization mode to skip cross type fallback inheritance when reading saved config state
  • thread skipCrossTypeFallbacks through saved config parsing paths used by profile and local storage loads
  • replace export snapshot reconstruction via import URL parser with direct normalizeSavedUiConfig from save params
  • persist the exact normalized saved snapshot to local storage after successful profile save
  • fix thumbnail aggregate source fallback behavior in skip mode to avoid backdrop bleed through
  • keep URL import behavior backward compatible for generic import links
  
  Verification:
  • pnpm run lint
  • pnpm run test
  • pnpm run build
  • manual: backdrop none/random save reload no false unsaved state
  • manual: poster ring sources persist after save reload
  • manual: revert diff and apply behavior verified
  • manual: URL import backdrop ring inheritance path verified

### Documentation
* refresh static doc assets
* audit sync and presentation docs

## [v1.13.1] - 10/04/2026

### Fixed
* BUG persistent config profile ID lost on page refresh or tab navigation
  
  Root cause: three successive bad fixes introduced by lint compliance attempts:
  1. Promise.resolve().then() wrapper deferred localStorage read past write back effect firing with null, silently deleting the stored ID on every mount.
  2. Lazy useState initializer caused SSR hydration mismatch (server null vs client stored value).
  3. useRef guard on write back effect still vulnerable to React Strict Mode double invocation, where ref persists across remounts and fires the write with null before sync() restores the value.
  
  Fix: remove the write back effect entirely. Reads are handled by sync() called immediately in the event listener effect (setState inside callback, not effect body, satisfying react hooks/set state in effect). Writes happen synchronously inside handleProfileIdChange alongside setSavedProfileId, so localStorage and state always stay in sync with no effect involvement.

### Documentation
* refresh static doc assets

## [v1.13.0] - 10/04/2026

### Added
* FR-56 revert unsaved edits to last saved profile
  
  Add revert to saved profile feature to the Saved Config Profile section
  of the Export panel.
  
  • Fetch server saved params on mount via GET /api/config/{id} and
    reconstruct a SavedUiConfig snapshot via parseConfiguratorLinkImport
    so the reference state always reflects what is persisted, not the
    current UI state
  • Track snapshotReady to gate unsaved changes detection until the
    server fetch completes, preventing false negatives on initial load
  • Compute a param level diff (capped at 20 entries) between current
    UI params and the saved snapshot on every render cycle
  • Show an 'unsaved changes' badge in the Saved Config Profile header
    whenever the current settings diverge from the snapshot
  • Show an amber 'Revert to saved' button alongside the unsaved badge
  • RevertDiffModal renders a CHANGE badged diff with OLD (server saved,
    red) and NEW (current, green) columns before any destructive action
  • 'Revert to saved' opens the modal with 'Confirm and Revert' label;
    confirming restores all settings via applySavedUiConfig and resets
    the fingerprint
  • 'Update saved profile' opens the same modal with 'Save changes'
    label; confirming saves to the server and updates the snapshot
  • Snapshot and fingerprint are refreshed after every save, migrate, or
    delete to keep the reference state in sync
* BUG-71 config profile security — encryption, migration deadline, overlay
  
  • Encrypt all config profile params at rest using AES 256 GCM via CONFIG_ENCRYPTION_KEY
  • Add xrc_ prefix for new encrypted profiles; xr_ legacy profiles remain readable
  • Seed a global legacy_migration_deadline in config_meta table at first server start
  • New GET /api/config/[id]/status endpoint returns isLegacy + migrationDeadline from server
  • SaveConfigSection fetches server anchored deadline; countdown survives localStorage clear
  • Image overlay (red orange hazard stripe) injected on all xr_ legacy profile requests
  • Overlay composited via Sharp after render; cache bypassed for legacy profiles
  • HTTP 410 with human readable message when a legacy profile has expired or been deleted
  • Update button disabled when saved profile exists and params match last saved fingerprint
  • Key rotation banner shown after successful migration to prompt xrc_ URL adoption
  • Fix hydration mismatch: savedProfileId starts null, populated in useEffect after mount
  • Fix ArrayBuffer passed to Sharp for overlay: wrap with Buffer.from() before composite
  • env.template: add CONFIG_ENCRYPTION_KEY entry with generation instructions

### Fixed
* BUG-73 config profile xrdbKey used as auth fallback on image and thumbnail routes
  
  Previously the request key auth check fired before the config profile was
  loaded, so xrdbKey stored in the profile was never used to authorize the
  request. Users had to manually append &xrdbKey= to every URL even when it
  was already saved in their config profile.
  
  Fix: read the config profile before the auth check in imageRouteHandler and
  thumbnail route, pass profile xrdbKey as fallbackKey to isXrdbRequestAuthorized.
  This matches the existing behavior in proxyRouteHandler.
  
  A config ID is now fully self contained — no additional params needed in the URL.
* BUG-70 scale badge metrics to fit natural logo width with 4+ ratings
  
  Before this fix the logo badge layout had no fitBadgeMetricsToWidth step,
  unlike poster and backdrop. With 4+ providers at full logo badge scale
  (iconSize 92, paddingX 38) the badge row exceeded the natural logo width,
  causing finalOutputWidth to expand. The logo art stayed at its original
  narrow width but was centered in the much wider canvas, appearing tiny.
  
  Fix: before computing logoBadgesPerRow, run fitBadgeMetricsToWidth against
  a row of ceil(sqrt(N)) badges at the natural outputWidth. This scales badge
  metrics down proportionally so N badges across ceil(sqrt(N)) rows fill the
  canvas without expanding it. finalOutputWidth is now always outputWidth for
  logo type images.
  
  logoBadgesPerRow also switches from cappedRatingBadges.length (all on one
  row) to ceil(sqrt(N)) for standard presentation, matching the scaling target
  and producing a grid layout (4 badges -> 2x2, 9 -> 3x3, 16 -> 4x4).
  
  Tests updated to assert finalOutputWidth stays at outputWidth and
  logoBadgesPerRow follows the sqrt grid.
* BUG-72 preserve empty string values in saved config profiles
  
  Config save endpoint was stripping empty string values, causing provider
  selections like ratings="" (no providers) to be silently dropped. On load
  the missing key returned null, which the parser treated as all providers
  enabled.
  
  • Stop filtering empty strings in POST /api/config so explicit empty
    selections persist correctly across all image types (poster, backdrop,
    logo, thumbnail)
  • Add DELETE /api/config/[id] endpoint and deleteConfigProfile db helper
    so users can remove a saved profile and reset to defaults
  • Show missing keys message in Saved Config Profile section when TMDB or
    MDBList key is absent, matching the Config String section behavior
  • Add Delete profile button next to save button for saved profiles
* revert ignoreDeprecations, invalid value for CI TypeScript version
* prevent race condition marking older release as latest
  
  The reconcile step ran immediately after softprops/action gh release
  created the new release. Due to GitHub API eventual consistency, the
  freshly created release was sometimes absent from GET /releases?per_page=100,
  causing the reconcile to identify the previous release as the highest
  version and PATCH it as Latest, undoing the correct Latest marker.
  
  Pass CURRENT_TAG to the reconcile step. When set, the script fetches
  the release directly via GET /releases/tags/{tag} (point in time
  consistent) and merges it into the comparison set before determining
  which release wins Latest. If the new release was missing from the
  paginated list it is now included and correctly wins the version sort.

### Documentation
* refresh static doc assets
* pre minor release documentation and lint audit
  
  README Proxy and Security table was missing six env vars that are live
  in env.template and code:
  • XRDB_REQUEST_API_KEY and XRDB_REQUEST_API_KEYS (request access control)
  • XRDB_CONFIG_ENCRYPTION_KEY (config profile encryption, added in v1.12.0)
  • XRDB_INACTIVE_CONFIG_PRUNE_DAYS (config profile pruning, added in v1.12.0)
  • MDBLIST_API_KEY and MDBLIST_API_KEYS (server side rating pool keys)
  
  env.template had TMDB_API_KEY with an incorrect description claiming it is
  used for preview, rendering, and artwork selection. No code reads this var.
  Removed it to prevent user confusion.
  
  env.template was missing four brand env vars that are read in lib/siteBrand.ts:
  • NEXT_PUBLIC_BRAND_GITHUB_URL
  • NEXT_PUBLIC_BRAND_GITHUB_LABEL
  • NEXT_PUBLIC_BRAND_SUPPORT_URL
  • NEXT_PUBLIC_BRAND_UPTIME_URL
  
  Regenerated public/product context.json after surface updates.
  
  Fixed two pre existing React lint errors in components/export view.tsx:
  • Replaced setState in effect aiometadataUrlMode reset with a derived
    effectiveAiometadataUrlMode computed at render time
  • Added [buildSaveParams, snapshotReady] deps to no deps useEffect
  • Moved localStorage mount read into a promise callback to satisfy
    react hooks/set state in effect without changing behavior

### Other Changes
* silence baseUrl deprecation warning for TS 6.0

## [v1.12.0] - 09/04/2026

### Added
* add Authelia access control template
  
  Add authelia rules.template.yaml with bypass rules for image, proxy,
  API, preview, and static asset endpoints so media clients (Stremio,
  Jellyfin) can fetch posters without authentication.
  
  Includes step by step instructions for both Viren070
  docker compose template users and standalone Traefik setups. Uses Go
  template syntax (TEMPLATE_XRDB_HOSTNAME env var) matching the Authelia
  config filter pattern.
  
  Add commented out authelia@docker middleware label to compose.yaml.
  Add Authelia section to README with setup guidance for both paths.
* saved config profiles via ?config=<id>
  
  Add server stored config profiles that allow any image URL to load a
  preset set of params by appending ?config=<id> to the request.
  
  • lib/dbCore.ts: add config_profiles table to SCHEMA_SQL with upsert
    and get accessors
  • app/api/config/route.ts: POST endpoint generates xr_<8hex> profile ID
    or updates existing when _id is supplied
  • app/api/config/[id]/route.ts: GET endpoint returns stored params or 404
  • lib/imageRouteRequestState.ts: extract config param at request entry
    point; merge stored profile as base with inline params overriding
  • lib/uiConfig.ts: export buildProfileParams helper for string only
    payload from SharedXrdbSettings
  • lib/configuratorPageProps.ts: wire buildSaveParams into exportPanelsProps
  • components/export view.tsx: add SaveConfigSection with save/update
    button, profile ID display, and copy helpers; persist profile ID in
    localStorage across refreshes and navigation
  • lib/useConfiguratorWorkspaceConfigIo.ts: add missing
    setRatingBlackStripEnabled to applySavedUiConfig dep array (lint fix)
  • lib/useConfiguratorWorkspaceStorage.ts: fix Clear button to call
    applySavedUiConfig with defaults so live state resets, not only storage
  • README.md: add config param to main table and AI integration prompt table
  • public/product context.json: regenerated

### Fixed
* BUG-65 compact ring accent mode ignored and position offset
  
  Compact Ring presentation (ratingPresentation=ring) was excluded from the
  usesAggregateRatingPresentation gate in useConfiguratorOutputs, so
  aggregateAccentMode and all dependent accent params were never serialized
  into the generated image URL. The renderer always fell back to the default
  source mode, locking the ring color to the badge provider accent regardless
  of user selection.
  
  Fixed by adding usesCompactRingPresentation to each of the eight accent
  param guards so genre, custom, and dynamic modes serialize correctly for
  ring presentation URLs.
  
  The ring SVG viewport includes glowPad for the bloom filter, but the
  overlay top/left position did not compensate for the extra padding.
  This pushed the visible ring circle glowPad/2 pixels southwest of the
  intended corner inset. Fixed by computing glowOffset = Math.round(glowPad / 2)
  and applying it to both top and left so the ring edge sits at the same
  inset as other badge types.
  
  README: added dynamic to aggregateAccentMode allowed values, noted that
  the setting also controls Compact Ring stroke color. Regenerated
  product context.json and refreshed static preview assets.
* correct site description and OG image for link previews
  
  Replace stale repository description with accurate service description
  matching the stateless artwork engine purpose of XRDB.
  
  Switch Open Graph and Twitter card image from favicon.png (512x512 icon)
  to discord banner.png (1376x768 branded banner) so Discord and other
  platforms render a proper preview instead of a tiny icon.
  
  Update test assertion for the new OG image path.
* BUG-66 scale paddingX proportionally with badge height
  
  paddingX was hardcoded (e.g. 13px for glass+both) and never grew with
  badge height. At 4K scale the badge height reaches ~140px but paddingX
  stayed at 13, causing the icon to hug the border while iconGap (which
  already used height * 0.16) ballooned — producing the large icon to text
  gap observed in reports.
  
  Fix: express each paddingX constant as a fraction of height so the ratios
  hold at every scale. Values are derived so they round to the original
  pixel constants at the default poster base height of 40px, leaving
  normal size rendering unchanged.
  
  Add two regression tests:
  • BUG-66 genre badge icon padding scales proportionally at 4K scale
  • BUG-66 genre badge icon gap stays proportional to badge height at 4K scale
* BUG-67 Black Bar option incorrect visually and in wrong section
  
  The Black Bar rating strip was miscategorized as an artwork source, sat
  flush incorrectly (appearing to float), and was visually broken in
  stacked rating view. This fix addresses all three reported problems.
  
  • Move Black Bar out of artwork sources and expose it as an independent
    ratingBlackStrip=1 query parameter so it combines with any style
  • Fix rendering order so the strip sits flush at the poster bottom and
    edges in all configurations including stacked rating view
  • Move the Black Bar control from artwork source selector to the
    Appearance section as a standalone On/Off overlay toggle
  • Migrate saved configs with posterArtworkSource=blackbar to tmdb and
    enable the strip flag so existing setups are not broken
  • Fix useMemo dependency array in useConfiguratorOutputs
  • Include ratingBlackStripEnabled in render cache seed key (v14) so
    toggling it updates the preview immediately without reshuffling
  • Guard textless artwork sources correctly
  • Add renderer tests for strip overlay behavior
  • Update README, reference view, and product context
* BUG-68 ring does not scale with badge size and age rating affected by badge scale
  
  • Accept badgeScalePercent in buildPosterCompactRingOverlay and apply it
    to the base size calculation so the ring scales proportionally with the
    posterRatingBadgeScale slider
  • Thread posterRatingBadgeScale through resolveImageRouteDisplayState and
    pass it from imageRouteExecution so the value is available at build time
  • Fix clean text poster anchor when ring is active: bottomOverlayAnchorY
    now uses the fixed bottom inset instead of bottomRowY when no bottom
    badge rows exist, preventing text from shifting as badge scale changes
  • Break coupling between posterRatingBadgeScale and quality/age rating
    badge column heights: extractedAgeRatingColumnReferenceHeight and the
    shared qualityBadgeHeight now use posterQualityRowReferenceHeight as
    their reference instead of the already scaled ratingBadgeHeight

### Documentation
* refresh static doc assets (2 commits)

### Other Changes
* refresh product context
* remove unused firebase tools and ioredis devDependencies
  
  firebase tools pulled in @apphosting/build which had a broken ts node
  sub install, producing noisy ENOENT bin warnings on every rebuild.
  Neither firebase tools nor ioredis were referenced anywhere in the
  codebase so both were removed cleanly.

## [v1.11.0] - 08/04/2026

### Added
* FR-52 power law genre badge auto scale for large and 4K outputs
  
  Add resolveGenreBadgeAutoScale using clamp(pow(linearScale, 1.15), 0.75, 5)
  so genre badges scale more aggressively than the linear overlay scale at
  large and 4K resolutions, making them visually proportional to the poster area.
  
  Wire imageRoutePreparedMedia to use the new helper for effectiveGenreBadgeScale.
  Add unit tests covering normal poster (1.0), large poster (~2.49), 4K poster
  (~4.13), 4K backdrop (~3.54), min clamp (0.75), max clamp (5), and the
  invariant that genre scale >= linear scale when scale > 1. Add integration
  test confirming 4K badge height exceeds strict proportional equivalent.
* add streaming mode for AniList thumbnail priority
  
  Add 'streaming' as a third EpisodeArtworkMode value alongside 'still' and 'series'.
  
  When thumbnailEpisodeArtwork=streaming, the AniList streamingEpisodes lookup
  runs first. If it returns a per episode thumbnail URL the request returns
  immediately with that image. If AniList returns nothing (no mapping, empty
  streamingEpisodes, unmatched episode), execution falls through to the existing
  TMDB episode still path unchanged, which in turn falls back to the series
  backdrop stack. Default behaviour (still) is completely unchanged.
  
  • Add 'streaming' to EpisodeArtworkMode union and EPISODE_ARTWORK_MODE_SET
    in lib/imageRouteConfig.ts and lib/uiConfig.ts
  • Extract fetchStreamingEpisodeThumbnail helper in imageRouteArtworkSelection.ts
    and reuse it for both the existing still fallback and the new streaming early
    path; no AniList logic duplicated
  • Fix inline type in useConfiguratorOutputs.ts which was missing 'streaming'
  • Add Streaming button to Episode Artwork selector in configurator and export panel
  • Update Episode Artwork description copy to mention Crunchyroll sourcing caveat
  • Add two unit tests: streaming mode uses AniList when available; falls through
    to TMDB still when AniList returns nothing (642 tests, 0 failures)
* add show/hide toggle for each API key field
  
  Each key input (XRDB Request, TMDB, MDBList, Fanart, SIMKL) now has an
  Eye/EyeOff toggle button positioned inside the input on the right. Keys
  default to hidden (password) and can be revealed individually. Styling
  is consistent with the existing configurator design language.

### Fixed
* BUG genre badges hidden on compact ring and ring undersized on large/4K posters
  
  • Remove compact ring from the genre badge suppression condition in
    resolveImageRouteDisplayState; only editorial presentation suppresses
    genre badges, compact ring has no reason to
  • Remove upper size clamps (116px cap on size, 30px on inset, 12px on
    ringStroke, 38px on valueFontSize) in buildPosterCompactRingOverlay so
    the proportional formulas govern at all output resolutions; normal size
    output is numerically unchanged, large and 4K now scale correctly
  • Update the display state test assertion that expected genreBadge null
    under compact ring to expect the badge present
* BUG-64 follow single safe redirect for addon resource fetches
  
  Cinemeta catalog endpoints (and potentially other addons) return HTTP 307
  redirects to a separate host. The proxy was using redirect: 'error' on all
  upstream fetches, causing 502s for any catalog or resource route that redirects.
  
  Replace all three fetch call sites with fetchWithOneRedirect, a new helper in
  lib/networkSecurity.ts that uses undici request() to get the real 3xx status
  code, validates the Location header through assertSafeSourceUrl to prevent SSRF,
  follows exactly one hop, and throws on chained redirects.
  
  Also fix a pre existing bug where genreBadge was not cleared for compact ring
  poster presentation, matching the already correct behavior for editorial. This
  was caught by a failing test during the run.
  
  Affected call sites:
  • lib/proxyRouteHandler.ts: resource fetch and manifest fetch
  • lib/proxyManifestRoute.ts: manifest fetch
  
  Tests:
  • tests/network security.test.mjs: 5 unit tests for fetchWithOneRedirect
    covering happy path, missing Location, invalid target, chained redirects
  • All 652 tests pass
* BUG-63 exclude mdblist from critics aggregate
  
  Move 'mdblist' from CRITICS_RATING_PROVIDERS to AUDIENCE_RATING_PROVIDERS.
  MDBList is a user contributed weighted aggregate, not a professional critic
  outlet, so its score was incorrectly inflating the critics average when
  aggregateRatingSource=critics or dual critic/audience presentation was used.
  
  • Remove mdblist from CRITICS_RATING_PROVIDERS
  • Add mdblist to AUDIENCE_RATING_PROVIDERS
  • Add regression tests: critics only mdblist falls back to overall; audience
    average correctly incorporates mdblist alongside imdb
* BUG-60 compact ring and network badge rendering fixes
  
  • Add && !compactRingOverlay to early return guard in imageRouteExecution.ts
    so compact ring requests reach the Sharp pipeline regardless of imageText value.
    Previously, imageText=original produced no posterTitleText/posterLogoUrl,
    causing the guard to fire and silently skip compact ring rendering entirely.
  
  • Scope genreBadge suppression to editorial presentation only in
    imageRouteDisplayState.ts. The previous condition included useCompactRingPresentation,
    which incorrectly cleared the genre badge when the ring was active. The ring
    sits top right with no spatial conflict; genre badge independence is correct.
  
  • Gate networkBadges construction on shouldRenderStreamBadges in
    imageRoutePreparedMedia.ts. TV network affiliation badges (e.g. Netflix for
    Stranger Things from media.networks) were always injected regardless of the
    posterStreamBadges=off setting. Watch provider badges were correctly gated;
    network badges now follow the same rule.
  
  • Remove dark backing <rect> and compact ring surface linearGradient from the
    compact ring SVG in posterCompactRingOverlay.ts. The ring now renders as a
    clean progress ring without a dark backing card. The inner circle fill that
    darkens the center behind the score text is intentionally preserved.
* BUG-62 stop showing series rating for episode thumbnails
  
  Replace tableExists schema check with tableHasRows row presence check for
  both imdb_ratings and imdb_episodes in imdbDatasetAvailability.ts. Both
  tables are always created at DB init so the old check was permanently true,
  disabling the early return guard and silently falling through to the series
  IMDB ID on every cold cache.
  
  Remove the series IMDB ID fallback from ensureEpisodeScopedImdbId. When
  season and episode are provided and no matching episode tconst is found in
  the dataset, return null so the IMDB rating block produces no badge rather
  than a misleading series level rating.
  
  Remove the !combinedRatings.has('imdb') guard from the IMDB dataset block.
  MDBList runs first and can set 'imdb' from the series level IMDB rating via
  its API response; that guard was silently blocking the dataset episode lookup
  from ever firing for users who have both MDBList and the IMDB dataset
  configured. The dataset result now always wins when an episode specific
  tconst is found.
  
  Add three new test cases: episode not resolved produces no IMDB badge,
  episode resolved uses episode specific tconst, and MDBList series IMDB is
  overridden when the dataset has an episode specific rating.
* BUG-61 remap consolidated TMDB anime season/episode coordinates
  
  Resolves incorrect episode lookups for anime that use accumulated/absolute
  episode numbering on animemapping.com. When a series consolidates multiple
  seasons into one TMDB season, episode numbers from TVDB aired order can
  exceed the actual episode count for that season, causing a 404 and falling
  back to the series backdrop.
  
  • Add resolveTmdbConsolidatedSeasonEpisode in imageRouteEpisodeLookup.ts:
    walks TMDB seasons accumulating episode counts to remap an absolute
    episode index to the correct season/episode pair
  • Wire tmdb_ep_order query param (tvdb|tmdb, default tmdb) through
    imageRouteRequestState, imageRouteMediaTarget, and imageRouteExecution
  • When tmdb_ep_order=tvdb, resolves through resolveTvdbEpisodeToTmdb
    before applying the consolidated season remap
  • Add three new tests in image route episode lookup.test.mjs covering
    in range passthrough, single season remap, and multi season remap
  • Add tmdb_ep_order to README param table and thumbnail quick reference
  • Add tmdb_ep_order to reference view.tsx high signal params list
  • Regenerate product context.json

### Documentation
* refresh static doc assets
* add streaming to thumbnailEpisodeArtwork allowed values and regenerate product context
  
  Update README AI param table and thumbnail quick reference to include
  the streaming option added in the streaming mode feature. Regenerate
  product context.json to reflect current config state.

## [v1.10.1] - 06/04/2026

### Fixed
* preserve user API keys on link import
  
  When importing a shared URL, the parsed config now has xrdbKey, tmdbKey,
  mdblistKey, fanartKey, and simklClientId replaced with the user's current
  values before applying. Keys the user had set are kept untouched; keys that
  were blank remain blank. All other configuration from the imported URL is
  applied as expected.
* replace effect based menu reset with render time state adjustment
  
  Close mobile menu on route change by tracking previous pathname in state
  instead of calling setState inside a useEffect body. Satisfies the
  react hooks/set state in effect lint rule. Pattern follows React's
  recommended 'adjust state while rendering' approach using useState for
  the previous value comparison.
* restore persistent status labels in brand lockup
  
  Move Live and Latest deployment status pills out of the hidden
  desktop only app bar status section and into the brand lockup name
  row, so they are always visible on all viewport widths.
  
  • Add StatusBanner component owning its own release fetch state
    (lifted from AppBar) and rendering both pills with labelless+compact
  • Restructure BrandLockup to accept a nameSlot rendered inline on
    the same row as the XRDB short name
  • Add labelless prop to DeploymentVersionPill and LatestReleasePill
    so the inline context shows only icon + version value
  • Add xrdb app chrome sticky wrapper in AppShellLayout; AppBar nav
    no longer carries sticky positioning itself
  • Add xrdb status banner and xrdb app chrome CSS; xrdb app bar brand
    kept at same height as before
  • Remove release fetch state and pill JSX from AppBar entirely

### Documentation
* refresh static doc assets

## [v1.10.0] - 06/04/2026

### Added
* FR-49 relocate shuffle button to preview panel
  
  Move the shuffle sample button from the MediaTargetSection in the
  inputs panel to the ConfiguratorCenterStage preview panel. The button
  now renders right aligned in the type selector pill row, styled
  consistently with the existing type pills.
  
  • Add onShuffleMediaTarget prop and Shuffle icon to CenterStage
  • Wire handler through centerStageProps in configuratorPageProps
  • Remove shuffle button, prop, and Shuffle import from MediaTargetSection
  • No functional change to shuffle logic or pool behavior
* diversify gallery rotation and provider mixes
  
  Add a curated README preview pool with deterministic selection, recent history tracking, and generated gallery rendering.
  Expand the live preview cards to surface broader provider combinations, compact provider captions, and varied poster, backdrop, and logo examples.
  Wire gallery syncing into doc refresh, version, and release flows, and extend focused coverage for selection, rendering, and preview URL behavior.

### Fixed
* make readme preview gallery test resilient to slug rotation
  
  The active gallery test hardcoded specific slugs from the 1.9.0 seed,
  causing CI to fail after the 1.10.0 release rotated the logo selection.
  Replace hardcoded slug spot checks with structural assertions that
  verify image type coverage and pool addressability across rotations.
* URL pattern overflow and copy button feedback
  
  • Add overflow hidden and min w 0 to URL pattern value containers
    so long URLs stay within their rounded borders
  • Add min w 0 and flex 1 to the label column so it shrinks properly
  • Replace silent clipboard write with stateful copy button that
    flashes green with a check icon for 1.5s after clicking
  • Add shrink 0 to copy buttons so they never collapse
* BUG-58 prefer language tagged Fanart.tv assets over null tagged in clean and alternative modes
  
  Fanart.tv contributors sometimes upload foreign language posters with
  blank or '00' language codes, making them appear textless to the
  selection logic. In clean mode this caused mistagged foreign posters
  to be chosen over properly tagged English artwork, resulting in
  non English poster text despite lang=en.
  
  Split the clean/textless branch in pickFanartAssetByPreference so
  clean mode now checks for language tagged assets first and prefers
  the best language match. Textless mode is unchanged and continues
  to trust null lang tags as intended.
  
  Harden alternative mode with the same language tagged filter so the
  second pick slot does not land on a mistagged null lang asset when
  language tagged alternatives exist.
* track gallery state outside data dir
  
  Move the README preview gallery state into config so clean clones and CI
  builds do not depend on ignored runtime files.
  
  Update the runtime loader, sync script, version staging, and release docs
  refresh flow to use the tracked path.

### Documentation
* refresh static doc assets
* align README, env template, and product context with current behavior
  
  • Fix XRDB_SIMKL_ID_CACHE_TTL_MS default from 30 days to 180 days and max from 30 days to 365 days
  • Add posterRatingBadgeScale, backdropRatingBadgeScale, thumbnailRatingBadgeScale, logoRatingBadgeScale to query param table and AI Integration Prompt
  • Add sideRatingsPosition, posterSideRatingsPosition, backdropSideRatingsPosition, sideRatingsOffset, posterSideRatingsOffset, backdropSideRatingsOffset to query param table and AI Integration Prompt
  • Add XRDB_FANART_API_KEY and XRDB_FANART_CLIENT_KEY to env var table and env.template
  • Add XRDB_IMDB_EPISODES_DATASET_PATH and XRDB_IMDB_EPISODES_DATASET_URL to IMDb dataset env var table
  • Regenerate product context artifact

### Other Changes
* remove 6 dead components from app bar migration
  
  Remove component files that became unreferenced after the app bar migration:
  
  • configurator workspace columns.tsx (old layout wrapper, never JSX mounted)
  • configurator export panels.tsx (only mounted inside dead workspace columns)
  • configurator support panels.tsx (only mounted inside dead workspace columns)
  • configurator page chrome.tsx (type ref only, never mounted)
  • site page outro.tsx (type ref only, never mounted)
  • site primary nav.tsx (old nav replaced by app bar, completely unreferenced)
  
  Clean up stale imports and return properties in configuratorPageProps.ts and
  useConfiguratorWorkspaceRuntime.ts. Remove dead file reads from the center
  stage sticky test. Back up all removed files to .local backup/ (gitignored).

## [v1.9.0] - 05/04/2026

### Added
* FR-45 expand age rating placement and slider defaults
  
  Extend poster age rating placement to supported top, bottom, and side anchors with layout aware validation and renderer placement rules.
  Add slider default snapping readouts, keep quality placement controls aligned when certification is isolated, and fold in the FR-45 preview dependency follow up.
  Refresh the generated configurator assets and expand the focused renderer, config, and reset group coverage for the complete FR-45 flow.
* FR-44 align rating badge scaling across artwork
  
  Raise the shared rating badge scale ceiling to 200 across poster, backdrop, thumbnail, and logo outputs while preserving type scoped settings in configurator state, config export, and request parsing.
  
  Increase the thumbnail render layout baseline so high badge scales produce larger, more legible episode thumbnail badges. Update focused regressions and public docs, and refresh the generated doc asset preview.

### Fixed
* tighten default quality badge proportions
  
  Increase the default 4K and BD Remux presence, reduce the default Digital Release width, and tighten glass streaming network badge widths.
  Keep the configurable badge sizing path unchanged while refreshing the generated demo asset and focused badge coverage.
* BUG-56 honor provider textless support
  
  • preserve Fanart poster and backdrop asset metadata for textless aware selection
  • skip Cinemeta and OMDb whenever the active artwork mode requires textless artwork
  • disable unsupported artwork sources in the configurator and align public docs
  • add focused regressions for fanart textless picks and provider fallback behavior
* BUG-57 restore quality badge controls
  
  Restore the poster quality badge placement surface in the configurator and add bulk enable and hide actions for per type quality badges.
  
  Add focused regression coverage for quality badge control resolution and poster quality badge position export behavior, and refresh the public docs capture to match the updated UI.

### Documentation
* refresh static doc assets

## [v1.8.4] - 05/04/2026

### Added
* generate XRDB product context artifact
  
  Add a source derived product context generator that writes public/product context.json for tagged releases.
  Reuse the public commit extraction logic across the commit feed and the new artifact generator, and cover the generator with a focused test.
  Wire generation into the npm version lifecycle so released tags include the product context snapshot consumed by XRDBBot.

### Fixed
* default doc refresh away from Turbopack
  
  Make the docs capture workflow opt in to Turbopack instead of opt out.
  This keeps screenshot generation and release automation on the stable
  next dev path by default, which matches the successful release flow and
  avoids the capture route manifest failures seen under Turbopack.
  
  Validation:
  • nocorrect npm run lint
  • nocorrect npm run test
  • nocorrect npm run build

### Documentation
* refresh static doc assets

## [v1.8.3] - 05/04/2026

### Fixed
* add timeout to playwright screenshot CLI to prevent infinite selector wait
  
  Without timeout, playwright's wait for selector uses timeout:0 (infinite).
  A Turbopack cache corruption causing a 500 on the workspace route meant the
  selector never appeared, resulting in an indefinite hang.
  
  Set timeout to captureCommandTimeoutMs so the CLI respects the same bound
  as the runCommand process level timeout.
* BUG-55 make setup intro navigable on constrained mobile viewports
  
  Outer overlay and modal card now use tighter mobile padding (px 3 py 3 on mobile,
  sm:px 4 sm:py 6 on wider breakpoints) so the card is not clipped by the overlay
  padding on small screens.
  
  Modal container switches from a single padded block to a flex column with an
  explicit max h bound relative to 100dvh (1.5rem gap on mobile, 3rem on sm+).
  The body region uses min h 0 flex 1 overflow y auto to provide internal scrolling
  when content exceeds available height. The Continue action footer is a shrink 0
  element outside the scroll region so it remains reachable regardless of scroll
  position.
  
  Resolves the reported behaviour where users had to zoom out in mobile browsers
  to reveal the Continue button. Mode selection and first visit vs return visit
  semantics are unchanged. 603/603 tests pass, production build clean.

### Documentation
* refresh static doc assets

### Other Changes
* add playwright as dev dependency for doc capture screenshots
  
  The release script uses npx yes playwright screenshot to generate static
  doc assets. Without playwright installed locally this caused npx to attempt
  an on demand download which hung indefinitely. Installing playwright as an
  explicit devDependency ensures the binary and Chromium are resolved from the
  local node_modules cache and the doc asset capture step completes reliably.

## [v1.8.2] - 05/04/2026

### Fixed
* BUG-54 restore scroll containment export text mapping and ring rendering
  
  Isolate configurator side rail scrolling from page scroll and stabilize setup mode background layering in setup mode UI.
  
  Normalize AIOMetadata export query generation to emit canonical imageText values and preserve legacy imageText aliases in request parsing.
  
  Harden compact ring presentation behavior by allowing fallback when configured value/progress providers are partially unavailable and add compact ring alias normalization.
  
  Add targeted regression coverage and update refreshed documentation capture assets.

### Documentation
* refresh static doc assets

## [v1.8.1] - 05/04/2026

### Fixed
* thumbnail preview input editability and title preservation
  
  • Switch season/episode inputs from type=number to type=text with
    inputMode=numeric so backspace works on mobile browsers
  • Add local state for season/episode fields to allow free clearing
    and retyping without controlled value snap back
  • Add dedicated onThumbnailEpisodeChange handler that updates the
    media ID without clearing the resolved series title
  • Remove setActivePreviewTitle clear from the previewType change
    effect so title persists across poster/thumbnail switches
  • Fix TMDB episode resolve ID extraction to use base series ID
    (e.g. tmdb:tv:85937) instead of full episode string
  • Remove redundant Series ID field from the thumbnail detail panel
    since series identity is already shown in the unified search field
  • Update thumbnail panel grid to two column layout for season/episode
* harden native dependency preflight and remediation
  
  Add deterministic better sqlite3 remediation with rebuild then install fallback and explicit failure guidance.
  
  Run native preflight at refresh and release entrypoints, expand native dependency tests, and document behavior in README.

### Documentation
* refresh static doc assets

## [v1.8.0] - 05/04/2026

### Added
* streamline workspace and experience mode UX
* FR-42 BUG-52 BUG-53 refine media target controls
* add custom Discord widget popover with polished card
  
  Replace iframe based Discord widget with a custom card using the
  Discord widget JSON API via a local proxy route to avoid CORS.
  
  Card features:
  • Banner image with gradient fade into card background
  • Animated GIF server avatar with blurple glow ring and online dot
  • Live member list sorted by status, bots filtered out
  • Join button with breathing glow animation
  • Skeleton loading state matching card layout
  • Polished error state with muted banner and avatar
  • Live online count badge on the nav pill
  • Popover scale and fade open/close animation
  • Click outside and Escape key dismiss
  
  Includes /api/discord widget proxy route with 120s cache.
  Avatar GIF optimized from 9.8MB to 207KB (96x96 resize).

### Fixed
* use Next Image for Discord widget avatars
  
  Replace plain img tags in the Discord widget card with Next Image and allow Discord CDN hosts in the shared Next image config.
  
  This keeps the widget aligned with Next lint rules and avoids leaving standalone image warnings in the site chrome.
* align refresh outputs with routed workspace ui
  
  Route capture URLs to real workspace paths and expose docs capture readiness on addon.
  
  Auto open metadata translation panel during docs capture and retune screenshot crop regions for configurator and proxy assets.

### Documentation
* refresh static doc assets

### Other Changes
* fix sample title test block closure

## [v1.7.1] - 05/04/2026

### Fixed
* remove duplicate ConfiguratorTopNav from configurator page
  
  The workspace redesign (5d4a682) added AppBar via AppShellLayout as the
  sole navigation bar, but a subsequent fix (79bfb55) re inlined the full
  old page content into configurator page.tsx to wire docsCaptureReady,
  which brought back ConfiguratorTopNav. This caused two nav bars to stack
  on screen.
  
  Restore the thin ConfigureView wrapper from the redesign while keeping
  docsCaptureReady and pageRef on the .xrdb page div. Remove topNavProps
  from the props builder and runtime. Point navRef at .xrdb app bar via
  DOM query so scroll offset calculations still target the AppBar.

### Documentation
* refresh static doc assets

## [v1.7.0] - 04/04/2026

### Added
* FR-41 add rating value text color parameters
  
  Add three new URL parameters for configuring rating value text color:
  • aggregateValueColor: global fallback for all badge value text
  • aggregateCriticsValueColor: critics source override
  • aggregateAudienceValueColor: audience source override
  
  Follows the same resolution chain as accent colors (critics override >
  audience override > global fallback > default white). Applied across
  all badge styles (standard, minimal, average, dual, blockbuster) and
  both aggregate and per provider badge paths.
  
  Includes configurator UI color pickers in the appearance section,
  URL serialization in the preview/output URLs, cache key integration,
  and README parameter documentation.
* FR-35 add textless artwork text preference
  
  Add 'textless' as a first class poster and backdrop text preference
  that selects TMDB artwork without embedded text (iso_639_1: null)
  and renders it bare with rating badges but without the branding
  overlay that 'clean' mode adds.
  
  • Add 'textless' to PosterTextPreference union in imageRouteConfig
  • Add 'textless' to UI validation sets and configurator options
  • Update selection algorithms to share clean/textless null language branch
  • Accept 'textless' in imageText URL parameter parsing
  • Update configurator option descriptions to clarify overlay behavior
  • Update README parameter tables with textless value
  • Add 5 tests covering selection, fallback, and overlay suppression
* FR-30 add per provider value offset for glass and square badges
  
  Add valueOffsetX and valueOffsetY fields to RatingProviderAppearanceOverride
  for per provider numeric value text positioning within glass and square
  horizontal badge styles. Range is ±24px, matching stacked element offsets,
  with clamping to badge bounds across standard, minimal, and summary variants.
  
  Wire parsing with backward compatible aliases (valueX, scoreOffsetX, etc.),
  serialization that omits default zero values, and configurator UI with
  Value Position sliders per provider.
  
  Rename confusing configurator labels: Pill Stack Offset to Pill Badge
  Position, Square Stack Offset to Square Badge Position.
  
  Includes 10 new unit tests covering parse, clamp, serialization round trip,
  SVG offset application across all variant paths, and plain style exclusion.
* FR-40 add pinned preview targets and expanded shuffle defaults
  
  Expand default media sample IDs from 3 to 4 to 10 per type with anime
  and TV coverage. Add per type pinned targets with localStorage
  persistence (max 8 per type). Merge pinned targets into the unified
  shuffle pool with deduplication. Add pin affordances on search results
  and current preview. Add horizontally scrollable chip row showing
  pinned targets. Add inline type switch banner prompt with Keep and
  Start fresh options and 5 second auto dismiss.
* BUG-49 add full TMDB genre coverage and catchall fallback
  
  Add dedicated badge families for all previously unmapped TMDB genres:
  music, reality, family, history, kids, news, soap, talk, tvmovie, and
  warpolitics. Each gets a unique SVG icon, accent color, label, and
  TMDB ID/name matching in the resolution cascade.
  
  Add a catchall 'other' family at the end of the cascade so
  resolveGenreBadgeFamily never returns null when genres are present.
  This eliminates the class of bug where new or niche genres render
  without any badge.
  
  Expand GenreBadgeFamilyId union (11 to 22 values), GENRE_BADGE_FAMILY_META,
  TMDB_GENRE const, buildGenreBadgeIconMarkup, EDITORIAL_GENRE_LABEL_BY_FAMILY,
  and GENRE_BADGE_PREVIEW_SAMPLES. Add explicit documentary icon branch to
  preserve its existing film camera icon after changing the default fallback.
  
  Add test cases for name resolution, TMDB ID resolution, catchall behavior,
  empty genre handling, and priority preservation of existing families.
  Update README genre badge documentation.
* BUG-51 add composite BD Remux badge with remux display mode
  
  Add bdremux as a new quality badge that combines Blu ray and Remux into
  a single composite badge. Users can choose between composite (BD Remux)
  and separate (Bluray + Remux) display modes per media type via the
  configurator UI.
  
  Rewrites buildMediaFeatureBadgesFromFlags to accept remuxDisplayMode
  parameter. Composite mode emits a single bdremux badge. Separate mode
  preserves the original bluray and remux as individual badges.
  
  Adds full 5 style mode parity (glass/square/plain/media/silver) via
  the existing asset backed badge pipeline. Threads remuxDisplayMode
  through all image routes, configurator settings, workspace state,
  config IO, link import/export, and URL query serialization.
  
  Includes Remux Display selector in the quality badge customization
  section with BD Remux and Show Both options.
* restore Discord links across workspace UI
  
  Add XRDB Community Discord pill to the AppBar desktop status area
  and mobile overflow menu. Add Discord pill to SitePrimaryNav desktop
  and mobile drawer for when it is re enabled.
  
  Add a Community and support section to the Reference view with both
  Discord server links (XRDB Community and AIOMetadata in AIOStreams),
  a direct DM fallback link, GitHub repo link, and Ko fi support pill.
* add multi view workspace layout with dedicated Proxy tab
  
  Restructure the configurator into a tabbed workspace with four views:
  Configure, Export, Proxy, and Reference. Each view gets its own route
  under the (workspace) route group sharing ConfiguratorProvider state.
  
  • Add app bar with horizontal view tabs and bottom tab bar for mobile
  • Create app shell layout as the shared chrome wrapper
  • Extract configure view, export view, proxy view, and reference view
  • Move proxy controls from support panels accordion to standalone /addon
    route with full two panel layout and progressive disclosure
  • Remove experience mode gating from proxy metadata and catalog sections
  • Add (workspace) route group with shared layout for /, /export, /addon
  • Add /reference route outside workspace group
  • Update site chrome, configurator page, and styles for new shell
  • Remove old /configurator, /docs, and / page routes
  • All proxy state still wired through useConfiguratorContext

### Fixed
* wire docsCaptureReady attribute and inline configurator page
  
  The configurator page component was a thin ConfigureView wrapper that
  never set data docs capture ready on the .xrdb page div. Playwright
  waited forever for that attribute during doc asset refresh, causing a
  5 minute timeout that blocked every release.
  
  Inline the full workspace runtime into the page component and bind
  docsCaptureReady from context to the data attribute so the capture
  script can detect when the page is ready.
* correct workspace capture URL for route group
  
  The configurator page lives at app/(workspace)/page.tsx which maps
  to the root route /, not /configurator. The route group wrapper does
  not create a URL segment. The stale /configurator path caused a 404
  during doc asset refresh, making the preview viewport capture time
  out and blocking releases.
* BUG-50 fix badge text clipping and anime episode thumbnail fallback
  
  Badge clipping: add 14% bold weight compensation to estimateQualityTextBadgeWidth
  for font weight 800 text badges (glass, square, plain styles). Localized to the
  quality badge path only, not the shared estimateGeneratedLogoLineWidth function.
  Digital Release width increases from 171px to 190px at height 44.
  
  Anime thumbnails: add three tier fallback chain after the primary TMDB episode
  still query fails:
  • TMDB /images endpoint for untagged stills
  • Null language TMDB episode retry
  • AniList streaming episode thumbnails via reverse mapping (TMDB -> AniList ID)
    with title regex matching and index based fallback
  
  AniList integration uses fetchJsonCached with KITSU_CACHE_TTL_MS and the existing
  anime reverse mapping service. ArtworkFetchJson type extended with optional
  RequestInit for GraphQL POST support.
  
  Tests: 563 pass, 0 fail. 14 artwork selection tests, 11 quality badge tests.
* BUG-48 scale poster edge inset with overlay auto scale
  
  Move posterEdgeInset computation from imageRouteRenderer into
  imageRouteRenderLayout where all other spatial layout values are scaled.
  The composed inset (POSTER_EDGE_INSET_BASE + posterEdgeOffset) is now
  multiplied by overlayAutoScale with a 12px minimum floor, matching the
  existing pattern used by backdropEdgeInset, badgeTopOffset,
  badgeBottomOffset, and posterRowHorizontalInset.
  
  Adds posterEdgeOffset to the layout input interface and posterEdgeInset
  to the layout result type. The renderer now consumes the pre scaled
  value instead of computing it inline as an absolute pixel sum.
  
  Adds test cases verifying proportional scaling across normal, large,
  and 4k quality levels and the 12px minimum floor.
* BUG-45 scope stack offsets and release status badges
  
  BUG-45 completes the stack offset split for poster, backdrop, and thumbnail renders while keeping legacy shared values as a logo and import fallback.
  
  The configurator now reads and writes active preview offsets per type, generated preview URLs and AIOMetadata exports stay type scoped, and request parsing prefers typed params before legacy shared ones.
  
  The quality badge path now preserves intrinsic widths for text badges like Digital Release and In Cinemas in glass, square, and plain styles, with regression coverage for request parsing, export serialization, prepared media, badge rendering, placement, and proxy rewrites.
* update page lint regression test to correct page path
  
  The root page moved to app/(workspace)/page.tsx but the test still
  referenced app/page.tsx, causing ESLint to fail with 'no files found'.

### Documentation
* refresh static doc assets

### Other Changes
* FR-41 add value color fields to round trip assertion
  
  Add aggregateValueColor, aggregateCriticsValueColor, and
  aggregateAudienceValueColor to the expected serialization output
  in the workspace round trip test.
* auto refresh doc assets before release
  
  Add a pre release step to scripts/release.mjs that runs the full doc
  static asset refresh when a TMDB key is available. If the refresh produces
  changes to README.md or docs/images, they are staged and committed
  automatically before the version bump. Skips with a warning when the key
  is not configured.
* auto update README capture date in refresh script
  
  Add logic at the end of refresh doc static assets.mjs to read README.md,
  find the screenshot capture date line using a regex pattern, and replace the
  date with the current CAPTURE_DATE value. Logs a warning if the pattern is
  not found.
  
  Part of public facing freshness rules OpenSpec change.
* remove code comments from quality badge layout tests

## [v1.6.0] - 04/04/2026

### Added
* add Media ID search poster previews
  
  Show mini poster previews in Media ID search results so similarly named titles can be distinguished before selection.
  
  Start debounced search from the first typed character, keep the results list scrollable, and extend search mapping tests to cover poster URLs from TMDB and OMDb.

### Fixed
* theme language dropdown and keep English default
  
  Replace the native language select with a compact themed dropdown that matches the configurator styling more closely.
  
  Preserve base language entries when TMDB returns regional variants so the default language stays plain English instead of resolving to a region specific option.
* replace sticky rails with scroll wells
  
  Move the configurator workspace to independent left and right rail scroll regions so the center preview stays in place while the side columns can be scanned without sticky preview controls.
  
  Remove the sticky preview toggle and related sticky rail wiring. Teach hash navigation to scroll the relevant workspace rail when a target lives inside a desktop scroll region.
  
  Refresh the regression coverage for the new scroll region behavior.
* restore XRDB and AIOMetadata Discord links
  
  Restore separate Discord brand links for the official XRDB community and the AIOMetadata support channel in AIOStreams.
  
  Update the configurator callout and footer to surface both destinations with corrected labels and titles.
  
  Refresh env template defaults so new deployments inherit the correct invite URLs and branding copy.

### Other Changes
* align language dropdown assertions with new selector
  
  Update the TMDB language options test to expect plain English alongside regional variants so the default language behavior matches the configurator change.
  
  Replace the old native select source assertion with checks that match the themed dropdown rendering without appending locale codes.

## [v1.5.0] - 03/04/2026

### Added
* add share link import and remove invalid discord link
  
  Add workspace import link parsing so shared XRDB URLs can apply configurator settings and media target context.
  
  Add parser coverage tests and wire the new action into workspace management controls.
  
  Remove XRDB AIOStreams Discord  from hero/footer UI and brand env template defaults, keeping official XRDB Discord only and adding AIOMetadata discord

## [v1.4.2] - 03/04/2026

### Fixed
* BUG-44 FR-22 restore sticky rail and black ratings strip
  
  Remove relative positioning classes from sticky rail wrappers so preview and showcase sticky mode can pin correctly again on desktop.
  
  Rework blackbar handling to keep normal artwork selection and render a black strip behind rating rows instead of replacing the full image with a solid black source.
  
  Wire black strip mode through request state and renderer inputs, update artwork option copy, and adjust render seed artwork tokens for blackbar cache busting.
  
  Add targeted regressions for sticky wrapper classes, black strip rendering, request state black strip activation, artwork selection fallback behavior, and render seed changes.

## [v1.4.1] - 03/04/2026

### Fixed
* BUG-47 make shuffle sample update live preview targets
  
  Adds deterministic sample target selection that avoids returning the currently selected media target when alternatives exist.
  
  Updates poster sample IDs to unique titles so shuffle no longer appears stuck on Matrix aliases.
  
  Keeps shuffle interactions aligned with active search state and adds regression tests for non repeat behavior.
* BUG-46 restore media title lookup and live search dropdown
  
  Fixes the media search request path regression by preserving the TMDB /3 route in the configurator search API.
  
  Adds TMDB first lookup with OMDb backed IMDb fallback when TMDB returns no mapped results and keeps TMDB auth failures explicit.
  
  Replaces button based submit UX with debounced typeahead behavior and dropdown results while preserving Enter to search support.
  
  Extends media search utility coverage with regression tests for URL building, TMDB mapping, and IMDb fallback mapping.

## [v1.4.0] - 03/04/2026

### Added
* FR-32 show localized language names without locale codes
  
  Update the configurator language selector to display the full localized language label directly instead of appending the raw locale code in each option.
  
  Regional variants remain available through existing locale aware language option generation so entries such as English (United Kingdom) and Español (Spain) stay visible.
  
  Validation: pnpm run lint && pnpm run build.
* FR-20 add thumbnail episode target controls
  
  Add dedicated thumbnail preview target inputs in Configurator Essentials for series ID, season, and episode so episode URLs are composed from explicit fields instead of manual freeform strings.
  
  Introduce shared episode preview target parsing and building helpers that support typed IDs such as tmdb:tv:id and tvdb:id, plus kitsu shorthand inputs.
  
  Reuse the shared parser in preview URL generation and keep season/episode values stable when a thumbnail media search result switches to a new series.
  
  Document the episode thumbnail capability matrix and parsing behavior in README and extend episode identity tests for parser and builder coverage.
* FR-26 increase thumbnail rating badge scale range
  
  Add a thumbnail specific rating badge scale normalizer capped at 200 while preserving the existing 150 cap for poster, backdrop, and logo rating badge scale values.
  
  Wire the thumbnail scale normalizer through saved config normalization and image request state parsing, and update the Look panel rating badge slider to use the higher cap only for thumbnail previews.
  
  Extend tests for badge scale normalization, request state parsing, and config serialization to cover larger thumbnail rating badge scale values.
* FR-25 add no background badge text outline controls
  
  Wire posterNoBackgroundBadgeOutlineColor and posterNoBackgroundBadgeOutlineWidth across shared settings, proxy/query schema, request state parsing, render seed, and configurator workspace runtime.
  
  Apply outline stroke rendering for plain genre badges and plain quality/network badge text, and expose poster only configurator controls for outline color and width.
  
  Add regression coverage for normalization, config serialization, request parsing, render seed scoping, and SVG output behavior.
* FR-15 add per type glass genre badge border width controls
  
  Add new per type genre badge border width settings for poster, backdrop, thumbnail, and logo surfaces.
  
  Wire the new controls through configurator state, saved config normalization/serialization, proxy schema allowlists, and URL output generation.
  
  Apply border width in glass genre badge rendering, include it in request parsing and render seed inputs for cache correctness, and add regression coverage for normalization, rendering, and config round trips.
* FR-12 improve provider icon rendering quality
  
  • request higher resolution provider icon sources for rating providers and TMDB network logos
  
  • increase provider icon rasterization output size and resize quality for cleaner scaling
  
  • bump provider icon and final render cache versions to invalidate stale low resolution output
  
  • update and extend tests for provider icon processing and URL/cache key expectations
* FR-11 add dynamic aggregate accent stop mapping
  
  Add a dynamic aggregate accent mode with configurable threshold color stops and normalization helpers.
  
  Wire dynamic stops through configurator state, config import/export, query generation, proxy schema, request parsing, display state resolution, and render seed scoping.
  
  Extend aggregate badge and compact ring accent resolution to map score percent to dynamic stop colors.
  
  Add regression coverage for dynamic stop parsing, request state normalization, display state accents, seed scoping, and UI config payload behavior.
* FR-10 add TMDB random poster quality filters
  
  Introduce random poster filter controls for TMDB selection across request parsing, config schema, and configurator state.
  
  Add deterministic filtered random selection with explicit fallback modes, and include filter settings in render seed generation.
  
  Expose poster random filter controls in the configurator UI and persist them through config import/export and preview URLs.
  
  Add request state, selection, and config tests covering filter parsing, candidate filtering, and fallback behavior.
* FR-4 add backdrop image sizing controls and render support
  
  Add backdropImageSize (normal|large|4k) across route parsing, config schema, seed generation, and render dimensions.
  
  Wire backdrop size through configurator workspace state, config import/export, preview URL generation, and UI controls in Look and Quick Tune sections.
  
  Expand tests for ui config normalization/payload behavior, render seed scoping, and prepared media dimension selection.
* FR-14 add proxy media type selection and gating
  
  Add proxyTypes to saved configurator state, proxy payload encoding, and proxy query decoding schema so manifests can target movie, series, or anime media types.
  
  Wire the configurator proxy panel with media type toggles and persist selections through workspace import export flows.
  
  Gate proxy artwork rewrites and metadata translation by selected media types, including anime classification via anime native ID prefixes.
  
  Add runtime and config regression tests for proxyTypes normalization, payload output, and rewrite behavior.
* FR-32 show full language names in selector
  
  Render full language labels in the configurator language dropdown instead of ISO codes alone.
  
  Keep the ISO code in parentheses for compatibility and quick reference, and widen the control so labels remain readable.
* FR-5 add imdb artwork source alias and ui labels
  
  Accept imdb as an artwork source alias and normalize it to the existing cinemeta pipeline across route parsing and workspace config normalization.
  
  Update configurator artwork source labels and descriptions to expose IMDb wording directly while preserving compatibility with existing cinemeta values.
* FR-22 add black bar artwork source option
  
  Add a new blackbar artwork source to config normalization and configurator options for poster, backdrop, thumbnail, and logo flows.
  
  Render blackbar selections using an inline solid black image source in artwork selection so existing overlay and badge pipelines continue to work without layout regressions.
* FR-29 add preview title search by name
  
  Add a TMDB backed media search endpoint and wire search controls into Media Target so users can resolve movie and series names into typed TMDB IDs.
  
  Support thumbnail specific filtering to series results, expose selectable search results, show the active preview title, and add a shuffle sample action for faster preview iteration.
* FR-23 raise quality badge scale limit to 200
  
  Split quality badge scaling normalization from rating badge scaling so quality badges can scale up to 200 percent while rating badges remain capped at 150.
  
  Update configurator quality badge slider max, UI config normalization, request state parsing, and add regression coverage for quality scale clamping.

### Fixed
* FR-16 FR-32 expose compact ring selection and locale label coverage
  
  • include compact ring in the presentation section ordering so it appears in configurator presentation controls
  
  • include compact ring in simple mode presentation choices used by workspace summary and quick tune paths
  
  • add regression tests for ring visibility in both lists
  
  • expand language option tests to assert regional localized labels and ensure selector renders labels without appended ISO codes
* FR-2 keep sticky preview above showcase samples
  
  Raise the sticky preview rail layer in showcase, preview, and guide center views so floating preview content remains above the samples column while scrolling.
  
  Lower the samples column layer in showcase mode to avoid stacking context overlap with the sticky preview frame.
  
  Validation: pnpm run lint && pnpm run build.
* FR-2 keep sticky preview above sample content
  
  Apply a dedicated sticky preview class and desktop stacking rules so the center preview stays above adjacent showcase/sample surfaces while scrolling.
  
  Use a local stacking context for the preview section and raise the sticky rail z index without changing mobile behavior.

### Documentation
* FR-23 document and lock quality badge scale max at 200
  
  Document poster, backdrop, thumbnail, and logo quality badge scale query parameters with the shipped 70 to 200 range in README.
  
  Extend the slider regression test to lock MAX_QUALITY_BADGE_SCALE_PERCENT at 200 and verify the configurator quality badge slider uses that max constant.
  
  Validation: node experimental strip types test tests/genre badge slider range.test.mjs && pnpm run lint && pnpm run build.
* FR-9 align genre badge slider range with 200 percent max
  
  Update README query parameter reference so genre badge scale ranges reflect the shipped 70 to 200 limits across global and per type controls.
  
  Add a regression test that locks MAX_GENRE_BADGE_SCALE_PERCENT at 200 and verifies the configurator genre badge slider is wired to that max constant.
  
  Validation: node experimental strip types test tests/genre badge slider range.test.mjs && pnpm run lint && pnpm run build.

## [v1.3.0] - 03/04/2026

### Added
* FR-30 add stacked rating XY offsets for pill glass and square
  
  Add style scoped stacked rating position controls for pill glass and square presentation modes across configurator state, URL params, proxy schema, and request parsing.
  
  Apply the resolved offsets in image rendering with canvas bounds clamping, include active offsets in render seed generation for cache correctness, and keep exports lean by emitting only active non default style offsets.
  
  Update README parameter docs and add test coverage for normalization, proxy passthrough, request state resolution, and render seed behavior.
* add prominent XRDB ID and route guide
  
  Add a large reference block to the media target section so users can
  see accepted base ID families, current preview input shape, route
  examples, strict TMDB rules, and thumbnail specific episode formats
  without leaving the essentials flow.
  
  Include concrete examples for poster, backdrop, logo, and thumbnail
  workflows plus the most important scoped query params that affect
  preview and export behavior.
* FR-13 add movie release status badge
  
  Introduce an opt in release status quality badge that resolves movie theatrical and digital release state from TMDB release dates and feeds it through the existing prepared media badge flow.
  
  Add configurator badge support and regression tests covering digital and in cinemas transitions.
* FR-28 render streaming service badges with provider logos
  
  Extend stream and network badge metadata to carry TMDB logo paths, resolve those icons during rendering, and render supported streaming badges with logo plates instead of text only badges.
  
  Cover the new behavior with quality badge and media feature regressions for watch providers and TV networks.
* FR-16 add compact ring rating presentation
  
  Add a poster only compact ring presentation with configurable center and progress sources, genre or custom accent handling, and render seed support.
  
  Wire the configurator, saved workspace config, request parsing, display state, renderer overlays, and regression coverage for the new presentation mode.

### Fixed
* BUG-43 preserve stacked badge scale in side layouts
  
  Reorders poster side layout fitting so width fitting and auto max per side capping happen before height fitting. This keeps the rating badge scale control effective for dense stacked layouts instead of collapsing back to near identical badge sizes.
  
  Adds a regression test covering dense left right stacked poster layouts to confirm higher badge scale increases effective badge size and reduces auto fit badge count when max per side is automatic.
* BUG-44 restore sticky preview rail
  
  Allow the configurator preview panel to use visible overflow on desktop breakpoints so the center sticky rail can pin correctly while scrolling.
  
  Keep the change scoped to #workspace preview so the shared panel shell behavior stays unchanged elsewhere.
  
  Verified with pnpm build and desktop Chrome sticky rail measurements.
* restore clean production build
  
  Narrow the streaming provider badge resolver to the streaming badge key
  union so provider matching type checks correctly during Next build.
  
  Restore the missing poster compact ring setters in configurator
  workspace runtime wiring and remove the duplicated setter entries so
  workspace config IO compiles cleanly again.
* BUG-42 add thumbnail safe inset for badge overlays
  
  Increase thumbnail backdrop badge top and bottom spacing and apply a
  larger horizontal edge inset to right side ratings and backdrop
  quality badge columns so Stremio preview crops do not clip the badge
  frame.
  
  Pass the thumbnail request state through render layout resolution and
  add regression coverage for the thumbnail safe inset and backdrop
  quality badge clamp behavior.
* BUG-41 center square genre badge cap
  
  Adjust square genre badge rendering so the top cap line centers over the label block instead of the full badge width when text is present.
  
  Add a regression test covering the square cap alignment for text badges.
* show recent changes commit bodies
  
  Preserve normalized git commit bodies in the generated recent changes feed instead of dropping them during commits JSON generation.
  
  Render commit body text in the Recent Changes dialog only when a body is present so short release entries stay compact while detailed fixes expose their full context.
  
  Verified with node experimental strip types test tests/commit display utils.test.mjs and npx eslint components/site chrome.tsx scripts/generate commits json.mjs.

### Documentation
* FR-31 expand XRDB guide feature explanations
  
  Add a dedicated XRDB feature explanations section to the docs page.
  
  Document ID format behavior, Poster ID source impact, artwork source selection, and presentation mode guidance.
  
  Clarify per type provider ordering, thumbnail default ratings, metadata translation defaults, proxy route forms, BYOK flow, AIOMetadata exports, and type scoped controls.

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

