'use client';

import { useState } from 'react';
import type { MediaType } from './configurator-types';

type Frame = {
  id: string;
  label: string;
  aspect: number;
  surfaces: MediaType[];
};

// Card aspects from NuvioMobile, NuvioDesktop and NuvioTV; every row centre-crops.
const FRAMES: Frame[] = [
  { id: 'phone-episode-list', label: 'Phone · Episode List (square)', aspect: 1, surfaces: ['thumbnail'] },
  { id: 'phone-episode', label: 'Phone · Episode Row', aspect: 296 / 184, surfaces: ['thumbnail'] },
  { id: 'tv-episode', label: 'Android TV · Episode Row', aspect: 280 / 179, surfaces: ['thumbnail'] },
  { id: 'phone-cw-card', label: 'Phone & Desktop · Continue Watching Card', aspect: 1.77, surfaces: ['thumbnail', 'backdrop', 'poster'] },
  { id: 'tv-cw-card', label: 'Android TV · Continue Watching Card', aspect: 16 / 9, surfaces: ['thumbnail', 'backdrop', 'poster'] },
  { id: 'phone-cw-wide', label: 'Phone · Continue Watching Wide', aspect: 100 / 160, surfaces: ['thumbnail', 'backdrop', 'poster'] },
  { id: 'phone-catalog', label: 'Phone & Desktop · Catalog Row', aspect: 0.675, surfaces: ['poster'] },
  { id: 'tv-catalog', label: 'Android TV · Catalog Row', aspect: 126 / 189, surfaces: ['poster'] },
];

const SOURCE_ASPECT: Partial<Record<MediaType, number>> = { poster: 2 / 3, backdrop: 16 / 9, thumbnail: 16 / 9 };

export function shownShare(source: number, card: number): string {
  const wider = card > source;
  const share = wider ? source / card : card / source;
  if (share > 0.99) return 'Nuvio shows the whole image here.';
  return `Nuvio shows ${Math.round(share * 100)}% of the ${wider ? 'height' : 'width'} here.`;
}

type Props = {
  mediaType: MediaType;
  src: string;
};

export function NuvioFrame({ mediaType, src }: Props) {
  const [frameId, setFrameId] = useState('');
  const source = SOURCE_ASPECT[mediaType];
  const frames = FRAMES.filter(f => f.surfaces.includes(mediaType));
  if (!source || frames.length === 0) return null;
  const frame = frames.find(f => f.id === frameId);

  return (
    <div className="nuvio-frame">
      <label className="nuvio-frame-pick">
        <span className="nuvio-frame-label">See It in Nuvio</span>
        <select className="select" value={frame?.id ?? ''} onChange={e => setFrameId(e.target.value)}>
          <option value="">Off</option>
          {frames.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </label>
      {frame && (
        <figure className="nuvio-frame-view">
          <div className="nuvio-frame-card" style={{ aspectRatio: String(frame.aspect) }} data-testid="nuvio-frame-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={`${mediaType} as Nuvio crops it`} decoding="async" />
            <span className="nuvio-frame-tick" aria-hidden="true" />
            <span className="nuvio-frame-bar" aria-hidden="true" />
          </div>
          <figcaption className="hint">{shownShare(source, frame.aspect)}</figcaption>
        </figure>
      )}
    </div>
  );
}
