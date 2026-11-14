'use client';

import { useState } from 'react';
import type { MediaType } from './configurator-types';
import { useT } from '@/lib/i18n';
import { msg } from '@/lib/i18n-msg';
import type { TFunction } from '@/lib/i18n';

type Frame = {
  id: string;
  label: string;
  aspect: number;
  surfaces: MediaType[];
};

// Card aspects from NuvioMobile, NuvioDesktop and NuvioTV; every row centre-crops.
const FRAMES: Frame[] = [
  { id: 'phone-episode-list', label: msg('Phone · Episode List (square)'), aspect: 1, surfaces: ['thumbnail'] },
  { id: 'phone-episode', label: msg('Phone · Episode Row'), aspect: 296 / 184, surfaces: ['thumbnail'] },
  { id: 'tv-episode', label: msg('Android TV · Episode Row'), aspect: 280 / 179, surfaces: ['thumbnail'] },
  { id: 'phone-cw-card', label: msg('Phone & Desktop · Continue Watching Card'), aspect: 1.77, surfaces: ['thumbnail', 'backdrop', 'poster'] },
  { id: 'tv-cw-card', label: msg('Android TV · Continue Watching Card'), aspect: 16 / 9, surfaces: ['thumbnail', 'backdrop', 'poster'] },
  { id: 'phone-cw-wide', label: msg('Phone · Continue Watching Wide'), aspect: 100 / 160, surfaces: ['thumbnail', 'backdrop', 'poster'] },
  { id: 'phone-catalog', label: msg('Phone & Desktop · Catalog Row'), aspect: 0.675, surfaces: ['poster'] },
  { id: 'tv-catalog', label: msg('Android TV · Catalog Row'), aspect: 126 / 189, surfaces: ['poster'] },
];

const SOURCE_ASPECT: Partial<Record<MediaType, number>> = { poster: 2 / 3, backdrop: 16 / 9, thumbnail: 16 / 9 };

export function shownShare(t: TFunction, source: number, card: number): string {
  const wider = card > source;
  const share = wider ? source / card : card / source;
  const pct = Math.round(share * 100);
  if (share > 0.99) return t('Nuvio shows the whole image here.');
  return wider
    ? t('Nuvio shows {pct}% of the height here.', { pct })
    : t('Nuvio shows {pct}% of the width here.', { pct });
}

type Props = {
  mediaType: MediaType;
  src: string;
};

export function NuvioFrame({ mediaType, src }: Props) {
  const t = useT();
  const [frameId, setFrameId] = useState('');
  const source = SOURCE_ASPECT[mediaType];
  const frames = FRAMES.filter(f => f.surfaces.includes(mediaType));
  if (!source || frames.length === 0) return null;
  const frame = frames.find(f => f.id === frameId);

  return (
    <div className="nuvio-frame">
      <label className="nuvio-frame-pick">
        <span className="nuvio-frame-label">{t('See It in Nuvio')}</span>
        <select className="select" value={frame?.id ?? ''} onChange={e => setFrameId(e.target.value)}>
          <option value="">{t('Off')}</option>
          {frames.map(f => <option key={f.id} value={f.id}>{t(f.label)}</option>)}
        </select>
      </label>
      {frame && (
        <figure className="nuvio-frame-view">
          <div className="nuvio-frame-card" style={{ aspectRatio: String(frame.aspect) }} data-testid="nuvio-frame-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={t('{mediaType} as Nuvio crops it', { mediaType })} decoding="async" />
            <span className="nuvio-frame-tick" aria-hidden="true" />
            <span className="nuvio-frame-bar" aria-hidden="true" />
          </div>
          <figcaption className="hint">{shownShare(t, source, frame.aspect)}</figcaption>
        </figure>
      )}
    </div>
  );
}
