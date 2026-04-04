'use client';

import Image from 'next/image';

type PreviewType = 'poster' | 'backdrop' | 'thumbnail' | 'logo';

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
  [key: string]: unknown;
}) {
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
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded-full border border-white/10 bg-zinc-950/70 px-3 py-1.5 font-medium text-zinc-300">
            {activeTypeLabel}
          </span>
          <span className="rounded-full border border-white/10 bg-zinc-950/70 px-3 py-1.5 font-medium text-zinc-300">
            {activePresentationLabel}
          </span>
          <span className="rounded-full border border-white/10 bg-zinc-950/70 px-3 py-1.5 font-medium text-zinc-300">
            {enabledProviderCount} providers
          </span>
        </div>
      </div>
    </div>
  );
}
