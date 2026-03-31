import { RATING_PROVIDER_OPTIONS, type RatingPreference } from './ratingProviderCatalog.ts';
import type { RatingProviderRow } from './ratingProviderRows.ts';

const PROVIDER_LABELS = new Map(RATING_PROVIDER_OPTIONS.map((provider) => [provider.id, provider.label]));

export const getProviderLabel = (providerId: RatingPreference) => PROVIDER_LABELS.get(providerId) ?? providerId;

export const getRowShellClassName = (enabled: boolean, isDragging: boolean) =>
  [
    'flex min-w-0 items-center gap-1.5 rounded-xl border px-2 py-2 text-[11px] transition-shadow',
    enabled
      ? 'border-violet-500/45 bg-zinc-800/85 text-white'
      : 'border-white/10 bg-zinc-950/80 text-zinc-400',
    isDragging ? 'z-10 opacity-25 ring-1 ring-violet-400/30' : 'opacity-100',
  ].join(' ');

export const getPositionChipClassName = (enabled: boolean) =>
  [
    'shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
    enabled
      ? 'border-violet-400/40 bg-violet-500/10 text-violet-100'
      : 'border-white/10 bg-white/[0.03] text-zinc-500',
  ].join(' ');

export const getDragPreviewClassName = (enabled: boolean) =>
  [
    'pointer-events-none flex min-w-[148px] max-w-[min(100vw-2rem,300px)] items-center gap-2 rounded-xl border px-2.5 py-2 shadow-[0_22px_50px_-12px_rgba(0,0,0,0.65)] ring-2 ring-violet-500/35',
    enabled
      ? 'border-violet-400/55 bg-zinc-900/95 text-white'
      : 'border-white/20 bg-zinc-950/95 text-zinc-300',
  ].join(' ');

export const buildRatingProviderGridStyle = (fillDirection: 'row' | 'column', itemCount: number) => {
  if (fillDirection !== 'column') {
    return undefined;
  }

  return {
    gridAutoFlow: 'column',
    gridTemplateRows: `repeat(${Math.max(1, Math.ceil(itemCount / 2))}, auto)`,
  } as const;
};

export const findActiveRatingProviderRow = (
  rows: RatingProviderRow[],
  activeId: RatingPreference | null,
) => {
  if (!activeId) {
    return null;
  }

  return rows.find((row) => row.id === activeId) ?? null;
};

export const resolveRatingProviderReorder = (
  rows: RatingProviderRow[],
  activeId: string,
  overId: string | null | undefined,
) => {
  if (!overId || activeId === overId) {
    return null;
  }

  const fromIndex = rows.findIndex((row) => row.id === activeId);
  const toIndex = rows.findIndex((row) => row.id === overId);
  if (fromIndex < 0 || toIndex < 0) {
    return null;
  }

  return { fromIndex, toIndex };
};
