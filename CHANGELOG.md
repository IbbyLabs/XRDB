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

