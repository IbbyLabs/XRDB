'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import {
  Check,
  ChevronDown,
  Clipboard,
  ExternalLink,
  Eye,
  EyeOff,
  Zap,
} from 'lucide-react';

import { useConfiguratorContext } from '@/lib/configuratorProvider';
import {
  METADATA_TRANSLATION_MODE_OPTIONS,
  type MetadataTranslationMode,
} from '@/lib/metadataTranslation';
import {
  normalizeProxyCatalogRules,
  readProxyCatalogDescriptors,
  type ProxyCatalogRule,
} from '@/lib/proxyCatalogRules';
import type { ProxyMediaType } from '@/lib/uiConfig';

type PreviewType = 'poster' | 'backdrop' | 'thumbnail' | 'logo';

export function ProxyView() {
  const { workspaceColumnsProps } = useConfiguratorContext();
  const { supportPanelsProps, centerStageProps } = workspaceColumnsProps;

  const {
    proxyManifestUrl,
    onChangeProxyManifestUrl,
    proxyTranslateMeta,
    onToggleProxyTranslateMeta,
    proxyTranslateMetaMode,
    onSelectProxyTranslateMetaMode,
    proxyDebugMetaTranslation,
    onToggleProxyDebugMetaTranslation,
    proxyTypes,
    onChangeProxyTypes,
    proxyCatalogRules,
    onChangeProxyCatalogRules,
    tmdbKey,
    mdblistKey,
    displayedProxyUrl,
    proxyUrl,
    baseUrl,
    canGenerateProxy,
    proxyCopied,
    onCopyProxy,
    showProxyUrl,
    onToggleShowProxyUrl,
  } = supportPanelsProps;

  const {
    previewType,
    onSelectPreviewType,
    previewUrl,
    previewErrored,
    tmdbKeyPresent,
    onPreviewImageError,
    onPreviewImageLoad,
    activeTypeLabel,
  } = centerStageProps;

  const [translationOpen, setTranslationOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);

  const [catalogLoadError, setCatalogLoadError] = useState('');
  const [catalogLoadState, setCatalogLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [catalogManifest, setCatalogManifest] = useState<Record<string, unknown> | null>(null);
  const [catalogRequestKey, setCatalogRequestKey] = useState('');

  const normalizedManifestUrl = proxyManifestUrl.trim();
  const normalizedTmdbKey = tmdbKey.trim();
  const normalizedMdblistKey = mdblistKey.trim();
  const activeCatalogRequestKey =
    normalizedManifestUrl && normalizedTmdbKey && normalizedMdblistKey
      ? `${normalizedManifestUrl}::${normalizedTmdbKey}::${normalizedMdblistKey}`
      : '';

  useEffect(() => {
    if (!activeCatalogRequestKey) {
      return;
    }

    let cancelled = false;
    void (async () => {
      setCatalogRequestKey(activeCatalogRequestKey);
      setCatalogLoadState('loading');
      setCatalogLoadError('');

      const target = new URL('/proxy/manifest.json', window.location.origin);
      target.searchParams.set('url', normalizedManifestUrl);
      target.searchParams.set('tmdbKey', normalizedTmdbKey);
      target.searchParams.set('mdblistKey', normalizedMdblistKey);

      try {
        const response = await fetch(target.toString(), { cache: 'no-store' });
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || `Manifest request failed with ${response.status}`);
        }
        const payload = await response.json();
        if (cancelled) return;
        setCatalogManifest(payload && typeof payload === 'object' ? payload : null);
        setCatalogLoadState('ready');
      } catch (error) {
        if (cancelled) return;
        setCatalogManifest(null);
        setCatalogLoadState('error');
        setCatalogLoadError(error instanceof Error ? error.message : 'Unable to load source catalogs.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeCatalogRequestKey, normalizedManifestUrl, normalizedMdblistKey, normalizedTmdbKey]);

  const effectiveCatalogLoadState = !activeCatalogRequestKey
    ? 'idle'
    : catalogRequestKey === activeCatalogRequestKey
      ? catalogLoadState
      : 'loading';
  const effectiveCatalogLoadError =
    effectiveCatalogLoadState === 'error' && catalogRequestKey === activeCatalogRequestKey
      ? catalogLoadError
      : '';
  const effectiveCatalogManifest =
    effectiveCatalogLoadState === 'ready' && catalogRequestKey === activeCatalogRequestKey
      ? catalogManifest
      : null;

  const catalogDescriptors = useMemo(
    () => (effectiveCatalogManifest ? readProxyCatalogDescriptors(effectiveCatalogManifest) : []),
    [effectiveCatalogManifest],
  );
  const catalogRulesByKey = useMemo(
    () => new Map(proxyCatalogRules.map((rule) => [rule.key, rule])),
    [proxyCatalogRules],
  );
  const proxyTypeSet = useMemo(() => new Set(proxyTypes), [proxyTypes]);

  const toggleProxyType = (type: ProxyMediaType, enabled: boolean) => {
    const nextSet = new Set(proxyTypes);
    if (enabled) {
      nextSet.add(type);
    } else {
      nextSet.delete(type);
    }
    const orderedTypes = (['movie', 'series', 'anime'] as ProxyMediaType[]).filter((item) =>
      nextSet.has(item),
    );
    if (orderedTypes.length > 0) {
      onChangeProxyTypes(orderedTypes);
    }
  };

  const updateCatalogRule = (key: string, nextRule: Partial<ProxyCatalogRule>) => {
    const currentRule = catalogRulesByKey.get(key) || { key };
    const mergedRule = normalizeProxyCatalogRules([
      {
        ...currentRule,
        ...nextRule,
        key,
      },
    ])[0];
    const nextRules = proxyCatalogRules.filter((rule) => rule.key !== key);
    onChangeProxyCatalogRules(mergedRule ? [...nextRules, mergedRule] : nextRules);
  };

  const clearCatalogRules = () => {
    onChangeProxyCatalogRules([]);
  };

  return (
    <div className="xrdb-export-layout w-full px-4 py-6 md:px-6 md:py-8">
      <div className="order-2 lg:order-1 min-w-0 space-y-4">
        <div className="xrdb-panel rounded-2xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-white">Addon manifest</h2>
          <p className="text-[13px] leading-5 text-zinc-400">
            Paste a Stremio addon manifest URL. XRDB will generate a proxy manifest that carries the current configurator settings into artwork output.
          </p>
          <input
            type="url"
            value={proxyManifestUrl}
            onChange={(event) => onChangeProxyManifestUrl(event.target.value)}
            placeholder="https://addon.example.com/manifest.json"
            className="w-full min-w-0 rounded-xl border border-white/10 bg-black/70 px-3 py-2.5 text-[13px] text-white placeholder:text-zinc-500 focus:border-violet-500/50 outline-none"
          />
        </div>

        <div className="xrdb-panel rounded-2xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-white">Apply proxy to</h2>
          <p className="text-[13px] leading-5 text-zinc-400">
            Select which media types get XRDB image rewrites and metadata translation in this proxy manifest.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {([
              { id: 'movie' as ProxyMediaType, label: 'Movie' },
              { id: 'series' as ProxyMediaType, label: 'Series' },
              { id: 'anime' as ProxyMediaType, label: 'Anime' },
            ]).map((option) => (
              <label
                key={option.id}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-[13px] font-medium text-zinc-300 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={proxyTypeSet.has(option.id)}
                  onChange={(event) => toggleProxyType(option.id, event.target.checked)}
                  className="h-3.5 w-3.5 accent-violet-500"
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="xrdb-panel rounded-2xl">
          <button
            type="button"
            onClick={() => setTranslationOpen((prev) => !prev)}
            className="flex w-full items-center justify-between gap-3 p-4 text-left"
          >
            <span className="text-sm font-semibold text-white">Metadata translation</span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${translationOpen ? 'rotate-180' : ''}`} />
          </button>
          {translationOpen && (
            <div className="border-t border-white/10 p-4 space-y-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={proxyTranslateMeta}
                  onChange={(event) => onToggleProxyTranslateMeta(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black accent-violet-500"
                />
                <span className="space-y-1">
                  <span className="block text-[13px] font-medium text-zinc-200">Translate metadata in the proxy</span>
                  <span className="block text-[13px] leading-5 text-zinc-500">
                    Preserve good addon text by default, then backfill localized TMDB text. Anime native IDs can bridge through anime mapping plus AniList or Kitsu when TMDB is weak.
                  </span>
                </span>
              </label>

              {proxyTranslateMeta && (
                <div className="space-y-4 rounded-xl border border-white/10 bg-black/40 p-4">
                  <div>
                    <div className="text-[12px] font-semibold text-zinc-300 mb-2">Merge mode</div>
                    <div className="flex flex-wrap gap-2">
                      {METADATA_TRANSLATION_MODE_OPTIONS.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => onSelectProxyTranslateMetaMode(option.id)}
                          className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                            proxyTranslateMetaMode === option.id
                              ? 'border-violet-500/60 bg-zinc-800 text-white'
                              : 'border-white/10 bg-zinc-950 text-zinc-400 hover:text-white'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-[13px] leading-5 text-zinc-500">
                      {METADATA_TRANSLATION_MODE_OPTIONS.find((option) => option.id === proxyTranslateMetaMode)?.description}
                    </p>
                  </div>

                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={proxyDebugMetaTranslation}
                      onChange={(event) => onToggleProxyDebugMetaTranslation(event.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black accent-violet-500"
                    />
                    <span className="space-y-1">
                      <span className="block text-[13px] font-medium text-zinc-200">Attach debug provenance</span>
                      <span className="block text-[13px] leading-5 text-zinc-500">
                        Adds a `_xrdbMetaTranslation` object to proxied meta items so you can see which fields came from the source addon, TMDB, AniList, or Kitsu.
                      </span>
                    </span>
                  </label>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="xrdb-panel rounded-2xl">
          <button
            type="button"
            onClick={() => setCatalogOpen((prev) => !prev)}
            className="flex w-full items-center justify-between gap-3 p-4 text-left"
          >
            <span className="text-sm font-semibold text-white">Catalog controls</span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${catalogOpen ? 'rotate-180' : ''}`} />
          </button>
          {catalogOpen && (
            <div className="border-t border-white/10 p-4 space-y-3">
              <p className="text-[13px] leading-5 text-zinc-400">
                Tune catalog names, visibility, and search behavior for the generated XRDB proxy manifest.
              </p>

              {proxyCatalogRules.length > 0 && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={clearCatalogRules}
                    className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-zinc-300 hover:text-white transition-colors"
                  >
                    Reset controls
                  </button>
                </div>
              )}

              {effectiveCatalogLoadState === 'idle' && (
                <div className="rounded-xl border border-dashed border-white/10 bg-black/30 px-4 py-3 text-[13px] leading-5 text-zinc-500">
                  Add a manifest URL, TMDB key, and MDBList key to load catalog controls.
                </div>
              )}

              {effectiveCatalogLoadState === 'loading' && (
                <div className="rounded-xl border border-dashed border-white/10 bg-black/30 px-4 py-3 text-[13px] leading-5 text-zinc-500">
                  Loading catalog controls...
                </div>
              )}

              {effectiveCatalogLoadState === 'error' && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[13px] leading-5 text-rose-200">
                  {effectiveCatalogLoadError || 'Unable to load source catalogs.'}
                </div>
              )}

              {effectiveCatalogLoadState === 'ready' && catalogDescriptors.length === 0 && (
                <div className="rounded-xl border border-dashed border-white/10 bg-black/30 px-4 py-3 text-[13px] leading-5 text-zinc-500">
                  The source manifest did not expose any catalogs that XRDB can tune here.
                </div>
              )}

              {effectiveCatalogLoadState === 'ready' && catalogDescriptors.length > 0 && (
                <div className="space-y-3">
                  {catalogDescriptors.map((catalog) => {
                    const rule = catalogRulesByKey.get(catalog.key);
                    const title = rule?.title || '';
                    const isVisible = rule?.hidden !== true;
                    const searchEnabled =
                      catalog.searchSupported &&
                      rule?.discoverOnly !== true &&
                      rule?.searchEnabled !== false;
                    const discoverOnly = catalog.searchSupported && rule?.discoverOnly === true;

                    return (
                      <div key={catalog.key} className="rounded-xl border border-white/10 bg-black/40 p-3 space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-[13px] font-semibold text-zinc-100">{catalog.name}</div>
                            <div className="mt-1 font-mono text-[11px] text-zinc-500">{catalog.type}:{catalog.id}</div>
                          </div>
                          <label className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isVisible}
                              onChange={(event) => updateCatalogRule(catalog.key, { hidden: !event.target.checked })}
                              className="h-3 w-3 accent-violet-500"
                            />
                            <span>Visible</span>
                          </label>
                        </div>

                        <div>
                          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Display name</label>
                          <input
                            type="text"
                            value={title}
                            onChange={(event) => updateCatalogRule(catalog.key, { title: event.target.value })}
                            placeholder={catalog.name}
                            className="w-full rounded-lg border border-white/10 bg-black px-2.5 py-2 text-[13px] text-white outline-none focus:border-violet-500/50"
                          />
                        </div>

                        {catalog.searchSupported ? (
                          <div className="grid gap-2 sm:grid-cols-2">
                            <label className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-[11px] font-semibold text-zinc-300 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={searchEnabled}
                                onChange={(event) =>
                                  updateCatalogRule(catalog.key, {
                                    searchEnabled: event.target.checked,
                                    discoverOnly: event.target.checked ? false : rule?.discoverOnly,
                                  })
                                }
                                className="h-3 w-3 accent-violet-500"
                              />
                              <span>Search</span>
                            </label>
                            <label className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-[11px] font-semibold text-zinc-300 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={discoverOnly}
                                onChange={(event) =>
                                  updateCatalogRule(catalog.key, {
                                    discoverOnly: event.target.checked,
                                    searchEnabled: event.target.checked ? false : rule?.searchEnabled,
                                  })
                                }
                                className="h-3 w-3 accent-violet-500"
                              />
                              <span>Discover only</span>
                            </label>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed border-white/10 bg-black/30 px-3 py-2 text-[11px] leading-5 text-zinc-500">
                            This source catalog does not expose a search path.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="xrdb-panel rounded-2xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Zap className="w-4 h-4 text-violet-500" /> Generated manifest
          </h2>
          <p className="text-[13px] leading-5 text-zinc-400">
            Use this URL in Stremio. It ends with manifest.json and has no query params.
          </p>
          <div className="rounded-xl border border-white/10 bg-black/70 p-3 overflow-hidden">
            <div className={`font-mono text-[11px] text-zinc-300 break-all${!showProxyUrl && proxyUrl ? ' select-none' : ''}`}>
              {displayedProxyUrl || `${baseUrl || 'https://xrdb.example.com'}/proxy/{config}/manifest.json`}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onCopyProxy}
              disabled={!canGenerateProxy}
              className={`rounded-full px-4 py-2 text-xs font-semibold flex items-center gap-2 transition-colors ${
                canGenerateProxy
                  ? proxyCopied
                    ? 'bg-green-500 text-white'
                    : 'bg-violet-600 text-white hover:bg-violet-500'
                  : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
              }`}
            >
              {proxyCopied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Clipboard className="w-3.5 h-3.5" />
                  <span>Copy link</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onToggleShowProxyUrl}
              disabled={!canGenerateProxy}
              className={`rounded-full px-3 py-2 text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                canGenerateProxy
                  ? 'border border-white/15 text-zinc-300 hover:text-white'
                  : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-white/5'
              }`}
              aria-label={showProxyUrl ? 'Hide proxy URL' : 'Show proxy URL'}
            >
              {showProxyUrl ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{showProxyUrl ? 'Hide' : 'Show'}</span>
            </button>
            <a
              href={canGenerateProxy ? proxyUrl : undefined}
              target="_blank"
              rel="noreferrer"
              className={`rounded-full px-4 py-2 text-xs font-semibold inline-flex items-center gap-2 transition-colors ${
                canGenerateProxy
                  ? 'border border-white/15 text-zinc-300 hover:text-white'
                  : 'border border-white/5 bg-zinc-800 text-zinc-500 pointer-events-none'
              }`}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open
            </a>
          </div>
          {!canGenerateProxy && (
            <p className="text-[13px] text-zinc-500">
              Add manifest URL, TMDB key and MDBList key to generate a valid link.
            </p>
          )}
        </div>
      </div>

      <div className="order-1 lg:order-2 min-w-0 lg:sticky lg:top-20">
        <div className="xrdb-panel rounded-2xl p-4 space-y-3">
          <div className="rounded-xl border border-white/10 bg-black/70 p-3 min-h-[200px] flex items-center justify-center">
            {previewUrl && !previewErrored ? (
              <div
                className={`relative shadow-xl shadow-black ring-1 ring-white/10 rounded-xl overflow-hidden ${
                  previewType === 'poster'
                    ? 'aspect-[2/3] w-full max-w-[14rem]'
                    : previewType === 'logo'
                      ? 'h-32 w-full max-w-xs'
                      : 'aspect-video w-full max-w-sm'
                }`}
              >
                <Image
                  key={previewUrl as string}
                  src={previewUrl as string}
                  alt="Preview"
                  unoptimized
                  fill
                  className={previewType === 'logo' ? 'object-contain' : 'object-cover'}
                  onLoad={() => { (onPreviewImageLoad as (url: string) => void)(previewUrl as string); }}
                  onError={() => { void (onPreviewImageError as (url: string) => void | Promise<void>)(previewUrl as string); }}
                />
              </div>
            ) : (
              <div className="text-center text-[13px] text-zinc-500">
                {tmdbKeyPresent ? 'No preview available.' : 'Add a TMDB key to unlock preview.'}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {(['poster', 'backdrop', 'thumbnail', 'logo'] as const).map((type) => (
              <button
                key={`proxy-preview-${type}`}
                type="button"
                onClick={() => (onSelectPreviewType as (value: string) => void)(type)}
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
      </div>
    </div>
  );
}
