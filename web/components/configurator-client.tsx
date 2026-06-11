'use client';

import {
  useState, useCallback, useRef, useId, useEffect,
} from 'react';
import { Settings2, Star, Film, Rocket, Link2, Maximize2 } from 'lucide-react';
import { renderUrl, type MediaType, type Template } from '@/lib/api';
import {
  MEDIA_TYPES, DEFAULT_CONFIG, PREVIEW_DEBOUNCE_MS,
  readSession, encodeShare, decodeShare, type ConfigState,
} from './configurator-types';
import { Notice, DisplayPanel } from './configurator-display';
import { TemplateStrip, RatingsPanel } from './configurator-panels';
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
  const [config, setConfig] = useState<ConfigState>(DEFAULT_CONFIG);
  const [hydrated, setHydrated] = useState(false);

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
      setConfig(shared.cfg);
      history.replaceState(null, '', window.location.pathname + window.location.search);
    } else {
      setMediaType(readSession<MediaType>('xrdb-media-type', 'poster'));
      setMediaId(readSession<string>('xrdb-media-id', 'tt0468569'));
      setMediaTitle(readSession<string>('xrdb-media-title', 'The Dark Knight (2008)'));
      setConfig({ ...DEFAULT_CONFIG, ...readSession<Partial<ConfigState>>('xrdb-config', {}) });
    }
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
  const undoConfigRef = useRef<ConfigState | null>(null);
  const [undoAvailable, setUndoAvailable] = useState(false);

  useEffect(() => {
    if (!hydrated) return; // don't clobber storage with defaults pre-restore
    try {
      sessionStorage.setItem('xrdb-media-type', JSON.stringify(mediaType));
      sessionStorage.setItem('xrdb-media-id',   JSON.stringify(mediaId));
      sessionStorage.setItem('xrdb-media-title', JSON.stringify(mediaTitle));
      sessionStorage.setItem('xrdb-config',      JSON.stringify(config));
    } catch { /* unavailable */ }
  }, [hydrated, mediaType, mediaId, mediaTitle, config]);

  const buildSrc = useCallback((type: MediaType, id: string, cfg: ConfigState) => {
    return renderUrl(type, id || 'tt0468569', JSON.stringify({
      size: cfg.size, artworkSource: cfg.artworkSource, language: cfg.language,
      textPreference: cfg.textPreference, ratingsLayout: cfg.ratingsLayout,
      badgeStyle: cfg.badgeStyle, badgeTheme: cfg.badgeTheme,
      ratings: cfg.ratings, ageRating: cfg.ageRating, ageRatingPos: cfg.ageRatingPos,
      genre: cfg.genre, genrePos: cfg.genrePos, badges: cfg.badges,
      providers: cfg.providers, aggregateBar: cfg.aggregateBar,
      aggregateBarPos: cfg.aggregateBarPos, trending: cfg.trending,
    }));
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
    setConfig(c => ({ ...c, [key]: value }));
  };

  const toggleRating = (r: string) => {
    markManualEdit();
    setConfig(c => ({
      ...c, ratings: c.ratings.includes(r) ? c.ratings.filter(x => x !== r) : [...c.ratings, r],
    }));
  };

  const toggleBadge = (b: string) => {
    markManualEdit();
    setConfig(c => ({
      ...c, badges: c.badges.includes(b) ? c.badges.filter(x => x !== b) : [...c.badges, b],
    }));
  };

  const applyTemplate = (t: Template) => {
    const parsed = t.config as Partial<ConfigState>;
    undoConfigRef.current = config;
    setConfig(c => ({ ...c, ...parsed }));
    setAppliedTemplate(t.id);
    flash('info', `Template "${t.name}" applied`);
    setUndoAvailable(true);
  };

  const undoTemplate = () => {
    if (undoConfigRef.current) {
      setConfig(undoConfigRef.current);
      undoConfigRef.current = null;
    }
    setAppliedTemplate(null);
    setUndoAvailable(false);
    setNotice(null);
  };

  const handleLoadConfig = (loaded: Partial<ConfigState>) => {
    markManualEdit();
    setConfig({ ...DEFAULT_CONFIG, ...loaded });
  };

  const handleMediaSelect = (id: string, title: string) => {
    setMediaId(id);
    setMediaTitle(title);
  };

  const shareLook = async () => {
    const fragment = encodeShare({ t: mediaType, id: mediaId, title: mediaTitle, cfg: config });
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

          {activeTab === 'display' && (
            <div id={`${uid}-panel-display`} role="tabpanel" aria-labelledby={`${uid}-tab-display`} className="tabpanel-enter">
              <DisplayPanel uid={uid} config={config} onUpdate={updateConfig} onToggleBadge={toggleBadge} onReset={() => { markManualEdit(); setConfig(DEFAULT_CONFIG); }} />
            </div>
          )}

          {activeTab === 'ratings' && (
            <div id={`${uid}-panel-ratings`} role="tabpanel" aria-labelledby={`${uid}-tab-ratings`} className="tabpanel-enter">
              <RatingsPanel uid={uid} config={config} onUpdate={updateConfig} onToggleRating={toggleRating} />
            </div>
          )}

          {activeTab === 'profile' && (
            <div id={`${uid}-panel-profile`} role="tabpanel" aria-labelledby={`${uid}-tab-profile`} className="tabpanel-enter">
              <ProfilePanel
                config={config}
                mediaType={mediaType}
                mediaId={mediaId}
                loaded={loadedProfile}
                setLoaded={setLoadedProfile}
                onLoadConfig={handleLoadConfig}
                flash={flash}
              />
            </div>
          )}

          {activeTab === 'install' && (
            <div id={`${uid}-panel-install`} role="tabpanel" aria-labelledby={`${uid}-tab-install`} className="tabpanel-enter">
              <InstallPanel
                configKey={loadedProfile ? (loadedProfile.alias || loadedProfile.id) : ''}
                onNotice={flash}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
