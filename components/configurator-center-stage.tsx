'use client';

import { useCallback, useState } from 'react';
import Image from 'next/image';
import { ArrowLeftRight, Shuffle } from 'lucide-react';

import { useConfiguratorContext } from '@/lib/configuratorProvider';
import { ConfirmDiffModal, type ConfirmDiffSection } from '@/components/confirm-diff-modal';
import { SyncFlyout } from '@/components/sync-flyout';
import {
  computeSyncDiff,
  computeSyncToAllDiff,
  applySyncableSettings,
  extractSyncableSettings,
} from '@/lib/crossTypeSync';
import type { MediaSearchPreviewType } from '@/lib/configuratorMediaSearch';

type PreviewType = 'poster' | 'backdrop' | 'thumbnail' | 'logo';

const TYPE_LABEL: Record<PreviewType, string> = {
  poster: 'Poster',
  backdrop: 'Backdrop',
  thumbnail: 'Thumbnail',
  logo: 'Logo',
};

const ALL_TYPES: PreviewType[] = ['poster', 'backdrop', 'thumbnail', 'logo'];

type SyncDiffModalState = {
  title: string;
  description: string;
  confirmLabel: string;
  sections: ConfirmDiffSection[];
  onConfirm: () => void;
};

export function ConfiguratorCenterStage({
  previewType,
  onSelectPreviewType,
  previewUrl,
  previewErrored,
  previewErrorDetails,
  tmdbKeyPresent,
  onPreviewImageError,
  onPreviewImageLoad,
  activeTypeLabel,
  activePresentationLabel,
  enabledProviderCount,
  onShuffleMediaTarget,
  ...rest
}: {
  previewType: PreviewType;
  onSelectPreviewType: (value: PreviewType) => void;
  previewUrl: string;
  previewErrored: boolean;
  previewErrorDetails: string;
  tmdbKeyPresent: boolean;
  onPreviewImageError: (url: string) => void | Promise<void>;
  onPreviewImageLoad: (url: string) => void;
  activeTypeLabel: string;
  activePresentationLabel: string;
  enabledProviderCount: number;
  onShuffleMediaTarget: () => void;
  [key: string]: unknown;
}) {
  const { buildCurrentUiConfig, applySavedUiConfig } = useConfiguratorContext();
  const [openSyncFlyout, setOpenSyncFlyout] = useState<{ type: PreviewType; rect: DOMRect } | null>(null);
  const [syncDiffModal, setSyncDiffModal] = useState<SyncDiffModalState | null>(null);

  const openSyncTo = useCallback(
    (sourceType: PreviewType, targetType: PreviewType) => {
      const currentConfig = buildCurrentUiConfig();
      const incoming = extractSyncableSettings(
        currentConfig.settings,
        sourceType as MediaSearchPreviewType,
      );
      const after = applySyncableSettings(
        currentConfig.settings,
        targetType as MediaSearchPreviewType,
        incoming,
      );
      const diff = computeSyncDiff(currentConfig.settings, after);
      const targetLabel = TYPE_LABEL[targetType];
      setSyncDiffModal({
        title: `Sync to ${targetLabel}`,
        description: `Review changes to ${targetLabel} before applying.`,
        confirmLabel: `Apply to ${targetLabel}`,
        sections: [{ entries: diff.entries, totalChanged: diff.totalChanged }],
        onConfirm: () => {
          const fresh = buildCurrentUiConfig();
          const src = extractSyncableSettings(
            fresh.settings,
            sourceType as MediaSearchPreviewType,
          );
          const updated = applySyncableSettings(
            fresh.settings,
            targetType as MediaSearchPreviewType,
            src,
          );
          applySavedUiConfig({ ...fresh, settings: updated });
          setSyncDiffModal(null);
        },
      });
    },
    [buildCurrentUiConfig, applySavedUiConfig],
  );

  const openSyncToAll = useCallback(
    (sourceType: PreviewType) => {
      const currentConfig = buildCurrentUiConfig();
      const allDiffs = computeSyncToAllDiff(
        currentConfig.settings,
        sourceType as MediaSearchPreviewType,
      );
      const otherTypes = ALL_TYPES.filter((t) => t !== sourceType);
      const sections: ConfirmDiffSection[] = otherTypes.map((t) => ({
        label: TYPE_LABEL[t],
        entries: allDiffs[t as MediaSearchPreviewType].entries,
        totalChanged: allDiffs[t as MediaSearchPreviewType].totalChanged,
      }));
      setSyncDiffModal({
        title: 'Sync to all',
        description: 'Review changes to all types before applying.',
        confirmLabel: 'Apply to all',
        sections,
        onConfirm: () => {
          const fresh = buildCurrentUiConfig();
          const extracted = extractSyncableSettings(
            fresh.settings,
            sourceType as MediaSearchPreviewType,
          );
          let updated = fresh.settings;
          for (const targetType of otherTypes) {
            updated = applySyncableSettings(
              updated,
              targetType as MediaSearchPreviewType,
              extracted,
            );
          }
          applySavedUiConfig({ ...fresh, settings: updated });
          setSyncDiffModal(null);
        },
      });
    },
    [buildCurrentUiConfig, applySavedUiConfig],
  );

  return (
    <div id="workspace-preview" className="space-y-3 scroll-mt-24">
      <div className="xrdb-panel rounded-2xl p-4">
        <div className="rounded-xl border border-white/10 bg-black/70 p-4 min-h-[300px] sm:min-h-[380px] flex items-center justify-center flex-col">
          {previewUrl && !previewErrored ? (
            <div className="w-full flex flex-col items-center">
              <div
                className={`relative shadow-2xl shadow-black ring-1 ring-white/10 rounded-2xl overflow-hidden ${
                  previewType === 'poster'
                    ? 'aspect-[2/3] w-full max-w-[22rem]'
                    : previewType === 'logo'
                      ? 'h-48 w-full max-w-xl'
                      : 'aspect-video w-full max-w-3xl'
                }`}
              >
                <Image
                  key={previewUrl}
                  src={previewUrl}
                  alt="Preview"
                  unoptimized
                  fill
                  className={previewType === 'logo' ? 'object-contain' : 'object-cover'}
                  onLoad={() => { onPreviewImageLoad(previewUrl); }}
                  onError={() => { void onPreviewImageError(previewUrl); }}
                />
              </div>
            </div>
          ) : (
            <div className="w-full max-w-md text-center">
              <div className="mx-auto flex h-44 w-full max-w-[13rem] items-end justify-center rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
                <div className="grid w-full grid-cols-[1fr_auto] gap-3">
                  <div className="flex items-end">
                    <div className="rounded-full border border-white/10 bg-black/50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-200">
                      {activeTypeLabel}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-10 w-10 rounded-xl border border-white/10 bg-white/10" />
                    <div className="h-10 w-10 rounded-xl border border-white/10 bg-white/10" />
                  </div>
                </div>
              </div>
              <div className="mt-4 text-sm text-zinc-400 leading-6">
                {previewErrored
                  ? previewErrorDetails || 'Preview could not be rendered with the current settings.'
                  : tmdbKeyPresent
                    ? 'No preview available.'
                    : 'Add a TMDB key to unlock the live render.'}
              </div>
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {(['poster', 'backdrop', 'thumbnail', 'logo'] as const).map((type) => (
              <div key={`pill-wrap-${type}`}>
                <div className="flex items-center gap-1">
                  <button
                    key={`preview-pill-${type}`}
                    type="button"
                    onClick={() => onSelectPreviewType(type)}
                    className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                      previewType === type
                        ? 'border-violet-500/60 bg-zinc-800 text-white'
                        : 'border-white/10 bg-zinc-950 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setOpenSyncFlyout((prev) =>
                        prev?.type === type ? null : { type, rect },
                      );
                    }}
                    aria-label={`Sync ${TYPE_LABEL[type]} settings`}
                    className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-500 hover:bg-white/5 hover:text-zinc-300 transition-colors"
                  >
                    <ArrowLeftRight className="h-3 w-3" />
                  </button>
                </div>
                {openSyncFlyout?.type === type && (
                  <SyncFlyout
                    sourceType={type}
                    anchorRect={openSyncFlyout.rect}
                    onSyncToAll={() => openSyncToAll(type)}
                    onSyncTo={(target) => openSyncTo(type, target)}
                    onPullFrom={(source) => openSyncTo(source, type)}
                    onClose={() => setOpenSyncFlyout(null)}
                  />
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={onShuffleMediaTarget}
            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-zinc-950 px-3 py-1.5 text-[11px] font-medium text-zinc-400 transition-colors hover:text-white"
          >
            <Shuffle className="h-3 w-3" />
            Shuffle
          </button>
        </div>

        <p className="mt-2 text-[10px] text-zinc-500">Select to preview each type</p>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded-full border border-white/10 bg-zinc-950/70 px-3 py-1.5 font-medium text-zinc-300">
            {activePresentationLabel}
          </span>
          <span className="rounded-full border border-white/10 bg-zinc-950/70 px-3 py-1.5 font-medium text-zinc-300">
            {enabledProviderCount} providers
          </span>
        </div>

      </div>

      {syncDiffModal ? (
        <ConfirmDiffModal
          title={syncDiffModal.title}
          description={syncDiffModal.description}
          confirmLabel={syncDiffModal.confirmLabel}
          sections={syncDiffModal.sections}
          onConfirm={syncDiffModal.onConfirm}
          onCancel={() => setSyncDiffModal(null)}
        />
      ) : null}
    </div>
  );
}
