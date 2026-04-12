'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { DiscordPill, SupportPill } from '@/components/site-chrome';
import {
  BRAND_DISCORD_AIO_LABEL,
  BRAND_DISCORD_AIO_URL,
  BRAND_DISCORD_DM_HANDLE,
  BRAND_DISCORD_DM_URL,
  BRAND_DISCORD_OFFICIAL_LABEL,
  BRAND_DISCORD_OFFICIAL_URL,
  BRAND_GITHUB_LABEL,
  BRAND_GITHUB_URL,
} from '@/lib/siteBrand';

const SECTIONS = [
  { id: 'route-examples', label: 'Route examples' },
  { id: 'id-formats', label: 'ID formats' },
  { id: 'artwork-sources', label: 'Artwork sources' },
  { id: 'presentation-modes', label: 'Presentation modes' },
  { id: 'provider-ordering', label: 'Provider ordering' },
  { id: 'metadata-translation', label: 'Metadata translation' },
  { id: 'proxy', label: 'Proxy' },
  { id: 'aiometadata-exports', label: 'AIOMetadata exports' },
  { id: 'byok-setup', label: 'BYOK setup' },
  { id: 'per-type-controls', label: 'Per type controls' },
  { id: 'community-support', label: 'Community and support' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

export function ReferenceView() {
  const [activeSection, setActiveSection] = useState<SectionId>('route-examples');
  const [mobileOpen, setMobileOpen] = useState(false);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id as SectionId);
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 },
    );

    for (const el of sectionRefs.current.values()) {
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, []);

  const registerRef = (id: string) => (el: HTMLElement | null) => {
    if (el) {
      sectionRefs.current.set(id, el);
    } else {
      sectionRefs.current.delete(id);
    }
  };

  const activeLabel = SECTIONS.find((s) => s.id === activeSection)?.label ?? '';

  return (
    <div className="xrdb-reference-layout w-full px-4 py-6 md:px-6 md:py-8">
      <nav className="hidden lg:block min-w-0 lg:sticky lg:top-20 self-start">
        <div className="xrdb-panel rounded-2xl p-4 space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-3">Contents</div>
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className={`block rounded-lg px-3 py-2 text-[13px] transition-colors ${
                activeSection === section.id
                  ? 'bg-violet-500/15 text-violet-300 font-semibold'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {section.label}
            </a>
          ))}
        </div>
      </nav>

      <div className="lg:hidden sticky top-14 z-20 mb-4">
        <button
          type="button"
          onClick={() => setMobileOpen((prev) => !prev)}
          className="xrdb-panel w-full rounded-xl px-4 py-3 flex items-center justify-between text-sm font-semibold text-white"
        >
          <span>Jump to: {activeLabel}</span>
          <ChevronDown className={`h-4 w-4 text-zinc-400 transition-transform ${mobileOpen ? 'rotate-180' : ''}`} />
        </button>
        {mobileOpen && (
          <div className="xrdb-panel mt-1 rounded-xl p-2 absolute left-0 right-0 shadow-xl">
            {SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                onClick={() => setMobileOpen(false)}
                className={`block rounded-lg px-3 py-2 text-[13px] transition-colors ${
                  activeSection === section.id
                    ? 'bg-violet-500/15 text-violet-300 font-semibold'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {section.label}
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="min-w-0 space-y-10">
        <ReferenceSection id="route-examples" title="Route examples" ref={registerRef('route-examples')}>
          <p>
            XRDB provides three main image endpoints. Poster, backdrop, and logo artwork uses{' '}
            <code>GET /{'{'}<em>type</em>{'}'}/{'{'}<em>id</em>{'}'}.jpg</code>.
            Episode thumbnails use{' '}
            <code>GET /thumbnail/{'{'}<em>id</em>{'}'}/S{'{'}<em>season</em>{'}'}E{'{'}<em>episode</em>{'}'}.jpg</code>.
          </p>
          <CodeBlock>{`GET /poster/tt0133093.jpg?ratings=imdb,tmdb&lang=en
GET /backdrop/tmdb:movie:603.jpg?ratings=mdblist&style=plain
GET /logo/tmdb:tv:1399.jpg
GET /thumbnail/xrdbid:tt0944947/S01E01.jpg?thumbnailRatings=tmdb,imdb`}</CodeBlock>
          <p>
            Poster and backdrop responses return JPEG. Logo requests keep the <code>.jpg</code> route but may return PNG when transparency is preserved.
          </p>
        </ReferenceSection>

        <ReferenceSection id="id-formats" title="ID formats" ref={registerRef('id-formats')}>
          <p>
            The Media ID field accepts a base title ID for posters, backdrops, and logos. Thumbnail previews need an episode target. Use this guide to match the field input, the exported route, and the most common scoped query params.
          </p>

          <h3 className="text-[13px] font-semibold text-white pt-2">Accepted base ID families</h3>
          <ul>
            <li><strong>IMDb</strong> — best general base ID for posters and simple movie or show lookups. Examples: <code>tt0133093</code>, <code>tt0944947</code></li>
            <li><strong>Typed TMDB</strong> — best when movie and TV type must stay explicit. Required by Strict TMDB scope for backdrop and logo requests. Examples: <code>tmdb:movie:603</code>, <code>tmdb:tv:1399</code></li>
            <li><strong>XRDB canon ID</strong> — keeps an IMDb base ID explicit in proxy and episodic workflows. Examples: <code>xrdbid:tt0944947</code></li>
            <li><strong>TVDB</strong> — supported for series and episode targeting when your upstream IDs come from TVDB. Examples: <code>tvdb:121361</code></li>
            <li><strong>Anime IDs</strong> — use the native anime provider ID when your source does not begin with IMDb or TMDB. Examples: <code>anilist:16498</code>, <code>mal:16498</code>, <code>anidb:5114</code>, <code>kitsu:7442</code></li>
          </ul>

          <h3 className="text-[13px] font-semibold text-white pt-2">Input format by type</h3>
          <ul>
            <li><strong>Poster input</strong> — <code>baseId</code>. Example: <code>tt0133093</code> or <code>tmdb:movie:603</code></li>
            <li><strong>Backdrop input</strong> — <code>baseId</code>. Example: <code>tmdb:tv:1399</code> or <code>xrdbid:tt0944947</code></li>
            <li><strong>Logo input</strong> — <code>baseId</code>. Example: <code>tmdb:movie:603</code> or <code>tmdb:tv:1399</code></li>
            <li><strong>Thumbnail input</strong> — <code>seriesId:season:episode</code>. Example: <code>tt0944947:1:1</code> or <code>tmdb:tv:1399:1:1</code></li>
            <li><strong>Kitsu thumbnail input</strong> — <code>seriesId:episode</code>. Example: <code>kitsu:7442:1</code></li>
          </ul>

          <h3 className="text-[13px] font-semibold text-white pt-2">Strict TMDB and route safety</h3>
          <p>
            If you enable Strict TMDB scope, backdrop and logo requests must stay typed as <code>tmdb:movie:603</code> or <code>tmdb:tv:1399</code>. Plain <code>tmdb:603</code> is ambiguous and will be rejected.
            Poster routes can stay on IMDb or another supported base ID when that fits your source better. The export panels show the full scoped query string XRDB will generate for your current workspace.
          </p>

          <h3 className="text-[13px] font-semibold text-white pt-2">High signal query params</h3>
          <ul>
            <li><code>idSource=tmdb</code> — pins poster, backdrop, and logo exports to typed TMDB route patterns</li>
            <li><code>tmdbIdScope=strict</code> — requires <code>tmdb:movie:id</code> or <code>tmdb:tv:id</code> for backdrop and logo requests</li>
            <li><code>thumbnailEpisodeArtwork=still|series</code> — controls whether thumbnails prefer the episode still or the series backdrop source</li>
            <li><code>tmdb_ep_order=tvdb|tmdb</code> — when set to <code>tvdb</code>, resolves episode coordinates through TVDB aired order before fetching the TMDB episode still; default is <code>tmdb</code></li>
            <li><code>thumbnailRatings=tmdb,imdb</code> — chooses the thumbnail specific rating providers without affecting poster, backdrop, or logo routes</li>
          </ul>
        </ReferenceSection>

        <ReferenceSection id="artwork-sources" title="Artwork sources" ref={registerRef('artwork-sources')}>
          <p>
            Poster sources support <code>tmdb</code>, <code>fanart</code>, <code>cinemeta</code>, <code>omdb</code>, and <code>random</code>.
            Backdrop and logo sources support <code>tmdb</code>, <code>fanart</code>, <code>cinemeta</code>, and <code>random</code>.
          </p>
          <p>
            <code>fanart</code> uses fanart.tv artwork when a fanart key is present and now honors textless poster and backdrop choices when Fanart exposes neutral language metadata. <code>cinemeta</code> uses MetaHub when an IMDb ID is available. <code>omdb</code> (poster only) uses the server OMDb key. <code>clean</code>, <code>textless</code>, and random textless poster filters only use sources that actually supply textless artwork, so unsupported providers are skipped automatically. <code>random</code> picks a seeded source across available candidates. <code>blackbar</code> is a presentation effect: the normal artwork is retained as the background, and rating badges are rendered on a solid black strip flush with the image edge. In the configurator UI it appears as a toggle in the Presentation section.
          </p>
        </ReferenceSection>

        <ReferenceSection id="presentation-modes" title="Presentation modes" ref={registerRef('presentation-modes')}>
          <p>
            Current rating presentation modes:
          </p>
          <ul>
            <li><strong>Standard</strong> — individual provider badges</li>
            <li><strong>Compact average</strong> — one compact aggregate badge</li>
            <li><strong>Labeled average</strong> — aggregate with a label</li>
            <li><strong>Critics + Audience</strong> — separate critic and audience aggregates</li>
            <li><strong>Compact Critics + Audience</strong> — separate compact critic and audience chips</li>
            <li><strong>Compact Ring</strong> — poster only score ring with separate center and progress sources</li>
            <li><strong>Editorial</strong> — poster score mark integrated into the artwork</li>
            <li><strong>Blockbuster</strong> — premium variant</li>
            <li><strong>None</strong> — disables ratings entirely</li>
          </ul>
          <p>
            Compact Ring uses <code>posterRingValueSource</code> for the center value and <code>posterRingProgressSource</code> for the stroke.
            Sources can be <code>overall</code>, <code>critics</code>, <code>audience</code>, <code>priority-critics</code>, <code>priority-audience</code>, <code>highest</code>, or a provider id.
            Aggregate sources try their selected lane, then overall, then <code>posterRingCriticsPriority</code> or <code>posterRingAudiencePriority</code>.
            Exact provider selections stay strict.
          </p>
          <p>
            Badge styles (glass, square, plain, stacked, media, silver) control the visual treatment.
            Glass is the default for posters and backdrops; plain is the default for logos.
          </p>
        </ReferenceSection>

        <ReferenceSection id="provider-ordering" title="Provider ordering" ref={registerRef('provider-ordering')}>
          <p>
            Rating providers are specified via comma separated lists in <code>ratings</code>, <code>posterRatings</code>, <code>backdropRatings</code>, <code>thumbnailRatings</code>, or <code>logoRatings</code> query parameters.
          </p>
          <p>
            Available providers include <code>tmdb</code>, <code>mdblist</code>, <code>imdb</code>, <code>allocine</code>, <code>allocinepress</code>, <code>tomatoes</code>, <code>tomatoesaudience</code>, <code>letterboxd</code>, <code>metacritic</code>, <code>metacriticuser</code>, <code>trakt</code>, <code>simkl</code>, <code>rogerebert</code>, <code>myanimelist</code>, <code>anilist</code>, and <code>kitsu</code>.
          </p>
          <p>
            The default is <code>all</code>, which includes every configured provider.
            Specifying a custom list renders only those providers in the order listed.
          </p>
        </ReferenceSection>

        <ReferenceSection id="metadata-translation" title="Metadata translation" ref={registerRef('metadata-translation')}>
          <p>
            Metadata translation changes text in proxied addon metadata (titles, descriptions, episode text) without affecting artwork rendering.
          </p>
          <p>Four merge modes are available:</p>
          <ul>
            <li><strong>Fill missing</strong> — safest, replaces only blanks or placeholders</li>
            <li><strong>Prefer source</strong> — keeps addon text, fills gaps only</li>
            <li><strong>Prefer requested language</strong> — replaces when an exact language match exists in TMDB</li>
            <li><strong>Prefer TMDB</strong> — uses TMDB text whenever available</li>
          </ul>
          <p>
            Anime gets extra fallback help using anime mapping plus AniList and Kitsu data when TMDB is missing text.
          </p>
        </ReferenceSection>

        <ReferenceSection id="proxy" title="Proxy" ref={registerRef('proxy')}>
          <p>
            The XRDB proxy acts as a transparent overlay for any Stremio addon, replacing poster, backdrop, and logo images with XRDB generated versions while optionally translating metadata.
          </p>
          <p>
            The normal install URL now uses a server stored UUID reference (<code>/proxy/{'{'}<em>uuid</em>{'}'}/manifest.json</code>) generated by the configurator.
            That UUID points to encrypted server side proxy settings instead of exposing keys inside the path.
          </p>
          <p>
            Legacy inline proxy links still resolve during the migration window, but the configurator only copies the UUID backed manifest URL now.
          </p>
        </ReferenceSection>

        <ReferenceSection id="aiometadata-exports" title="AIOMetadata exports" ref={registerRef('aiometadata-exports')}>
          <p>
            AIOMetadata exports generate URL patterns for custom art override fields in AIOMetadata compatible addons.
            Per type URL patterns (poster, backdrop, thumbnail, logo) are emitted with unchanged defaults omitted to keep patterns lean and type scoped.
          </p>
          <p>
            The <strong>Hide credentials</strong> toggle masks patterns with placeholders without affecting live XRDB URLs.
            The <strong>Poster ID source</strong> selector controls whether poster URLs use auto mode (typed TMDB IDs), explicit TMDB, or IMDb IDs.
          </p>
          <p>
            When a protected UUID profile is active, AIOMetadata exports default to config mode so copied patterns use <code>?config=&lt;uuid&gt;</code> links first. Inline parameter URLs remain available as an advanced fallback, and legacy profile IDs must still be migrated before config mode can be used.
          </p>
        </ReferenceSection>

        <ReferenceSection id="byok-setup" title="BYOK setup" ref={registerRef('byok-setup')}>
          <p>
            XRDB is stateless: it does not permanently store API keys on the server.
            Keys are read from incoming requests, letting public instances scale without shared API usage costs.
          </p>
          <p>
            Keys are embedded directly into generated URLs (<code>tmdbKey=...&mdblistKey=...&fanartKey=...</code>) or addon proxy configurations and stored locally in localStorage when using the configurator.
          </p>
          <p>
            When you save a config profile, XRDB stores the encrypted server copy behind a password protected UUID. Use Open saved profile in Import/Export, or reopen a configurator link containing <code>?config=&lt;uuid&gt;</code>, to load that same profile on another device. Runtime image requests can still use <code>?config=&lt;uuid&gt;</code>, but profile reveal, update, rotate-password, and delete actions require an unlock step in Import/Export.
          </p>
          <p>
            Optional server side client IDs (<code>XRDB_MAL_CLIENT_ID</code>, <code>XRDB_TRAKT_CLIENT_ID</code>, <code>XRDB_SIMKL_CLIENT_ID</code>) extend ratings beyond BYOK.
            User supplied parameters always take precedence.
          </p>
        </ReferenceSection>

        <ReferenceSection id="per-type-controls" title="Per type controls" ref={registerRef('per-type-controls')}>
          <p>
            Each type (poster, backdrop, thumbnail, logo) has independent settings for rating providers, rating style, presentation, layout, badge sizing, artwork source, and quality badge limits.
          </p>
          <p>
            The preview type row also includes a sync action so you can copy the active type into one target, all targets, or pull settings back from another type after reviewing a param diff.
          </p>
          <p>
            Rating badge scale is type scoped for every artwork type, and the configurator now supports the same 70 to 200 range across poster, backdrop, thumbnail, and logo outputs.
          </p>
          <p>
            Sync respects type specific safety rules: poster only presentations fall back to standard on backdrop, thumbnail, and logo targets, thumbnail sync keeps episode safe rating providers, and logo sync skips stream badges.
          </p>
          <p>
            Posters use <code>posterRatingsLayout</code> (top, bottom, left, right, and combinations).
            Backdrops use <code>backdropRatingsLayout</code> (center, right, right vertical) and can enable <code>backdropBottomRatingsRow</code>.
            The Quality Badges panel exposes poster placement controls for supported poster layouts, disables shared placement when certification is the only visible quality badge, adds a dedicated age rating position control for the active poster layout, and includes bulk enable and hide actions for visible quality badges.
          </p>
          <p>
            Slider based customisation controls snap back to their defaults when you move close to the baseline and show a Default readout, while keeping keys, manifest inputs, and the current target unchanged.
          </p>
          <p>
            Thumbnails are the most distinct: they use the <code>/thumbnail/</code> route with dedicated episode artwork mode (<code>still</code> or <code>series</code>), their own rating provider list, and separate layout and sizing controls.
          </p>
        </ReferenceSection>

        <ReferenceSection id="community-support" title="Community and support" ref={registerRef('community-support')}>
          <p>
            Get help with XRDB, ratings, proxy setup, or addon configuration through the community Discord servers.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <DiscordPill href={BRAND_DISCORD_OFFICIAL_URL} label={BRAND_DISCORD_OFFICIAL_LABEL} title={BRAND_DISCORD_OFFICIAL_LABEL} />
            <DiscordPill href={BRAND_DISCORD_AIO_URL} label={BRAND_DISCORD_AIO_LABEL} title={BRAND_DISCORD_AIO_LABEL} />
          </div>
          <p>
            You can also reach the developer directly at{' '}
            <a href={BRAND_DISCORD_DM_URL} target="_blank" rel="noreferrer" className="text-violet-400 hover:text-violet-300 underline underline-offset-2">
              {BRAND_DISCORD_DM_HANDLE}
            </a>{' '}
            on Discord.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <a href={BRAND_GITHUB_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-[13px] font-semibold text-zinc-300 hover:text-white hover:border-white/25 transition-colors">
              {BRAND_GITHUB_LABEL}
            </a>
            <SupportPill label="Support" />
          </div>
        </ReferenceSection>
      </div>
    </div>
  );
}

function ReferenceSection({ id, title, children, ref }: { id: string; title: string; children: React.ReactNode; ref: (el: HTMLElement | null) => void }) {
  return (
    <section id={id} ref={ref} className="scroll-mt-24">
      <h2 className="text-lg font-semibold text-white mb-3">{title}</h2>
      <div className="xrdb-panel rounded-2xl p-5 space-y-3 text-[14px] leading-6 text-zinc-300 [&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[13px] [&_code]:font-mono [&_code]:text-zinc-200 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_li]:text-zinc-400">
        {children}
      </div>
    </section>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="rounded-xl border border-white/10 bg-black/70 p-4 overflow-x-auto font-mono text-[12px] leading-5 text-zinc-300">
      {children}
    </pre>
  );
}
