'use client';

import {
  useState, useCallback, useRef, useId, useEffect,
} from 'react';
import { Settings2, Star, Film, Rocket, Link2, Maximize2 } from 'lucide-react';
import { renderUrl, type MediaType, type Template } from '@/lib/api';
import { getRenderKey, setRenderKey } from '@/lib/render-key';
import {
  MEDIA_TYPES, DEFAULT_CONFIG, DEFAULT_SURFACE_CONFIGS, PREVIEW_DEBOUNCE_MS,
  readSession, encodeShare, decodeShare, cloneToAllSurfaces, fromStoredConfig,
  type ConfigState, type SurfaceConfigs,
} from './configurator-types';
import { Notice, DisplayPanel } from './configurator-display';
import { TemplateStrip, RatingsPanel, AdvancedPanel } from './configurator-panels';
import { ProfilePanel, type LoadedProfile } from './profile-panel';
import { InstallPanel } from './install-panel';
import { MediaSearch } from './media-search';
import { CopyButton } from './copy-button';
import { tablistKeyNav } from './tablist';

export function ConfiguratorClient() {
  const uid = useId();

  const [mediaType, setMediaType] = useState<MediaType>('poster');
  const [mediaId, setMediaId] = useState('tt0468569');
  const [mediaTitle, setMediaTitle] = useState('The Dark Knight (2008)');
  const [configs, setConfigs] = useState<SurfaceConfigs>(DEFAULT_SURFACE_CONFIGS);
  const [hydrated, setHydrated] = useState(false);
  // Instance render key (XRDB_API_KEY). Empty on an open instance; on a keyed
  // one the operator enters it under the Install tab and it flows into the
  // preview/image URLs and profile saves.
  const [renderKey, setRenderKeyState] = useState('');
  // The surface currently being edited / previewed. Each surface keeps its own
  // settings; switching the media-type tab switches which one these controls edit.
  const config = configs[mediaType];

  // Restore persisted state after mount: the page is statically prerendered,
  // so reading storage during the first render mismatches the server HTML
  // (React #418). The config merge keeps sessions saved before new fields
  // existed (e.g. badgeStyle/badgeTheme) complete.
  // A share link (#c=…) beats the stored session — someone sent this exact
  // look — and is consumed from the URL so refreshes fall back to the session.
  useEffect(() => {
    const shared = window.location.hash.startsWith('#c=')
      ? decodeShare(window.location.hash.slice(3))
      : null;
    /* eslint-disable react-hooks/set-state-in-effect */
    if (shared) {
      setMediaType(shared.t);
      setMediaId(shared.id);
      setMediaTitle(shared.title);
      setConfigs(shared.cfgs);
      history.replaceState(null, '', window.location.pathname + window.location.search);
    } else {
      // Validate the stored media type before it indexes `configs` — a stale or
      // corrupted session value would otherwise make the active config undefined.
      const storedType = readSession<string>('xrdb-media-type', 'poster');
      setMediaType(MEDIA_TYPES.some(t => t.id === storedType) ? (storedType as MediaType) : 'poster');
      setMediaId(readSession<string>('xrdb-media-id', 'tt0468569'));
      setMediaTitle(readSession<string>('xrdb-media-title', 'The Dark Knight (2008)'));
      // Prefer the per-surface store; fall back to (and migrate) the older
      // single-config session so a mid-session upgrade keeps the user's look.
      const storedSurfaces = readSession<Record<string, unknown> | null>('xrdb-configs', null);
      if (storedSurfaces) {
        setConfigs(fromStoredConfig({ surfaces: storedSurfaces }));
      } else {
        const legacy = readSession<Partial<ConfigState> | null>('xrdb-config', null);
        setConfigs(legacy ? cloneToAllSurfaces({ ...DEFAULT_CONFIG, ...legacy }) : DEFAULT_SURFACE_CONFIGS);
      }
    }
    setRenderKeyState(getRenderKey());
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  const [appliedTemplate, setAppliedTemplate] = useState<string | null>(null);
  const [loadedProfile, setLoadedProfile] = useState<LoadedProfile | null>(null);
  const [notice, setNotice] = useState<{ type: 'error' | 'success' | 'info'; message: string } | null>(null);

  const [previewSrc, setPreviewSrc] = useState('');
  const [previewKey, setPreviewKey] = useState(0);
  const [imgLoading, setImgLoading] = useState(false);
  const [imgError, setImgError]     = useState(false);

  const [activeTab, setActiveTab] = useState<'display' | 'ratings' | 'profile' | 'install'>('display');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoConfigsRef = useRef<SurfaceConfigs | null>(null);
  const [undoAvailable, setUndoAvailable] = useState(false);

  useEffect(() => {
    if (!hydrated) return; // don't clobber storage with defaults pre-restore
    try {
      sessionStorage.setItem('xrdb-media-type', JSON.stringify(mediaType));
      sessionStorage.setItem('xrdb-media-id',   JSON.stringify(mediaId));
      sessionStorage.setItem('xrdb-media-title', JSON.stringify(mediaTitle));
      sessionStorage.setItem('xrdb-configs',     JSON.stringify(configs));
    } catch { /* unavailable */ }
  }, [hydrated, mediaType, mediaId, mediaTitle, configs]);

  const buildSrc = useCallback((type: MediaType, id: string, cfg: ConfigState) => {
    const payload: Record<string, unknown> = {
      size: cfg.size, artworkSource: cfg.artworkSource, language: cfg.language,
      textPreference: cfg.textPreference, ratingsLayout: cfg.ratingsLayout,
      badgeStyle: cfg.badgeStyle, badgeTheme: cfg.badgeTheme,
      ratings: cfg.ratings, ageRating: cfg.ageRating, ageRatingPos: cfg.ageRatingPos,
      genre: cfg.genre, genrePos: cfg.genrePos, badges: cfg.badges,
      providers: cfg.providers, aggregateBar: cfg.aggregateBar,
      aggregateBarPos: cfg.aggregateBarPos, trending: cfg.trending,
      trendingStyle: cfg.trendingStyle,
      backdropAsPoster: cfg.backdropAsPoster,
      ratingRing: cfg.ratingRing,
      ratingRingPos: cfg.ratingRingPos, ratingRingColor: cfg.ratingRingColor,
      // Advanced styling. Zero-valued numbers mean "default" and are harmless to
      // send; ratingsMax is the exception — 0 there would cap to zero badges, so
      // it is only included when the user set a real cap.
      ratingBadgeScale: cfg.ratingBadgeScale,
      ratingBadgeOffsetX: cfg.ratingBadgeOffsetX,
      ratingBadgeOffsetY: cfg.ratingBadgeOffsetY,
      ratingPresentation: cfg.ratingPresentation === 'standard' ? '' : cfg.ratingPresentation,
      genreBadgeScale: cfg.genreBadgeScale,
      genreBadgeOffsetX: cfg.genreBadgeOffsetX,
      genreBadgeOffsetY: cfg.genreBadgeOffsetY,
      genreBadgeBackgroundOpacity: cfg.genreBadgeBackgroundOpacity,
      qualityBadgesPos: cfg.qualityBadgesPos,
      qualityBadgeScale: cfg.qualityBadgeScale,
      qualityBadgesStyle: cfg.qualityBadgesStyle === 'default' ? '' : cfg.qualityBadgesStyle,
      qualityBadgesTileAccentColor: cfg.qualityBadgesTileAccentColor,
      aggregateAccentColor: cfg.aggregateAccentColor,
      scorebarLowColor: cfg.scorebarLowColor,
      scorebarMidColor: cfg.scorebarMidColor,
      scorebarHighColor: cfg.scorebarHighColor,
      scorebarLowThreshold: cfg.scorebarLowThreshold,
      scorebarHighThreshold: cfg.scorebarHighThreshold,
      trendingTextColor: cfg.trendingTextColor,
      ageRatingBadgeStyle: cfg.ageRatingBadgeStyle === 'default' ? '' : cfg.ageRatingBadgeStyle,
      ageRatingTileColor: cfg.ageRatingTileColor,
      trendingPos: cfg.trendingPos,
      logoBackground: cfg.logoBackground,
      ringCenterOpacity: cfg.ringCenterOpacity,
      ringValueSource: cfg.ringValueSource === 'overall' ? '' : cfg.ringValueSource,
      ringProgressSource: cfg.ringProgressSource === 'overall' ? '' : cfg.ringProgressSource,
    };
    if (cfg.ratingsMax > 0) payload.ratingsMax = cfg.ratingsMax;
    if (Object.keys(cfg.ratingProviderOverrides).length > 0) {
      payload.ratingProviderOverrides = cfg.ratingProviderOverrides;
    }
    return renderUrl(type, id || 'tt0468569', JSON.stringify(payload), renderKey);
  }, [renderKey]);

  const applyRenderKey = useCallback((value: string) => {
    setRenderKeyState(value);
    setRenderKey(value);
  }, []);

  const triggerPreview = useCallback((type: MediaType, id: string, cfg: ConfigState, immediate = false) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const run = () => {
      setPreviewSrc(buildSrc(type, id, cfg));
      setPreviewKey(k => k + 1);
      setImgError(false);
      setImgLoading(true);
    };
    if (immediate) { run(); return; }
    debounceRef.current = setTimeout(run, PREVIEW_DEBOUNCE_MS);
  }, [buildSrc]);

  useEffect(() => {
    triggerPreview(mediaType, mediaId, config);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [mediaType, mediaId, config, triggerPreview]);

  const aspect = MEDIA_TYPES.find(t => t.id === mediaType)?.aspect ?? '2/3';

  const flash = useCallback((type: 'error' | 'success' | 'info', message: string) => {
    setNotice({ type, message });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    if (type !== 'error') {
      noticeTimer.current = setTimeout(() => setNotice(null), 5000);
    }
  }, []);

  const markManualEdit = () => {
    setAppliedTemplate(null);
    setUndoAvailable(false);
  };

  const updateConfig = <K extends keyof ConfigState>(key: K, value: ConfigState[K]) => {
    markManualEdit();
    setConfigs(cs => ({ ...cs, [mediaType]: { ...cs[mediaType], [key]: value } }));
  };

  const toggleRating = (r: string) => {
    markManualEdit();
    setConfigs(cs => {
      const cur = cs[mediaType];
      return { ...cs, [mediaType]: {
        ...cur, ratings: cur.ratings.includes(r) ? cur.ratings.filter(x => x !== r) : [...cur.ratings, r],
      } };
    });
  };

  const toggleBadge = (b: string) => {
    markManualEdit();
    setConfigs(cs => {
      const cur = cs[mediaType];
      return { ...cs, [mediaType]: {
        ...cur, badges: cur.badges.includes(b) ? cur.badges.filter(x => x !== b) : [...cur.badges, b],
      } };
    });
  };

  const applyTemplate = (t: Template) => {
    const parsed = t.config as Partial<ConfigState>;
    undoConfigsRef.current = configs;
    setConfigs(cs => ({ ...cs, [mediaType]: { ...cs[mediaType], ...parsed } }));
    setAppliedTemplate(t.id);
    flash('info', `Template "${t.name}" applied to ${mediaType}`);
    setUndoAvailable(true);
  };

  const undoTemplate = () => {
    if (undoConfigsRef.current) {
      setConfigs(undoConfigsRef.current);
      undoConfigsRef.current = null;
    }
    setAppliedTemplate(null);
    setUndoAvailable(false);
    setNotice(null);
  };

  const handleLoadConfigs = (loaded: SurfaceConfigs) => {
    markManualEdit();
    setConfigs(loaded);
  };

  const copyToAllSurfaces = () => {
    markManualEdit();
    setConfigs(cs => cloneToAllSurfaces(cs[mediaType]));
    flash('success', `Applied ${mediaType} settings to every surface`);
  };

  const handleMediaSelect = (id: string, title: string) => {
    setMediaId(id);
    setMediaTitle(title);
  };

  const shareLook = async () => {
    const fragment = encodeShare({ t: mediaType, id: mediaId, title: mediaTitle, cfgs: configs });
    const link = `${window.location.origin}${window.location.pathname}#c=${fragment}`;
    try {
      await navigator.clipboard.writeText(link);
      flash('success', 'Share link copied — anyone who opens it sees this exact look');
    } catch {
      flash('error', 'Could not copy the link — your browser blocked clipboard access');
    }
  };

  return (
    <div className="page-inner">
      <div className="page-head">
        <h1 className="page-title">Configurator</h1>
        <p className="page-sub">Pick a template, watch the preview update live, copy the URL.</p>
      </div>

      {notice && (
        <div style={{ marginBottom: 'var(--sp-4)' }}>
          <Notice
            {...notice}
            onDismiss={() => setNotice(null)}
            actionLabel={undoAvailable && notice.type === 'info' ? 'Undo' : undefined}
            onAction={undoAvailable && notice.type === 'info' ? undoTemplate : undefined}
          />
        </div>
      )}

      <TemplateStrip appliedId={appliedTemplate} onApply={applyTemplate} />

      <div className="cfg-layout">

        {/* ── Preview column ───────────────────────────────────────── */}
        <div className="cfg-col">
          <div role="tablist" aria-label="Media type" className="seg" onKeyDown={tablistKeyNav}>
            {MEDIA_TYPES.map(t => (
              <button
                key={t.id}
                role="tab"
                aria-selected={mediaType === t.id}
                tabIndex={mediaType === t.id ? 0 : -1}
                className="seg-item"
                onClick={() => setMediaType(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div
            className="preview-stage"
            style={{
              aspectRatio: aspect,
              height: mediaType === 'poster' ? '560px' : mediaType === 'logo' ? '170px' : '330px',
              maxWidth: '100%',
              alignSelf: 'center',
            }}
          >
            {imgError ? (
              <div className="preview-empty" role="status">
                <span>Preview unavailable</span>
                <span className="hint">Check the backend is running</span>
              </div>
            ) : (
              <>
                {imgLoading && <div className="skeleton" style={{ position: 'absolute', inset: 0 }} aria-busy="true" aria-label="Loading preview" />}
                {previewSrc && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={previewKey}
                  src={previewSrc}
                  alt={`${mediaType} preview`}
                  className="preview-img"
                  decoding="async"
                  style={{ opacity: imgLoading ? 0 : 1, transition: 'opacity var(--dur-3) var(--ease-out)' }}
                  onLoad={() => setImgLoading(false)}
                  onError={() => { setImgLoading(false); setImgError(true); }}
                />
                )}
              </>
            )}
          </div>

          {previewSrc && (
            <div className="preview-actions">
              <a
                className="btn btn-ghost btn-sm"
                href={previewSrc}
                target="_blank"
                rel="noreferrer"
              >
                <Maximize2 size={13} aria-hidden />
                Full size
              </a>
              <button className="btn btn-ghost btn-sm" onClick={() => void shareLook()}>
                <Link2 size={13} aria-hidden />
                Share this look
              </button>
            </div>
          )}

          {previewSrc && (
            <div>
              <span className="label" id={`${uid}-url-label`}>Image URL</span>
              <div className="urlbar" aria-labelledby={`${uid}-url-label`}>
                <code className="urlbar-code" title={previewSrc}>
                  {previewSrc}
                </code>
                <CopyButton text={previewSrc} label="Copy image URL" />
              </div>
            </div>
          )}

          <MediaSearch
            mediaId={mediaId}
            mediaTitle={mediaTitle}
            onSelect={handleMediaSelect}
            onError={msg => flash('error', msg)}
          />
        </div>

        {/* ── Controls column ──────────────────────────────────────── */}
        <div className="cfg-col">
          <div className="tabs" role="tablist" aria-label="Settings panel" onKeyDown={tablistKeyNav}>
            {([
              { id: 'display', label: 'Display', icon: <Settings2 size={13} aria-hidden /> },
              { id: 'ratings', label: 'Ratings', icon: <Star      size={13} aria-hidden /> },
              { id: 'profile', label: 'Profile', icon: <Film      size={13} aria-hidden /> },
              { id: 'install', label: 'Install', icon: <Rocket    size={13} aria-hidden /> },
            ] as const).map(tab => (
              <button
                key={tab.id}
                id={`${uid}-tab-${tab.id}`}
                role="tab"
                aria-selected={activeTab === tab.id}
                tabIndex={activeTab === tab.id ? 0 : -1}
                aria-controls={`${uid}-panel-${tab.id}`}
                className="tab"
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {(activeTab === 'display' || activeTab === 'ratings') && (
            <div
              className="surface-scope"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-2)', flexWrap: 'wrap', marginBottom: 'var(--sp-3)' }}
            >
              <span className="hint" style={{ margin: 0 }}>
                Editing <strong>{MEDIA_TYPES.find(t => t.id === mediaType)?.label ?? mediaType}</strong> settings — each surface is configured separately.
              </span>
              <button className="btn btn-ghost btn-sm" onClick={copyToAllSurfaces}>
                Copy to all surfaces
              </button>
            </div>
          )}

          {activeTab === 'display' && (
            <div id={`${uid}-panel-display`} role="tabpanel" aria-labelledby={`${uid}-tab-display`} className="tabpanel-enter">
              <DisplayPanel uid={uid} mediaType={mediaType} config={config} onUpdate={updateConfig} onToggleBadge={toggleBadge} onReset={() => { markManualEdit(); setConfigs(cs => ({ ...cs, [mediaType]: { ...DEFAULT_CONFIG } })); }} />
            </div>
          )}

          {activeTab === 'ratings' && (
            <div id={`${uid}-panel-ratings`} role="tabpanel" aria-labelledby={`${uid}-tab-ratings`} className="tabpanel-enter">
              <RatingsPanel uid={uid} config={config} onUpdate={updateConfig} onToggleRating={toggleRating} />
              <AdvancedPanel uid={uid} config={config} onUpdate={updateConfig} />
            </div>
          )}

          {activeTab === 'profile' && (
            <div id={`${uid}-panel-profile`} role="tabpanel" aria-labelledby={`${uid}-tab-profile`} className="tabpanel-enter">
              <ProfilePanel
                configs={configs}
                mediaType={mediaType}
                mediaId={mediaId}
                loaded={loadedProfile}
                setLoaded={setLoadedProfile}
                onLoadConfigs={handleLoadConfigs}
                flash={flash}
              />
            </div>
          )}

          {activeTab === 'install' && (
            <div id={`${uid}-panel-install`} role="tabpanel" aria-labelledby={`${uid}-tab-install`} className="tabpanel-enter">
              <InstallPanel
                configKey={loadedProfile ? (loadedProfile.alias || loadedProfile.id) : ''}
                renderKey={renderKey}
                onRenderKeyChange={applyRenderKey}
                onNotice={flash}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
