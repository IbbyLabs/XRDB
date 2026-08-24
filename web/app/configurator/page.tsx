import { ConfiguratorClient } from '@/components/configurator-client';
import { DEFAULT_MEDIA_ID, defaultPreviewPayload } from '@/components/configurator-types';
import { renderPath } from '@/lib/api';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Configurator — XRDB' };

// The preview poster is the largest element on this page and the client builds
// its URL, so the browser cannot see it until the bundles have run. Injecting
// the preload before them starts the download alongside the JavaScript instead
// of behind it. Derived from the same constants the client uses, so the URL
// cannot drift from the one it asks for.
//
// Skipped when the session holds a title or config: that visitor resumes on a
// different poster and would download this one for nothing.
const PRELOAD = `(function(){try{
if(sessionStorage.getItem('xrdb-media-id')||sessionStorage.getItem('xrdb-configs'))return;
}catch(e){}
var l=document.createElement('link');
l.rel='preload';l.as='image';l.href=${JSON.stringify(renderPath('poster', DEFAULT_MEDIA_ID, defaultPreviewPayload()))};
l.fetchPriority='high';
document.head.appendChild(l);})();`;

export default function ConfiguratorPage() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: PRELOAD }} />
      <ConfiguratorClient />
    </>
  );
}
