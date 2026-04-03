'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  Check,
  ChevronRight,
  Clipboard,
  ExternalLink,
  Eye,
  EyeOff,
  Zap,
} from 'lucide-react';

import {
  METADATA_TRANSLATION_MODE_OPTIONS,
  type MetadataTranslationMode,
} from '@/lib/metadataTranslation';
import type { ConfiguratorExperienceMode } from '@/lib/configuratorPresets';
import {
  normalizeProxyCatalogRules,
  readProxyCatalogDescriptors,
  type ProxyCatalogRule,
} from '@/lib/proxyCatalogRules';
import type { ProxyMediaType } from '@/lib/uiConfig';

export type CurrentSetupItem = {
  label: string;
  value: string;
};

export function ConfiguratorSupportPanels({
  isAddonProxyOpen,
  isCurrentSetupOpen,
  isQuickActionsOpen,
  onToggleAddonProxy,
  onToggleCurrentSetup,
  onToggleQuickActions,
  proxyManifestUrl,
  onChangeProxyManifestUrl,
  proxyTranslateMeta,
  onToggleProxyTranslateMeta,
  experienceMode,
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
  currentSetupItems,
  onJumpToCenter,
  onJumpToExport,
  onFocusPreview,
}: {
  isAddonProxyOpen: boolean;
  isCurrentSetupOpen: boolean;
  isQuickActionsOpen: boolean;
  onToggleAddonProxy: () => void;
  onToggleCurrentSetup: () => void;
  onToggleQuickActions: () => void;
  proxyManifestUrl: string;
  onChangeProxyManifestUrl: (value: string) => void;
  proxyTranslateMeta: boolean;
  onToggleProxyTranslateMeta: (value: boolean) => void;
  experienceMode: ConfiguratorExperienceMode;
  proxyTranslateMetaMode: MetadataTranslationMode;
  onSelectProxyTranslateMetaMode: (value: MetadataTranslationMode) => void;
  proxyDebugMetaTranslation: boolean;
  onToggleProxyDebugMetaTranslation: (value: boolean) => void;
  proxyTypes: ProxyMediaType[];
  onChangeProxyTypes: (value: ProxyMediaType[]) => void;
  proxyCatalogRules: ProxyCatalogRule[];
  onChangeProxyCatalogRules: (value: ProxyCatalogRule[]) => void;
  tmdbKey: string;
  mdblistKey: string;
  displayedProxyUrl: string;
  proxyUrl: string;
  baseUrl: string;
  canGenerateProxy: boolean;
  proxyCopied: boolean;
  onCopyProxy: () => void;
  showProxyUrl: boolean;
  onToggleShowProxyUrl: () => void;
  currentSetupItems: CurrentSetupItem[];
  onJumpToCenter: () => void;
  onJumpToExport: () => void;
  onFocusPreview: () => void;
}) {
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
    <div id="proxy" className="space-y-3 scroll-mt-24">
      <div className="space-y-3">
          <div className="xrdb-panel xrdb-panel-form rounded-3xl border border-white/10 bg-zinc-900/60 p-4">
            <button
              type="button"
              onClick={onToggleAddonProxy}
              className="xrdb-panel-head flex w-full items-center justify-between gap-4 text-left"
            >
              <div>
                <p className="xrdb-panel-eyebrow font-mono">Proxy</p>
                <h3 className="xrdb-panel-title text-white">Proxy Manifest</h3>
                <p className="xrdb-panel-copy text-zinc-400">
                  Paste a Stremio addon manifest here. XRDB will generate a proxy manifest that carries the current configurator settings into artwork output.
                </p>
              </div>
              <ChevronRight className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${isAddonProxyOpen ? 'rotate-90 text-violet-300' : ''}`} />
            </button>
            <div className="xrdb-accordion-body" data-open={isAddonProxyOpen}>
              <div className="xrdb-accordion-inner">
                <div className="space-y-3 mt-3">
                  <div className="rounded-2xl border border-white/10 bg-black/35 p-4 space-y-3">
                    <div className="text-[11px] font-semibold text-zinc-400">XRDB settings</div>
                    <p className="text-[11px] leading-5 text-zinc-500">
                      Use the configurator for keys, language, ratings, layout, badges, and text.
                    </p>
                    <p className="text-[11px] leading-5 text-zinc-500">
                      A plain addon manifest URL will not apply the settings configured here by itself. Use the generated XRDB proxy manifest below if those settings should drive addon artwork.
                    </p>
                    <div>
                      <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 block mb-1">Manifest URL</label>
                      <input
                        type="url"
                        value={proxyManifestUrl}
                        onChange={(event) => onChangeProxyManifestUrl(event.target.value)}
                        placeholder="https://addon.example.com/manifest.json"
                        className="w-full min-w-0 bg-black border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white focus:border-violet-500/50 outline-none"
                      />
                    </div>
                    <div className="rounded-xl border border-white/10 bg-zinc-950/70 p-3 space-y-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Apply proxy to</div>
                      <p className="text-[11px] leading-5 text-zinc-500">
                        Select which media types get XRDB image rewrites and metadata translation in this proxy manifest.
                      </p>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {[
                          { id: 'movie' as ProxyMediaType, label: 'Movie' },
                          { id: 'series' as ProxyMediaType, label: 'Series' },
                          { id: 'anime' as ProxyMediaType, label: 'Anime' },
                        ].map((option) => (
                          <label
                            key={option.id}
                            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-[11px] font-semibold text-zinc-300"
                          >
                            <input
                              type="checkbox"
                              checked={proxyTypeSet.has(option.id)}
                              onChange={(event) => toggleProxyType(option.id, event.target.checked)}
                              className="h-3 w-3 accent-violet-500"
                            />
                            <span>{option.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-zinc-950/70 p-3 space-y-3">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={proxyTranslateMeta}
                          onChange={(event) => onToggleProxyTranslateMeta(event.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black accent-violet-500"
                        />
                        <span className="space-y-1">
                          <span className="block text-[11px] font-semibold text-zinc-200">Translate metadata in the proxy</span>
                          <span className="block text-[11px] leading-5 text-zinc-500">
                            Preserve good addon text by default, then backfill localized TMDB text. Anime native IDs can bridge through anime mapping plus AniList or Kitsu when TMDB is weak.
                          </span>
                        </span>
                      </label>

                      {proxyTranslateMeta && experienceMode === 'advanced' ? (
                        <div className="space-y-3 rounded-xl border border-white/10 bg-black/40 p-3">
                          <div>
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Merge mode</div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {METADATA_TRANSLATION_MODE_OPTIONS.map((option) => (
                                <button
                                  key={option.id}
                                  type="button"
                                  onClick={() => onSelectProxyTranslateMetaMode(option.id)}
                                  className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                                    proxyTranslateMetaMode === option.id
                                      ? 'border-violet-500/60 bg-zinc-800 text-white'
                                      : 'border-white/10 bg-zinc-900 text-zinc-400 hover:text-white'
                                  }`}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                            <p className="mt-2 text-[11px] leading-5 text-zinc-500">
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
                              <span className="block text-[11px] font-semibold text-zinc-200">Attach debug provenance</span>
                              <span className="block text-[11px] leading-5 text-zinc-500">
                                Adds a `_xrdbMetaTranslation` object to proxied meta items so you can see which fields came from the source addon, TMDB, AniList, or Kitsu.
                              </span>
                            </span>
                          </label>
                        </div>
                      ) : null}

                      {proxyTranslateMeta && experienceMode === 'simple' ? (
                        <div className="rounded-xl border border-dashed border-white/10 bg-black/30 px-4 py-3 text-[11px] leading-5 text-zinc-500">
                          Simple mode keeps proxy translation on with the safe defaults from the preset.
                          Switch to advanced mode if you want to change merge mode or attach debug provenance.
                        </div>
                      ) : null}

                      {experienceMode === 'advanced' ? (
                        <div className="space-y-3 rounded-xl border border-white/10 bg-black/40 p-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Catalog controls</div>
                              <p className="mt-1 text-[11px] leading-5 text-zinc-500">
                                Tune catalog names, visibility, and search behavior for the generated XRDB proxy manifest.
                              </p>
                            </div>
                            {proxyCatalogRules.length > 0 ? (
                              <button
                                type="button"
                                onClick={clearCatalogRules}
                                className="rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300 hover:bg-zinc-800"
                              >
                                Reset controls
                              </button>
                            ) : null}
                          </div>

                          {effectiveCatalogLoadState === 'idle' ? (
                            <div className="rounded-xl border border-dashed border-white/10 bg-black/30 px-4 py-3 text-[11px] leading-5 text-zinc-500">
                              Add a manifest URL, TMDB key, and MDBList key to load catalog controls.
                            </div>
                          ) : null}

                          {effectiveCatalogLoadState === 'loading' ? (
                            <div className="rounded-xl border border-dashed border-white/10 bg-black/30 px-4 py-3 text-[11px] leading-5 text-zinc-500">
                              Loading catalog controls...
                            </div>
                          ) : null}

                          {effectiveCatalogLoadState === 'error' ? (
                            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[11px] leading-5 text-rose-200">
                              {effectiveCatalogLoadError || 'Unable to load source catalogs.'}
                            </div>
                          ) : null}

                          {effectiveCatalogLoadState === 'ready' && catalogDescriptors.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-white/10 bg-black/30 px-4 py-3 text-[11px] leading-5 text-zinc-500">
                              The source manifest did not expose any catalogs that XRDB can tune here.
                            </div>
                          ) : null}

                          {effectiveCatalogLoadState === 'ready' && catalogDescriptors.length > 0 ? (
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
                                  <div key={catalog.key} className="rounded-xl border border-white/10 bg-zinc-950/70 p-3">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div>
                                        <div className="text-[11px] font-semibold text-zinc-100">{catalog.name}</div>
                                        <div className="mt-1 font-mono text-[10px] text-zinc-500">{catalog.type}:{catalog.id}</div>
                                      </div>
                                      <label className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300">
                                        <input
                                          type="checkbox"
                                          checked={isVisible}
                                          onChange={(event) => updateCatalogRule(catalog.key, { hidden: !event.target.checked })}
                                          className="h-3 w-3 accent-violet-500"
                                        />
                                        <span>Visible</span>
                                      </label>
                                    </div>

                                    <div className="mt-3">
                                      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Display name</label>
                                      <input
                                        type="text"
                                        value={title}
                                        onChange={(event) => updateCatalogRule(catalog.key, { title: event.target.value })}
                                        placeholder={catalog.name}
                                        className="w-full rounded-lg border border-white/10 bg-black px-2.5 py-2 text-xs text-white outline-none focus:border-violet-500/50"
                                      />
                                    </div>

                                    {catalog.searchSupported ? (
                                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                        <label className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-[11px] font-semibold text-zinc-300">
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
                                        <label className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-[11px] font-semibold text-zinc-300">
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
                                      <div className="mt-3 rounded-lg border border-dashed border-white/10 bg-black/30 px-3 py-2 text-[11px] leading-5 text-zinc-500">
                                        This source catalog does not expose a search path.
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                    <div className="xrdb-panel-head">
                      <div>
                        <p className="xrdb-panel-eyebrow font-mono">Export</p>
                        <h3 className="text-xl font-semibold text-white">Generated Manifest</h3>
                        <p className="mt-2 text-sm text-zinc-400">
                          Use this URL in Stremio. It ends with manifest.json and has no query params.
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 rounded-2xl border border-white/10 bg-black/70 p-4 overflow-hidden">
                      <div className={`font-mono text-xs text-zinc-300 break-all${!showProxyUrl && proxyUrl ? ' select-none' : ''}`}>
                        {displayedProxyUrl || `${baseUrl || 'https://xrdb.example.com'}/proxy/{config}/manifest.json`}
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={onCopyProxy}
                        disabled={!canGenerateProxy}
                        className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${canGenerateProxy ? (proxyCopied ? 'bg-green-500 text-white' : 'bg-violet-500 text-white hover:bg-violet-400') : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}`}
                      >
                        {proxyCopied ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>COPIED</span>
                          </>
                        ) : (
                          <>
                            <Clipboard className="w-3.5 h-3.5" />
                            <span>COPY LINK</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={onToggleShowProxyUrl}
                        disabled={!canGenerateProxy}
                        className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${canGenerateProxy ? 'bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 hover:text-white border border-violet-500/30' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-white/5'}`}
                        aria-label={showProxyUrl ? 'Hide proxy URL' : 'Show proxy URL'}
                      >
                        {showProxyUrl ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        <span>{showProxyUrl ? 'HIDE' : 'SHOW'}</span>
                      </button>
                      <a
                        href={canGenerateProxy ? proxyUrl : undefined}
                        target="_blank"
                        rel="noreferrer"
                        className={`px-4 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-2 transition-colors ${canGenerateProxy ? 'border border-white/10 bg-zinc-900 text-zinc-200 hover:bg-zinc-800' : 'border border-white/5 bg-zinc-950 text-zinc-600 pointer-events-none'}`}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Open
                      </a>
                    </div>
                    {!canGenerateProxy ? (
                      <p className="mt-3 text-[11px] text-zinc-500">
                        Add manifest URL, TMDB key and MDBList key to generate a valid link.
                      </p>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/35 p-4 text-xs text-zinc-500">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-violet-500/10">
                        <Zap className="w-4 h-4 text-violet-500" />
                      </div>
                      <div className="space-y-1">
                        <div className="text-zinc-200 font-semibold">Route addon artwork through XRDB</div>
                        <div>Proxy routes `meta.poster`, `meta.background`, and `meta.logo` through XRDB for both `catalog` and `meta` responses using the active configurator settings above.</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="xrdb-panel xrdb-panel-preview rounded-3xl border border-white/10 bg-zinc-900/60 p-4">
            <button
              type="button"
              onClick={onToggleCurrentSetup}
              className="xrdb-panel-head flex w-full items-center justify-between gap-4 text-left"
            >
              <div>
                <p className="xrdb-panel-eyebrow font-mono">Support</p>
                <h3 className="text-lg font-semibold text-white">Current Setup</h3>
                <p className="mt-1 text-sm text-zinc-400">
                  A compact snapshot of the active output so the right rail stays useful while the configurator keeps scrolling.
                </p>
              </div>
              <ChevronRight className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${isCurrentSetupOpen ? 'rotate-90 text-violet-300' : ''}`} />
            </button>
            <div className="xrdb-accordion-body" data-open={isCurrentSetupOpen}>
              <div className="xrdb-accordion-inner">
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  {currentSetupItems.map((item) => (
                    <div key={item.label} className="min-w-0 rounded-xl border border-white/10 bg-zinc-950/70 px-3 py-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{item.label}</div>
                      <div className="mt-1 min-w-0 break-words text-sm font-semibold leading-5 text-white">
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="xrdb-panel xrdb-panel-preview rounded-3xl border border-white/10 bg-zinc-900/60 p-4">
            <button
              type="button"
              onClick={onToggleQuickActions}
              className="xrdb-panel-head flex w-full items-center justify-between gap-4 text-left"
            >
              <div>
                <p className="xrdb-panel-eyebrow font-mono">Support</p>
                <h3 className="text-lg font-semibold text-white">Quick Actions</h3>
              </div>
              <ChevronRight className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${isQuickActionsOpen ? 'rotate-90 text-violet-300' : ''}`} />
            </button>
            <div className="xrdb-accordion-body" data-open={isQuickActionsOpen}>
              <div className="xrdb-accordion-inner">
                <div className="mt-3 grid gap-2">
                  <button
                    type="button"
                    onClick={onJumpToCenter}
                    className="rounded-2xl border border-white/10 bg-zinc-950/70 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-200 transition-colors hover:text-white"
                  >
                    Jump to center
                  </button>
                  <button
                    type="button"
                    onClick={onJumpToExport}
                    className="rounded-2xl border border-white/10 bg-zinc-950/70 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-200 transition-colors hover:text-white"
                  >
                    Jump to export
                  </button>
                  <button
                    type="button"
                    onClick={onFocusPreview}
                    className="rounded-2xl border border-white/10 bg-zinc-950/70 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-200 transition-colors hover:text-white"
                  >
                    Focus preview
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
    </div>
  );
}
