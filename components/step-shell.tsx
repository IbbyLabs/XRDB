'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pin } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { buildEpisodePreviewMediaTarget, parseEpisodePreviewMediaTarget } from '@/lib/episodeIdentity';
import { useOptionalConfiguratorContext } from '@/lib/configuratorProvider';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { WORKFLOW_STEPS, type WorkflowStep } from '@/lib/workflowSteps';
import { XrdbDropdown } from '@/components/xrdb-dropdown';

type ArtworkStep = Exclude<WorkflowStep, 'integrations'>;
type ControlTab = 'providers' | 'style' | 'position' | 'advanced' | 'quality';
type PreviewMode = 'workspace' | 'floating';

const CONTROL_TABS: Array<{ key: ControlTab; label: string; hint: string }> = [
  { key: 'providers', label: 'Providers', hint: 'Source priority, fallback order, and API key settings' },
  { key: 'style', label: 'Style', hint: 'Typography, badges, tint, and treatment options' },
  { key: 'position', label: 'Position', hint: 'Badge stacks, title blocks, and overlay placement' },
  { key: 'quality', label: 'Quality', hint: 'Stream badges, quality badges, and certification position' },
  { key: 'advanced', label: 'Advanced', hint: 'Edge case overrides and behaviour tuning' },
];

function looksLikeMediaTarget(value: string, step: ArtworkStep): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  if (/^imdb:tt\d+(?::\d+:\d+)?$/i.test(trimmed)) {
    return true;
  }

  if (/^tt\d+(?::\d+:\d+)?$/i.test(trimmed)) {
    return true;
  }

  if (step === 'thumbnail') {
    return /^tmdb:(movie|tv):\d+(?::\d+:\d+)?$/i.test(trimmed);
  }

  return /^tmdb:(movie|tv):\d+$/i.test(trimmed);
}

const PANEL_COPY: Record<ArtworkStep, Record<ControlTab, { title: string; body: string }>> = {
  poster: {
    providers: {
      title: 'Poster providers',
      body: 'Provider controls for poster source priority and fallback order appear in this panel.',
    },
    style: {
      title: 'Poster style controls',
      body: 'Poster typography, badges, and treatment controls appear here with live updates.',
    },
    position: {
      title: 'Poster position controls',
      body: 'Position controls for badge stacks, logo rows, and title blocks appear in this panel.',
    },
    quality: {
      title: 'Poster quality badges',
      body: 'Stream badges, quality badge style, badge preferences, and certification position controls appear here.',
    },
    advanced: {
      title: 'Poster advanced controls',
      body: 'Advanced poster behaviour and edge case tuning controls appear in this section.',
    },
  },
  backdrop: {
    providers: {
      title: 'Backdrop providers',
      body: 'Provider controls for backdrop sourcing and fallback behaviour appear in this panel.',
    },
    style: {
      title: 'Backdrop style controls',
      body: 'Backdrop tint, badge, and composition style controls appear in this panel.',
    },
    position: {
      title: 'Backdrop position controls',
      body: 'Backdrop position controls for metadata rows and overlays appear in this panel.',
    },
    quality: {
      title: 'Backdrop quality badges',
      body: 'Stream badges, quality badge style, badge preferences, and certification position controls appear here.',
    },
    advanced: {
      title: 'Backdrop advanced controls',
      body: 'Advanced backdrop options and override settings appear in this section.',
    },
  },
  thumbnail: {
    providers: {
      title: 'Thumbnail providers',
      body: 'Thumbnail source controls and episode specific provider handling appear in this panel.',
    },
    style: {
      title: 'Thumbnail style controls',
      body: 'Thumbnail styling for compact readability and edge contrast appears in this panel.',
    },
    position: {
      title: 'Thumbnail position controls',
      body: 'Thumbnail position controls for tight layouts and row balancing appear in this panel.',
    },
    quality: {
      title: 'Thumbnail quality badges',
      body: 'Stream badges, quality badge style, badge preferences, and certification position controls appear here.',
    },
    advanced: {
      title: 'Thumbnail advanced controls',
      body: 'Advanced thumbnail behaviour and compatibility options appear in this section.',
    },
  },
  logo: {
    providers: {
      title: 'Logo providers',
      body: 'Logo source and fallback controls appear in this panel for clean mark extraction.',
    },
    style: {
      title: 'Logo style controls',
      body: 'Logo style controls for scale, blend, and cleanup behaviour appear in this panel.',
    },
    position: {
      title: 'Logo position controls',
      body: 'Logo placement and spacing controls appear in this panel for final composition.',
    },
    quality: {
      title: 'Logo quality badges',
      body: 'Quality badge style, max count, and badge preference toggles appear here.',
    },
    advanced: {
      title: 'Logo advanced controls',
      body: 'Advanced logo options and route level tuning controls appear in this section.',
    },
  },
};

function getStepIndex(step: ArtworkStep): number {
  return WORKFLOW_STEPS.findIndex(item => item.key === step);
}

export function StepShell({
  step,
  panels,
}: {
  step: ArtworkStep;
  panels?: Partial<Record<ControlTab, ReactNode>>;
}) {
  const [activeTab, setActiveTab] = useState<ControlTab>('providers');
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [fullScreenOpen, setFullScreenOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('workspace');
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [floatingPreviewPosition, setFloatingPreviewPosition] = useState(() => {
    if (typeof window === 'undefined') {
      return { x: 12, y: 96 };
    }
    const width = 360;
    const rightOffset = 20;
    const bottomOffset = 24;
    return {
      x: Math.max(12, window.innerWidth - width - rightOffset),
      y: Math.max(84, window.innerHeight - 220 - bottomOffset),
    };
  });
  const [floatingPreviewDragging, setFloatingPreviewDragging] = useState(false);
  const [floatingPreviewResizing, setFloatingPreviewResizing] = useState(false);
  const [floatingPreviewSize, setFloatingPreviewSize] = useState({ width: 360, height: 242 });
  const [imgLoaded, setImgLoaded] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const targetInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const floatingDragOffsetRef = useRef({ x: 0, y: 0 });
  const floatingPreviewWindowRef = useRef<HTMLDivElement>(null);
  const floatingResizeStartRef = useRef({ pointerX: 0, pointerY: 0, width: 360, height: 242 });


  const ctx = useOptionalConfiguratorContext();
  const router = useRouter();
  const experienceMode = ctx?.experienceMode ?? 'simple';
  const mediaTarget = ctx?.inputsPanelProps.mediaTargetProps;
  const centerStage = ctx?.workspaceColumnsProps?.centerStageProps;
  const previewUrl = centerStage?.previewUrl ?? null;
  const previewErrored = centerStage?.previewErrored ?? false;
  const onPreviewImageLoad = centerStage?.onPreviewImageLoad;
  const onPreviewImageError = centerStage?.onPreviewImageError;
  const onSelectPreviewType = centerStage?.onSelectPreviewType;
  const effectivePreviewMode: PreviewMode = isMobileViewport ? 'workspace' : previewMode;

  useEffect(() => {
    return () => {
      if (searchDebounceTimeoutRef.current) {
        clearTimeout(searchDebounceTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const mediaQuery = window.matchMedia('(max-width: 919px)');
    const update = () => {
      setIsMobileViewport(mediaQuery.matches);
    };

    update();
    mediaQuery.addEventListener('change', update);
    return () => {
      mediaQuery.removeEventListener('change', update);
    };
  }, []);

  useEffect(() => {
    if (effectivePreviewMode !== 'floating') {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      setFloatingPreviewPosition((current) => {
        const maxX = Math.max(12, window.innerWidth - floatingPreviewSize.width - 12);
        const maxY = Math.max(84, window.innerHeight - floatingPreviewSize.height - 12);
        const nextX = Math.min(maxX, Math.max(12, event.clientX - floatingDragOffsetRef.current.x));
        const nextY = Math.min(maxY, Math.max(84, event.clientY - floatingDragOffsetRef.current.y));
        if (nextX === current.x && nextY === current.y) {
          return current;
        }
        return { x: nextX, y: nextY };
      });
    };

    const stopDragging = () => {
      setFloatingPreviewDragging(false);
    };

    if (floatingPreviewDragging) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', stopDragging);
      window.addEventListener('pointercancel', stopDragging);
    }

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
  }, [effectivePreviewMode, floatingPreviewDragging, floatingPreviewSize.height, floatingPreviewSize.width]);

  useEffect(() => {
    if (effectivePreviewMode !== 'floating') {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      setFloatingPreviewSize((current) => {
        const deltaX = event.clientX - floatingResizeStartRef.current.pointerX;
        const deltaY = event.clientY - floatingResizeStartRef.current.pointerY;
        const maxWidth = Math.min(560, Math.max(280, window.innerWidth - 24));
        const maxHeight = Math.max(220, window.innerHeight - 96);
        const nextWidth = Math.min(maxWidth, Math.max(280, floatingResizeStartRef.current.width + deltaX));
        const nextHeight = Math.min(maxHeight, Math.max(220, floatingResizeStartRef.current.height + deltaY));

        if (nextWidth === current.width && nextHeight === current.height) {
          return current;
        }

        return { width: nextWidth, height: nextHeight };
      });
    };

    const stopResizing = () => {
      setFloatingPreviewResizing(false);
    };

    if (floatingPreviewResizing) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', stopResizing);
      window.addEventListener('pointercancel', stopResizing);
    }

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResizing);
      window.removeEventListener('pointercancel', stopResizing);
    };
  }, [effectivePreviewMode, floatingPreviewResizing]);

  useEffect(() => {
    onSelectPreviewType?.(step as Parameters<NonNullable<typeof onSelectPreviewType>>[0]);
  }, [step, onSelectPreviewType]);

  const stepIndex = getStepIndex(step);
  const nextStep = stepIndex >= 0 && stepIndex < WORKFLOW_STEPS.length - 1 ? WORKFLOW_STEPS[stepIndex + 1] : null;
  const prevStep = stepIndex > 0 ? WORKFLOW_STEPS[stepIndex - 1] : null;

  const visibleTabs = useMemo(
    () => (experienceMode === 'simple' ? CONTROL_TABS.filter((tab) => tab.key !== 'advanced' && tab.key !== 'quality') : CONTROL_TABS),
    [experienceMode],
  );
  const thumbnailEpisodeTarget = useMemo(() => {
    if (step !== 'thumbnail' || !mediaTarget) {
      return null;
    }
    return parseEpisodePreviewMediaTarget(mediaTarget.mediaId);
  }, [mediaTarget, step]);
  const effectiveActiveTab: ControlTab =
    experienceMode === 'simple' && (activeTab === 'advanced' || activeTab === 'quality') ? 'providers' : activeTab;
  const activeTabDefinition = visibleTabs.find((tab) => tab.key === effectiveActiveTab);

  useFocusTrap(overlayRef, overlayOpen);
  useFocusTrap(fullscreenRef, fullScreenOpen);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const activeElement = document.activeElement;
      const inInput =
        activeElement instanceof HTMLElement &&
        (activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'SELECT' ||
          activeElement.tagName === 'TEXTAREA');

      if (event.key === 'Escape') {
        if (fullScreenOpen) {
          setFullScreenOpen(false);
          return;
        }
        if (overlayOpen) {
          setOverlayOpen(false);
        }
        return;
      }

      if (inInput) {
        return;
      }

      if ((event.key === 'p' || event.key === 'P') && !overlayOpen && !fullScreenOpen) {
        setOverlayOpen(true);
        return;
      }

      if ((event.key === 'f' || event.key === 'F') && overlayOpen && !fullScreenOpen) {
        setOverlayOpen(false);
        setFullScreenOpen(true);
        return;
      }

      if (event.key === ']' && nextStep && !overlayOpen && !fullScreenOpen) {
        event.preventDefault();
        router.push(nextStep.href);
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key === 'z' && !overlayOpen && !fullScreenOpen) {
        event.preventDefault();
        ctx?.undoLastConfigApply?.();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [overlayOpen, fullScreenOpen, nextStep, router, ctx]);

  const handleTargetSubmit = () => {
    if (!mediaTarget) {
      return;
    }

    const trimmed = targetInputRef.current?.value.trim() ?? '';
    if (!trimmed) {
      return;
    }

    if (looksLikeMediaTarget(trimmed, step)) {
      if (step === 'thumbnail') {
        mediaTarget.onThumbnailEpisodeChange(trimmed);
      } else {
        mediaTarget.onMediaIdChange(trimmed);
      }
      mediaTarget.onMediaSearchQueryChange('');
      return;
    }

    mediaTarget.onMediaSearchQueryChange(trimmed);
    mediaTarget.onMediaSearchSubmit();
  };

  const handleTargetInputChange = (value: string) => {
    if (!mediaTarget) {
      return;
    }

    if (searchDebounceTimeoutRef.current) {
      clearTimeout(searchDebounceTimeoutRef.current);
    }

    const trimmed = value.trim();
    mediaTarget.onMediaSearchQueryChange(trimmed);

    if (!trimmed || looksLikeMediaTarget(trimmed, step)) {
      return;
    }

    searchDebounceTimeoutRef.current = setTimeout(() => {
      mediaTarget.onMediaSearchSubmit();
    }, 300);
  };

  const handleThumbnailEpisodeNumberChange = (part: 'season' | 'episode', rawValue: string) => {
    if (step !== 'thumbnail' || !mediaTarget) {
      return;
    }

    const parsedValue = Number.parseInt(rawValue, 10);
    const normalizedValue = Number.isFinite(parsedValue) ? Math.max(1, parsedValue) : 1;
    const baseMediaId = thumbnailEpisodeTarget?.mediaId ?? mediaTarget.mediaId;
    const seasonNumber = part === 'season' ? normalizedValue : (thumbnailEpisodeTarget?.seasonNumber ?? 1);
    const episodeNumber = part === 'episode' ? normalizedValue : (thumbnailEpisodeTarget?.episodeNumber ?? 1);
    const nextMediaTarget = buildEpisodePreviewMediaTarget({
      mediaId: baseMediaId,
      seasonNumber,
      episodeNumber,
    });

    if (!nextMediaTarget) {
      return;
    }

    mediaTarget.onThumbnailEpisodeChange(nextMediaTarget);
    mediaTarget.onMediaSearchQueryChange('');
  };

  const docsCaptureReady = ctx?.docsCaptureReady ?? false;

  return (
    <section
      className="xrdb-step-shell xrdb-page"
      aria-label={`${step} step shell`}
      data-docs-capture-ready={docsCaptureReady ? 'true' : undefined}
    >
      {effectivePreviewMode === 'workspace' ? (
        <div className="xrdb-preview-band" role="region" aria-label={`${step} preview`} data-preview-mode={effectivePreviewMode}>
          <div className="xrdb-preview-band-head">
            <h1 className="xrdb-preview-band-title">{WORKFLOW_STEPS[stepIndex]?.label ?? 'Artwork'} workspace</h1>
            <div className="xrdb-preview-band-actions">
              <div className="xrdb-preview-mode-switch" role="group" aria-label="Preview mode">
                <button
                  type="button"
                  className={`xrdb-preview-mode-btn${effectivePreviewMode === 'workspace' ? ' xrdb-preview-mode-btn-active' : ''}`}
                  onClick={() => setPreviewMode('workspace')}
                  aria-pressed={effectivePreviewMode === 'workspace'}
                >
                  Resizable
                </button>
                <button
                  type="button"
                  className={`xrdb-preview-mode-btn${previewMode === 'floating' ? ' xrdb-preview-mode-btn-active' : ''}`}
                  onClick={() => setPreviewMode('floating')}
                  aria-pressed={previewMode === 'floating'}
                  disabled={isMobileViewport}
                  title={isMobileViewport ? 'Floating mode is desktop only' : 'Switch to floating preview'}
                >
                  Floating
                </button>
              </div>
              <button className="xrdb-btn xrdb-btn-secondary xrdb-inspect-desktop" type="button" onClick={() => setOverlayOpen(true)}>
                Inspect
              </button>
            </div>
          </div>

          <button
            className={`xrdb-preview-canvas xrdb-preview-canvas-${step}`}
            type="button"
            onClick={() => setOverlayOpen(true)}
            aria-label={`Open ${step} preview overlay`}
          >
            {previewUrl && !previewErrored ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className={`xrdb-preview-img${imgLoaded ? ' xrdb-preview-img-loaded' : ''}`}
                src={previewUrl}
                alt={`${step} preview`}
                onLoad={() => {
                  setImgLoaded(true);
                  onPreviewImageLoad?.(previewUrl);
                }}
                onError={() => {
                  setImgLoaded(false);
                  void onPreviewImageError?.(previewUrl);
                }}
              />
            ) : (
              previewErrored ? (
                <>
                  <span className="xrdb-preview-canvas-label">Preview failed to load</span>
                  <span className="xrdb-preview-canvas-hint">Check your proxy URL and server keys, then try a different title to regenerate</span>
                </>
              ) : (
                <>
                  <span className="xrdb-preview-canvas-label">{WORKFLOW_STEPS[stepIndex]?.previewLabel}</span>
                  <span className="xrdb-preview-canvas-hint">Tap or click to inspect larger preview</span>
                </>
              )
            )}
          </button>
        </div>
      ) : null}

      <div className="xrdb-step-controls" role="region" aria-label="Step controls">
        {effectivePreviewMode === 'floating' ? (
          <div className="xrdb-floating-mode-banner" role="status">
            <p className="xrdb-floating-mode-text">Floating preview is active.</p>
            <button
              type="button"
              className="xrdb-btn xrdb-btn-secondary"
              onClick={() => setPreviewMode('workspace')}
            >
              Return to resizable
            </button>
          </div>
        ) : null}
        {mediaTarget ? (
          <div className="xrdb-target-toolbar" aria-label="Preview target controls">
            <label className="xrdb-target-field">
              <span className="xrdb-target-label">Search</span>
              <div className="xrdb-target-search-row">
                <input
                  key={mediaTarget.activePreviewTitle || mediaTarget.mediaId || `${step}-target`}
                  ref={targetInputRef}
                  type="search"
                  defaultValue={mediaTarget.mediaSearchQuery.trim() || mediaTarget.activePreviewTitle || mediaTarget.mediaId}
                  onChange={(event) => handleTargetInputChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleTargetSubmit();
                    }
                  }}
                  className={`xrdb-target-input${mediaTarget.mediaSearchLoading ? ' xrdb-target-input-loading' : ''}`}
                  placeholder="e.g. Inception or imdb:tt1375666"
                  aria-label="Search title or ID"
                  aria-busy={mediaTarget.mediaSearchLoading}
                />
                <button
                  type="button"
                  className="xrdb-btn xrdb-btn-secondary"
                  onClick={handleTargetSubmit}
                  disabled={mediaTarget.mediaSearchLoading}
                  aria-busy={mediaTarget.mediaSearchLoading}
                >
                  {mediaTarget.mediaSearchLoading ? 'Searching' : 'Search'}
                </button>
                <button
                  type="button"
                  className="xrdb-btn xrdb-btn-secondary"
                  onClick={mediaTarget.onShuffleMediaTarget}
                >
                  Shuffle
                </button>
              </div>
              <p className="xrdb-target-help">Type a title to search, or paste an IMDb or TMDB ID to switch the preview target directly.</p>
            </label>
            {mediaTarget.tmdbKeyAvailable ? (
              <div className="xrdb-target-lang-field">
                <span className="xrdb-target-label">Language</span>
                <XrdbDropdown
                  className="xrdb-target-lang-select"
                  triggerClassName="xrdb-target-lang-trigger"
                  menuClassName="xrdb-target-lang-menu"
                  optionClassName="xrdb-target-lang-option"
                  value={mediaTarget.lang}
                  onChange={mediaTarget.onLangChange}
                  ariaLabel="Poster language"
                  options={mediaTarget.supportedLanguages.map((option) => ({
                    value: option.code,
                    label: `${option.flag} ${option.label}`,
                  }))}
                />
              </div>
            ) : null}
            {mediaTarget.activePreviewTitle ? (
              <div className="xrdb-target-active-row">
                {mediaTarget.activePreviewPosterUrl ? (
                  <span
                    className="xrdb-target-active-poster"
                    role="img"
                    aria-label={`${mediaTarget.activePreviewTitle} poster`}
                    style={{ backgroundImage: `url(${mediaTarget.activePreviewPosterUrl})` }}
                  />
                ) : (
                  <span className="xrdb-target-active-poster-placeholder" aria-hidden="true" />
                )}
                <p className="xrdb-target-active">Preview target: {mediaTarget.activePreviewTitle}</p>
                {!mediaTarget.isPinned(mediaTarget.mediaId) ? (
                  <button
                    type="button"
                    className="xrdb-target-pin-current"
                    onClick={mediaTarget.onTogglePin}
                  >
                    Pin target
                  </button>
                ) : null}
              </div>
            ) : null}
            {step === 'thumbnail' ? (
              <div className="xrdb-target-episode-row" aria-label="Thumbnail episode controls">
                <label className="xrdb-target-episode-field">
                  <span className="xrdb-target-label">Season</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    className="xrdb-target-input"
                    value={thumbnailEpisodeTarget?.seasonNumber ?? 1}
                    onChange={(event) => handleThumbnailEpisodeNumberChange('season', event.target.value)}
                    aria-label="Season number"
                  />
                </label>
                <label className="xrdb-target-episode-field">
                  <span className="xrdb-target-label">Episode</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    className="xrdb-target-input"
                    value={thumbnailEpisodeTarget?.episodeNumber ?? 1}
                    onChange={(event) => handleThumbnailEpisodeNumberChange('episode', event.target.value)}
                    aria-label="Episode number"
                  />
                </label>
              </div>
            ) : null}
            {mediaTarget.mediaSearchError ? (
              <p className="xrdb-target-error" role="alert">{mediaTarget.mediaSearchError}</p>
            ) : null}
            {mediaTarget.pinnedTargets.length ? (
              <div className="xrdb-target-pins" aria-label="Pinned targets">
                {mediaTarget.pinnedTargets.map((target) => (
                  <div key={target.mediaId} className="xrdb-target-pin-card">
                    <button
                      type="button"
                      className="xrdb-target-pin-select"
                      onClick={() => mediaTarget.onSelectPinnedTarget(target)}
                    >
                      {target.posterUrl ? (
                        <span
                          className="xrdb-target-result-poster"
                          role="img"
                          aria-label={`${target.title} poster`}
                          style={{ backgroundImage: `url(${target.posterUrl})` }}
                        />
                      ) : (
                        <span className="xrdb-target-result-poster-placeholder" aria-hidden="true" />
                      )}
                      <span className="xrdb-target-pin-title">{target.title}</span>
                      <span className="xrdb-target-pin-id">{target.mediaId}</span>
                    </button>
                    <button
                      type="button"
                      className="xrdb-target-pin-remove"
                      onClick={() => mediaTarget.onRemovePinnedTarget(target.mediaId)}
                      aria-label={`Unpin ${target.title}`}
                    >
                      <Pin size={14} fill="currentColor" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            {mediaTarget.mediaSearchResults.length ? (
              <div className="xrdb-target-results" aria-label="Search results">
                {mediaTarget.mediaSearchResults.slice(0, 6).map((result) => {
                  const isPinned = mediaTarget.isPinned(result.mediaId);

                  return (
                    <div key={result.mediaId} className="xrdb-target-result-card">
                    <button
                      type="button"
                      className="xrdb-target-result"
                      onClick={() => mediaTarget.onSelectMediaSearchResult(result)}
                    >
                      {result.posterUrl ? (
                        <span
                          className="xrdb-target-result-poster"
                          role="img"
                          aria-label={`${result.title} poster`}
                          style={{ backgroundImage: `url(${result.posterUrl})` }}
                        />
                      ) : (
                        <span className="xrdb-target-result-poster-placeholder" aria-hidden="true" />
                      )}
                      <span className="xrdb-target-result-title">{result.title}</span>
                      <span className="xrdb-target-result-id">{result.mediaId}</span>
                    </button>
                    <button
                      type="button"
                      className={`xrdb-target-result-pin-inline${isPinned ? ' xrdb-target-result-pin-inline-active' : ''}`}
                      onClick={() => mediaTarget.onPinSearchResult(result)}
                      disabled={isPinned || mediaTarget.isPinnedLimitReached}
                      aria-label={isPinned ? `Pinned ${result.title}` : `Pin ${result.title}`}
                    >
                      <Pin size={14} />
                    </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="xrdb-subtabs" role="tablist" aria-label="Control sections">
          {visibleTabs.map(tab => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={effectiveActiveTab === tab.key}
              aria-controls={`panel-${tab.key}`}
              id={`tab-${tab.key}`}
              className={`xrdb-subtab${effectiveActiveTab === tab.key ? ' xrdb-subtab-active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
              title={tab.hint}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <p className="xrdb-subtabs-guidance" role="status" aria-live="polite">
          {activeTabDefinition?.hint ?? PANEL_COPY[step][effectiveActiveTab].body}
        </p>

        <div
          id={`panel-${effectiveActiveTab}`}
          role="tabpanel"
          aria-labelledby={`tab-${effectiveActiveTab}`}
          className="xrdb-subtab-panel"
        >
          {panels?.[effectiveActiveTab] ?? (
            <>
              <h2 className="xrdb-subtab-panel-title">{PANEL_COPY[step][effectiveActiveTab].title}</h2>
              <p className="xrdb-subtab-panel-body">{PANEL_COPY[step][effectiveActiveTab].body}</p>
            </>
          )}
        </div>

        <button
          className="xrdb-preview-fab"
          type="button"
          onClick={() => setOverlayOpen(true)}
          aria-label="Open preview"
          title="Open preview (P)"
        >
          Preview
        </button>

        {effectivePreviewMode === 'workspace' ? (
          <button
            className="xrdb-preview-return-btn"
            type="button"
            onClick={() => {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            aria-label="Return to preview"
            title="Scroll back to preview"
          >
            ↑
          </button>
        ) : null}
      </div>

      {overlayOpen ? (
        <div
          ref={overlayRef}
          className="xrdb-preview-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Preview overlay"
          aria-labelledby="overlay-heading"
          onClick={() => setOverlayOpen(false)}
        >
          <span id="overlay-heading" className="sr-only">Preview overlay</span>
          <button
            className="xrdb-preview-overlay-dismiss"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setOverlayOpen(false);
            }}
            aria-label="Close preview overlay"
          >
            Close
          </button>
          <button
            className={`xrdb-preview-overlay-canvas xrdb-preview-canvas-${step}`}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setOverlayOpen(false);
              setFullScreenOpen(true);
            }}
            aria-label="Open full screen preview"
          >
            {previewUrl && !previewErrored ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="xrdb-preview-img xrdb-preview-img-loaded"
                src={previewUrl}
                alt={`${step} preview enlarged`}
              />
            ) : (
              <>
                <span className="xrdb-preview-canvas-label">Expanded {WORKFLOW_STEPS[stepIndex]?.previewLabel}</span>
                <span className="xrdb-preview-canvas-hint">Inspect details here, then tap again for the full screen stage</span>
              </>
            )}
          </button>
        </div>
      ) : null}

      {effectivePreviewMode === 'floating' && !isMobileViewport ? (
        <div
          ref={floatingPreviewWindowRef}
          className={`xrdb-preview-floating-window${floatingPreviewDragging ? ' xrdb-preview-floating-window-dragging' : ''}${floatingPreviewResizing ? ' xrdb-preview-floating-window-resizing' : ''}`}
          style={{
            left: `${floatingPreviewPosition.x}px`,
            top: `${floatingPreviewPosition.y}px`,
            width: `${floatingPreviewSize.width}px`,
            height: `${floatingPreviewSize.height}px`,
          }}
        >
          <div
            className="xrdb-preview-floating-handle"
            role="button"
            tabIndex={0}
            onPointerDown={(event) => {
              const rect = event.currentTarget.parentElement?.getBoundingClientRect();
              if (!rect) {
                return;
              }
              floatingDragOffsetRef.current = {
                x: event.clientX - rect.left,
                y: event.clientY - rect.top,
              };
              setFloatingPreviewDragging(true);
            }}
            onKeyDown={(event) => {
              const stepSize = 16;
              if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
                return;
              }
              event.preventDefault();
              setFloatingPreviewPosition((current) => {
                const maxX = Math.max(12, window.innerWidth - floatingPreviewSize.width - 12);
                const maxY = Math.max(84, window.innerHeight - floatingPreviewSize.height - 12);
                const deltaX = event.key === 'ArrowLeft' ? -stepSize : event.key === 'ArrowRight' ? stepSize : 0;
                const deltaY = event.key === 'ArrowUp' ? -stepSize : event.key === 'ArrowDown' ? stepSize : 0;
                return {
                  x: Math.min(maxX, Math.max(12, current.x + deltaX)),
                  y: Math.min(maxY, Math.max(84, current.y + deltaY)),
                };
              });
            }}
            aria-label="Drag floating preview"
          >
            Floating preview
          </div>
          <button
            className={`xrdb-preview-floating-canvas xrdb-preview-canvas-${step}`}
            type="button"
            onClick={() => setOverlayOpen(true)}
            aria-label={`Open ${step} preview overlay`}
          >
            {previewUrl && !previewErrored ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className={`xrdb-preview-img${imgLoaded ? ' xrdb-preview-img-loaded' : ''}`}
                src={previewUrl}
                alt={`${step} preview`}
                onLoad={() => {
                  setImgLoaded(true);
                  onPreviewImageLoad?.(previewUrl);
                }}
                onError={() => {
                  setImgLoaded(false);
                  void onPreviewImageError?.(previewUrl);
                }}
              />
            ) : (
              previewErrored ? (
                <>
                  <span className="xrdb-preview-canvas-label">Preview failed to load</span>
                  <span className="xrdb-preview-canvas-hint">Check your proxy URL and server keys, then try a different title to regenerate</span>
                </>
              ) : (
                <>
                  <span className="xrdb-preview-canvas-label">{WORKFLOW_STEPS[stepIndex]?.previewLabel}</span>
                  <span className="xrdb-preview-canvas-hint">Tap or click to inspect larger preview</span>
                </>
              )
            )}
          </button>
          <button
            type="button"
            className="xrdb-preview-floating-resize-grip"
            onPointerDown={(event) => {
              event.preventDefault();
              floatingResizeStartRef.current = {
                pointerX: event.clientX,
                pointerY: event.clientY,
                width: floatingPreviewSize.width,
                height: floatingPreviewSize.height,
              };
              setFloatingPreviewResizing(true);
            }}
            aria-label="Resize floating preview"
            title="Drag to resize floating preview"
          />
        </div>
      ) : null}

      {fullScreenOpen ? (
        <div
          ref={fullscreenRef}
          className="xrdb-preview-fullscreen"
          role="dialog"
          aria-modal="true"
          aria-label="Full screen preview"
          aria-labelledby="fullscreen-heading"
          onClick={() => setFullScreenOpen(false)}
        >
          <span id="fullscreen-heading" className="sr-only">Full screen preview</span>
          <button
            className="xrdb-preview-overlay-dismiss"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setFullScreenOpen(false);
            }}
            aria-label="Exit full screen preview"
          >
            Exit full screen
          </button>
          <div
            className={`xrdb-preview-fullscreen-canvas xrdb-preview-canvas-${step}`}
            onClick={(event) => event.stopPropagation()}
          >
            {previewUrl && !previewErrored ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="xrdb-preview-img xrdb-preview-img-loaded"
                src={previewUrl}
                alt={`${step} preview full screen`}
              />
            ) : (
              <>
                <span className="xrdb-preview-canvas-label">Full screen {WORKFLOW_STEPS[stepIndex]?.previewLabel}</span>
                <span className="xrdb-preview-canvas-hint">Immersive view for alignment and edge checks. Press Escape to close.</span>
              </>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
