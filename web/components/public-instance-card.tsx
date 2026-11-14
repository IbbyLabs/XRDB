'use client';

import { useSyncExternalStore } from 'react';
import { ExternalLink } from 'lucide-react';
import { PUBLIC_INSTANCE_NAME, PUBLIC_INSTANCE_URL, isCanonicalHost } from '@/lib/brand';
import { useT } from '@/lib/i18n';

/** True only when the page is served from our own host, decided in the
 *  browser because the UI is a static export shipped to every self-hoster. */
const subscribeNever = () => () => {};
const readHost = () => isCanonicalHost(window.location.hostname);
const serverSnapshot = () => false;

export function useIsCanonicalHost(): boolean {
  return useSyncExternalStore(subscribeNever, readHost, serverSnapshot);
}

export function PublicInstanceCard() {
  const t = useT();
  if (!useIsCanonicalHost()) return null;
  return (
    <section className="panel home-public" aria-labelledby="home-public-title">
      <div className="panel-body">
        <h2 className="home-public-title" id="home-public-title">{t('Public instance, hosted by {name}', { name: PUBLIC_INSTANCE_NAME })}</h2>
        <p className="home-public-copy">
          {t('New here? Use the public instance at')}{' '}
          <a href={PUBLIC_INSTANCE_URL} target="_blank" rel="noreferrer">xrdb.elfhosted.com</a>
          {t(', run free by {name} with far more capacity than this server. Configure and save your profile there.', { name: PUBLIC_INSTANCE_NAME })}
        </p>
        <p className="home-public-copy hint">
          {t('Profiles do not carry across. One saved here stays here, and every artwork URL it feeds keeps working.')}
        </p>
        <div className="home-actions">
          <a href={PUBLIC_INSTANCE_URL} className="btn btn-primary" target="_blank" rel="noreferrer">
            <ExternalLink size={15} aria-hidden="true" />
            {t('Use the public instance')}
          </a>
        </div>
      </div>
    </section>
  );
}
