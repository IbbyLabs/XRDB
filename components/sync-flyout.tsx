'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

type PreviewType = 'poster' | 'backdrop' | 'thumbnail' | 'logo';

const TYPE_LABEL: Record<PreviewType, string> = {
  poster: 'Poster',
  backdrop: 'Backdrop',
  thumbnail: 'Thumbnail',
  logo: 'Logo',
};

const ALL_TYPES: PreviewType[] = ['poster', 'backdrop', 'thumbnail', 'logo'];
const FLYOUT_WIDTH = 192;
const FLYOUT_HEIGHT = 286;
const VIEWPORT_PADDING = 8;
const BOTTOM_NAV_SAFE_SPACE = 80;
const ANCHOR_GAP = 6;

export function SyncFlyout({
  sourceType,
  anchorRect,
  onSyncToAll,
  onSyncTo,
  onPullFrom,
  onClose,
}: {
  sourceType: PreviewType;
  anchorRect: DOMRect;
  onSyncToAll: () => void;
  onSyncTo: (type: PreviewType) => void;
  onPullFrom: (type: PreviewType) => void;
  onClose: () => void;
}) {
  const flyoutRef = useRef<HTMLDivElement>(null);
  const otherTypes = ALL_TYPES.filter((t) => t !== sourceType);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (flyoutRef.current && !flyoutRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0;

  const preferredTop = anchorRect.bottom + ANCHOR_GAP;
  const flippedTop = anchorRect.top - FLYOUT_HEIGHT - ANCHOR_GAP;
  const maxTop = Math.max(
    VIEWPORT_PADDING,
    viewportHeight - BOTTOM_NAV_SAFE_SPACE - FLYOUT_HEIGHT,
  );

  let top = preferredTop;
  if (preferredTop > maxTop) {
    top = flippedTop;
  }
  top = Math.max(VIEWPORT_PADDING, Math.min(top, maxTop));

  const maxLeft = Math.max(
    VIEWPORT_PADDING,
    viewportWidth - FLYOUT_WIDTH - VIEWPORT_PADDING,
  );
  const left = Math.max(VIEWPORT_PADDING, Math.min(anchorRect.left, maxLeft));

  return createPortal(
    <div
      ref={flyoutRef}
      style={{ position: 'fixed', top, left }}
      className="z-[9999] w-48 rounded-xl border border-white/10 bg-zinc-900 shadow-xl py-1"
    >
      <button
        type="button"
        onClick={() => { onSyncToAll(); onClose(); }}
        className="w-full text-left px-3 py-2 text-[12px] text-zinc-300 hover:bg-white/5 hover:text-white transition-colors"
      >
        Sync to all
      </button>
      {otherTypes.map((type) => (
        <button
          key={`sync-to-${type}`}
          type="button"
          onClick={() => { onSyncTo(type); onClose(); }}
          className="w-full text-left px-3 py-2 text-[12px] text-zinc-300 hover:bg-white/5 hover:text-white transition-colors"
        >
          Sync to {TYPE_LABEL[type]}
        </button>
      ))}
      <div className="my-1 border-t border-white/10" />
      {otherTypes.map((type) => (
        <button
          key={`pull-from-${type}`}
          type="button"
          onClick={() => { onPullFrom(type); onClose(); }}
          className="w-full text-left px-3 py-2 text-[12px] text-zinc-300 hover:bg-white/5 hover:text-white transition-colors"
        >
          Pull from {TYPE_LABEL[type]}
        </button>
      ))}
    </div>,
    document.body,
  );
}
