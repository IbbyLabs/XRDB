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
import { METADATA_TRANSLATION_MODE_OPTIONS } from '@/lib/metadataTranslation';
import { loadProxyCatalogManifest } from '@/lib/proxyCatalogManifestLoad';
import {
  normalizeProxyCatalogRules,
  readProxyCatalogDescriptors,
  type ProxyCatalogRule,
} from '@/lib/proxyCatalogRules';
import type { ProxyMediaType } from '@/lib/uiConfig';

export function ProxyView() {
  const { workspaceColumnsProps, isDocsCapture } = useConfiguratorContext();
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
    proxyPayload,
    baseUrl,
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
  } = centerStageProps;

  const [translationOpen, setTranslationOpen] = useState(isDocsCapture);
  const [catalogOpen, setCatalogOpen] = useState(false);

  const [catalogLoadError, setCatalogLoadError] = useState('');
  const [catalogLoadState, setCatalogLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [catalogManifest, setCatalogManifest] = useState<Record<string, unknown> | null>(null);
  const [catalogRequestKey, setCatalogRequestKey] = useState('');
  const [generatedProxyUrl, setGeneratedProxyUrl] = useState('');
  const [proxyCopied, setProxyCopied] = useState(false);

  const activeCatalogRequestKey = proxyPayload ? JSON.stringify(proxyPayload) : '';

  useEffect(() => {
    if (!activeCatalogRequestKey) {
      return;
    }

    let cancelled = false;
    void (async () => {
      setCatalogRequestKey(activeCatalogRequestKey);
      setCatalogLoadState('loading');
      setCatalogLoadError('');

      const result = await loadProxyCatalogManifest(activeCatalogRequestKey);
      if (cancelled) return;
      setGeneratedProxyUrl(result.generatedProxyUrl);
      setCatalogManifest(result.catalogManifest);
      setCatalogLoadState(result.catalogLoadState);
      setCatalogLoadError(result.catalogLoadError);
    })();

    return () => {
      cancelled = true;
    };
  }, [activeCatalogRequestKey]);

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
  const effectiveGeneratedProxyUrl =
    activeCatalogRequestKey && catalogRequestKey === activeCatalogRequestKey
      ? generatedProxyUrl
      : '';

  const catalogDescriptors = useMemo(
    () => (effectiveCatalogManifest ? readProxyCatalogDescriptors(effectiveCatalogManifest) : []),
    [effectiveCatalogManifest],
  );
  const catalogRulesByKey = useMemo(
    () => new Map(proxyCatalogRules.map((rule) => [rule.key, rule])),
    [proxyCatalogRules],
  );
  const proxyTypeSet = useMemo(() => new Set(proxyTypes), [proxyTypes]);
  const canGenerateProxy = Boolean(effectiveGeneratedProxyUrl);
  const displayedProxyUrl =
    effectiveGeneratedProxyUrl ||
    `${baseUrl || 'https://xrdb.example.com'}/proxy/{uuid}/manifest.json`;

  const handleCopyProxy = () => {
    if (!effectiveGeneratedProxyUrl) {
      return;
    }
    navigator.clipboard.writeText(effectiveGeneratedProxyUrl);
    setProxyCopied(true);
    setTimeout(() => setProxyCopied(false), 2000);
  };

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
          <h2 className="text-sm font-semibold text-[color:var(--ink)]">Addon manifest</h2>
          <p className="text-[13px] leading-5 text-[color:var(--muted)]">
            Paste a Stremio addon manifest URL. XRDB will generate a proxy manifest that carries the current configurator settings into artwork output.
          </p>
          <input
            type="url"
            value={proxyManifestUrl}
            onChange={(event) => onChangeProxyManifestUrl(event.target.value)}
            placeholder="https://addon.example.com/manifest.json"
            className="w-full min-w-0 rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-surface)] px-3 py-2.5 text-[13px] text-[color:var(--ink)] placeholder:text-[color:var(--muted)] focus:border-[color:var(--accent)] outline-none"
          />
        </div>

        <div className="xrdb-panel rounded-2xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-[color:var(--ink)]">Apply proxy to</h2>
          <p className="text-[13px] leading-5 text-[color:var(--muted)]">
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
                className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-surface)] px-3 py-2.5 text-[13px] font-medium text-[color:var(--ink)] cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={proxyTypeSet.has(option.id)}
                  onChange={(event) => toggleProxyType(option.id, event.target.checked)}
                  className="h-3.5 w-3.5 accent-[var(--accent)]"
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
            <span className="text-sm font-semibold text-[color:var(--ink)]">Metadata translation</span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-[color:var(--muted)] transition-transform ${translationOpen ? 'rotate-180' : ''}`} />
          </button>
          {translationOpen && (
            <div className="border-t border-[color:var(--border)] p-4 space-y-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={proxyTranslateMeta}
                  onChange={(event) => onToggleProxyTranslateMeta(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-[color:var(--border)] bg-[color:var(--bg-surface)] accent-[var(--accent)]"
                />
                <span className="space-y-1">
                  <span className="block text-[13px] font-medium text-[color:var(--ink)]">Translate metadata in the proxy</span>
                  <span className="block text-[13px] leading-5 text-[color:var(--muted)]">
                    Preserve good addon text by default, then backfill localized TMDB text. Anime native IDs can bridge through anime mapping plus AniList or Kitsu when TMDB is weak.
                  </span>
                </span>
              </label>

              {proxyTranslateMeta && (
                <div className="space-y-4 rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-surface)] p-4">
                  <div>
                    <div className="text-[12px] font-semibold text-[color:var(--ink)] mb-2">Merge mode</div>
                    <div className="flex flex-wrap gap-2">
                      {METADATA_TRANSLATION_MODE_OPTIONS.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => onSelectProxyTranslateMetaMode(option.id)}
                          className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                            proxyTranslateMetaMode === option.id
                              ? 'border-[color:var(--accent)] bg-[color:var(--accent-dim)] text-[color:var(--ink)]'
                              : 'border-[color:var(--border)] bg-[color:var(--bg-elevated)] text-[color:var(--muted)] hover:text-[color:var(--ink)]'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-[13px] leading-5 text-[color:var(--muted)]">
                      {METADATA_TRANSLATION_MODE_OPTIONS.find((option) => option.id === proxyTranslateMetaMode)?.description}
                    </p>
                  </div>

                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={proxyDebugMetaTranslation}
                      onChange={(event) => onToggleProxyDebugMetaTranslation(event.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-[color:var(--border)] bg-[color:var(--bg-surface)] accent-[var(--accent)]"
                    />
                    <span className="space-y-1">
                      <span className="block text-[13px] font-medium text-[color:var(--ink)]">Attach debug provenance</span>
                      <span className="block text-[13px] leading-5 text-[color:var(--muted)]">
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
            <span className="text-sm font-semibold text-[color:var(--ink)]">Catalog controls</span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-[color:var(--muted)] transition-transform ${catalogOpen ? 'rotate-180' : ''}`} />
          </button>
          {catalogOpen && (
            <div className="border-t border-[color:var(--border)] p-4 space-y-3">
              <p className="text-[13px] leading-5 text-[color:var(--muted)]">
                Tune catalog names, visibility, and search behaviour for the generated XRDB proxy manifest.
              </p>

              {proxyCatalogRules.length > 0 && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={clearCatalogRules}
                    className="rounded-full border border-[color:var(--border)] px-3 py-1.5 text-[11px] font-semibold text-[color:var(--muted)] hover:text-[color:var(--ink)] transition-colors"
                  >
                    Reset controls
                  </button>
                </div>
              )}

              {effectiveCatalogLoadState === 'idle' && (
                <div className="rounded-xl border border-dashed border-[color:var(--border)] bg-[color:var(--bg-surface)] px-4 py-3 text-[13px] leading-5 text-[color:var(--muted)]">
                  Add a manifest URL and make sure TMDB and MDBList coverage is available through server keys or the current workspace to load catalog controls.
                </div>
              )}

              {effectiveCatalogLoadState === 'loading' && (
                <div className="rounded-xl border border-dashed border-[color:var(--border)] bg-[color:var(--bg-surface)] px-4 py-3 text-[13px] leading-5 text-[color:var(--muted)]">
                  Loading catalog controls...
                </div>
              )}

              {effectiveCatalogLoadState === 'error' && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[13px] leading-5 text-rose-200">
                  {effectiveCatalogLoadError || 'Unable to load source catalogs.'}
                </div>
              )}

              {effectiveCatalogLoadState === 'ready' && catalogDescriptors.length === 0 && (
                <div className="rounded-xl border border-dashed border-[color:var(--border)] bg-[color:var(--bg-surface)] px-4 py-3 text-[13px] leading-5 text-[color:var(--muted)]">
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
                      <div key={catalog.key} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-surface)] p-3 space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-[13px] font-semibold text-[color:var(--ink)]">{catalog.name}</div>
                            <div className="mt-1 font-mono text-[11px] text-[color:var(--muted)]">{catalog.type}:{catalog.id}</div>
                          </div>
                          <label className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-2.5 py-1.5 text-[11px] font-semibold text-[color:var(--ink)] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isVisible}
                              onChange={(event) => updateCatalogRule(catalog.key, { hidden: !event.target.checked })}
                              className="h-3 w-3 accent-[var(--accent)]"
                            />
                            <span>Visible</span>
                          </label>
                        </div>

                        <div>
                          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">Display name</label>
                          <input
                            type="text"
                            value={title}
                            onChange={(event) => updateCatalogRule(catalog.key, { title: event.target.value })}
                            placeholder={catalog.name}
                            className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-2.5 py-2 text-[13px] text-[color:var(--ink)] outline-none focus:border-[color:var(--accent)]"
                          />
                        </div>

                        {catalog.searchSupported ? (
                          <div className="grid gap-2 sm:grid-cols-2">
                            <label className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-2.5 py-2 text-[11px] font-semibold text-[color:var(--ink)] cursor-pointer">
                              <input
                                type="checkbox"
                                checked={searchEnabled}
                                onChange={(event) =>
                                  updateCatalogRule(catalog.key, {
                                    searchEnabled: event.target.checked,
                                    discoverOnly: event.target.checked ? false : rule?.discoverOnly,
                                  })
                                }
                                className="h-3 w-3 accent-[var(--accent)]"
                              />
                              <span>Search</span>
                            </label>
                            <label className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-2.5 py-2 text-[11px] font-semibold text-[color:var(--ink)] cursor-pointer">
                              <input
                                type="checkbox"
                                checked={discoverOnly}
                                onChange={(event) =>
                                  updateCatalogRule(catalog.key, {
                                    discoverOnly: event.target.checked,
                                    searchEnabled: event.target.checked ? false : rule?.searchEnabled,
                                  })
                                }
                                className="h-3 w-3 accent-[var(--accent)]"
                              />
                              <span>Discover only</span>
                            </label>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-3 py-2 text-[11px] leading-5 text-[color:var(--muted)]">
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
          <h2 className="text-sm font-semibold text-[color:var(--ink)] flex items-center gap-2">
            <Zap className="w-4 h-4 text-[color:var(--accent)]" /> Generated manifest
          </h2>
          <p className="text-[13px] leading-5 text-[color:var(--muted)]">
            Use this stable URL in Stremio. It ends with manifest.json, has no query params, and keeps the same UUID when the source manifest changes.
          </p>
          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-surface)] p-3 overflow-hidden">
            <div className={`font-mono text-[11px] text-[color:var(--ink)] break-all${!showProxyUrl && effectiveGeneratedProxyUrl ? ' select-none' : ''}`}>
              {showProxyUrl || !effectiveGeneratedProxyUrl
                ? displayedProxyUrl
                : '*'.repeat(displayedProxyUrl.length)}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyProxy}
              disabled={!canGenerateProxy}
              className={`rounded-full min-h-11 px-4 py-2.5 text-sm font-semibold flex items-center gap-2 transition-colors ${
                canGenerateProxy
                  ? proxyCopied
                    ? 'bg-[color:var(--accent-dim)] text-[color:var(--ink)]'
                    : 'bg-[color:var(--accent)] text-[color:var(--bg-base)] hover:opacity-90'
                  : 'bg-[color:var(--bg-elevated)] text-[color:var(--muted)] cursor-not-allowed'
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
              className={`rounded-full min-h-11 px-4 py-2.5 text-sm font-semibold flex items-center gap-1.5 transition-colors ${
                canGenerateProxy
                  ? 'border border-[color:var(--border)] text-[color:var(--ink)] hover:text-[color:var(--ink)]'
                  : 'bg-[color:var(--bg-elevated)] text-[color:var(--muted)] cursor-not-allowed border border-[color:var(--border)]/50'
              }`}
              aria-label={showProxyUrl ? 'Hide proxy URL' : 'Show proxy URL'}
            >
              {showProxyUrl ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{showProxyUrl ? 'Hide' : 'Show'}</span>
            </button>
            <a
              href={canGenerateProxy ? effectiveGeneratedProxyUrl : undefined}
              target="_blank"
              rel="noreferrer"
              className={`rounded-full min-h-11 px-4 py-2.5 text-sm font-semibold inline-flex items-center gap-2 transition-colors ${
                canGenerateProxy
                  ? 'border border-[color:var(--border)] text-[color:var(--ink)] hover:text-[color:var(--ink)]'
                  : 'border border-[color:var(--border)]/50 bg-[color:var(--bg-elevated)] text-[color:var(--muted)] pointer-events-none'
              }`}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open
            </a>
          </div>
          {!canGenerateProxy && (
            <p className="text-[13px] text-[color:var(--muted)]">
              Add a manifest URL and make sure TMDB and MDBList coverage is available through server keys or the current workspace to generate a UUID backed link.
            </p>
          )}
          <p className="text-[11px] leading-4 text-[color:var(--muted)]">
            Legacy inline proxy links remain readable during migration. Copying here always rotates to the UUID backed manifest format, and the copied URL refreshes when the source manifest changes.
          </p>
        </div>
      </div>

      <div className="order-1 lg:order-2 min-w-0 lg:sticky lg:top-20">
        <div className="xrdb-panel rounded-2xl p-4 space-y-3">
          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-surface)] p-3 min-h-[200px] flex items-center justify-center">
            {previewUrl && !previewErrored ? (
              <div
                className={`relative shadow-xl shadow-black/60 ring-1 ring-[color:var(--border)] rounded-xl overflow-hidden ${
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
              <div className="text-center text-[13px] text-[color:var(--muted)]">
                {tmdbKeyPresent ? 'No preview available.' : 'Configure a server TMDB key to unlock preview.'}
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
                    ? 'border-[color:var(--accent)] bg-[color:var(--accent-dim)] text-[color:var(--ink)]'
                    : 'border-[color:var(--border)] bg-[color:var(--bg-surface)] text-[color:var(--muted)] hover:text-[color:var(--ink)]'
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
