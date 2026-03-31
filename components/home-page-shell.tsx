import Link from 'next/link';
import { ArrowRight, BookOpenText, Layers3, Sparkles, Wand2 } from 'lucide-react';

import { SitePrimaryNav } from '@/components/site-primary-nav';
import { SitePageOutro } from '@/components/site-page-outro';
import { BRAND_DISPLAY_NAME, BRAND_FULL_NAME, BRAND_NAME } from '@/lib/siteBrand';

const homeLaunchTracks = [
  {
    title: 'Live workspace',
    copy: 'Open the full artwork flow in one place with live preview, exports, and proxy output built from the same settings.',
    href: '/configurator',
    label: 'Open configurator',
    icon: Layers3,
  },
  {
    title: 'Reference docs',
    copy: 'Browse setup notes, route examples, and integration guidance in a dedicated docs area.',
    href: '/docs',
    label: 'Read docs',
    icon: BookOpenText,
  },
  {
    title: 'Deployment flow',
    copy: 'Move from tuning to export quickly with a structure built for public and private deployment and addon integrations.',
    href: '/docs',
    label: 'Review deployment',
    icon: Wand2,
  },
] as const;

export function HomePageShell() {
  return (
    <div className="xrdb-page min-h-screen bg-transparent text-zinc-300 selection:bg-violet-500/30">
      <SitePrimaryNav
        brandTag="Stateless artwork engine"
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
                Dynamic artwork.<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-indigo-500 to-violet-600">
                  Clearer workflow.
                </span>
              </h1>
              <p className="xrdb-hero-subtitle mt-4 text-lg text-zinc-400 leading-relaxed">
                {BRAND_NAME}, {BRAND_FULL_NAME}, generates posters, backdrops, thumbnails, and logos with live ratings, badge controls, and export ready integrations.
                Start with the configurator, then move into docs and proxy tools as needed.
              </p>
              <div className="xrdb-hero-actions flex flex-wrap items-center gap-4">
                <Link href="/configurator" className="xrdb-hero-primary">
                  Open Configurator
                </Link>
                <Link href="/docs" className="xrdb-hero-secondary">
                  Read Docs
                </Link>
              </div>
            </div>

            <aside className="xrdb-panel xrdb-hero-panel">
              <p className="xrdb-panel-eyebrow font-mono">Overview</p>
              <div className="xrdb-hero-panel-stack">
                <div>
                  <h2 className="xrdb-panel-title text-white">{BRAND_NAME} at a glance</h2>
                  <p className="xrdb-panel-copy text-zinc-400">
                    {BRAND_NAME}, {BRAND_FULL_NAME}, keeps configuration, docs, and deployment guidance in clear places.
                    The main tool stays fast to use, and the reference material stays easy to scan.
                  </p>
                </div>
                <div className="space-y-3">
                  {homeLaunchTracks.map(({ title, copy, href, label, icon: Icon }) => (
                    <Link
                      key={title}
                      href={href}
                      className="flex items-start gap-3 rounded-2xl border border-white/10 bg-zinc-950/55 px-4 py-3 transition-colors hover:border-violet-400/30"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-white">{title}</span>
                        <span className="mt-1 block text-sm leading-6 text-zinc-400">{copy}</span>
                        <span className="mt-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-violet-300">
                          {label}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </section>

        <section className="xrdb-section">
          <div className="rounded-[32px] border border-violet-500/15 bg-[radial-gradient(ellipse_at_top,_rgba(139,92,246,0.12),_transparent_60%),linear-gradient(180deg,rgba(30,22,42,0.95),rgba(14,10,22,0.98))] p-6 md:p-8">
            <div className="grid gap-4 md:grid-cols-3">
              <article className="rounded-3xl border border-white/10 bg-zinc-950/55 p-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300">
                  <Layers3 className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-xl font-semibold text-white">One working surface</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  The configurator keeps preview, exports, and proxy output together so nothing drifts out of sync.
                </p>
              </article>
              <article className="rounded-3xl border border-white/10 bg-zinc-950/55 p-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300">
                  <BookOpenText className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-xl font-semibold text-white">Separate docs</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Reference material has room to grow without making the configurator harder to use.
                </p>
              </article>
              <article className="rounded-3xl border border-white/10 bg-zinc-950/55 p-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300">
                  <Sparkles className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-xl font-semibold text-white">Deployment ready</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  {BRAND_NAME}, {BRAND_FULL_NAME}, is structured for public and private deployment, steady iteration, and long term maintenance.
                </p>
              </article>
            </div>
          </div>
        </section>
      </main>

      <SitePageOutro />
    </div>
  );
}
