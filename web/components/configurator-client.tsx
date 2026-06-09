'use client';

import {
  useState, useCallback, useRef, useTransition, useId, useEffect,
} from 'react';
import { RefreshCw, Settings2, Star, Film, LayoutTemplate, AlertCircle, Check, X } from 'lucide-react';
import {
  renderUrl, createProfile, exportProfile, importProfiles,
  type MediaType, type Profile, type Template,
} from '@/lib/api';
import {
  MEDIA_TYPES, DEFAULT_CONFIG, PROFILE_ID_RE, PREVIEW_DEBOUNCE_MS,
  readSession, normalizeError, type ConfigState,
} from './configurator-types';
import { Notice, DisplayPanel } from './configurator-display';
import { TemplatesPanel, RatingsPanel, ProfilePanel } from './configurator-panels';

export function ConfiguratorClient() {
  const uid = useId();

  const [mediaType, setMediaType] = useState<MediaType>(
    () => readSession<MediaType>('xrdb-media-type', 'poster'),
  );
  const [mediaId, setMediaId] = useState(
    () => readSession<string>('xrdb-media-id', 'tt0468569'),
  );
  const [config, setConfig] = useState<ConfigState>(
    () => readSession<ConfigState>('xrdb-config', DEFAULT_CONFIG),
  );
  const [profileId, setProfileId]     = useState('');
  const [profileName, setProfileName] = useState('');
  const [notice, setNotice] = useState<{ type: 'error' | 'success' | 'info'; message: string } | null>(null);
  const [recentProfiles, setRecentProfiles] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem('xrdb-recent') ?? '[]') as string[]; } catch { return []; }
  });

  const [previewSrc, setPreviewSrc] = useState('');
  const [previewKey, setPreviewKey] = useState(0);
  const [imgLoading, setImgLoading] = useState(false);
  const [imgError, setImgError]     = useState(false);

  const [isPending, startTransition] = useTransition();
  const [importText, setImportText]  = useState('');
  const [showImport, setShowImport]  = useState(false);
  const [activeTab, setActiveTab]    = useState<'display' | 'ratings' | 'profile' | 'templates'>('display');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem('xrdb-media-type', JSON.stringify(mediaType));
      sessionStorage.setItem('xrdb-media-id',   JSON.stringify(mediaId));
      sessionStorage.setItem('xrdb-config',      JSON.stringify(config));
    } catch { /* unavailable */ }
  }, [mediaType, mediaId, config]);

  const buildSrc = useCallback((type: MediaType, id: string, cfg: ConfigState) => {
    return renderUrl(type, id || 'tt0468569', JSON.stringify({
      size: cfg.size, artworkSource: cfg.artworkSource, language: cfg.language,
      textPreference: cfg.textPreference, ratingsLayout: cfg.ratingsLayout,
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

  useEffect(() => {
    triggerPreview(mediaType, mediaId, config, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aspect = MEDIA_TYPES.find(t => t.id === mediaType)?.aspect ?? '2/3';

  const flash = useCallback((type: 'error' | 'success' | 'info', message: string) => {
    setNotice({ type, message });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    if (type !== 'error') {
      noticeTimer.current = setTimeout(() => setNotice(null), 4000);
    }
  }, []);

  const addRecent = useCallback((id: string) => {
    setRecentProfiles(prev => {
      const next = [id, ...prev.filter(p => p !== id)].slice(0, 5);
      try { localStorage.setItem('xrdb-recent', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const updateConfig = <K extends keyof ConfigState>(key: K, value: ConfigState[K]) => {
    setConfig(c => ({ ...c, [key]: value }));
  };

  const toggleRating = (r: string) => {
    setConfig(c => ({
      ...c, ratings: c.ratings.includes(r) ? c.ratings.filter(x => x !== r) : [...c.ratings, r],
    }));
  };

  const toggleBadge = (b: string) => {
    setConfig(c => ({
      ...c, badges: c.badges.includes(b) ? c.badges.filter(x => x !== b) : [...c.badges, b],
    }));
  };

  const handleSaveProfile = () => {
    const trimmed = profileId.trim();
    if (!trimmed) { flash('error', 'Profile ID is required'); return; }
    if (!PROFILE_ID_RE.test(trimmed)) {
      flash('error', 'Profile ID: letters, numbers, hyphens, underscores only');
      return;
    }
    startTransition(async () => {
      try {
        await createProfile({ id: trimmed, name: profileName.trim() || trimmed, type: mediaType, config: config as unknown as Record<string, unknown> });
        addRecent(trimmed);
        flash('success', `Profile "${trimmed}" saved`);
      } catch (e) { flash('error', normalizeError(e)); }
    });
  };

  const handleExport = () => {
    if (!profileId.trim()) { flash('error', 'Enter a profile ID to export'); return; }
    startTransition(async () => {
      try {
        const envelope = await exportProfile(profileId.trim());
        const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = `xrdb-profile-${profileId.trim()}.json`;
        a.click(); URL.revokeObjectURL(url);
        flash('success', 'Profile exported');
      } catch (e) { flash('error', normalizeError(e)); }
    });
  };

  const handleImport = () => {
    startTransition(async () => {
      try {
        let envelope: { version: number; profiles: Profile[] };
        try {
          envelope = JSON.parse(importText) as { version: number; profiles: Profile[] };
        } catch {
          flash('error', 'Invalid JSON — expected {"version":1,"profiles":[...]}');
          return;
        }
        const result = await importProfiles(envelope);
        flash('success', `Imported ${result.imported}, skipped ${result.skipped}`);
        setImportText(''); setShowImport(false);
      } catch (e) { flash('error', normalizeError(e)); }
    });
  };

  return (
    <div className="xrdb-page-inner">
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 className="xrdb-section-title">Configurator</h1>
        <p className="xrdb-section-sub">Adjust settings and watch the preview update live.</p>
      </div>

      {notice && (
        <div style={{ marginBottom: '1rem' }}>
          <Notice {...notice} onDismiss={() => setNotice(null)} />
        </div>
      )}

      <div className="cfg-layout">

        {/* ── Preview column ───────────────────────────────────────── */}
        <div className="cfg-preview-col">
          <div role="tablist" aria-label="Media type" className="xrdb-type-tabs">
            {MEDIA_TYPES.map(t => (
              <button key={t.id} role="tab" aria-selected={mediaType === t.id} className="xrdb-type-tab" onClick={() => setMediaType(t.id)}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="xrdb-preview-frame" style={{ aspectRatio: aspect, maxHeight: mediaType === 'poster' ? '540px' : '320px' }}>
            {imgError ? (
              <div className="xrdb-preview-empty" role="status">
                <span>Preview unavailable</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
                  Check the backend is running
                </span>
              </div>
            ) : (
              <>
                {imgLoading && <div className="xrdb-skeleton" style={{ position: 'absolute', inset: 0 }} aria-busy="true" aria-label="Loading preview" />}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={previewKey}
                  src={previewSrc}
                  alt={`${mediaType} preview`}
                  className="xrdb-preview-img"
                  style={{ opacity: imgLoading ? 0 : 1, transition: 'opacity 0.25s' }}
                  onLoad={() => setImgLoading(false)}
                  onError={() => { setImgLoading(false); setImgError(true); }}
                />
              </>
            )}
          </div>

          <div className="xrdb-card">
            <div className="xrdb-card-body" style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label className="xrdb-label" htmlFor={`${uid}-media-id`}>Media ID</label>
                <input
                  id={`${uid}-media-id`}
                  className="xrdb-input"
                  value={mediaId}
                  onChange={e => setMediaId(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') triggerPreview(mediaType, mediaId, config, true); }}
                  placeholder="tt0468569"
                />
                <span className="xrdb-field-hint">IMDb tt-ID or TMDB integer ID</span>
              </div>
              <button className="xrdb-btn xrdb-btn-ghost" style={{ whiteSpace: 'nowrap' }} onClick={() => triggerPreview(mediaType, mediaId, config, true)} aria-label="Refresh preview now">
                <RefreshCw size={14} aria-hidden />
                Refresh
              </button>
            </div>
          </div>

          {previewSrc && (
            <div className="xrdb-card">
              <div className="xrdb-card-body">
                <label className="xrdb-label">Image URL</label>
                <div className="cfg-url-row">
                  <code className="cfg-url-code" title={previewSrc}>
                    {previewSrc.length > 72 ? previewSrc.slice(0, 72) + '…' : previewSrc}
                  </code>
                  <button
                    className="xrdb-btn xrdb-btn-ghost"
                    style={{ flexShrink: 0, fontSize: '0.72rem', padding: '0.2rem 0.55rem', minHeight: '2rem' }}
                    onClick={() => navigator.clipboard.writeText(previewSrc).then(() => flash('success', 'URL copied'), () => flash('error', 'Copy failed'))}
                    aria-label="Copy image URL"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Controls column ──────────────────────────────────────── */}
        <div className="cfg-controls-col">
          <div className="cfg-tab-bar" role="tablist" aria-label="Settings panel">
            {([
              { id: 'display',   label: 'Display',   icon: <Settings2      size={13} aria-hidden /> },
              { id: 'ratings',   label: 'Ratings',   icon: <Star           size={13} aria-hidden /> },
              { id: 'templates', label: 'Templates', icon: <LayoutTemplate size={13} aria-hidden /> },
              { id: 'profile',   label: 'Profile',   icon: <Film           size={13} aria-hidden /> },
            ] as const).map(tab => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                className={`cfg-tab${activeTab === tab.id ? ' cfg-tab--active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'display' && (
            <DisplayPanel uid={uid} config={config} onUpdate={updateConfig} onToggleBadge={toggleBadge} onReset={() => setConfig(DEFAULT_CONFIG)} />
          )}

          {activeTab === 'ratings' && (
            <RatingsPanel uid={uid} config={config} onUpdate={updateConfig} onToggleRating={toggleRating} />
          )}

          {activeTab === 'templates' && (
            <TemplatesPanel onApply={(t) => {
              const parsed = t.config as Partial<ConfigState>;
              setConfig(c => ({ ...c, ...parsed }));
              setActiveTab('display');
            }} />
          )}

          {activeTab === 'profile' && (
            <ProfilePanel
              uid={uid}
              profileId={profileId} setProfileId={setProfileId}
              profileName={profileName} setProfileName={setProfileName}
              recentProfiles={recentProfiles}
              isPending={isPending}
              importText={importText} setImportText={setImportText}
              showImport={showImport} setShowImport={setShowImport}
              onSave={handleSaveProfile} onExport={handleExport} onImport={handleImport}
            />
          )}
        </div>
      </div>
    </div>
  );
}
