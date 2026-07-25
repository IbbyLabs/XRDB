import {
  BRAND_DEVELOPER,
  BRAND_DEVELOPER_URL,
  BRAND_DISCORD_URL,
  BRAND_GITHUB_URL,
  BRAND_SUPPORT_URL,
} from '@/lib/brand';

/** Attribution required by the data providers, plus who built this.
 *
 *  The TMDB wording and logo are a contractual term of their API, not a
 *  courtesy, and the IMDb line is asked for by their non-commercial licence.
 *  Both are reproduced verbatim; do not reword them. */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="attribution">
          <a
            className="attribution-item"
            href="https://www.themoviedb.org"
            target="_blank"
            rel="noreferrer"
            title="The Movie Database"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/rating-logos/tmdb.svg" alt="TMDB" width={44} height={44} />
          </a>
          <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
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
            <img src="/rating-logos/imdb.svg" alt="IMDb" width={32} height={32} />
          </a>
          <p>
            Information courtesy of{' '}
            <a href="https://www.imdb.com" target="_blank" rel="noreferrer">IMDb</a>
            . Used with permission.
          </p>
        </div>

        <div className="site-footer-credit">
          <a href={BRAND_DEVELOPER_URL} target="_blank" rel="noreferrer" className="credit-link">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ibbylabs-icon-hex.png" alt="" width={18} height={18} aria-hidden />
            Developed by {BRAND_DEVELOPER}
          </a>
          <span className="credit-sep" aria-hidden>·</span>
          <a href={BRAND_GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a>
          <span className="credit-sep" aria-hidden>·</span>
          <a href={BRAND_DISCORD_URL} target="_blank" rel="noreferrer">Discord</a>
          <span className="credit-sep" aria-hidden>·</span>
          <a href={BRAND_SUPPORT_URL} target="_blank" rel="noreferrer">Ko-fi</a>
        </div>
      </div>
    </footer>
  );
}
