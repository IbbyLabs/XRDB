import Link from 'next/link';
import { BookOpenText, Bot, Code2, Layers3, Route, Wand2 } from 'lucide-react';

import { SitePrimaryNav } from '@/components/site-primary-nav';
import { SitePageOutro } from '@/components/site-page-outro';
import { BRAND_DISPLAY_NAME, BRAND_FULL_NAME, BRAND_GITHUB_LABEL, BRAND_GITHUB_URL, BRAND_NAME } from '@/lib/siteBrand';

const DOCS_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://xrdb.example.com';

const routeExamples = [
  {
    title: 'Movie poster with OMDb + AlloCiné',
    value: `${DOCS_BASE_URL}/poster/tt0133093.jpg?tmdbKey={tmdbKey}&mdblistKey={mdblistKey}&posterArtworkSource=omdb&posterRatings=imdb,allocine,allocinepress`,
  },
  {
    title: 'Typed TMDB backdrop with Bottom Row',
    value: `${DOCS_BASE_URL}/backdrop/tmdb:tv:1399.jpg?tmdbKey={tmdbKey}&mdblistKey={mdblistKey}&backdropRatings=tmdb,imdb&backdropBottomRatingsRow=true`,
  },
  {
    title: 'Episode thumb with XRDBID',
    value: `${DOCS_BASE_URL}/thumbnail/xrdbid:tt0944947/S01E01.jpg?tmdbKey={tmdbKey}&mdblistKey={mdblistKey}&thumbnailRatings=tmdb,imdb`,
  },
];

const docCards = [
  {
    title: 'Direct images',
    copy: 'Use path based routes for poster, backdrop, thumbnail, and logo output with the same XRDB query model.',
    icon: Route,
  },
  {
    title: 'Proxy setup',
    copy: 'Generate a proxy manifest from the configurator so rewritten artwork keeps the same settings.',
    icon: Layers3,
  },
  {
    title: 'Integration help',
    copy: 'Use the docs for examples, supported IDs, and deployment guidance without crowding the configurator.',
    icon: BookOpenText,
  },
];

const idFormatRows = [
  {
    label: 'IMDb',
    format: '`tt0133093`',
    details: 'Direct IMDb IDs are accepted as is. This is the broad compatibility path for many addons.',
  },
  {
    label: 'TMDB plain',
    format: '`tmdb:603`',
    details:
      'Plain TMDB IDs are accepted. XRDB can infer the media kind from context, but this is less explicit than typed TMDB.',
  },
  {
    label: 'TMDB typed',
    format: '`tmdb:movie:603` or `tmdb:tv:1399`',
    details:
      'Typed TMDB IDs are explicit and avoid movie vs show collisions. This is the recommended format for backdrops and logos and the default AIOMetadata poster mode.',
  },
  {
    label: 'Anime families',
    format: '`mal:`, `anilist:`, `kitsu:`, `tvdb:`, `anidb:`',
    details:
      'Anime ID prefixes are accepted directly. They are useful when your source metadata already uses anime native IDs.',
  },
];

const posterIdSourceRows = [
  {
    label: 'Auto (recommended)',
    pattern: '`/poster/tmdb:{type}:{tmdb_id}.jpg?idSource=tmdb...`',
    effect:
      'Uses typed TMDB IDs for poster patterns. This gives broader and more consistent poster coverage.',
  },
  {
    label: 'IMDb',
    pattern: '`/poster/{imdb_id}.jpg?...`',
    effect:
      'Uses IMDb IDs for poster patterns. Use this for integrations that require IMDb IDs, with possible coverage tradeoffs when IMDb IDs are missing.',
  },
];

const artworkSourceRows = [
  {
    source: '`tmdb`',
    availability: 'Poster, backdrop, thumbnail, logo',
    behavior: 'Uses normal TMDB artwork selection for the active type.',
  },
  {
    source: '`fanart`',
    availability: 'Poster, backdrop, thumbnail, logo',
    behavior:
      'Prefers fanart.tv assets when a fanart key is available, then falls back to TMDB.',
  },
  {
    source: '`cinemeta`',
    availability: 'Poster, backdrop, thumbnail, logo',
    behavior:
      'Prefers MetaHub Cinemeta assets when an IMDb ID is available, then falls back to TMDB.',
  },
  {
    source: '`random`',
    availability: 'Poster, backdrop, thumbnail, logo',
    behavior:
      'Picks a deterministic random source from the type supported pool, then falls back if needed.',
  },
  {
    source: '`omdb`',
    availability: 'Poster only',
    behavior:
      'Poster only path that uses OMDb poster data when server OMDb access and IMDb IDs are available, then falls back to TMDB.',
  },
];

const presentationRows = [
  {
    mode: '`standard`',
    visual: 'Provider badges in the selected style and layout.',
    useCase: 'Balanced default when you want provider specific badges visible.',
  },
  {
    mode: '`minimal`',
    visual: 'One compact aggregate chip.',
    useCase: 'Clean look with minimal badge density.',
  },
  {
    mode: '`average`',
    visual: 'One labeled aggregate badge (Overall, Critics, or Audience).',
    useCase: 'Simple single score display with label clarity.',
  },
  {
    mode: '`dual`',
    visual: 'Two aggregate badges, one for critics and one for audience.',
    useCase: 'When both perspectives should stay visible at the same time.',
  },
  {
    mode: '`dual-minimal`',
    visual: 'Two compact aggregate chips for critics and audience.',
    useCase: 'Dual view with lower visual weight.',
  },
  {
    mode: '`editorial`',
    visual: 'Poster uses an integrated top left editorial score mark.',
    useCase:
      'Poster focused editorial look. Non poster outputs fall back to a clean average badge.',
  },
  {
    mode: '`blockbuster`',
    visual: 'Dense promo style rendering with heavy badge presence.',
    useCase: 'High impact poster variants and showcase style outputs.',
  },
  {
    mode: '`none`',
    visual: 'No rating badges.',
    useCase: 'Artwork only output where ratings should be hidden.',
  },
];

const proxyRouteRows = [
  {
    route: '`/proxy/{config}/manifest.json`',
    purpose: 'Encoded install URL form used by the configurator proxy export.',
  },
  {
    route: '`/proxy/manifest.json?url={manifestUrl}&tmdbKey=...&mdblistKey=...`',
    purpose:
      'Query based manifest form for tools that build URLs dynamically instead of using the encoded config path.',
  },
  {
    route: '`/proxy/catalog/...`, `/proxy/meta/...`, and other addon resource paths',
    purpose:
      'Passthrough routes that forward addon resources while applying the same XRDB config for image rewrites and optional metadata translation.',
  },
];

const perTypeRows = [
  {
    type: 'Poster',
    controls:
      '`posterRatings`, `posterArtworkSource`, `posterRatingPresentation`, `posterRatingsLayout`, `posterRatingsMaxPerSide`, `posterQualityBadgesStyle`',
  },
  {
    type: 'Backdrop',
    controls:
      '`backdropRatings`, `backdropArtworkSource`, `backdropRatingPresentation`, `backdropRatingsLayout`, `backdropBottomRatingsRow`, `backdropQualityBadgesStyle`',
  },
  {
    type: 'Episode thumbnail',
    controls:
      '`thumbnailRatings`, `thumbnailArtworkSource`, `thumbnailEpisodeArtwork`, `thumbnailRatingPresentation`, `thumbnailRatingsLayout`, `thumbnailBottomRatingsRow`',
  },
  {
    type: 'Logo',
    controls:
      '`logoRatings`, `logoArtworkSource`, `logoRatingPresentation`, `logoRatingsMax`, `logoBottomRatingsRow`, `logoBackground`',
  },
];

export default function DocsPage() {
  return (
    <div className="xrdb-page min-h-screen bg-transparent text-zinc-300 selection:bg-violet-500/30">
      <SitePrimaryNav
        brandTag="Reference docs"
        items={[
          { href: '/configurator', label: 'Configurator' },
          { href: '/docs', label: 'Docs' },
        ]}
      />

      <main className="xrdb-main w-full px-6 py-10 md:py-14 2xl:px-8">
        <section className="xrdb-hero-section relative">
          <div className="xrdb-hero-orb absolute inset-0 rounded-[3rem] pointer-events-none" />
          <div className="xrdb-hero-grid">
            <div className="xrdb-hero-copy">
              <div className="xrdb-hero-meta">
                <p className="site-section-eyebrow font-mono">{BRAND_DISPLAY_NAME}</p>
              </div>
              <h1 className="xrdb-hero-title font-bold text-white">
                Docs for direct routes,<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-indigo-500 to-violet-600">
                  proxy setup, and integrations.
                </span>
              </h1>
              <p className="xrdb-hero-subtitle mt-4 text-lg text-zinc-400 leading-relaxed">
                {BRAND_NAME}, {BRAND_FULL_NAME}, keeps route examples, supported IDs, deployment guidance, and integration details here so the configurator can stay focused on artwork output.
              </p>
              <div className="xrdb-hero-actions flex flex-wrap items-center gap-4">
                <Link href="/configurator" className="xrdb-hero-primary">
                  Open Configurator
                </Link>
                <a href={BRAND_GITHUB_URL} target="_blank" rel="noreferrer" className="xrdb-hero-secondary">
                  Open {BRAND_GITHUB_LABEL}
                </a>
              </div>
            </div>

            <aside className="xrdb-panel xrdb-hero-panel">
              <p className="xrdb-panel-eyebrow font-mono">Focus areas</p>
              <div className="xrdb-hero-panel-stack">
                {docCards.map(({ title, copy, icon: Icon }) => (
                  <div key={title} className="rounded-2xl border border-white/10 bg-zinc-950/55 px-4 py-3">
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <div className="text-sm font-semibold text-white">{title}</div>
                        <div className="mt-1 text-sm leading-6 text-zinc-400">{copy}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </section>

        <section className="xrdb-section">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.95fr)]">
            <article className="rounded-[32px] border border-violet-500/15 bg-[radial-gradient(ellipse_at_top,_rgba(139,92,246,0.12),_transparent_60%),linear-gradient(180deg,rgba(30,22,42,0.95),rgba(14,10,22,0.98))] p-6 md:p-8">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300">
                  <Code2 className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-2xl font-semibold text-white">Route examples</h2>
                  <p className="mt-1 text-sm leading-6 text-zinc-400">
                    These examples show the direct image route shape. Use the configurator whenever live export values or full query strings are needed.
                  </p>
                </div>
              </div>
              <div className="mt-6 space-y-4">
                {routeExamples.map((example) => (
                  <div key={example.title} className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4">
                    <div className="text-sm font-semibold text-white">{example.title}</div>
                    <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded-xl border border-white/10 bg-black/45 p-3 font-mono text-[11px] leading-6 text-zinc-300">
                      {example.value}
                    </pre>
                  </div>
                ))}
              </div>
            </article>

            <div className="space-y-4">
              <article className="rounded-[32px] border border-white/10 bg-zinc-950/60 p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300">
                    <Wand2 className="h-5 w-5" />
                  </span>
                  <h2 className="text-2xl font-semibold text-white">Supported IDs</h2>
                </div>
                <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-400">
                  <p><span className="font-semibold text-zinc-200">IMDb</span> uses `tt...` values.</p>
                  <p><span className="font-semibold text-zinc-200">TMDB</span> works best with typed IDs such as `tmdb:movie:603` and `tmdb:tv:1399`.</p>
                  <p><span className="font-semibold text-zinc-200">Anime</span> routes accept providers such as `anilist:`, `mal:`, `tvdb:`, `anidb:`, and `kitsu:`.</p>
                  <p><span className="font-semibold text-zinc-200">Episodes</span> use `/thumbnail/{'{id}'}/S{'{season}'}E{'{episode}'}.jpg` and accept base IDs such as plain IMDb, `xrdbid:`, `tvdb:`, `kitsu:`, `anilist:`, `mal:`, and `anidb:`.</p>
                  <p><span className="font-semibold text-zinc-200">Thumbnail ratings</span> use their own `thumbnailRatings` order and currently support `tmdb` and `imdb`.</p>
                </div>
              </article>

              <article className="rounded-[32px] border border-white/10 bg-zinc-950/60 p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300">
                    <Bot className="h-5 w-5" />
                  </span>
                  <h2 className="text-2xl font-semibold text-white">Quick flow</h2>
                </div>
                <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-400">
                  <p>1. Start in the configurator and tune the live result.</p>
                  <p>2. Copy the config string, AIOMetadata URLs, or proxy manifest from the configured output.</p>
                  <p>3. Use the docs for examples, supported format notes, and integration guidance.</p>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="xrdb-section">
          <div className="space-y-4">
            <article className="rounded-[32px] border border-white/10 bg-zinc-950/60 p-6 md:p-8">
              <h2 className="text-2xl font-semibold text-white">XRDB feature explanations</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                This guide explains what each major setting does and how it changes image output, proxy behavior, and exported integration URLs.
              </p>
            </article>

            <article className="rounded-[32px] border border-white/10 bg-zinc-950/60 p-6 md:p-8">
              <h3 className="text-xl font-semibold text-white">ID formats and sources</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                XRDB accepts multiple ID families. Typed IDs are the safest choice when the source can provide them.
              </p>
              <div className="mt-4 space-y-3">
                {idFormatRows.map((row) => (
                  <div key={row.label} className="rounded-2xl border border-white/10 bg-black/35 p-4">
                    <div className="text-sm font-semibold text-white">{row.label}</div>
                    <div className="mt-1 font-mono text-xs text-zinc-300">{row.format}</div>
                    <div className="mt-2 text-sm leading-6 text-zinc-400">{row.details}</div>
                  </div>
                ))}
              </div>
              <h4 className="mt-6 text-sm font-semibold uppercase tracking-wide text-zinc-300">Poster ID source</h4>
              <div className="mt-3 space-y-3">
                {posterIdSourceRows.map((row) => (
                  <div key={row.label} className="rounded-2xl border border-white/10 bg-black/35 p-4">
                    <div className="text-sm font-semibold text-white">{row.label}</div>
                    <div className="mt-1 font-mono text-xs text-zinc-300">{row.pattern}</div>
                    <div className="mt-2 text-sm leading-6 text-zinc-400">{row.effect}</div>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-[32px] border border-white/10 bg-zinc-950/60 p-6 md:p-8">
              <h3 className="text-xl font-semibold text-white">Artwork sources</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Artwork source controls let each image type prefer a different upstream source while keeping fallback behavior predictable.
              </p>
              <div className="mt-4 space-y-3">
                {artworkSourceRows.map((row) => (
                  <div key={row.source} className="rounded-2xl border border-white/10 bg-black/35 p-4">
                    <div className="text-sm font-semibold text-white">{row.source}</div>
                    <div className="mt-1 text-xs text-zinc-500">{row.availability}</div>
                    <div className="mt-2 text-sm leading-6 text-zinc-400">{row.behavior}</div>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-[32px] border border-white/10 bg-zinc-950/60 p-6 md:p-8">
              <h3 className="text-xl font-semibold text-white">Presentation modes</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Presentation controls define the rating overlay style. Each type can use its own presentation mode.
              </p>
              <div className="mt-4 space-y-3">
                {presentationRows.map((row) => (
                  <div key={row.mode} className="rounded-2xl border border-white/10 bg-black/35 p-4">
                    <div className="text-sm font-semibold text-white">{row.mode}</div>
                    <div className="mt-1 text-sm leading-6 text-zinc-300">{row.visual}</div>
                    <div className="mt-1 text-sm leading-6 text-zinc-400">{row.useCase}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-2xl border border-violet-500/25 bg-violet-500/10 p-4 text-sm leading-6 text-zinc-300">
                Episode thumbnails use the same 16:9 layout model as backdrops and expose thumbnail scoped layout controls (`thumbnailRatingsLayout`, `thumbnailBottomRatingsRow`, `thumbnailSideRatingsPosition`, `thumbnailSideRatingsOffset`) so they can mirror or diverge from backdrop behavior.
              </div>
            </article>

            <article className="rounded-[32px] border border-white/10 bg-zinc-950/60 p-6 md:p-8">
              <h3 className="text-xl font-semibold text-white">Rating provider ordering</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Provider order is configured per image type with `posterRatings`, `backdropRatings`, `thumbnailRatings`, and `logoRatings`. The order you set controls the provider sequence for that type.
              </p>
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/35 p-4 text-sm leading-6 text-zinc-400">
                <p>
                  Episode thumbnail ratings are type limited today and default to <span className="font-mono text-zinc-300">`tmdb,imdb`</span>.
                </p>
                <p className="mt-2">
                  Keep values per type if you want different provider emphasis across poster, backdrop, thumbnail, and logo outputs.
                </p>
              </div>
            </article>

            <article className="rounded-[32px] border border-white/10 bg-zinc-950/60 p-6 md:p-8">
              <h3 className="text-xl font-semibold text-white">Metadata translation</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Proxy metadata translation is controlled by `translateMeta` and `translateMetaMode`.
              </p>
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                  <div className="text-sm font-semibold text-white">`translateMeta=true`</div>
                  <div className="mt-2 text-sm leading-6 text-zinc-400">
                    Enables proxy side metadata translation for catalog and meta responses while image rendering settings remain unchanged.
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                  <div className="text-sm font-semibold text-white">`translateMetaMode=fill-missing` (safe default)</div>
                  <div className="mt-2 text-sm leading-6 text-zinc-400">
                    Keeps good source text, then fills blank or placeholder fields. This is the conservative default for most proxy installs.
                  </div>
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-violet-500/25 bg-violet-500/10 p-4 text-sm leading-6 text-zinc-300">
                AIOMetadata URL exports are image URL patterns. They do not change merge behavior by themselves. Translation settings matter when those addons are consumed through XRDB proxy routes.
              </div>
            </article>

            <article className="rounded-[32px] border border-white/10 bg-zinc-950/60 p-6 md:p-8">
              <h3 className="text-xl font-semibold text-white">Proxy functionality</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                XRDB supports both encoded and query based proxy configuration styles.
              </p>
              <div className="mt-4 space-y-3">
                {proxyRouteRows.map((row) => (
                  <div key={row.route} className="rounded-2xl border border-white/10 bg-black/35 p-4">
                    <div className="font-mono text-xs text-zinc-300">{row.route}</div>
                    <div className="mt-2 text-sm leading-6 text-zinc-400">{row.purpose}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/35 p-4 text-sm leading-6 text-zinc-400">
                Proxy rewrites `meta.poster`, `meta.background`, and `meta.logo` to XRDB image routes using the active config and passes non image resources through unchanged.
              </div>
            </article>

            <article className="rounded-[32px] border border-white/10 bg-zinc-950/60 p-6 md:p-8">
              <h3 className="text-xl font-semibold text-white">BYOK stateless setup</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                XRDB is stateless by design. User provided keys flow through generated URLs and encoded config payloads instead of server side session storage.
              </p>
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/35 p-4 text-sm leading-6 text-zinc-400">
                This lets one XRDB deployment serve many users while each user keeps their own API usage and limits through URL scoped credentials.
              </div>
            </article>

            <article className="rounded-[32px] border border-white/10 bg-zinc-950/60 p-6 md:p-8">
              <h3 className="text-xl font-semibold text-white">AIOMetadata exports</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                The configurator generates four ready to paste patterns for AIOMetadata fields: poster, background, logo, and episode thumbnail.
              </p>
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/35 p-4 text-sm leading-6 text-zinc-400">
                Poster pattern behavior follows the Poster ID source control. Episode thumbnail pattern behavior follows Episode ID source and thumbnail specific settings including artwork source, ratings, layout, and text mode. The Hide credentials toggle can mask key values with placeholders without changing live runtime URLs.
              </div>
            </article>

            <article className="rounded-[32px] border border-white/10 bg-zinc-950/60 p-6 md:p-8">
              <h3 className="text-xl font-semibold text-white">Per type rendering controls</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Most rendering controls are type scoped so one setup can drive different poster, backdrop, thumbnail, and logo outputs from the same base config.
              </p>
              <div className="mt-4 space-y-3">
                {perTypeRows.map((row) => (
                  <div key={row.type} className="rounded-2xl border border-white/10 bg-black/35 p-4">
                    <div className="text-sm font-semibold text-white">{row.type}</div>
                    <div className="mt-2 font-mono text-xs leading-6 text-zinc-300">{row.controls}</div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm leading-6 text-zinc-500">
                For the full parameter catalog and deployment references, use the README in the repository root.
              </p>
            </article>
          </div>
        </section>
      </main>

      <SitePageOutro />
    </div>
  );
}
