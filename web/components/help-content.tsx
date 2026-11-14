'use client';

import { BRAND_DISCORD_URL, BRAND_GITHUB_URL, BRAND_SUPPORT_URL } from '@/lib/brand';
import { useT, useRich } from '@/lib/i18n';
import type { RichTags } from '@/lib/i18n';

const MARKUP: RichTags = {
  b: c => <strong>{c}</strong>,
  i: c => <em>{c}</em>,
  code: c => <code>{c}</code>,
};

const LINKS: RichTags = {
  discord: c => <a href={BRAND_DISCORD_URL} target="_blank" rel="noreferrer">{c}</a>,
  github: c => <a href={BRAND_GITHUB_URL} target="_blank" rel="noreferrer">{c}</a>,
  support: c => <a href={BRAND_SUPPORT_URL} target="_blank" rel="noreferrer">{c}</a>,
};

export function HelpContent() {
  const t = useT();
  const rich = useRich();
  return (
    <div className="page-inner">
      <div className="page-head">
        <h1 className="page-title">{t('Help & documentation')}</h1>
        <p className="page-sub">{t('How XRDB overlays your media artwork, and how to dial in a look.')}</p>
      </div>

      <div className="help">
        <section aria-labelledby="help-what">
          <h2 id="help-what">{t('What XRDB does')}</h2>
          <p>
            {t('XRDB sits in front of your media library and re-renders artwork — posters, backdrops, thumbnails and logos — with overlays: ratings, quality badges, genre and age labels, a trending tag, and aggregate or score-based presentations. You design a look once in the configurator and every image your setup requests is rendered to match.')}
          </p>
        </section>

        <section aria-labelledby="help-flow">
          <h2 id="help-flow">{t('The workflow')}</h2>
          <ol>
            <li>{rich('<b>Find a title</b> — search by name, or paste an IMDb (<code>tt…</code>) or TMDB ID.', MARKUP)}</li>
            <li>{rich('<b>Adjust the controls</b> — the preview updates live. Undo any change with Ctrl/Cmd+Z.', MARKUP)}</li>
            <li>{rich('<b>Style each surface</b> — poster, backdrop, thumbnail and logo are configured separately; use <i>Copy to all surfaces</i> to match them.', MARKUP)}</li>
            <li>{rich('<b>Save a profile</b> to get a short config key, then open <i>Install</i> to wire it into your media setup. You can also share a link that carries the exact look.', MARKUP)}</li>
          </ol>
        </section>

        <section aria-labelledby="help-sources">
          <h2 id="help-sources">{t('Artwork sources')}</h2>
          <dl>
            <dt>TMDB</dt><dd>{t('The Movie Database — broad, reliable poster coverage.')}</dd>
            <dt>Fanart.tv</dt><dd>{t('High-resolution, often textless artwork.')}</dd>
            <dt>Cinemeta</dt><dd>{t("Stremio's Cinemeta catalogue artwork.")}</dd>
            <dt>{t('Random')}</dt><dd>{t('Pick a different source on each render.')}</dd>
          </dl>
          <p className="help-note">
            {rich('<i>Text on poster</i> chooses how much title text the artwork carries: <i>Original</i> keeps it, <i>Clean</i> prefers minimal text, and <i>Textless</i> prefers none.', MARKUP)}
          </p>
        </section>

        <section aria-labelledby="help-ratings">
          <h2 id="help-ratings">{t('Rating presentation')}</h2>
          <dl>
            <dt>{t('Standard')}</dt><dd>{t('A row of individual rating badges.')}</dd>
            <dt>{t('Minimal')}</dt><dd>{t('One pill with the overall average score.')}</dd>
            <dt>{t('Dual')}</dt><dd>{t('Critics score on top, audience score below.')}</dd>
            <dt>{t('Score bar')}</dt><dd>{t('A full-width bar coloured by the average score.')}</dd>
            <dt>{t('Editorial')}</dt><dd>{t('Magazine style: a genre label over a large score.')}</dd>
            <dt>{t('Hidden')}</dt><dd>{t('No ratings on that surface.')}</dd>
          </dl>
          <p className="help-note">
            {t("A source only appears if it actually has a rating for that title — selecting it doesn't force it to show.")}
          </p>
        </section>

        <section aria-labelledby="help-trouble">
          <h2 id="help-trouble">{t('Troubleshooting')}</h2>
          <dl>
            <dt>{t("A rating isn't showing")}</dt>
            <dd>{t("The provider has no score for that title, or its API key isn't configured on this instance.")}</dd>
            <dt>{t("Search says it's unavailable")}</dt>
            <dd>{t("The instance needs a TMDB key for search and shuffle.")}</dd>
            <dt>{t('“Preview unavailable”')}</dt>
            <dd>{t("The backend that renders images isn't reachable — check it's running.")}</dd>
          </dl>
        </section>

        <section aria-labelledby="help-more">
          <h2 id="help-more">{t('More help')}</h2>
          <p>
            {rich('Questions or a bug? Join the <discord>Discord</discord>, read the <github>source on GitHub</github>, or <support>support the project</support>.', LINKS)}
          </p>
        </section>
      </div>
    </div>
  );
}
