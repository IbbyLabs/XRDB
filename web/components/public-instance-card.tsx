'use client';

import { useSyncExternalStore } from 'react';
import { ExternalLink } from 'lucide-react';
import { PUBLIC_INSTANCE_NAME, PUBLIC_INSTANCE_URL, isCanonicalHost } from '@/lib/brand';

/** True only when the page is served from our own host, decided in the
 *  browser because the UI is a static export shipped to every self-hoster. */
const subscribeNever = () => () => {};
const readHost = () => isCanonicalHost(window.location.hostname);
const serverSnapshot = () => false;

export function useIsCanonicalHost(): boolean {
  return useSyncExternalStore(subscribeNever, readHost, serverSnapshot);
}

export function PublicInstanceCard() {
  if (!useIsCanonicalHost()) return null;
  return (
    <section className="panel home-public" aria-labelledby="home-public-title">
      <div className="panel-body">
        <h2 className="home-public-title" id="home-public-title">Public instance, hosted by {PUBLIC_INSTANCE_NAME}</h2>
        <p className="home-public-copy">
          New here? Use the public instance at{' '}
          <a href={PUBLIC_INSTANCE_URL} target="_blank" rel="noreferrer">xrdb.elfhosted.com</a>, run free by {PUBLIC_INSTANCE_NAME} with
          far more capacity than this server. Configure and save your profile there.
        </p>
        <p className="home-public-copy hint">
          Profiles do not carry across. One saved here stays here, and every artwork URL it feeds keeps working.
        </p>
        <div className="home-actions">
          <a href={PUBLIC_INSTANCE_URL} className="btn btn-primary" target="_blank" rel="noreferrer">
            <ExternalLink size={15} aria-hidden="true" />
            Use the public instance
          </a>
        </div>
      </div>
    </section>
  );
}
