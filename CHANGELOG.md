# Changelog

> [!NOTE]
> This changelog may contain duplicate entries for certain changes. This occurs when an upstream commit is followed by a corresponding conventional commit used for release management and repository standards.

## Unreleased

### Added

### Fixed

### Documentation

<a id="v2-1-0"></a>

## [v2.1.0] - 20/05/2026

### Added
* BUG-151 restore compact aggregate controls across all artwork types
  
  • Restore the missing Compact Average customization controls after the presentation rewrite.
  • Bring poster, backdrop, thumbnail, and logo back to consistent behavior for aggregate controls.
  • Re enable Dynamic stops editing directly in Style so custom score color ramps can be tuned again.
  • Re enable Accent bar visibility and offset controls for compact aggregate presentations.
  • Keep behavior aligned with existing rendering and URL export logic by wiring only the missing UI controls.

### Fixed
* reduce client server hydration mismatch noise on search input
  
  add hydration warning suppression for dynamic preview target search input
  keep SSR output stable while allowing client only input attributes to differ safely
* BUG-150 and BUG-154 finalize pin layout readability and not found log visibility
  
  make pinned target cards wrap cleanly and remain readable at dense counts
  preserve distinct card boundaries across workspace routes
  add handler level warn logging for HttpError responses so not found failures stay visible across log level modes

### Documentation
* refresh static doc assets


## [v2.0.0] - 19/05/2026

### Added
* add optional uid remap and simplify env template
  
  Add optional container uid/gid remap support so self hosted Docker setups can
  align runtime permissions with host mounted data directories without changing
  default behavior.
  
  Simplify env.template by removing stack level and optional advanced variables
  that are not required in the local deployment template:
  • removed DOCKER_DATA_DIR
  • removed DOCKER_NETWORK
  • removed DOCKER_NETWORK_EXTERNAL
  • removed PUID
  • removed PGID
  
  Also add concise troubleshooting guidance for permission mismatch scenarios in
  self host docs and keep canonical advanced variable references in variables.md.
* Replace inactive config hard deletion with soft marking
  
  Replace hard deletion of inactive saved configurations with a visible marking system.
  After N days of inactivity, configurations are now marked as inactive and removed from
  active user metrics, but preserved for returning users. Optional hard deletion can be
  enabled via XRDB_INACTIVE_CONFIG_PURGE_DAYS for eventual cleanup after a much longer
  grace period.
  
  Changes:
  • Database: Added is_inactive and inactive_marked_at columns to track marked state
  • Admin metrics: Split active/inactive/pending purge counts; active user metric now
    excludes marked inactive configs (same accuracy, non destructive)
  • Admin dashboard: Added Activity filter for browsing active/inactive configs; showed
    "Inactive" badge on marked profiles; display separate inactive count in metrics panel
  • Environment: XRDB_INACTIVE_CONFIG_PRUNE_DAYS now marks instead of deletes; added
    XRDB_INACTIVE_CONFIG_PURGE_DAYS (optional, default disabled) for eventual deletion
    after much longer threshold
* add customizable trending tag styles and safe poster placement
* FR-98 add trending and recognition quality tags
  
  Adds new quality badge options for trending, ranking, and awards signals.
  
  Keeps tag controls aligned with existing per type badge preferences and appearance overrides.
  
  Includes validation coverage so generated artwork surfaces stable tag output.
* add signed partner access controls
  
  • Adds server to server partner request signing with replay protection and nonce checks.
  
  • Enforces per partner rate limits so shared single IP traffic is isolated and controlled.
  
  • Preserves existing request key authorization as fallback while adding partner profile support and documentation.
* README docs and add cache optimization foundation
  
  **Documentation & Preview Improvements**
  • Add "Badge Styles" live preview section to README showcasing community badge (gold/rainbow) and tile badge variants across poster and backdrop types
  • Add static "Badge Style Options" comparison board reference in Rendering Option Comparisons section with full artwork examples
  • Expand README preview pool from 3 default entries to 7 with new badge style variants: community badge gold poster, community badge rainbow poster, tile badges poster, tile badges backdrop
  • Wire badgeStyleComparison path into doc static asset manifest for tracked asset generation
  • Implement 4th comparison board generation in refresh doc static assets script with correct board layout (4 card badge comparison)
  • Test coverage: all 1086 tests pass, lint clean, build succeeds
  
  **User Facing Copy Standardisation**
  • Standardise all user facing text to British English spelling by default
  • Convert color → colour, customize → customise, behavior → behaviour, center/centre, centered/centred across UI components
  • Apply to nav bar, theme page content, backdrop panels, poster panels, thumbnail panels, logo panels, proxy view, step shell, reference view, and community templates
  • This is now a hard rule for all future UI and copy work; internal code comments and variable names remain American English for codebase consistency
  
  **Cache & Performance Foundation**
  • Add 30 second write level debounce to image cache pruning (IMAGE_CACHE_PRUNE_WRITE_DEBOUNCE_MS constant)
  • Add 30 second write level debounce to metadata cache pruning (METADATA_PRUNE_WRITE_DEBOUNCE_MS constant)
  • Remove 5% and 2% random sampling from prune paths; both pruneObjectStorageCache and pruneExpiredMetadata/pruneOldestMetadata now run unconditionally after debounce window elapses
  • Pruning operations maintain 10 minute interval timer and on read expiry deletion; debounce only applies to write path frequency
  • Technical impact: prevents sustained CPU spikes and frequent FS scans during cache fill and warmup bursts by batching pruning operations
  • Add regression tests in storage runtime.test.mjs for byte budget and file count eviction, plus automatic oldest entry and expired entry cleanup
  • Test coverage: 1086 tests pass (including 2 new cache pruning regression tests)
* FR-54 add Filmweb provider support
  
  • Adds Filmweb as an available rating source so Polish audience scores can appear alongside existing providers
  • Uses Filmweb's own hosted icon so provider badges match the real service branding
  • Improves title matching and score handling so Filmweb results stay consistent across lookup, display, and fallback flows
  • Adds regression coverage to keep Filmweb fetch, parsing, formatting, and icon behavior working locally
* add scorebar rating display mode
  
  • Ratings can now be displayed as a colour bar beneath the poster
    instead of a floating badge, giving more space for the score visual.
  • Three bar styles are available: solid fill, gradient blend, and a
    progress bar fill that grows with the rating value.
  • The bar colour changes automatically across three configurable bands,
    so low, mid, and high scores each show a distinct colour.
  • All six scorebar settings (style, three colours, two thresholds) are
    included in shareable config links and round trip correctly through
    save and restore flows.
  • Default values are omitted from config links to keep URLs short.
  • Scorebar controls appear in the configurator only when the scorebar
    presentation is selected, keeping the UI uncluttered for other modes.
* improve site title, description, and social preview metadata
  
  • Rewrite site title to "XRDB | Artwork Engine for Stremio" to replace
    the triple stacked brand name that appeared in browser tabs
  • Upgrade OG and Twitter image declarations from bare path strings to
    objects with explicit dimensions and alt text so chat clients show
    a correctly sized preview image
  • Add siteName and locale to the OpenGraph block for richer embeds
  • Update site metadata test to cover the new image object shape
* add panel section hierarchy to poster workspace
  
  Add PanelSection component for visual grouping of related controls within poster workspace panels.
  
  Style panel:
  • Group presentation controls (Presentation, Artwork Source, Rating Style, Image Text, Rating Values, Icon Shape) under 'Presentation and display' section with descriptive header
  • Move Genre Badges controls to separate section with toggle and conditional sub controls (style, position, size, overlay strength)
  • Add section descriptions to contextualise user choices
  
  Position panel:
  • Group core placement controls (Ratings Layout, Edge Offset, Rating Size) under 'Rating placement' section
  • Move conditional Side Ratings control to separate 'Additional ratings' section
  
  CSS hierarchy styling:
  • Add section borders with subtle fade for visual separation
  • Apply accent color to section headings with uppercase treatment
  • Maintain section spacing and breathing room without adding clutter
* add floating return to preview button for resizable workspace mode
  
  • Adds a floating up arrow button anchored bottom right when using resizable preview mode
  • Button scrolls smoothly back to the preview area when users are scrolled deep into controls
  • Button only visible in resizable mode; hidden when floating preview is active
  • Uses 44px minimum touch target size for accessibility
  • Positioned z index 44 to not obstruct floating preview (z index 45)
  • Hidden on mobile viewports (≤919px) to match resizable only behaviour on small screens
* add resizable and floating preview modes for artwork workspace
  
  • Adds a new preview mode switch with two options: Resizable and Floating
  • Adds a floating preview window that can be moved around the screen while editing controls
  • Adds a dedicated resize handle on the floating preview so people can drag to change its size easily
  • Hides the in page workspace preview area while Floating mode is active to free up editing space
  • Adds a clear return action to switch back to the default Resizable workspace preview mode
  • Keeps preview overlay and full screen viewing available in both modes
  • Keeps mobile behavior safe by defaulting to Resizable mode on small screens
* conflict resolution and split login behavior
  
  • Entry page login always applies the saved profile directly. Logging
    in there loads your configuration immediately with no conflict prompt.
  
  • Save page login detects when local settings differ from the saved
    profile and shows a conflict banner so you can choose what to keep.
* add guided slider legends and stabilize preview swatch editing
  
  • Added gradient legends with low, mid, and high cues across custom theme
    sliders so color mapping is clear before dragging
  • Added interactive preview swatch editing with color wheel and hex input
    for Background, Surface, Elevated, Accent, and Text
  • Fixed swatch regression where editing one token could reset another by
    moving to token specific preview overrides
  • Improved OKLCH and hex conversion sync so preview chips and displayed values
    stay consistent during successive edits
* v2 — full UI redesign, theme system, admin panel, community themes
  
  This is the v2 release of XRDB. It replaces the v1 configurator first
  interface with a structured workspace, introduces a complete design
  system rewrite, adds a theme engine with community sharing, and ships a
  new admin panel for self hosters.
  
  UI and Design System
  • Replaced the v1 single page configurator with a step based workspace
    (Integrations, Poster, Backdrop, Thumbnail, Logo) navigated via a
    persistent nav bar
  • Rewrote the CSS foundation from ad hoc variables to a full OKLCH token
    system with semantic surface, accent, ink, border, elevation, and
    status tokens
  • Replaced all legacy hex/rgba color values; design system now supports
    live theme switching by swapping palette tokens at the root
  • Removed glassmorphism and glow heavy decorative styles; updated
    typography scale, shell layout, and responsive breakpoints
  
  Theme Engine (v2)
  • Added XRDBThemeV2 type with a typed XRDBPalette (bgBase, bgMid,
    bgSurface, bgElevated, accent, accentDim, accentText, ink, muted,
    border, scrim)
  • Ships with built in preset themes; users can create and save personal
    themes locally
  • Theme family and mode columns added to community_themes table via
    migration for light/dark family grouping
  
  Community Themes
  • Users can browse, submit, and apply community contributed themes from
    the themes workspace
  • Submission flow validates OKLCH palette values before accepting
  • New API routes: GET/POST /api/themes/community, POST
    /api/themes/submit
  
  AIOMetadata Integration
  • POST /api/aiometadata/install profile: lets AIOMetadata instances push
    a config profile directly into XRDB without manual URL import
  • Public AIOMetadata instance list sourced from lib/aiometadataPublicInstances.ts
  • Integrations step surfaces connection status for linked AIOMetadata
    instances via /api/configurator integrations status
  
  Community Templates
  • GET/POST /api/templates and /api/templates/[id]: stored in SQLite via
    communityTemplateStore; separate from themes
  • Admin can review and manage submissions via the admin panel
  
  Admin Panel
  • New /admin route with login gated access (cookie session, 7 day TTL)
    protected by ADMIN_KEY env var
  • Admin panels: cache management, config health, instance metrics, config
    profile management, template review, theme moderation
  • New API routes under /api/admin/: cache, config, health, login,
    logout, metrics, prewarm, profiles, stats, templates, themes
  • Admin key verified via constant time comparison; bearer token auth
    also supported for API access
  
  Entry and Experience Mode
  • The workspace entry page now handles experience mode selection (simple
    vs advanced) with keyboard navigation (arrow keys, Home key)
  • Config profile login dialog integrated directly into the entry page
  • Instance branding slot supports custom logo/name for self hosted
    deployments
  
  Configurator Hooks Refactor
  • Configurator logic split into focused hook modules:
    lib/configuratorHooks/ui.ts, workspace.ts, index.ts
  • Removes previous monolithic hook surface
  
  Branding and Assets
  • New XRDB logo.svg, xrdb logo.png, ibbylabs logo.png added to public/
  • Favicon set regenerated from new SVG source (16, 32, 96, 180, 512px)
  • generate favicons.mjs script added for future favicon regeneration
    (pnpm generate:favicons)
  • Web app manifest icons updated
  
  Documentation and Config
  • variables.md added: full reference for all supported environment
    variables
  • env.selfhost.template removed; consolidated into env.template
  • knip.config.ts added for dead code analysis (pnpm knip)
  • README updated to reflect v2 workspace structure and new features
  
  CI and Deployment
  • Docker build workflow updated for v2
  • post discord dev build.mjs added for dev build Discord notifications
  • compose.yaml updated
  
  Search and Target UX Fixes
  • Fixed search input losing focus after each keystroke caused by
    mediaSearchQuery being part of the React key on the input element
  • Poster thumbnails now appear in pinned target cards and the active
    target row, consistent with search result cards
  • PinnedTarget type extended with posterUrl; pin handlers carry poster
    through from search results and active target
  • media resolve API route now returns posterUrl alongside title so
    artwork is available immediately after shuffle or page load
  • Title resolve effect now fetches poster even when title is already
    known from static samples, closing the shuffle then pin blank poster gap

### Fixed
* include docs capture in preview memo dependencies
  
  • keep preview URL memo dependencies aligned with docs capture mode
  • fix lint failure from manual memoization dependency checks
  • keep docs capture preview path stable during verification and release gates
* unify docs refresh gate and support v2 README changelog links
* stabilize docs capture preview flow
* simplify capture readiness condition to prevent memory exhaustion
  
  The strict capture readiness gate required 14 state conditions to converge simultaneously, triggering excessive re renders that exhausted the Next.js dev server heap during doc asset capture.
  
  Changed Playwright wait condition from the strict data docs capture ready="true" attribute to simply waiting for the .xrdb page element to exist. This is sufficient for capturing screenshots and avoids the render storm.
* refresh script hanging on static asset capture
  
  The release script was timing out while waiting for page readiness to converge. The root cause was that storage state hydration was deferred to the microtask queue, creating unpredictable timing gaps that exceeded the Playwright wait timeout.
  
  Changes:
  • Detect docs capture mode via `?docsCapture` URL parameter
  • Apply storage hydration synchronously when capturing, ensuring experienceModeDraft state converges immediately
  • Preserve existing async behavior for normal user sessions
  • Increase Playwright timeout from 1800ms to 5000ms as safety net
  • Add comprehensive diagnostic logging to identify which page readiness condition fails
* resolve social metadata URLs from runtime host
  
  • Makes Open Graph and Twitter card URLs resolve from the live request host instead of build time localhost fallback
  • Uses trusted forwarded host and protocol headers when proxy trust is enabled
  • Falls back safely to request host, explicit public URL override, then localhost default
  • Prevents broken preview images in Discord and other link preview clients on dev and self hosted domains
  • Adds regression tests for host resolution precedence and malformed header fallback
  • Updates deployment docs to explain runtime metadata base resolution and optional override behavior
* resolve docker runtime package failure and harden action runtime compatibility
  
  Fix the Docker publish workflow failure caused by an invalid Debian runtime package
  name in the image build stage, and add workflow level Node 24 action runtime opt in
  to stay ahead of the GitHub Actions Node 20 deprecation window.
  
  Changes:
  • Docker runtime image:
  • Replaced unavailable Debian package `shadow` with `passwd` in `Dockerfile`
  • Entrypoint hardening:
  • Added `groupmod`/`usermod` availability guard in `scripts/docker entrypoint.sh`
  • Keeps startup resilient by warning and continuing when remap tools are unavailable
  • Workflow runtime compatibility:
  • Added `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: 'true'` to:
  • `.github/workflows/build and push docker.yml`
  • `.github/workflows/ci.yml`
  • `.github/workflows/create github release.yml`
  • `.github/workflows/backfill discord dev build.yml`
  • `.github/workflows/notify discord on release.yml`
  • `.github/workflows/promote docker latest.yml`
  
  Why:
  • CI log showed Docker build failure at apt install step:
  • `E: Unable to locate package shadow`
  • Actions warning indicated impending Node 20 runtime deprecation on runners
* BUG-146 smooth clean scrim and auto minimal trending stack
  
  Improve poster readability in clean mode by smoothing the lower scrim fade so the transition looks natural on bright artwork.
  Keep auto minimal trending labels readable by rendering two label cases as separate centered rows instead of compressing into one line.
  Add focused regression checks for clean scrim falloff and two row trending label visibility in the poster renderer test suite.
* add missing badge keys to proxy config schema
  
  Six badge related query parameters were silently dropped when encoding
  proxy URLs because they were absent from the allowlists in proxyConfigSchema.ts.
  The profile persistence path in uiConfig.ts already included all six keys
  and did not require changes.
  
  Changes:
  • Add qualityBadgeAppearance to SHARED_IMAGE_QUERY_KEYS so custom badge
    icon overrides survive proxy encoding across all image types
  • Add logoStreamBadges, logoQualityBadges, logoQualityBadgesStyle,
    logoQualityBadgeScale, logoQualityBadgesMax to IMAGE_QUERY_KEYS_BY_TYPE.logo
    so logo specific badge on/off and style settings are no longer dropped
  • Add all six keys as optional string properties on the ProxyConfig type
  
  Before this fix, a user who disabled quality badges on the logo type or
  configured custom streaming service badge settings would see their changes
  work in the live preview and in direct pattern URLs, but the proxy URL would
  revert to defaults — stripping the values silently at encode time.
* BUG-147 inline toggle layout now keeps label and toggle adjacent
  
  Inline toggles such as "Bottom Row" and "Black bar" were separated across the
  full width due to `justify content: space between;` on `.xrdb control row inline`.
  
  Changed to `justify content: flex start;` to render label and toggle as an
  adjacent pair rather than stretched to opposite edges. Fixes visual separation
  affecting all inline toggle controls across the configurator.
  
  Affected controls:
  • Thumbnail position "Bottom Row" toggle
  • Backdrop position "Bottom Row" toggle
  • All "Black bar" toggles (thumbnail, backdrop, poster, logo)
* BUG-149 hide floating preview toggle on mobile
  
  • Floating preview toggle is now hidden entirely on mobile instead of rendered disabled
  • Mobile users no longer see misleading disabled controls suggesting resize capability is unavailable
  • Desktop viewport (>919px) behavior unchanged; toggle remains visible and functional
  • Touch users get clean workspace only layout without hover inaccessible tooltips
* BUG-148 prevent genre and trending badge overlap
  
  • Keep genre badges readable when trending badges use the same poster corner
  • Preserve existing auto trending behavior while improving explicit badge placements
  • Add regression coverage for same position poster badge layouts
* BUG-144 keep trending overlays proportional across poster sizes
  
  Styled trending badges now scale with poster sized quality badge metrics instead of a fixed height.
  Auto minimal trending strip text now scales from overlay size with proportional stroke width.
  Added regression coverage for styled trending growth and auto minimal 4K text density.
* BUG-145 make score bar styles refresh and render distinctly
  
  • Score bar style and color changes now refresh preview output immediately without requiring unrelated setting changes.
  • Progress style now renders as segmented progress with a clear current position marker, so it no longer looks identical to Solid.
  • Solid and Gradient keep their expected behavior while remaining visually distinct from Progress.
  • Added regression coverage to protect cache key refresh behavior and style level render differences.
* BUG-143 hide genre position control for clean poster genre style Remove no op genre position controls when clean style is active in poster workspace Keep genre position controls available for non clean styles Preserve renderer behavior where clean genre remains bottom anchored
* BUG-143 add full trending tag anchor parity for poster overlays
  
  Expand trending tag position controls to top and bottom left center right anchors
  Parse and round trip new anchors through request and output flows
  Apply anchor aware renderer placement with collision safe vertical resolution
  Add regression tests for request parsing and renderer anchoring
  Fix reserved bottom spacing to apply only when trending badges exist
* BUG-143 normalize provider icon footprint and soften plain badge surface fade
  
  normalizes provider icon visual footprint by trimming transparent bounds and re centering to the canonical icon canvas
  reduces plain readable surface shadow and gradient intensity to keep fades subtle while preserving readability
  adds deterministic regression tests for icon footprint consistency and plain surface opacity tuning
* BUG-143 prevent clean genre text overlap with trending labels
  
  Keeps genre labels readable when clean genre style and auto minimal trending labels are enabled together
  Resolves label placement so trending chips stay clear of the genre row in poster outputs
  Adds regression coverage to lock this behavior and prevent overlap from returning
* BUG-143 recover malformed TMDB poster IDs from TMDB source exports
  
  • Prevents poster outputs from disappearing when upstream TMDB source URLs omit the media type segment
  • Keeps TMDB source links renderable by normalizing malformed IDs instead of dropping the request
  • Adds regression tests for malformed TMDB ID normalization and poster request state handling
* prevent first load crash on Integrations page
  
  • Keeps initial page rendering stable so Integrations no longer throws a transient runtime error on first open
  • Ensures host status cards appear consistently instead of briefly showing conflicting states
  • Preserves existing integrations behavior while removing the hydration mismatch trigger
* restore drag reorder for rating providers
  
  Bring back click and drag provider ordering across poster, backdrop, thumbnail, and logo workspaces.
  Keep existing provider enable and disable toggles unchanged while restoring reorder behavior.
  Add clear drag cursor feedback so reorder interactions are easier to discover.
* auto catch up missed dev Discord notifications
  
  • persist last successful dev notification checkpoint as tag `discord dev notified`
  • use checkpoint SHA as next notification baseline so missed commits are included on the next successful run
  • skip duplicate notifications when current SHA already matches checkpoint
* correct browser timeout ref typing
* ui polish and refinements
* keep trending preview tags factual
  
  • Prevent preview only placeholder tags from replacing real trend and recognition badges
  • Use TMDB trending day and week rank membership for Trending Today, Trending This Week, Top 10, and Top 25 labels
* restore trending tag preview updates
  
  Ensure trending style changes show up immediately in poster preview instead of appearing stuck.
  
  Add a preview only trending fallback so style and text color controls remain visible even when the selected title has no live trending signal.
  
  Refresh image cache identity for this behavior update so older cached renders do not mask current preview settings.
* use last successful dev tag as Discord compare base
* Refresh static assets.
* BUG-135 Add timeout to source image fetches
  
  Source image fetch calls had no timeout, causing the fetch to hang indefinitely
  when connecting to slow or unresponsive image URLs. This was especially
  problematic for AIOMetadata provider logos, where a single slow fetch could
  block the entire image rendering pipeline for 15+ seconds.
  
  Changes:
  • Add SOURCE_IMAGE_FETCH_TIMEOUT_MS constant (default 10s, configurable)
  • Use AbortController with timeout in fetchSourceImageUncached()
  • Fetch now aborts after 10 seconds instead of hanging indefinitely
  • Follows existing timeout pattern from githubRelease.ts
  
  Impact:
  • Logo rendering no longer hangs on slow artwork sources
  • Image generation completes within reasonable time bounds
  • Fallback paths can be attempted after timeout
  
  Tests: 1085 passing, 0 failing | Lint: Clean | Build: Success
* BUG-127 calculate badge width per row to prevent overflow
  
  Custom quality badges with full intrinsic width now clamp correctly when multiple badges appear in a single row. The previous global maxBadgeWidth calculation did not account for sequential badge positioning, causing oversized full badge assets to overflow the available row width.
  
  Changes:
  • Refactored `buildQualityBadgeRowOverlays()` to calculate maxBadgeWidth per row
  • Width formula: (availableWidth, rowGaps) / badgeCount, accounting for badge count and gaps
  • Each row now receives a row specific maxBadgeWidth based on its badge count
  • All badges in a row stay within layout bounds, even when intrinsic width full badges are present
* BUG-123 normalize logo badge icon scale in auto mode
  
  • Ensures all logo badges in auto mode use normalized icon scale for consistent sizing
  • Preserves manual scale for explicit logo badge overrides
  • Passes logoRatingsMax through layout pipeline for correct auto/manual detection
  • Updates regression tests to cover auto/manual logo badge scale and edge cases
  • Validated: all tests pass, no lint errors
* BUG-127 keep custom quality badges aligned when scaled
  
  • Custom quality badges now stay in the correct position when larger size settings are used.
  • Wide custom badge icons are constrained so they do not drift out of layout bounds.
  • Offset controls now behave consistently across DV, 4K, and Atmos style badge setups.
  • Added regression tests to keep row and column quality badge placement stable.
* BUG-129 align auto limited provider logo rendering
  
  • Third provider logo now stays aligned and consistent when logo rows are auto limited by size.
  • Manual three logo setups keep their existing appearance behavior.
  • Added regression coverage so auto limited and manual limited cases remain stable.
* BUG-137 stabilize rating logos and BUG-131 protect custom badge save flow
  
  • IMDb and Letterboxd now use built in logo assets so logo rendering no longer depends on remote favicon availability
  • Added regression checks to keep IMDb and Letterboxd provider logos pinned to embedded assets
* BUG-138 restore mobile access to Poster and Backdrop tabs
  
  • Mobile tab scrolling now starts from a stable left edge so Poster and Backdrop stay reachable.
  • Navigation swipe behavior is more reliable on affected mobile browsers.
  • This protects users from getting stuck on only Thumbnail and Logo in the top bar.
* admin panel shows blank page instead of login form
  
  • Admin layout was returning null when ADMIN_KEY was unset, silently
    blocking all child rendering including the login form
  • Add force dynamic to the admin layout so the ADMIN_KEY env var is
    always read at request time and never cached as false during the build
  • Replace silent null returns in both admin pages with a visible
    not configured card that tells the user to set ADMIN_KEY
* make metadata cache pruning deterministic on every write
  
  • Removes probabilistic 5%/2% pruning sample rates from metadataStore
  • pruneExpiredMetadata and pruneOldestMetadata now run on every setMetadata call
  • Adds regression tests for automatic eviction and expired entry cleanup
  • Pairs with the earlier disk cache byte budget and deterministic prune fix to close the full cache footprint risk across both storage layers
* tighten image cache pruning
  
  • Keeps the image cache from growing without clear limits during normal use
  • Removes older cached files once storage use or file count gets too high
  • Preserves faster repeat loads while reducing long term disk growth
  • Adds regression coverage for both size based and file count eviction
* handle mislabeled custom badge SVG icons
  
  • Custom badge icons now keep working when a badge host serves an SVG file with the wrong file type header.
  • SVG badge links are more reliable for self hosted setups that sit behind redirects, file proxies, or storage providers with inconsistent metadata.
  • Added regression coverage so these custom badge icons keep rendering after future renderer changes.
* improve custom SVG badge icon reliability
  
  • Keep custom badge icons visible when SVG files omit explicit size attributes.
  • Retry image conversion with safe dimensions so badge icons still render instead of disappearing.
  • Add regression coverage to prevent SVG badge rendering from breaking in future updates.
* anchor mobile preview action and remove floating overlap
  
  Keeps the mobile preview action tied to the customization section instead of floating over content
  Improves scroll behavior so controls stay readable and feel stable while editing
  Preserves quick preview access without covering workspace controls
* improve tab guidance and remove overlap controls
  
  Shows clear section guidance directly under workspace tabs so help is visible without hover
  Increases key touch targets to improve tap accuracy during frequent edits
  Removes the floating bottom navigation overlay to keep editing content unobstructed
* restore community badge theme selection in all workspaces
  
  • Badge theme picker (gold, white, rainbow, black) now appears in the Quality
    panel for poster, backdrop, thumbnail, and logo workspaces whenever the
    community badge style is active
  • Choosing a theme is no longer blocked — users who pick the community badge
    style can now select the exact look they want without being stuck on the default
  • Logo workspace reads its own badge style setting correctly while still using
    the shared theme value and save behavior
* restore custom badge icon controls and display mode toggle
  
  • Custom icon images can be set per quality badges
  • A display option now lets you choose between showing the logo alongside the
    badge text or filling the badge with just the logo image
* stabilize tab strip alignment; restore clean overlay strength control
  
  The Simple/Advanced toggle was only shown on step routes. On all other routes it
  disappeared, shrinking the right rail and causing the centered tab strip to shift
  noticeably. Toggle visibility is now tied to configurator context availability so
  the right rail stays the same width on every route.
  
  The clean genre overlay intensity setting existed in state and serialization but
  had no visible control in the redesigned configurator. Added a Clean overlay
  strength control (0–100%) to poster, backdrop, and thumbnail style panels. The
  control appears only when genre badges are enabled and genre style is set to clean.
  Logo was intentionally excluded as it has no genre badge capability.
* stabilize nowMs initial value to prevent SSR hydration mismatch
* stabilize quality badge layout and restore age rating toggle
  
  • Poster quality badges now keep a cleaner, more predictable alignment instead of being over shifted by collision handling.
  • Age Rating is now included in the quality badge selector, so counts, enable all, and manual toggles stay consistent.
  • Badge placement behavior now matches the intended structured pattern seen on other surfaces.
* save button and login preserve
  
  • Login no longer silently overwrites local settings: conflict detection
    now checks whether local settings differ from the server profile before
    applying; if local has changes, they are kept and the Save button
    remains enabled so the user can persist them
* restore back button, simplify nav labels, fix inspect visibility
  
  • Restore Back button in sticky nav using prevStep (hidden on first step only)
  • Simplify sticky nav labels from "Next: Backdrop" / removed Back to plain "Next" / "Back"
  • Fix preview band top offset from 0 to 52px so Inspect button always sticks
    below the nav bar instead of disappearing behind it
* prevent logo artwork from being compressed by oversized badge bands
  
  When ratings are enabled on logo artwork, a badge band is appended below
  the logo canvas, extending the total image height. Downstream clients
  (Stremio, Aurora) scale the entire image to fit their logo cell, causing
  the logo portion to shrink by up to 35% depending on badge load.
  
  This change enforces a 65% minimum logo portion ratio. After the badge
  band height is finalised, if the band would push the logo below 65% of
  the total output height, the logo canvas height is expanded to satisfy
  the floor:
  
    logoImageHeight = max(baseHeight, ceil(bandHeight * 0.65 / 0.35))
  
  For a 320px base logo with a 200px band (total 520px), the logo canvas
  is raised to 372px, keeping it at 65% of the 572px total instead of
  shrinking to 62%. Lighter configs (170px minimum band) keep the existing
  320px base unchanged.
  
  • No change to badge band height or badge content
  • Logo renders larger in the output image, reducing client side compression
  • imageRouteExecution already passes renderLayout.logoImageHeight so no
    execution layer changes are needed
  • Test updated to assert minimum ratio rather than a fixed legacy height
* move build meta chip outside home link to resolve nested anchor errors
  
  • The commit hash chip and version label were nested inside the XRDB
    home anchor, causing two browser console errors for nested anchor
    elements and one recoverable hydration mismatch in the Next.js dev
    overlay
  • Extracted the build meta block to a sibling element so the home link
    wraps only the brand mark and name, and the chip remains visually
    adjacent without violating HTML nesting rules
* restore edge alignment and center primary tabs in header
  
  • Keeps brand content pinned to the left and mode/theme controls pinned to the right in fullscreen layouts
  • Centers the primary navigation tab strip as its own middle zone so layout intent stays consistent across desktop and tablet
  • Removes the header width cap that was causing the whole navbar content to drift toward the middle
* prevent badge group pileup by nudging quality overlays away from occupied regions
  
  • Quality badge overlays now detect overlap with already placed rating and strip
    regions before compositing, and nudge vertically to the nearest clear position
  • Bottom placements prefer nudging upward; top and side placements prefer
    downward, matching expected visual priority order
  • Detached age rating overlays follow the same nudge logic so they do not stack
    with quality columns sharing the same anchor side
* feature logo mark on home page hero
  
  • The XRDB logo mark now appears above the brand name on the entry
    page, giving it clear visual priority as the first thing a user
    sees when landing on the app
* expose badge size controls for all artwork types
  
  • Rating, genre, and quality badge size controls (70–200%) are now
    available in the Style, Position, and Quality tabs for all four
    artwork types (poster, backdrop, thumbnail, logo)
  • Controls use a percentage scale where 100 is default, letting users
    make badges smaller or larger to suit their artwork
  • Genre size appears in the Style tab alongside genre position when
    genre badges are enabled; rating size in the Position tab; quality
    badge size in the Quality tab
* move Inspect action to bottom nav on mobile
  
  • Inspect button in the preview band header is now hidden on screens narrower than 920px
  • A matching Inspect button appears in the bottom sticky action bar on mobile, next to the Next CTA, within easy thumb reach
  • Desktop behavior is unchanged — Inspect remains in the sticky preview controls header at all times
* collapse theme mode switcher to icon popover on mobile
  
  • On screens narrower than 640px the full Auto / Light / Dark / Midnight
    pill is now hidden and replaced by a compact crescent moon icon button
  • Tapping the icon opens a small dropdown where users can pick any mode;
    selecting a mode applies it immediately and closes the panel
  • The escape key and tapping outside also close the panel
  • Primary nav tabs now have the full horizontal row to themselves on
    mobile, so all pages are reachable without the theme controls pushing
    them out of view
* show signed in indicator and update action when authenticated
  
  • When signed in, the entry page now shows a clear indicator: a green dot
    plus the first 8 characters of the profile UUID in monospace, so users
    can tell at a glance that they are logged in and which profile is active
  • The Login button changes to Save & Export (link to the save page) when
    authenticated, replacing an action that had no effect while already
    logged in
  • Start and the secondary button now use a shared flex class that keeps
    both buttons equally sized, centered, and away from the card edges on
    all screen widths
* discord release notes now render bullet markers correctly
  
  Detailed release items in continuation embeds were rendering
  with a dash instead of the expected bullet marker, causing the
  CI workflow to fail on every run.
* settings no longer reset silently when loading a profile
  
  When a user logged into a saved profile, the workspace silently
  replaced all their local settings with whatever was stored in
  the profile. Any changes made before logging in were lost, and
  the Save button immediately showed Saved because local state
  now matched the profile.
  
  • On login, local settings are now compared against the profile
    before anything is applied
  • If they differ, a conflict banner is shown with two choices:
    keep your local settings and save them to the profile, or
    discard local changes and load from the profile
  • Nothing is overwritten without an explicit user action
  • Profile creation (first time UUID flow) is unaffected
* all 5 subtabs now fit on one row
  
  Grid was hardcoded to 4 columns but there are 5 subtabs
  (Providers, Style, Position, Quality, Advanced). The fifth
  tab was wrapping to a second row.
  
  • Changed subtab grid from 4 to 5 equal columns
  • Reduced tab padding from 0.5rem 1rem to 0.375rem 0.5rem
  • Reduced tab font size from 0.8125rem to 0.75rem
  
  All five tabs now sit in a single row on desktop. Mobile
  2 column layout is unchanged.
* remove duplicate release bullets and add explicit UK publish time
  
  • keeps one top level bullet per release item in Discord embeds
  • normalizes detail lines so nested bullets do not render as duplicated points
* resolve completed redesign regressions from today LS tracker
  
  • Removes duplicate step bars so each workspace now shows a single clear progress flow (LS 35).
  • Improves top navigation branding by making the XRDB lockup easier to read and keeping build details inline (LS 36).
  • Brings full Enable all and Disable all parity to provider controls across poster, backdrop, thumbnail, and logo editing (LS 37).
  • Expands preview space on desktop and mobile so artwork is easier to review without extra clicks (LS 38).
  • Switches development build labels to a clean dev format and updates docs so version labeling is less confusing (LS 40).
  • Simplifies the Integrations screen so first time users can complete setup faster with less text overload (LS 41).
  • Hides advanced host options by default on the newbie host path while keeping them available when needed (LS 42).
  • Fixes status chips that looked broken by preventing awkward wrapping and improving readability (LS 43).
  • Normalizes chip height and alignment so provider cards stay visually consistent (LS 44).
  • Restores quality badge controls in the redesigned UI for all artwork types with a dedicated Quality tab and complete toggles/settings (LS 45).
* read instance branding html at runtime
  
  • Custom entry banner content now follows the live container environment value instead of a build time snapshot
  • Restarting with updated environment settings now updates the entry banner without needing a new image build
  • Keeps the full entry experience unchanged while making self hosted branding updates reliable
* stop truncating dev build release notes
* restore docs capture ready signal to proxy page
* BUG-133 harden sqlite startup against bind mount permission failures
  
  • add container entrypoint that prepares the XRDB data directory, attempts ownership repair as root, then drops to node before launch
  • add DB preflight checks for writable parent directories before opening sqlite and before writing config key material
  • replace generic SQLITE_CANTOPEN surfacing with actionable permission diagnostics and host side recovery guidance
  • add runtime regression coverage for non writable data directory behavior
  • document data directory permission recovery notes in environment template
* reset Unreleased template during changelog updates
  
  Prevent stale released items from persisting in the Unreleased section by making
  the changelog updater rebuild top matter deterministically on each run.
  
  • add a canonical UNRELEASED_TEMPLATE in the updater
  • add helper logic to extract existing versioned sections only
  • rebuild changelog top as: header note + empty Unreleased template
  • insert the new release entry after the template
  • append previously versioned release sections unchanged
  • apply the same template behavior in rebuild mode
  
  Also perform a one time changelog cleanup by removing stale shipped entries from
  the current Unreleased section while keeping all tagged version entries intact.

### Documentation
* refresh static doc assets
* stripped documentation for ease of use and literacy.
* clarify cache TTL ranges and MDBList tuning guidance

### Other Changes
* add cross browser workspace smoke coverage
* add manual Discord dev build notification backfill workflow
* update multiple project areas
* Added a guide for partner access.
* fix image.source label casing to match canonical repo name
  
  The OCI image.source label referenced the lowercase form of the repo
  (IbbyLabs/xrdb) while every other committed reference in the project
  uses the canonical uppercase form (IbbyLabs/XRDB). Corrected to match.


## [v1.25.1] - 27/04/2026

### Fixed
* replace Google S2 favicon URLs with direct gstatic faviconV2 URLs
  
  Google S2 favicons redirect server side to faviconV2 gstatic URLs. The
  redirect chain was causing fallback 2 letter text icons instead of the
  actual provider logos. Replace all 9 affected providers with the direct
  faviconV2 URLs which return HTTP 200 without a redirect.
  
  Fixes: TMDB, MDBList, IMDb, Rotten Tomatoes, Letterboxd, SIMKL,
  Roger Ebert, MyAnimeList, AniList

### Documentation
* refresh static doc assets

## [v1.25.0] - 25/04/2026

### Added
* add dedicated per type genre badge X/Y offset controls
  
  Add eight new settings — posterGenreBadgeOffsetX/Y, backdropGenreBadgeOffsetX/Y,
  thumbnailGenreBadgeOffsetX/Y, logoGenreBadgeOffsetX/Y — giving each image type
  independent pixel level control over where genre badges are drawn, matching the
  offset capability already available for quality and rating badges.
  
  UI
  • Two new ScaleField controls ("Genre offset X", "Genre offset Y") added to
    LookSection in configurator appearance sections.tsx, bounded by the shared
    rating stack offset limits (MIN/MAX_RATING_STACK_OFFSET_PX).
  • Both controls update the active per type value via the existing previewType
    dispatch pattern so preview and export stay in sync.
  
  Config model
  • SharedXrdbSettings gains all eight fields, defaulting to
    DEFAULT_RATING_STACK_OFFSET_PX and normalized through normalizeRatingStackOffsetPx.
  • buildSharedPayload omits values that equal the default (lossless round trip).
  • Profile verification coverage extended with integer range tests for all eight
    keys under the genre badge family.
  • Proxy config allowlists updated with shared genreBadgeOffsetX/Y and all four
    per type variants.
  
  State and hooks
  • useConfiguratorWorkspaceState: eight useState hooks, values and setters exported.
  • useConfiguratorActiveWorkspaceSettings: activeGenreBadgeOffsetX/Y computed from
    previewType; setActiveGenreBadgeOffsetX/Y dispatched to the correct per type setter.
  • configuratorPageProps: lookProps carries activeGenreBadgeOffsetX/Y and
    onSelectGenreBadgeOffsetX/Y.
  • useConfiguratorOutputs: appendGenreBadgeQueryParams emits offset params when
    non default; useMemo dependency array includes both active offset values.
  • useConfiguratorWorkspaceConfigIo: all eight fields included in
    buildCurrentUiConfig payload and applySavedUiConfig deps array.
  • useConfiguratorWorkspaceRuntime: threads per type offset state through the full
    hook chain.
  
  Request parsing and render pipeline
  • imageRouteRequestState: parses globalGenreBadgeOffsetX/Y, then per type
    overrides, and resolves the active pair from imageType.
  • finalImageRenderSeed: includes offset values in the cache key when genre mode
    is active, ensuring renders vary correctly per offset.
  • imageRouteExecution → imageRoutePreparedMedia: offsets forwarded through the
    pipeline and included in GenreBadgeSpec.
  • imageRouteRenderer: GenreBadgeSpec type extended with optional offsetX/offsetY.
  • imageRouteGenrePlacement: baseLeft/initialTop adjusted by offsetX/offsetY before
    the clamped final position is returned.

### Fixed
* restore poster quality badge offset controls in UI
  
  The configurator now exposes poster quality badge X and Y position offsets, fixing the regression where these settings were only available as query params and changelog surfaced options.
  
  • add Position Offset controls for poster quality badges in the Quality section
  • wire new controls through configurator page props and workspace state setters
  • thread values through workspace runtime and config IO apply and save flows
  • include poster quality badge offsets in output URL generation when non default
  • add shared config defaults and normalization for both offset fields
  • serialize offsets in payloads only when values differ from defaults
  • register offset keys in proxy config schema allowlists and typings
  • include offset keys in poster quality reset group coverage
  • add config profile verification entries for both offset params
  • add regression tests for:
  • AIOMetadata export includes poster scoped offset params when set
  • offsets stay poster scoped and do not leak to other surfaces
  • reset groups include both new offset keys

### Documentation
* refresh static doc assets

## [v1.24.0] - 25/04/2026

### Added
* improve plain quality badge readability and add poster badge offsets
  
  • Reduce plain quality badge blur softness so text and glyph edges stay sharper at poster scale.
  • Add adaptive plain readability plate logic that only appears when backdrop luminance variance indicates poor contrast.
  • Add poster scoped quality badge position controls via query params:
  • posterQualityBadgeOffsetX
  • posterQualityBadgeOffsetY
  • Wire new params through request normalization, execution input, renderer placement, and final render seed.
  • Bump final render seed version to v15 to prevent stale cache collisions after placement and readability changes.
  • Fix logo band regression by clamping overlay bounds against final composited output height where required.
  • Document new poster badge offset parameters in README parameter tables and usage guidance.
  • Add offsets to addon developer optional pass through parameter list.
  • Add offsets to AI integration URL BUILD template so generated links preserve the new controls.
  • Extend render seed tests to verify poster only cache key impact for new offsets and no backdrop seed leakage.
  • Add dedicated renderer regression tests for:
  • X and Y offset movement behavior
  • Offset clamp behavior
  • Adaptive readability plate on busy versus flat backgrounds
  • Refresh static documentation assets after rendering changes, including comparison boards and captured preview/proxy images.
  • Sync README preview gallery metadata and capture date updates from asset refresh workflow.
  
  Files touched
  • README.md
  • readme preview gallery.json
  • addon proxy live demo.png
  • configurator live demo.png
  • anime logo comparison.png
  • movie poster comparison.png
  • show backdrop comparison.png
  • finalImageRenderSeed.ts
  • imageRouteExecution.ts
  • imageRouteQualityBadge.ts
  • imageRouteRenderer.ts
  • imageRouteRequestState.ts
  • final image render seed.test.mjs
  • image route renderer quality badge plain.test.mjs
* add icon shape controls for rating provider badges
  
  • add support for icon shape selection with values original, circle, squircle, and rounded
  • keep original as the default so existing URLs and visuals remain unchanged
  • thread icon shape through request parsing, render input, cache keys, and final image seed generation
  • apply icon masking in both icon preprocessing and SVG badge clip paths for consistent output
  • ensure plain rating style also respects non original icon shape selections
  • update shared UI config schema, normalization, serialization, and saved profile verification coverage
  • wire icon shape state through configurator workspace state, config IO, runtime, outputs, and advanced look controls
  • place icon shape control in Advanced look section and remove accidental placement from Simple quick tune
  • update README parameter docs and integration template examples for iconShape
  • update tests for cache key format and UI config round trip behavior
* add AIOMetadata public instance picker for repair profiles
  
  Introduce a dedicated AIOMetadata base URL picker in the Export repair section
  to improve instance selection flow for public and self hosted users.
  
  • add curated public AIOMetadata instances
  • replace native datalist behavior with a custom styled picker UI
  • add dropdown toggle control with visible arrow affordance
  • support open on focus and ArrowDown, close on outside click and Escape
  • support search/filter by instance name and base URL while typing
  • keep addon password hidden when selected base URL is a known public instance
  • keep addon password visible for self hosted or unknown custom instances
  • omit addon password from repair API payload when the selected instance is public
  
  Files:
  • components/export view.tsx

### Fixed
* FR-91 localize clean genre badge labels
  
  Use the resolved genre badge label for clean badge rendering
  instead of replacing it with a fixed English family label.
  
  This fixes cases where genre badges stayed in English even when
  XRDB requests used a non English language setting and TMDB
  returned localized genre names.
* remove age rating from custom icon overrides
* preserve fantasy classification with TMDB combined sci fi genres
  
  Update genre family resolution to split explicit science fiction from combined sci fi and fantasy signals.
  Fantasy now takes precedence when fantasy is present and there is no explicit science fiction signal.
  Sci fi still wins when explicit science fiction is present, and combined sci fi and fantasy still maps to sci fi when fantasy is not explicitly present.
  
  Add targeted regression coverage for:
  • fantasy precedence with TMDB combined genre id 10765
  • explicit science fiction precedence when both science fiction and fantasy are present
* include rating style and icon shape in cross type sync with generated sync matrix docs
  
  Changes:
  • add ratingStyle and iconShape to SyncableTypeSettings
  • include ratingStyle and iconShape in extractSyncableSettings for all preview types
  • apply ratingStyle and iconShape in applySyncableSettings for all target types
  • keep existing compatibility constraints:
  • non poster presentation coercion to standard
  • thumbnail provider filtering to episode safe providers
  • stream badges excluded when syncing into logo
  • use computeSyncDiffForTarget in configurator center stage single target sync flow
  • use computeSyncDiffForTarget in sync to all grouped diffs
  
  Tests:
  • add transfer coverage for rating style and icon shape sync
  • add target diff coverage for rating style and icon shape keys
  • update identical per type zero diff fixture for new syncable fields
  
  Docs and automation:
  • add scripts/generate sync settings matrix.mjs to build matrix from crossTypeSync exports
  • add docs/sync settings matrix.md generated artifact
  • export SYNCABLE_TARGET_KEY_MAP, SYNCABLE_GLOBAL_KEYS, and SYNC_SPECIAL_RULES from crossTypeSync
  • add npm script sync matrix:generate
  • run sync matrix generation automatically in predev, pretest, and prebuild
  • add README link to generated sync matrix and update sync behavior description
* enforce type scoped option edits and sync only cross type propagation
  
  • make icon shape truly per type across state, config IO, serialization, and request parsing
  • stop save and revert confirmation from over reporting by diffing normalized comparable params
  • add hard verification guardrails so any new shared option key fails tests unless explicitly allowed as legacy
  • convert aggregate accent controls and rating value mode to active type scoped state so regular edits do not fan out across poster, backdrop, thumbnail, and logo
  • preserve legacy compatibility paths for existing shared keys while prioritizing per type keys
  • update docs for per type icon shape behavior and sync expectations
  
  Implementation details:
  • add per type icon shape fields and fallback handling in normalization and payload building
  • route icon shape writes through preview type specific setters
  • update configurator runtime and config IO wiring for per type icon shape fields
  • add explicit global key list and legacy shared key inventory in config profile verification
  • add tests that block introduction of new shared option surfaces
  • update round trip and regression coverage for profile serialization behavior
* BUG-125 keep UUID proxy addon identity stable
  
  Stop UUID backed proxy manifests from rotating addon identity when upstream manifest payloads drift over time, which can invalidate saved collection bindings in clients like Nuvio.
  
  • treat stored UUID config seeds as stable identity anchors
  • exclude upstream manifest fingerprint from identity seed when config seed is a UUID
  • keep direct query mode behavior unchanged so non UUID flows can still reflect payload and catalog plan identity changes
  • preserve existing no store response behavior and catalog rewrite flow
  
  Add regression coverage for identity stability and preserve existing identity tests:
  
  • add test ensuring UUID backed proxy identity remains stable across source manifest payload changes
  • keep test coverage proving query mode identity still changes when source payload or catalog rules change
* BUG-124 restore custom quality badge scaling for 4k outputs
  
  Remove the fixed quality badge height ceiling that caused poster and backdrop
  quality badges to stop growing on larger and 4k renders, which made the size
  slider appear unresponsive once the badges hit the cap.
  
  Preserve intrinsic aspect ratios for custom quality badge assets so full badge
  overrides and asset backed custom icons keep their intended proportions instead
  of collapsing toward square sizing.
  
  Add regression coverage for:
  • full badge custom icon aspect handling
  • asset backed custom badge aspect handling
  • 4k poster quality badge height scaling past the old ceiling
  • 4k backdrop quality badge height scaling past the old ceiling
* BUG-126 black bar overlay changes not saved to profile
  
  Root cause: `buildCurrentUiConfig()` serialized the raw artwork source state
  values (posterArtworkSource, backdropArtworkSource, thumbnailArtworkSource)
  directly into the saved config. During a live session, these values are never
  'blackbar' — `applySavedUiConfig` correctly splits a stored 'blackbar' value
  into a raw source ('tmdb') plus a boolean flag
  (posterRatingBlackStripEnabled: true) on load. The recombination step was
  missing on save, so the serialized config never reflected overlay changes.
  Dirty detection therefore never saw a difference, the save button stayed
  disabled, and overlay state was lost on round trip.
  
  Fix: compute effective artwork sources inside `buildCurrentUiConfig` before
  writing to the settings object. When the corresponding strip enabled flag is
  true, the effective source is 'blackbar'; otherwise it falls through to the raw
  state value. This mirrors the existing split in `applySavedUiConfig` and
  completes the round trip symmetrically.
  
  • lib/useConfiguratorWorkspaceConfigIo.ts
  • Added posterRatingBlackStripEnabled, backdropRatingBlackStripEnabled,
      thumbnailRatingBlackStripEnabled to the hook args type
  • Destructured the three flags in the hook body
  • Computed effectivePosterArtworkSource, effectiveBackdropArtworkSource,
      effectiveThumbnailArtworkSource in buildCurrentUiConfig
  • Used effective values when writing posterArtworkSource,
      backdropArtworkSource, thumbnailArtworkSource into serialized settings
  • Added the three flags to all relevant useCallback dependency arrays
  
  • lib/useConfiguratorWorkspaceRuntime.ts
  • Passed the three strip enabled flags from workspace state into the
      useConfiguratorWorkspaceConfigIo call
* polish dropdown layering and readability in repair and search panels
  
  keep the AIOMetadata repair base URL dropdown above URL pattern rows by applying explicit stacking on the repair container
  increase readability in the repair dropdown by giving the base URL input more horizontal space and allowing long instance URLs to wrap
  apply the same readability polish to Configure search by widening the results dropdown on desktop and allowing long result titles and media IDs to wrap instead of truncating
  keep existing selection, keyboard, and click behaviors unchanged
  Files changed:
  
  export view.tsx
  configurator basics.tsx
  ROADMAP.md

### Documentation
* refresh static doc assets

### Other Changes
* migrate XRDB public URL to extendedratings.com
  
  Replace all instances of xrdb.ibbylabs.dev with extendedratings.com across
  documentation, product context, and test files.
  
  The new domain currently redirects to xrdb.ibbylabs.dev and will become the
  primary public URL when the migration is complete.

## [v1.23.1] - 24/04/2026

### Fixed
* BUG-122 isolate black bar overlay by artwork type
  
  Fixes a state coupling bug where Black Bar Overlay toggles in one artwork type were affecting other types.
  
  • Replace the single shared black bar state with three independent states for poster, backdrop, and thumbnail.
  • Update Appearance panel toggle wiring so it reads and writes only the currently active preview type.
  • Update runtime preview/output derivation to use the active type’s black bar flag instead of a global value.
  • Update saved config application so legacy blackbar artwork source values restore black bar state per type, not globally.
  • Preserve existing renderer behavior and request semantics while removing cross type bleed.
* BUG-121 enforce regional translation paths across proxy and poster rendering
  
  • preserve requested regional locale behavior when metadata translation runs in default mode
  • add TMDB regional alias fallback so es MX can use es 419 entries when exact regional entries are absent
  • keep es ES strict so Spain locale does not incorrectly consume es 419 LATAM entries
  • propagate localized TMDB genre names into metadata and badge label selection so genre text localizes correctly
  • prefer localized TMDB details title for clean poster branding overlay text instead of base media payload title
* BUG-120 preserve quality badge placement across release status style changes
  
  Ensure explicit poster quality badge placement is always serialized when set, so placement intent survives unrelated style changes. This prevents fallback to auto placement that made quality badges appear to jump when cycling release status style options.
  
  • update configurator output query generation to always emit posterQualityBadgesPosition when value is not auto
  • decouple placement persistence from placement control visibility gating
  • preserve existing behavior for qualityBadgesSide and all rendering logic outside this persistence path
  • scope limited to configurator URL/state output stability for poster quality badge placement
* BUG-119 unify custom quality badge full surface rendering and icon fetch reliability
  
  • Add fullBadge support to quality badge appearance overrides and preserve it through normalization, encoding, parsing, and prepared media mapping.
  • Add configurator support for per badge full badge mode with a dedicated Use as full badge toggle.
  • Render full badge overrides as image only surfaces so custom artwork is shown without embedded text or nested default badge chrome.
  • Ensure custom quality badge icon resolution uses the quality badge resolver path and supports SVG rasterization to PNG via sharp, with safe fallback to raw data URIs.
  • Add optional request headers to safe redirected fetches and pass a browser like User Agent for provider and quality badge icon fetches.
  • Fix CDN and Wikimedia style 403 fetch failures that previously caused icon resolution to return null and silently disable full badge rendering.
  • Harden quality badge rendering to resolve icon sources from either iconDataUri or pre resolved iconUrl data URIs so behavior is consistent across all quality badge styles.
  • Keep streaming logo and intrinsic width behavior aligned with the same resolved icon source logic across glass, square, plain, media, silver, tile, and community badge paths.
* BUG-118 prevent compact ring overlap with age rating and grouped badges
  
  Move compact ring collision resolution to the end of poster rendering so placement is based on all rendered badge overlays, not only detached age rating overlays.
  
  • replace the age only compact ring avoidance path with generic collision avoidance against tracked blocked rectangles
  • keep detached age rating overlay computation shared for both rendering and collision inputs to avoid drift between geometry and output
  • preserve right edge compact ring anchoring while applying vertical repositioning to the first non overlapping slot
  • ensure grouped mode and explicit age rating anchors both avoid compact ring overlap with top badge rows and quality badge stacks
  • keep genre collision tracking behavior intact by adding the resolved compact ring rectangle after final placement
  • add renderer regression coverage validating compact ring relocation when a detached age rating occupies the same corner
* BUG-117 restore genre badge position control for tile dark style
  
  The configurator was hiding Genre Badge Position when the genre badge style was tile or clean.
  Tile style still supports position state and rendering, so this created a style specific UI regression where users could not reposition badges directly.
  
  This change narrows the visibility gate so the position control is hidden only for clean style.
  Tile dark now keeps the position controls visible, matching behavior across other styles and removing the style switch workaround.

### Documentation
* refresh static doc assets
* updated README.md to remove redundant note.

## [v1.23.0] - 23/04/2026

### Added
* FR-34 ring rating style visual improvements
  
  Implement the remaining FR-34 Compact Ring visual improvements for ring completion and center transparency control.
  
  Problem
  • Compact Ring could appear visually incomplete at scores very close to 100 because a tiny arc gap remained.
  • Ring center transparency was not user configurable in a reliable end to end way.
  • Omitted center opacity could incorrectly behave like zero transparency in some paths.
  
  What changed
  • Added explicit near full completion logic for Compact Ring progress:
  • Snap progress to full when value is >= 99.5.
  • Render a full stroke path at snapped 100 to avoid a residual seam artifact.
  • Added configurable Compact Ring center opacity:
  • New poster scoped setting: posterRingCenterOpacity (0 to 100).
  • Default center opacity: 86.
  • Clamp and normalize all incoming values to supported bounds.
  • Fixed missing value normalization:
  • Treat undefined/null/empty center opacity as default, not zero.
  • Wired posterRingCenterOpacity across all relevant surfaces:
  • configurator state and controls
  • URL/export generation
  • request parsing and normalization
  • image execution/display state
  • render cache seed scoping
  • reset groups and profile verification coverage
  • Updated docs/reference surfaces to describe the new setting and behavior.
  
  Tests and verification
  • Added/updated regression tests for:
  • center opacity normalization (including null/undefined/empty and clamping)
  • request parsing and render behavior for posterRingCenterOpacity
  • near full progress completion behavior
  • render seed scoping for ring only cache variance
  • saved config/profile round trip coverage
* FR-60 customizable aggregate provider weights
  
  Add per type provider weight controls to the configurator so users can
  assign relative weights (0–1000) to each active rating provider when
  computing the aggregate score. Weights are normalized at render time so
  only ratios matter; equal weighting is preserved as the default.
  
  Core logic
  • lib/ratingPresentation.ts: add AggregateProviderWeights type,
    normalizeAggregateProviderWeights (accepts both URL string format
    "imdb:50,tmdb:30" and saved profile object format {imdb:50,tmdb:30}),
    stringifyAggregateProviderWeights, isDefaultAggregateProviderWeights,
    computeWeightedAverage with active provider renormalization and
    equal weight fallback when all weights are zero or map is empty
  
  Routing and rendering
  • lib/imageRouteRequestState.ts: parse per type URL params
    (posterAggregateProviderWeights, backdropAggregateProviderWeights,
    thumbnailAggregateProviderWeights, logoAggregateProviderWeights) and
    global aggregateProviderWeights fallback; include in seed key
  • lib/imageRouteAggregateBadge.ts: pass providerWeights to
    computeWeightedAverage
  • lib/imageRouteDisplayState.ts, lib/imageRouteExecution.ts: thread
    aggregateProviderWeights through display state and execution
  
  Configurator state
  • lib/uiConfig.ts: four SharedXrdbSettings fields; defaults; thumbnail
    falls back to backdrop unless skipCrossTypeFallbacks; buildSharedPayload
    emits per type keys when non default
  • lib/useConfiguratorWorkspaceState.ts: four useState declarations
  • lib/useConfiguratorWorkspaceRuntime.ts: 28 weight field references
  • lib/useConfiguratorWorkspaceConfigIo.ts: applySavedUiConfig and
    buildCurrentUiConfig wired for all four types including full deps array
  • lib/useConfiguratorWorkspaceSummary.ts: activeAggregateProviderWeights
    derived; setAggregateProviderWeightsForType callback
  • lib/configuratorPageProps.ts: activeAggregateProviderWeights and
    onSetAggregateProviderWeightsForType in presentationProps
  • lib/configuratorLinkImport.ts: aggregateProviderWeights in
    SHARED_VISUAL_QUERY_KEYS and CROSS_TYPE_COMPATIBLE_SUFFIXES
  • lib/crossTypeSync.ts, lib/configuratorResetGroups.ts: all four types
  
  UI
  • components/configurator appearance sections.tsx: "Provider Weights"
    section with per provider number inputs (0–100, placeholder "Equal"),
    shown only when usesAggregatePresentation
  
  Output
  • lib/useConfiguratorOutputs.ts: aggregateProviderWeightsForType derived;
    URL query param emitted when non default, omitted when equal weight
  
  Tests
  • tests/aggregate provider weights.test.mjs: 15 tests covering
    equal weight fallback, custom weight math, missing provider default,
    zero weight fallback, single entry, string parsing, object input
    (saved profile format), null/invalid input, clamping, malformed parts,
    stringify, isDefault
  • tests/ui config.test.mjs: round trip expected object updated with four
    weight fields
  • tests/config profile verification.test.mjs: verification schema updated
* FR-58 FR-76 add secondary genre replacement mode
  
  Add a new anime grouping mode that can replace Anime or Animation with the next strongest supported genre family when available, while preserving existing Split and Group as Animation behavior.
  
  Why:
  • FR-58 requests an option to avoid uninformative Anime or Animation badges and show a more meaningful secondary genre.
  • FR-76 reports inaccurate genre badge outcomes where Anime or Animation appears too generically.
  
  What changed:
  • Added secondary as a valid Genre Badge anime grouping mode in core type and normalization logic.
  • Kept split as default behavior to preserve current output for existing users.
  • Kept animation grouping behavior and added alias handling so merge style inputs normalize safely.
  • Updated resolver logic to:
  • Compute the normal primary family first.
  • If mode is secondary and the primary family is anime or animation, rerun resolution without anime or animation families.
  • Promote the secondary supported family when present.
  • Fall back to original primary when no meaningful secondary family exists.
  • Added the new mode to configurator options and UI copy.
  • Updated profile verification coverage for allowed Genre Badge anime grouping values.
  • Updated README documentation to describe genreBadgeAnimeGrouping=secondary behavior.
  • Added unit coverage for:
  • New normalization aliases and secondary mode parsing.
  • Secondary family resolution behavior for anime and animation inputs.
  • Prepared media flow to confirm resolved badge family uses secondary where applicable.
  
  Behavioral impact:
  • No change for users on split or animation.
  • Users who select secondary get more informative genre badges whenever a stronger non anime non animation family is available.
  • If no stronger family exists, badge remains anime or animation to avoid empty or misleading output.
* add normalized clean value mode to trim trailing point zero
  
  Introduce a new rating value display mode that keeps normalized ten point formatting but removes trailing point zero values.
  This allows values like 10.0 and 8.0 to render as 10 and 8 while preserving non zero decimals such as 8.6.
  The mode is exposed through the existing Rating Values selector and is parsed through the same config/query flow as other rating value modes.
  
  • Add new ratingValueMode: normalizedclean
  • Add parser aliases for normalized clean variants
  • Keep native, normalized, and normalized100 behavior unchanged
  • Update config profile verification coverage for the new mode
  • Add test coverage for formatting and mode normalization
  • Update README parameter docs and rating value mode description
* collapse quality badge custom icon editor into accordion
  
  Reduce visual clutter in the Quality section by moving custom quality badge icon URL controls into a compact accordion while preserving existing override behavior.
  
  • add derived override count via `qualityBadgeIconOverrideCount` for clearer state tracking
  • replace inline always expanded icon URL grid with a `details/summary` accordion
  • show compact status in summary (`N custom`) so active overrides remain visible when collapsed
  • keep all existing per badge icon URL edit behavior unchanged
  : trim input values
  : write override when URL is present
  : remove override entry when URL is cleared
  • keep global `Reset All` behavior unchanged and reuse the derived override count for button visibility
  • retain existing helper copy and input placeholders inside the expanded accordion panel
  
  UX impact:
  • lowers default vertical footprint of the configurator
  • makes advanced icon customization less overwhelming
  • preserves discoverability and full editing capability when expanded
* add custom icon URL override support via qualityBadgeAppearance param
  
  Add a new `qualityBadgeAppearance` query parameter that accepts a base64url encoded JSON
  object allowing per badge icon overrides for all 18 quality badge keys (certification,
  releasestatus, netflix, hbo, primevideo, disneyplus, appletvplus, hulu, paramountplus,
  peacock, 4k, hd, bluray, hdr, dolbyvision, dolbyatmos, remux, bdremux).
  
  Each override accepts an `iconUrl` field that supports both inline data URIs and external
  HTTP/HTTPS URLs, matching full parity with the existing provider badge custom icon system.
  
  New module:
  • lib/imageRouteQualityBadgeIcon.ts: external URL resolver that fetches a remote SVG or
    raster asset, converts it to a base64 data URI, caches the result for 24 hours in the
    metadata store, and deduplicates concurrent in flight requests via withDedupe()
  
  Changes:
  • lib/badgeCustomization.ts: QualityBadgeAppearanceOverride and
    QualityBadgeAppearanceOverrides types; normalise, serialize, parse, and encode helpers
  • lib/imageRouteQualityBadge.ts: check badge.iconDataUri (custom) before falling back to
    the built in asset path; adjust aspectRatio for custom icons
  • lib/imageRoutePreparedMedia.ts: move override application outside the communityBadgeTheme
    conditional so overrides apply regardless of theme state
  • lib/finalImageRenderSeed.ts: include encoded quality badge appearance overrides in the
    render seed key so cache is invalidated when overrides change
  • lib/imageRouteRequestState.ts: parse qualityBadgeAppearance query param and thread it
    through buildFinalImageRenderSeedKey and the returned request state
  • lib/imageRouteRenderer.ts: instantiate and export getQualityBadgeIconDataUri resolver
  • lib/imageRouteExecution.ts: resolve all external iconUrl values in streamBadges to data
    URIs before the render call
  • lib/useConfiguratorWorkspaceState.ts: useState for qualityBadgeAppearanceOverrides
  • lib/useConfiguratorWorkspaceConfigIo.ts: persist and load overrides from workspace config
  • lib/useConfiguratorWorkspaceRuntime.ts: wire state and IO hooks together
  • lib/useConfiguratorOutputs.ts: emit qualityBadgeAppearance param in the output URL
  • lib/configuratorPageProps.ts: forward overrides to the quality section
  • components/configurator workspace sections.tsx: per badge custom icon URL input fields
* FR-66 community badge system, tile style, HD badge, per badge style overrides
  
  Community badge system
  • Add lib/communityBadgeAssets.ts: canonical SVG resolver reading from
    public/assets/community badges/canonical/{category}/{theme}/{slug}.svg
  • Add lib/communityBadgeTheme.ts: CommunityBadgeTheme type (gold | white |
    rainbow | black) and DEFAULT_COMMUNITY_BADGE_THEME constant
  • Add public/assets/community badges/canonical/: 75 production SVGs organized
    as age/{theme}/, network/{theme}/, quality/{theme}/ with human readable slugs
    (pg 13.svg, netflix.svg, dolby vision.svg, etc.)
  • Wire communityBadgeTheme query param through resolveImageRouteRequestState,
    prepareImageRouteMediaState, buildQualityBadgeSvg, and all configurator hooks
  • community badge style delegates rendering to getCommunityBadgeSvg; taller
    badge box (height * 1.15, min 44px) to match asset proportions
  
  Tile Dark badge style
  • Add tile and community badge to QualityBadgeStyle and tile to RatingStyle
    in lib/ratingAppearance.ts; add normalizeQualityBadgeStyleOrNull helper
  • Implement tile SVG path in buildQualityBadgeSvg: dark #0f1117 background,
    left accent color strip using rounded left SVG path; handles certification
    (two line AGE + value layout), streaming service logos (icon plate + label),
    and plain text badges
  • Add tileAccentColor field to QualityBadgeInput; per badge accent colors
    threaded through prepared media state
  • Add query params: qualityBadgesTileAccentColor, networkTileColor,
    ageRatingTileColor, releaseStatusTileColor, genreBadgeTileAccentColor
  • All tile color params emitted only when style is tile
  
  Per badge style overrides
  • Add ageRatingBadgeStyle and releaseStatusBadgeStyle query params; resolved
    via normalizeQualityBadgesStyleOrNull in request state
  • Add styleOverride field to QualityBadgeInput; buildQualityBadgeSvg uses
    effectiveStyle = badge.styleOverride ?? style throughout to allow individual
    badges to override the global quality badge style
  • Certification and release status badges enriched with styleOverride and
    tileAccentColor in prepareImageRouteMediaState
  
  HD badge
  • Add hd to MediaFeatureBadgeKey, MediaFeatureFlags, MEDIA_FEATURE_BADGE_ORDER,
    and MEDIA_FEATURE_META_BY_KEY (label "HD", accentColor #38bdf8)
  • Detect hasHdCandidate from 1080P, 720P, FULLHD, FHD tokens in filenames;
    hasHd flag set when candidate found and 4K is absent
  
  Logo stream badges
  • Add dedicated logoStreamBadges query param (logoStreamBadges ||
    streamBadges fallback) resolved as logoStreamBadgesSetting
  • Logo quality badges (shouldApplyLogoQualityBadges) now require explicit
    logoStreamBadgesSetting === 'on' | 'auto' rather than activating implicitly
  • useConfiguratorOutputs emits logoStreamBadges key when not auto; wires
    logoStreamBadges through output hook props and config I/O
  
  Provider icon outline
  • Apply white outline SVG filter to provider logos in all non plain quality
    badge styles (previously only in plain); filter defined inline in defs block
    for both plain and non plain paths to ensure consistent rendering
  
  Torrentio filename deduplication
  • Collect all filename candidates from stream.filename,
    behaviorHints.filename, title, and name rather than stopping at first hit
  • Deduplicate collected filenames via Set before returning from
    extractTorrentioFilenames
  
  Configurator wiring
  • Extend useConfiguratorWorkspaceState, useConfiguratorWorkspaceRuntime,
    useConfiguratorWorkspaceConfigIo, and useConfiguratorActiveWorkspaceSettings
    with all new fields: logoStreamBadges, ageRatingBadgeStyle,
    releaseStatusBadgeStyle, communityBadgeTheme, and all five tile color fields
  • useConfiguratorOutputs: community badge theme emitted only when non default;
    per badge style overrides emitted unconditionally when non null; tile color
    params gated on matching active style
  • components/configurator workspace sections.tsx: new tile and community badge
    appearance sections surfacing all new controls
  • components/configurator appearance sections.tsx: badge style selector updated
    to include tile and community badge entries
  
  Tests and docs
  • tests/media features.test.mjs: cover hd badge detection, certification label
    hyphen stripping, generic badge label normalization
  • tests/image route torrentio.test.mjs: cover multi candidate filename harvest
    and deduplication, circuit breaker, provider budget, stale while revalidate
  • tests/ui config.test.mjs: cover stream badge default, new tile/community
    badge config fields
  • tests/cross type sync.test.mjs: updated sync assertion
  • README.md, config/readme preview gallery.json, docs/images: updated gallery
    and render comparison screenshots

### Fixed
* harden remote badge icon fetches
  
  Route remote provider icon and quality badge icon URLs through the shared
  safe source network guard instead of fetching arbitrary user supplied URLs
  directly during image rendering.
  
  Why:
  custom badge icon URLs can originate from query params or saved profile
  state. Before this change, those URLs could reach raw server side fetch
  paths in the render pipeline. That created an SSRF style risk where badge
  rendering could be abused to probe localhost, private network addresses,
  metadata services, or other internal only targets.
  
  What changed:
  • update provider icon resolution to validate icon URLs with the shared
    safe source URL assertion before any network request
  • update quality badge icon resolution to use the same validation path
  • replace direct fetch calls with the controlled safe fetch flow that
    preserves the repository's redirect and source safety rules
  • keep inline data URIs working unchanged
  • keep cache behavior unchanged for valid remote icons
  • add regression coverage proving unsafe hosts are rejected before fetch
  
  Behavior:
  • valid public http/https icon URLs still resolve normally
  • inline data URIs still bypass remote fetching
  • unsafe targets such as localhost or private/internal addresses now return
    no fetched icon instead of issuing a network request
* FR-75 FR-62 adaptive single row logo ratings and TMDB logo safe frame centering
  
  For FR-75:
  • Replace logo rating auto wrapping behavior with adaptive single row logic.
  • Dynamically cap visible rating badges by logo width tier so narrow logos keep readable badge size.
  • Keep one row output for logo ratings and trim overflow instead of shrinking into tiny icons.
  • Preserve existing rating style scaling while enforcing minimum legibility thresholds.
  
  For FR-62:
  • Add transparent safe frame compositing for logo images before badge overlays.
  • Improve perceived centering and reduce oversized edge to edge TMDB logo presentation.
  • Keep logo output transparent and platform safe for Stremio style clients.
  
  Test updates:
  • Update image route render layout expectations to validate adaptive one row behavior and width based trimming.
  • Update blockbuster logo row expectations under new adaptive constraints.
  • Add renderer coverage to assert transparent safe frame padding behavior.
  
  Files touched:
  • imageRouteRenderLayout.ts
  • imageRouteRenderer.ts
  • image route render layout.test.mjs
  • image route renderer black strip.test.mjs
* restore clean poster textless selection and clean branding behavior
  
  The clean artwork path regressed to language preferred selection, causing clean posters to look the same as original when textless art existed. This change restores clean mode semantics so clean prefers textless assets first, then falls back to language matched artwork only when textless is unavailable.
  
  What changed
  • Updated poster selection logic to prioritize textless TMDB posters for clean mode.
  • Updated backdrop selection logic to prioritize textless TMDB backdrops for clean mode consistency.
  • Updated fanart asset selection logic so clean mode prioritizes textless fanart assets.
  • Kept existing fallback behavior intact when no textless asset exists.
  • Updated unit tests to assert the restored clean mode behavior and prevent future regressions.
  
  Why
  • Clean mode is expected to produce textless art plus branding overlay placement above the bottom rating area.
  • Selecting language tagged art first made clean effectively mirror original in many cases.
  • Restoring textless first selection re enables the intended clean visual treatment.
* rebalance tile dark badge value spacing and centering
  
  Adjust Tile Dark provider badge layout so score values stay centered and keep consistent edge clearance.
  This update removes asymmetric value lane padding and applies a shared blanket inset so text no longer appears shifted or too close to the right edge.
  It also stabilizes icon plate sizing behavior to reduce per provider visual drift that made value alignment look uneven.
  
  • Use equal horizontal insets for the Tile Dark value lane
  • Preserve text centering while maintaining overflow fit behavior
  • Standardize icon plate width baseline for more consistent visual centering
  • Improve spacing reliability across different provider icon scales

### Documentation
* refresh static doc assets (2 commits)
* correct genre badge border width and outline width ranges
  
  Fix stale parameter range documentation that diverged from the actual
  runtime clamp constants in lib/badgeCustomization.ts.
  
  genreBadgeBorderWidth family (global, poster, backdrop, thumbnail, logo):
  documented as 0 to 10 but clamped to 0 to 6 by MAX_GENRE_BADGE_BORDER_WIDTH_PX.
  
  posterNoBackgroundBadgeOutlineWidth:
  documented as 0 to 10 in the main param table and missing the range entirely
  in the AI Integration Prompt table; actual clamp is 0 to 4 via
  MAX_NO_BACKGROUND_BADGE_OUTLINE_WIDTH_PX.
* align docs
  
  Update documentation and reference copy so the latest two feature commits are
  fully represented across README, reference UI text, and changelog context.
  
  • refresh README quality badge language to cover:
  • tile and community badge styles
  • HD badge behavior
  • per badge style overrides
  • qualityBadgeAppearance custom icon overrides
  • extend README parameter coverage with newly shipped query params and style
    values (including logo stream badge and tile color controls)
  • update AI integration guidance in README:
  • pass through parameter list
  • per type settings notes
  • URL build template fields
  • align reference page user facing copy with new behavior and controls:
  • style list expansion
  • community badge themes
  • tile accent controls
  • custom icon override support
  • add unreleased changelog entries summarizing FR-66 surfaces and
    qualityBadgeAppearance support

## [v1.22.7] - 20/04/2026

### Fixed
* BUG-114 preserve regional TMDB poster locale selection
  
  Preserve regional locale codes like es MX in image request state so TMDB detail requests keep the requested market instead of collapsing to the base language.
  
  Prioritize locale specific TMDB poster paths during artwork selection and keep Clean poster selection language aware so null language textless art does not override the requested locale.
  
  Add regression coverage for regional locale preservation, locale specific TMDB poster selection, and clean versus textless image preference behavior.

### Documentation
* refresh static doc assets

## [v1.22.6] - 20/04/2026

### Fixed
* preserve xrdb key in saved profiles
  
  Keep xrdbKey in protected saved profile params even when provider credentials are omitted from exported payloads.
  
  Add a preserveXrdbKey serialization option, enable it for saved profile payload generation and dirty state comparisons, and cover the behavior with regression tests.
  
  Validated with pnpm run lint, pnpm run test, pnpm run build, pnpm run verify:config profiles, and a manual in app save/reveal flow confirming config UUID requests still authorize via the stored xrdbKey.
* preserve anime season tokens in AIOM thumbnail urls
  
  Prevent anime native AIOM episode thumbnail exports from collapsing every season to S01 when XRDB builds override URLs.
  
  Keep S{season}E{episode} in generated thumbnail paths for Kitsu, AniList, MAL, and AniDB episode modes so season specific thumbnails can resolve correctly across multi season anime libraries.
  
  Retain the existing mixed provider episodeSource* hint params and explicit raw id compatibility behavior while updating the season aware path contract exercised by the export tests.
  
  Validated with focused AIOM export tests, anime media target and rating resolution tests, and the full lint, test, and build gate.

### Documentation
* refresh static doc assets (2 commits)

## [v1.22.5] - 19/04/2026

### Fixed
* preserve anime season tokens in AIOM thumbnail urls
  
  Prevent anime native AIOM episode thumbnail exports from collapsing every season to S01 when XRDB builds override URLs.
  
  Keep S{season}E{episode} in generated thumbnail paths for Kitsu, AniList, MAL, and AniDB episode modes so season specific thumbnails can resolve correctly across multi season anime libraries.
  
  Retain the existing mixed provider episodeSource* hint params and explicit raw id compatibility behavior while updating the season aware path contract exercised by the export tests.
  
  Validated with focused AIOM export tests, anime media target and rating resolution tests, and the full lint, test, and build gate.

### Documentation
* refresh static doc assets

## [v1.22.4] - 19/04/2026

### Fixed
* repair xrdb and simkl custom art placeholders

### Documentation
* refresh static doc assets

## [v1.22.3] - 18/04/2026

### Fixed
* repair encoded XRDB art placeholders in saved profiles
  
  Add an XRDB owned recovery path for AIOMetadata profiles that persisted custom
  art URL patterns with percent encoded placeholder tokens such as %7Bimdb_id%7D.
  When those encoded values are saved remotely, AIOMetadata cannot interpolate the
  expected media identifiers and live payloads emit broken XRDB URLs.
  
  This change adds a shared repair helper for AIOMetadata custom art pattern
  fields, a server route that loads and updates remote AIOMetadata profiles in
  place, and an Import/Export UI form that lets operators trigger the repair with
  profile credentials when needed.
  
  The fix is covered by focused tests for placeholder decoding, selective custom
  art field repair, and AIOMetadata base URL normalization.
  
  Validation:
  • pnpm run lint
  • pnpm run test
  • pnpm run build

### Documentation
* refresh static doc assets

## [v1.22.2] - 18/04/2026

### Added
* add mixed library thumbnail auto mode
  
  Default AIOMetadata thumbnail exports to a mixed library safe Auto mode that keeps the public IMDb style route while attaching linked anime authority candidate ids.
  
  Add provider candidate parsing and deterministic precedence at runtime so explicit episodeSourceProvider plus episodeSourceId continues to win, while Auto exports can resolve anime native authority without breaking non anime compatibility.
  
  Update export UI copy, README/reference guidance, and regression coverage for the new Auto behavior and the poster export compatibility default.

### Documentation
* refresh static doc assets

## [v1.22.1] - 18/04/2026

### Fixed
* canonicalize episode authority across thumbnails and proxy exports
  
  Add a canonical anime series and episode identity layer backed by SQLite
  series mappings, episode mappings, provider refs, override storage, and
  negative cache entries so mixed provider anime requests resolve through a
  stable authority path instead of ad hoc reverse mapping branches.
  
  Normalize thumbnail request handling to preserve provider native episode
  authority with episodeSourceProvider, episodeSourceId, episodeSourceSeason,
  episodeSourceEpisode, and episodeAbsolute hints, and include those hints in
  the render seed so canonicalized episode requests do not collide in cache.
  
  Route image request state, media target resolution, and prepared media
  selection through canonical series and episode identity lookups so xrdbid
  requests reuse IMDb backed overrides, Kitsu shorthand inputs resolve cleanly,
  mixed provider anime hints remap before downstream TMDB lookups, and TMDB
  consolidated season remaps reuse the same canonical episode authority.
  
  Update anime artwork fallback and reverse mapping helpers to reuse canonical
  provider refs, canonical AniList ids, canonical TVDB ids, and canonical
  absolute episode numbers before broader fallback heuristics, improving
  AniList episode thumbnails and Fanart fallback selection for split cour,
  special, and mixed provider cases.
  
  Teach AIOMetadata and proxy thumbnail URL generation to default anime native
  episode exports to canonical series placeholders such as xrdbid:{imdb_id},
  keep raw {id} only for explicit source faithful patterns, preserve
  episodeSource* hint params when public SxxExx tokens are only compatibility
  transport, and support the same authority rules in proxied episode rewrites.
  
  Harden proxy runtime and handler behavior by awaiting async meta image
  rewrites consistently, supporting canonical anime authority when rewriting
  video thumbnails, and keeping generated UUID backed proxy manifests aligned
  with translation and debug settings.
  
  Refresh public documentation and configurator copy to describe canonical
  anime thumbnail behavior, mixed provider episode hint params, canonical
  override operations, and updated AIOMetadata export semantics across the
  README, reference page, export view, configurator basics, and generated
  product context.
  
  Add regression coverage for canonical cache invalidation and orphan cleanup,
  override rollback, thumbnail route rewriting, mixed provider request state
  parsing, canonical media target remapping, anime reverse mapping resolution,
  artwork fallback selection, proxy thumbnail authority hints, AIOMetadata
  episode export generation, and end to end anime coverage verification.

### Documentation
* refresh static doc assets
* align canonical thumbnail integration guidance
  
  Clarify addon integration guidance for canonical anime thumbnail ids and episodeSource hint params.
  
  Expand the AI prompt parameter table to include xrdbid, tvdb, anidb, and the thumbnail only authority hint fields.
  
  Refresh the generated product context so release facing derived docs stay in sync with the README.

## [v1.22.0] - 17/04/2026

### Added
* support original language artwork selection (FR-85)
  
  • add original as a first class language option in the configurator and supported language defaults
  • keep request state cache identity distinct for lang=original without breaking fixed locale callers
  • resolve TMDB artwork bundles, certification lookups, and localized badge data through the title's original language
  • document lang=original usage and cover it with request state, prepared media, and configurator regression tests

### Fixed
* resolve BUG-111 badge border scaling
  
  Replace fixed badge border stroke widths with height relative stroke calculations so rating and genre badges keep proportional borders at large poster scales.
  
  Scale outer and inner badge strokes from badge height with clamps to preserve current normal size rendering while fixing thin borders on 4K and oversized poster outputs.
  
  Add direct SVG regression tests for rating badge glass borders and genre badge glass borders so future changes cannot silently reintroduce under scaled outlines.
* resolve BUG-110 logo quality badge flow
  
  Remove the duplicated logo quality controls from the configurator and wire logo quality badges through the full image route pipeline.
  
  Parse logo quality badge params, enable the media feature pipeline for logo requests, preserve logo quality settings in the render seed, size the logo badge band for rating and quality rows, and render logo quality rows in the final output.
  
  Add regression coverage for logo request state parsing, logo quality only layout, renderer output in the logo badge band, and render cache busting for logo quality changes.

### Documentation
* refresh static doc assets

## [v1.21.2] - 16/04/2026

### Fixed
* invalidate proxied manifests when source config changes
  
  Make proxy manifest identity depend on the effective source manifest payload and proxy seed so stable source URLs do not keep a stale addon identity after configuration changes.
  
  Add explicit no store cache headers to proxy manifest and proxy ref responses and cover the behavior with focused proxy regression tests.
* BUG-101 BUG-105 preserve proxy age rating placement and clean genre sizing
  
  Keep the genre badge size slider available when the clean text genre style is active so the configurator still exposes badge scaling in that mode.
  
  Forward ageRatingBadgePosition through shared proxy image query keys and cover the rewrite with a regression test so poster proxy manifests preserve custom age rating placement.

### Documentation
* refresh static doc assets
* align freshness guidance and refresh doc assets
  
  Clarify that the Generated manifest flow uses a stable UUID backed install URL that refreshes when the source addon manifest changes instead of implying a rotated install link is required.
  
  Update proxy page and reference copy to describe server managed TMDB and MDBList coverage, record the recent proxy and configurator fixes in the unreleased changelog, and refresh the tracked README preview metadata plus static documentation captures.

## [v1.21.1] - 16/04/2026

### Fixed
* keep personal provider keys server side
  
  Move personal provider credentials into an opaque server held session and resolve them through session aware configurator routes instead of browser visible params.
  
  Add server fallback behavior for TMDB, Fanart, and Simkl requests, strip provider keys from previews and saved workspace exports, and show masked previews for saved personal keys in the advanced access keys modal.
* harden server managed credential handling
  
  Prefer server side TMDB bearer auth when a read access token is configured while keeping explicit per request overrides intact.
  
  Redact sensitive credential query params from observer URLs and replay storage, hash MDBList cache keys, and omit xrdbKey from masked exports.
  
  Update docs, templates, and tests for the new credential handling and masked export behavior.
* BUG-109 restore full language options
  
  Move configurator language loading behind a server route so provider keys stay out of the browser while TMDB backed language options still load. Also keep the language dropdown aligned inside the viewport and cover both regressions with focused tests.
* prefer IMDb reverse mapping for anime episode fallback
  
  Use season aware reverse mapping for AniList episode thumbnail fallback instead of always routing through the TMDB show id.
  
  The previous fallback path could resolve sequel anime entries to the wrong AniList work and reuse the same episode thumbnail across seasons, which is what caused the JJK S02E01 and S03E01 collision.
  
  Prefer explicit anime mapping ids and resolved IMDb ids before falling back to TMDB, and keep the regression covered with a focused artwork selection test for the season 3 episode fallback path.
* sanitize poster warm replay requests
  
  Default poster warm renders to a lean imdb,tmdb profile and strip replay only params, provider credentials, config ids, and MDBList backed providers before replay.
  
  Share the MDBList backed provider set and add focused regressions for sanitized replay storage and warm request parameter normalization.
* BUG-108 shorten cache for transient MDBList failures
  
  Detect transient MDBList failures during provider resolution and carry a short lived TTL through prepared media into final image cache control.
  
  Add focused regressions for MDBList failure handling, provider resolution propagation, prepared media state, and final image TTL calculation.

### Documentation
* refresh static doc assets

## [v1.21.0] - 16/04/2026

### Added
* harden stream cache
  
  Implement stream cache hardening controls for Torrentio with feature gated behavior and a global hardening kill switch.
  
  Add negative caching, stale while revalidate serving, circuit breaker thresholds and cooldowns, provider request budgets, prewarm popularity ranking with snapshot restore, and observe only auto tune telemetry paths.
  
  Document activation and rollback controls in README and env template, extend config and metadata plumbing for hardening controls, and add targeted hardening tests that validate gating, rollback behavior, SWR, circuit, budgets, and prewarm recovery flows.
* add adaptive stream cache ttl policy
  
  Introduce adaptive Torrentio stream cache TTL selection using recency buckets (fresh, warm, stable) instead of relying only on a fixed TTL.
  
  Add operator configurable adaptive window and TTL environment variables, document them in README and env template, and wire prepared media cache TTL calls through the adaptive helper.
  
  Add targeted tests for recency classification boundaries, fallback behavior for missing or invalid dates, and deterministic TTL jitter behavior.

### Fixed
* BUG-106 restore full provider resolution
  
  • switch MDBList fetch from legacy mdblist.com/api query format to api.mdblist.com path format
  
  • pass resolved media type through provider rating fetch so movie/show endpoints are targeted correctly
  
  • map MDBList popcorn source aliases to tomatoesaudience so RT audience ratings render
  
  • update MDB fetch tests to assert exact endpoint URLs and add popcorn alias coverage
* replace s<=30 season cap with TMDB number_of_seasons bound
  
  Fetch the show detail endpoint to read number_of_seasons and use that
  as the upper bound for the consolidated remap season walk. Falls back
  to 100 if the endpoint fails. Eliminates the hard coded 30 season cap
  that would silently return null for long running consolidated series.
  
  Updated resolveTmdbConsolidatedSeasonEpisode tests to mock the
  tmdb:tv:{id} show detail key in all three test cases.
* BUG-102 BUG-103 TMDB episode ID mode and anime S2 consolidated remap
  
  BUG-103: add tmdb episode ID mode with tmdb:{tmdb_id} URL pattern.
  Wired tmdb to EpisodeIdMode union, EPISODE_ID_MODE_SET,
  buildEpisodePatternBaseId, and applyEpisodeIdModeToXrdbId.
  Added TMDB selector to export view and configuratorPageOptions.
  export view now imports EPISODE_ID_MODE_OPTIONS from
  configuratorPageOptions so option descriptions render inline
  below the selector pills.
  
  BUG-102: anime S2+ thumbnails now resolve unique stills via
  resolveTmdbConsolidatedSeasonEpisode. Applied in the generic
  IMDb else path and as TVDB fallback when thetvdb.com scrape
  returns null (no hard 404).
  
  README: document tmdb:{tmdb_id} in episode base ID formats.
  
  Verified: lint clean, 841/841 tests pass, production build
  clean. Manual checks: tmdb:1399/S01E01 200, anime S1/S2 stills
  differ, tvdb:81189/S99E99 200 fallback, tt0468569 poster 200,
  TVDB description visible in export options.
* constrain Tailwind source scanning to app and components (#3)
  
  Co authored by: IbbyLabs <40578997+IbbyLabs@users.noreply.github.com>

### Documentation
* refresh static doc assets
* add minimal self host template

### Other Changes
* reuse known TMDB season counts in remap helper
  
  Reuse TMDB show season counts that are already loaded in image route
  resolution when calling resolveTmdbConsolidatedSeasonEpisode. This
  avoids an extra /tv/{id} fetch in thumbnail remap paths while keeping
  the existing fallback fetch when the season count is not already known.
  
  Verified with focused thumbnail tests, full lint + test, and a fresh
  manual pass of the export and thumbnail checks on a clean dev server.
* consolidate season fetch loop into single pass
  
  Replace the separate targetSeason early check fetch and priorCount loop
  with a single pass from s=1 to targetSeason. Tracks priorCount and
  targetSeasonEpisodeCount in one loop, eliminating the duplicate fetch
  of targetSeason that previously occurred when episodes exceeded the
  season count. All fetches after the first are still cache hits.
  
  Updated test mocks to reflect the new fetch sequence.
* add color scheme dark meta tag (#2)

## [v1.20.1] - 16/04/2026

### Fixed
* BUG-100 stabilize saved profile revert and sync diffs
  
  Route saved profile revert through the canonical snapshot apply path so imported workspace changes clear dirty state correctly after revert.
  
  Compare saved profile and cross type sync params with allow missing server managed provider key options so dirty checks and sync diffs still work when TMDB and MDBList keys are only configured on the server.
  
  Add regression coverage for provider keyless dirty detection and sync to all diffs.

### Documentation
* refresh static doc assets

## [v1.20.0] - 15/04/2026

### Added
* expand poster warm sources with TMDB multi endpoint, IMDb baseline, recent ring
  
  • TMDB: fetch 6 endpoints per pass (movie/popular p1+p2, movie/now_playing p1,
    tv/popular p1+p2, tv/on_the_air p1) instead of 2; up to ~120 raw ids before cap
  • MDBList: raise default limit from 100 to 200
  • IMDb: new optional source reads local title.ratings.tsv.gz, sorts by vote count,
    merges top N ids; no network required, falls back cleanly when file is absent
  • Recent ring: bounded in memory ring buffer (default 500) records each inbound
    poster request with its full search params (auth stripped); scheduler replays
    exact request signatures so warm hits land in per config cache slots
  • Wire recordRecentPosterRequest into imageRouteHandler for poster requests
  • New env vars: XRDB_POSTER_WARM_IMDB_ENABLED/LIMIT, XRDB_POSTER_WARM_RECENT_ENABLED/LIMIT
  • Update XRDB_POSTER_WARM_MDBLIST_LIMIT default in docs and env.template to 200
  • 9 new tests covering TMDB 6 endpoint mapping, IMDb sort/cap/missing file,
    ring dedup/eviction/auth strip/limit; all existing tests updated for new fields
  • 834/834 tests pass, lint clean, build clean
* FR-80 FR-55 speed up poster cold loads
  
  • default poster stream badges to off for new configs
  
  • add non blocking posterStreamBadges=auto behavior with deferred warming
  
  • add Torrentio timeout, fallback host, and proxy bypass controls
  
  • add scheduled poster cache warming with source parsing and overlap protection
  
  • enforce metadata cache pruning bounds and add stream warm observability
  
  • update docs, env template, and tests for new behavior

### Fixed
* track poster warm target seed file
* include poster warm targets in docker build context

### Documentation
* refresh static doc assets

### Other Changes
* bake poster warm targets.txt into image

## [v1.19.1] - 15/04/2026

### Fixed
* BUG-97 apply stored episode config profile when thumbnail URL has no explicit badge params
  
  The /thumbnail/<id>/S01E01.jpg route is a thin wrapper that parses the
  episode token into season and episode numbers, then constructs an internal
  backdrop URL (/backdrop/<id>:<season>:<episode>.jpg?thumbnail=1) and
  delegates rendering to the shared image handler.
  
  XRDB_EPISODE_CONFIG_PROFILE_ID is a server side env var intended to apply
  a default config profile to all episode thumbnail requests, so Plex,
  Jellyfin, and similar callers that send bare URLs with no query params
  receive the operator configured badge and rating settings. The feature was
  completely inert due to two separate gaps in the route:
  
  1. configId was read only from the ?config= search param of the incoming
     URL. The env var was never consulted, so bare thumbnail URLs always
     rendered with no profile applied.
  
  2. The route constructs a fresh internal URL for the backdrop handler. The
     original search params are copied over but ?config= was never explicitly
     set on the internal URL. Even if configId had been populated, the
     backdrop renderer would have received no config param and skipped the
     profile lookup entirely.
  
  Fix reads XRDB_EPISODE_CONFIG_PROFILE_ID as a fallback when no ?config=
  is present on the incoming request. When configId resolves from the env
  var rather than the caller URL, it is injected into the internal backdrop
  URL as ?config= before forwarding. The guard on !requestUrl.searchParams
  .has('config') ensures the env var is strictly a fallback: an explicit
  ?config= from the caller always takes precedence.
* BUG-98 fix quality badge column centering when clean genre badge reserves bottom space
  
  When a poster renders Pill Glass quality badges alongside a clean style
  genre badge, the renderer reserves a block of space at the bottom of the
  poster for the genre badge via cleanPosterReservedBottomHeight. That value
  is folded into effectiveBadgeBottomOffset so layout bounds are correct
  throughout the renderer.
  
  The quality badge column centering step did not use effectiveBadgeBottomOffset
  as the lower boundary. Instead it divided the full output height by two,
  treating the center of the entire image as the target midpoint. The result
  was that the quality column drifted into the space reserved for the genre
  badge and appeared off center relative to the usable area above it.
  
  The fix computes availableCenter as:
    (badgeTopOffset + outputHeight, effectiveBadgeBottomOffset) / 2
  
  This bounds the center calculation to the region between the top badge
  offset and the effective bottom offset, so the column centers correctly
  within the available space regardless of how much bottom space the clean
  genre badge reserves.
* BUG-99 apply configured value color to ring score text across all accent modes
  
  aggregateValueColor was fully resolved in the display state pipeline but
  was never passed to buildPosterCompactRingOverlay. The ring builder had
  the score text fill hardcoded to #f8fafc regardless of what color was
  configured. As a result, any value set via aggregateValueColor was silently
  ignored whenever the compact ring presentation was active.
  
  The fix adds an optional valueColor param to buildPosterCompactRingOverlay
  and threads it through to the SVG fill attribute using valueColor ?? '#f8fafc'
  so the hardcoded default is preserved when no color is configured.
  
  On the display state side, compactRingValueColor is derived before the
  ring builder call: when the primary badge is an aggregate kind, the color
  follows the aggregate value color resolver; for provider badges, it falls
  back to the aggregateValueColor input. This keeps behavior consistent
  across all four accent modes (source, genre, custom, dynamic).
  
  Tests added for all four accent modes to confirm the configured color
  appears in the rendered SVG and that the default white is preserved when
  no color is set.

### Documentation
* refresh static doc assets

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
* improve workspace and experience mode UX
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

