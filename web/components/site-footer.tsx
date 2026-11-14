'use client';

import {
  BRAND_DEVELOPER,
  BRAND_DEVELOPER_URL,
  BRAND_DISCORD_DM_URL,
  BRAND_DISCORD_URL,
  BRAND_GITHUB_URL,
  BRAND_SUPPORT_URL,
} from '@/lib/brand';
import { useT } from '@/lib/i18n';

/** Attribution required by the data providers, plus who built this.
 *
 *  The TMDB wording and logo are a contractual term of their API, not a
 *  courtesy, and the IMDb line is asked for by their non-commercial licence.
 *  Both are reproduced verbatim; do not reword them. */
export function SiteFooter() {
  const t = useT();
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="attribution">
          <a
            className="attribution-item"
            href="https://www.themoviedb.org"
            target="_blank"
            rel="noreferrer"
            title={t('The Movie Database')}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/rating-logos/tmdb.svg" alt="TMDB" width={44} height={44} />
          </a>
          <p>{t('This product uses the TMDB API but is not endorsed or certified by TMDB.')}</p>
        </div>

        <div className="attribution">
          <a
            className="attribution-item"
            href="https://www.imdb.com"
            target="_blank"
            rel="noreferrer"
            title="IMDb"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/rating-logos/imdb.png" alt="IMDb" width={32} height={32} />
          </a>
          <p>
            {t('Information courtesy of')}{' '}
            <a href="https://www.imdb.com" target="_blank" rel="noreferrer">IMDb</a>
            {t('. Used with permission.')}
          </p>
        </div>

        <div className="site-footer-credit">
          <a href={BRAND_DEVELOPER_URL} target="_blank" rel="noreferrer" className="credit-link">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ibbylabs-icon-hex.png" alt="" width={18} height={18} aria-hidden />
            {t('Developed by {name}', { name: BRAND_DEVELOPER })}
          </a>
          <span className="credit-sep" aria-hidden>·</span>
          <a href={BRAND_GITHUB_URL} target="_blank" rel="noreferrer">{t('GitHub')}</a>
          <span className="credit-sep" aria-hidden>·</span>
          <a href={BRAND_DISCORD_URL} target="_blank" rel="noreferrer">{t('Discord')}</a>
          <span className="credit-sep" aria-hidden>·</span>
          <a
            href={BRAND_DISCORD_DM_URL}
            target="_blank"
            rel="noreferrer"
            title={t('Message the developer directly on Discord')}
          >
            {t('DM')}
          </a>
          <span className="credit-sep" aria-hidden>·</span>
          <a href={BRAND_SUPPORT_URL} target="_blank" rel="noreferrer">Ko-fi</a>
        </div>
      </div>
    </footer>
  );
}
