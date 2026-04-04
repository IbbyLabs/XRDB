'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

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
            Multiple ID formats are supported. IMDb IDs use the standard <code>tt</code> prefix. TMDB IDs use <code>tmdb:603</code> or explicit scoping like <code>tmdb:movie:603</code> / <code>tmdb:tv:1399</code>.
          </p>
          <p>
            Anime mapping providers include <code>kitsu:1</code>, <code>anilist:123</code>, <code>myanimelist:456</code>, <code>tvdb:12345</code>, and <code>anidb:6789</code>.
            Episode thumbnails accept the same base ID families plus <code>xrdbid:{'{'}<em>imdb_id</em>{'}'}</code> as a wrapper format with season and episode appended as path segments.
          </p>
        </ReferenceSection>

        <ReferenceSection id="artwork-sources" title="Artwork sources" ref={registerRef('artwork-sources')}>
          <p>
            Poster sources support <code>tmdb</code>, <code>fanart</code>, <code>cinemeta</code>, <code>omdb</code>, and <code>random</code>.
            Backdrop and logo sources support <code>tmdb</code>, <code>fanart</code>, <code>cinemeta</code>, and <code>random</code>.
          </p>
          <p>
            <code>fanart</code> uses fanart.tv artwork when a fanart key is present. <code>cinemeta</code> uses MetaHub when an IMDb ID is available. <code>omdb</code> (poster only) uses the server OMDb key. <code>random</code> picks a seeded source across available candidates. <code>blackbar</code> renders a solid black strip instead of a real image.
          </p>
        </ReferenceSection>

        <ReferenceSection id="presentation-modes" title="Presentation modes" ref={registerRef('presentation-modes')}>
          <p>
            Six rating presentation modes are available:
          </p>
          <ul>
            <li><strong>Standard</strong> — individual provider badges</li>
            <li><strong>Compact average</strong> — one compact aggregate badge</li>
            <li><strong>Labeled average</strong> — aggregate with a label</li>
            <li><strong>Critics + Audience</strong> — separate critic and audience aggregates</li>
            <li><strong>Blockbuster</strong> — premium variant</li>
            <li><strong>None</strong> — disables ratings entirely</li>
          </ul>
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
            The proxy uses a base64url encoded config string (<code>/proxy/{'{'}<em>config</em>{'}'}/manifest.json</code>) generated by the configurator.
            That string encapsulates the base URL, API keys, per type style and layout settings, and optional overrides.
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
            Optional server side client IDs (<code>XRDB_MAL_CLIENT_ID</code>, <code>XRDB_TRAKT_CLIENT_ID</code>, <code>XRDB_SIMKL_CLIENT_ID</code>) extend ratings beyond BYOK.
            User supplied parameters always take precedence.
          </p>
        </ReferenceSection>

        <ReferenceSection id="per-type-controls" title="Per type controls" ref={registerRef('per-type-controls')}>
          <p>
            Each type (poster, backdrop, thumbnail, logo) has independent settings for rating providers, rating style, presentation, layout, badge sizing, artwork source, and quality badge limits.
          </p>
          <p>
            Posters use <code>posterRatingsLayout</code> (top, bottom, left, right, and combinations).
            Backdrops use <code>backdropRatingsLayout</code> (center, right, right vertical) and can enable <code>backdropBottomRatingsRow</code>.
          </p>
          <p>
            Thumbnails are the most distinct: they use the <code>/thumbnail/</code> route with dedicated episode artwork mode (<code>still</code> or <code>series</code>), their own rating provider list, and separate layout and sizing controls.
          </p>
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
