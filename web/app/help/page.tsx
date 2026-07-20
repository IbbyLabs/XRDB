import type { Metadata } from 'next';
import { BRAND_DISCORD_URL, BRAND_GITHUB_URL, BRAND_SUPPORT_URL } from '@/lib/brand';

export const metadata: Metadata = { title: 'Help — XRDB' };

export default function HelpPage() {
  return (
    <div className="page-inner">
      <div className="page-head">
        <h1 className="page-title">Help &amp; documentation</h1>
        <p className="page-sub">How XRDB overlays your media artwork, and how to dial in a look.</p>
      </div>

      <div className="help">
        <section aria-labelledby="help-what">
          <h2 id="help-what">What XRDB does</h2>
          <p>
            XRDB sits in front of your media library and re-renders artwork —
            posters, backdrops, thumbnails and logos — with overlays: ratings,
            quality badges, genre and age labels, a trending tag, and aggregate or
            score-based presentations. You design a look once in the configurator
            and every image your setup requests is rendered to match.
          </p>
        </section>

        <section aria-labelledby="help-flow">
          <h2 id="help-flow">The workflow</h2>
          <ol>
            <li><strong>Find a title</strong> — search by name, or paste an IMDb (<code>tt…</code>) or TMDB ID.</li>
            <li><strong>Adjust the controls</strong> — the preview updates live. Undo any change with Ctrl/Cmd+Z.</li>
            <li><strong>Style each surface</strong> — poster, backdrop, thumbnail and logo are configured separately; use <em>Copy to all surfaces</em> to match them.</li>
            <li><strong>Save a profile</strong> to get a short config key, then open <em>Install</em> to wire it into your media setup. You can also share a link that carries the exact look.</li>
          </ol>
        </section>

        <section aria-labelledby="help-sources">
          <h2 id="help-sources">Artwork sources</h2>
          <dl>
            <dt>TMDB</dt><dd>The Movie Database — broad, reliable poster coverage.</dd>
            <dt>Fanart.tv</dt><dd>High-resolution, often textless artwork.</dd>
            <dt>Cinemeta</dt><dd>Stremio&apos;s Cinemeta catalogue artwork.</dd>
            <dt>Random</dt><dd>Pick a different source on each render.</dd>
          </dl>
          <p className="help-note">
            <em>Text on poster</em> chooses how much title text the artwork carries:
            <em>Original</em> keeps it, <em>Clean</em> prefers minimal text, and
            <em>Textless</em> prefers none.
          </p>
        </section>

        <section aria-labelledby="help-ratings">
          <h2 id="help-ratings">Rating presentation</h2>
          <dl>
            <dt>Standard</dt><dd>A row of individual rating badges.</dd>
            <dt>Minimal</dt><dd>One pill with the overall average score.</dd>
            <dt>Dual</dt><dd>Critics score on top, audience score below.</dd>
            <dt>Score bar</dt><dd>A full-width bar coloured by the average score.</dd>
            <dt>Editorial</dt><dd>Magazine style: a genre label over a large score.</dd>
            <dt>Hidden</dt><dd>No ratings on that surface.</dd>
          </dl>
          <p className="help-note">
            A source only appears if it actually has a rating for that title — selecting
            it doesn&apos;t force it to show.
          </p>
        </section>

        <section aria-labelledby="help-trouble">
          <h2 id="help-trouble">Troubleshooting</h2>
          <dl>
            <dt>A rating isn&apos;t showing</dt>
            <dd>The provider has no score for that title, or its API key isn&apos;t configured on this instance.</dd>
            <dt>Search says it&apos;s unavailable</dt>
            <dd>The instance needs a TMDB key for search and shuffle.</dd>
            <dt>&ldquo;Preview unavailable&rdquo;</dt>
            <dd>The backend that renders images isn&apos;t reachable — check it&apos;s running.</dd>
          </dl>
        </section>

        <section aria-labelledby="help-more">
          <h2 id="help-more">More help</h2>
          <p>
            Questions or a bug? Join the{' '}
            <a href={BRAND_DISCORD_URL} target="_blank" rel="noreferrer">Discord</a>, read
            the{' '}
            <a href={BRAND_GITHUB_URL} target="_blank" rel="noreferrer">source on GitHub</a>, or{' '}
            <a href={BRAND_SUPPORT_URL} target="_blank" rel="noreferrer">support the project</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
