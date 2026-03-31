import Link from 'next/link';
import { BookOpenText, Bot, Code2, Layers3, Route, Wand2 } from 'lucide-react';

import { BrandLockup, DeploymentVersionPill, ProjectArchiveNotice, SupportPill, UptimePill } from '@/components/site-chrome';
import { SitePageOutro } from '@/components/site-page-outro';
import { BRAND_DISPLAY_NAME, BRAND_FULL_NAME, BRAND_GITHUB_LABEL, BRAND_GITHUB_URL, BRAND_NAME } from '@/lib/siteBrand';

const DOCS_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://xrdb.example.com';

const routeExamples = [
  {
    title: 'Movie poster',
    value: `${DOCS_BASE_URL}/poster/tt0133093.jpg?tmdbKey={tmdbKey}&mdblistKey={mdblistKey}&ratings=imdb,tmdb`,
  },
  {
    title: 'Typed TMDB backdrop',
    value: `${DOCS_BASE_URL}/backdrop/tmdb:movie:603.jpg?tmdbKey={tmdbKey}&mdblistKey={mdblistKey}&backdropRatingsLayout=right%20vertical`,
  },
  {
    title: 'Episode thumb with XRDBID',
    value: `${DOCS_BASE_URL}/poster/xrdbid:tt0944947:1:1.jpg?tmdbKey={tmdbKey}&mdblistKey={mdblistKey}`,
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

export default function DocsPage() {
  return (
    <div className="xrdb-page min-h-screen bg-transparent text-zinc-300 selection:bg-violet-500/30">
      <nav className="xrdb-chrome sticky top-0 z-50">
        <div className="xrdb-nav-shell w-full px-6 py-4 2xl:px-8">
          <div className="xrdb-nav-desktop flex flex-wrap items-center justify-between gap-4">
            <div className="xrdb-nav-primary min-w-0">
              <BrandLockup compact />
              <span className="xrdb-brand-tag">Reference docs</span>
              <DeploymentVersionPill compact />
            </div>
            <div className="xrdb-nav-links flex flex-wrap items-center gap-2 text-sm font-medium">
              <Link href="/configurator" className="xrdb-nav-link">Configurator</Link>
              <Link href="/docs" className="xrdb-nav-link">Docs</Link>
              <a href={BRAND_GITHUB_URL} target="_blank" rel="noreferrer" className="xrdb-nav-link">{BRAND_GITHUB_LABEL}</a>
              <UptimePill label="Uptime Tracker" />
              <SupportPill label="Support" />
            </div>
          </div>
        </div>
      </nav>

      <main className="xrdb-main w-full px-6 py-10 md:py-14 2xl:px-8">
        <ProjectArchiveNotice />

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
                  <p><span className="font-semibold text-zinc-200">Episodes</span> can use `xrdbid:` when the source needs a stronger match.</p>
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
      </main>

      <SitePageOutro />
    </div>
  );
}
