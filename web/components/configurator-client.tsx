'use client';

import { useState, useCallback, useRef, useTransition, useId, useEffect } from 'react';
import { Eye, Save, Download, Upload, RefreshCw, Check, AlertCircle, X } from 'lucide-react';
import { renderUrl, createProfile, exportProfile, importProfiles, type MediaType, type Profile } from '@/lib/api';

const MEDIA_TYPES: { id: MediaType; label: string; aspect: string }[] = [
  { id: 'poster',    label: 'Poster',    aspect: '2/3'  },
  { id: 'backdrop',  label: 'Backdrop',  aspect: '16/9' },
  { id: 'thumbnail', label: 'Thumbnail', aspect: '16/9' },
  { id: 'logo',      label: 'Logo',      aspect: '4/1'  },
];

const SIZE_OPTIONS    = ['normal', '4k']                              as const;
const ARTWORK_OPTIONS = ['tmdb', 'fanart', 'cinemeta']                as const;
const LANG_OPTIONS    = ['en', 'de', 'fr', 'es', 'pt', 'it', 'ja', 'ko', 'zh'] as const;
const LAYOUT_OPTIONS  = ['bottom', 'top', 'none']                    as const;
const RATING_OPTIONS  = ['tmdb', 'imdb', 'rt', 'metacritic', 'trakt'] as const;

const RATING_LABELS: Record<string, string> = {
  tmdb: 'The Movie Database score',
  imdb: 'IMDb rating',
  rt: 'Rotten Tomatoes',
  metacritic: 'Metacritic score',
  trakt: 'Trakt rating',
};

const PROFILE_ID_RE = /^[a-zA-Z0-9_-]+$/;

interface ConfigState {
  size: string;
  artwork: string;
  language: string;
  ratingsLayout: string;
  ratings: string[];
}

const DEFAULT_CONFIG: ConfigState = {
  size: 'normal',
  artwork: 'tmdb',
  language: 'en',
  ratingsLayout: 'bottom',
  ratings: ['tmdb', 'imdb'],
};

function readSession<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

function Notice({ type, message, onDismiss }: {
  type: 'error' | 'success' | 'info';
  message: string;
  onDismiss?: () => void;
}) {
  return (
    <div
      className={`xrdb-notice xrdb-notice-${type}`}
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
    >
      {type === 'error'
        ? <AlertCircle size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: '0.1rem' }} />
        : <Check size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: '0.1rem' }} />}
      <span style={{ flex: 1 }}>{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="xrdb-notice-dismiss" aria-label="Dismiss notification">
          <X size={12} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function normalizeError(e: unknown): string {
  const msg = (e as Error).message ?? 'Unknown error';
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('fetch'))
    return 'Could not reach the backend — is it running on port 8787?';
  return msg;
}

export function ConfiguratorClient() {
  const uid = useId();

  const [mediaType, setMediaType] = useState<MediaType>(
    () => readSession<MediaType>('xrdb-media-type', 'poster')
  );
  const [mediaId, setMediaId] = useState(
    () => readSession<string>('xrdb-media-id', 'tt0816692')
  );
  const [config, setConfig] = useState<ConfigState>(
    () => readSession<ConfigState>('xrdb-config', DEFAULT_CONFIG)
  );
  const [profileId, setProfileId]     = useState('');
  const [profileName, setProfileName] = useState('');
  const [notice, setNotice]           = useState<{ type: 'error' | 'success' | 'info'; message: string } | null>(null);
  const [recentProfiles, setRecentProfiles] = useState<string[]>(
    () => {
      if (typeof window === 'undefined') return [];
      try { return JSON.parse(localStorage.getItem('xrdb-recent') ?? '[]') as string[]; } catch { return []; }
    }
  );

  // Committed preview state — only updates when user clicks Preview
  const [previewMediaType, setPreviewMediaType] = useState<MediaType>('poster');
  const [previewMediaId, setPreviewMediaId]     = useState('tt0816692');
  const [previewConfig, setPreviewConfig]       = useState<ConfigState>(DEFAULT_CONFIG);
  const [previewProfileId, setPreviewProfileId] = useState('');
  const [previewKey, setPreviewKey]             = useState(0);
  const [imgError, setImgError]   = useState(false);
  const [imgLoading, setImgLoading] = useState(false);

  const [isPending, startTransition] = useTransition();
  const [importText, setImportText]  = useState('');
  const [showImport, setShowImport]  = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist config to sessionStorage on change
  useEffect(() => {
    try {
      sessionStorage.setItem('xrdb-media-type', JSON.stringify(mediaType));
      sessionStorage.setItem('xrdb-media-id',   JSON.stringify(mediaId));
      sessionStorage.setItem('xrdb-config',      JSON.stringify(config));
    } catch { /* storage unavailable */ }
  }, [mediaType, mediaId, config]);

  const imgSrc = renderUrl(
    previewMediaType,
    previewMediaId || 'tt0816692',
    previewProfileId || JSON.stringify(previewConfig),
  );
  const aspect = MEDIA_TYPES.find(t => t.id === previewMediaType)?.aspect ?? '2/3';

  const commitPreview = useCallback(() => {
    setPreviewMediaType(mediaType);
    setPreviewMediaId(mediaId);
    setPreviewConfig(config);
    setPreviewProfileId(profileId);
    setPreviewKey(k => k + 1);
    setImgError(false);
    setImgLoading(true);
  }, [mediaType, mediaId, config, profileId]);

  const flash = useCallback((type: 'error' | 'success' | 'info', message: string) => {
    setNotice({ type, message });
    if (timerRef.current) clearTimeout(timerRef.current);
    // Errors persist until dismissed; success/info auto-dismiss
    if (type !== 'error') {
      timerRef.current = setTimeout(() => setNotice(null), 4000);
    }
  }, []);

  const addRecent = useCallback((id: string) => {
    setRecentProfiles(prev => {
      const next = [id, ...prev.filter(p => p !== id)].slice(0, 5);
      try { localStorage.setItem('xrdb-recent', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const handleSaveProfile = () => {
    const trimmed = profileId.trim();
    if (!trimmed) { flash('error', 'Profile ID is required'); return; }
    if (!PROFILE_ID_RE.test(trimmed)) {
      flash('error', 'Profile ID: letters, numbers, hyphens, and underscores only');
      return;
    }
    startTransition(async () => {
      try {
        await createProfile({
          id: trimmed,
          name: profileName.trim() || trimmed,
          type: mediaType,
          config: config as unknown as Record<string, unknown>,
        });
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

  const toggleRating = (r: string) => {
    setConfig(c => ({
      ...c,
      ratings: c.ratings.includes(r) ? c.ratings.filter(x => x !== r) : [...c.ratings, r],
    }));
  };

  return (
    <div className="xrdb-page-inner">
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 className="xrdb-section-title">Configurator</h1>
        <p className="xrdb-section-sub">Configure artwork and ratings overlays, then preview the result.</p>
      </div>

      {notice && (
        <div style={{ marginBottom: '1rem' }}>
          <Notice {...notice} onDismiss={() => setNotice(null)} />
        </div>
      )}

      <div className="cfg-layout">

        {/* Left: preview */}
        <div className="cfg-preview-col">
          <div role="tablist" aria-label="Media type" className="xrdb-type-tabs">
            {MEDIA_TYPES.map(t => (
              <button
                key={t.id}
                role="tab"
                id={`${uid}-tab-${t.id}`}
                aria-selected={mediaType === t.id}
                aria-controls={`${uid}-panel-preview`}
                className="xrdb-type-tab"
                onClick={() => setMediaType(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div
            id={`${uid}-panel-preview`}
            role="tabpanel"
            aria-label={`${mediaType} preview`}
            className="xrdb-preview-frame"
            style={{ aspectRatio: aspect, maxHeight: '520px' }}
          >
            {imgError ? (
              <div className="xrdb-preview-empty" role="status">
                <span>No preview — is the backend running?</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.25rem' }}>Click Preview to retry</span>
              </div>
            ) : (
              <>
                {imgLoading && (
                  <div className="xrdb-skeleton" style={{ position: 'absolute', inset: 0 }} aria-busy="true" aria-label="Loading preview" />
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={previewKey}
                  src={imgSrc}
                  alt={`${previewMediaType} preview for ${previewMediaId}`}
                  className="xrdb-preview-img"
                  style={{ aspectRatio: aspect, opacity: imgLoading ? 0 : 1, transition: 'opacity 0.2s' }}
                  loading="lazy"
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
                  onKeyDown={e => { if (e.key === 'Enter') commitPreview(); }}
                  placeholder="tt0816692"
                  aria-describedby={`${uid}-media-hint`}
                />
                <span id={`${uid}-media-hint`} className="xrdb-field-hint">IMDb tt-ID or TMDb integer ID · Enter to preview</span>
              </div>
              <button className="xrdb-btn xrdb-btn-ghost" onClick={commitPreview} aria-label="Refresh preview">
                <RefreshCw size={14} aria-hidden="true" />
                Preview
              </button>
            </div>
          </div>
        </div>

        {/* Right: config */}
        <div className="cfg-controls-col">
          <div className="xrdb-card">
            <div className="xrdb-card-header">
              <Eye size={14} aria-hidden="true" style={{ color: 'var(--muted)' }} />
              <span className="xrdb-card-title">Display</span>
              <button
                className="xrdb-btn xrdb-btn-ghost"
                onClick={() => setConfig(DEFAULT_CONFIG)}
                style={{ marginLeft: 'auto', fontSize: '0.75rem', padding: '0.2rem 0.6rem', minHeight: '2rem' }}
                aria-label="Reset display settings to defaults"
              >
                Reset
              </button>
            </div>
            <div className="xrdb-card-body cfg-fields">
              <div>
                <label className="xrdb-label" htmlFor={`${uid}-size`}>Size</label>
                <select id={`${uid}-size`} className="xrdb-select" value={config.size} onChange={e => setConfig(c => ({ ...c, size: e.target.value }))}>
                  {SIZE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                <span className="xrdb-field-hint">normal: standard · 4k: high-resolution output</span>
              </div>
              <div>
                <label className="xrdb-label" htmlFor={`${uid}-artwork`}>Artwork source</label>
                <select id={`${uid}-artwork`} className="xrdb-select" value={config.artwork} onChange={e => setConfig(c => ({ ...c, artwork: e.target.value }))}>
                  {ARTWORK_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                <span className="xrdb-field-hint">tmdb: The Movie Database · fanart: Fanart.tv · cinemeta: Cinemeta/Trakt</span>
              </div>
              <div>
                <label className="xrdb-label" htmlFor={`${uid}-lang`}>Language</label>
                <select id={`${uid}-lang`} className="xrdb-select" value={config.language} onChange={e => setConfig(c => ({ ...c, language: e.target.value }))}>
                  {LANG_OPTIONS.map(o => <option key={o} value={o}>{o.toUpperCase()}</option>)}
                </select>
                <span className="xrdb-field-hint">Preferred language for metadata and poster art</span>
              </div>
              <div>
                <label className="xrdb-label" htmlFor={`${uid}-layout`}>Ratings bar position</label>
                <select id={`${uid}-layout`} className="xrdb-select" value={config.ratingsLayout} onChange={e => setConfig(c => ({ ...c, ratingsLayout: e.target.value }))}>
                  {LAYOUT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                <span className="xrdb-field-hint">Overlay position: bottom, top, or none to hide ratings</span>
              </div>
              <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
                <legend className="xrdb-label">Rating providers</legend>
                <div className="cfg-rating-chips" role="group">
                  {RATING_OPTIONS.map(r => {
                    const active = config.ratings.includes(r);
                    return (
                      <button
                        key={r}
                        onClick={() => toggleRating(r)}
                        className={`xrdb-chip${active ? ' xrdb-chip--active' : ''}`}
                        aria-pressed={active}
                        title={RATING_LABELS[r]}
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>
                <span className="xrdb-field-hint">Toggle which scores appear in the ratings bar</span>
              </fieldset>
            </div>
          </div>

          <div className="xrdb-card">
            <div className="xrdb-card-header">
              <Save size={14} aria-hidden="true" style={{ color: 'var(--muted)' }} />
              <span className="xrdb-card-title">Profile</span>
            </div>
            <div className="xrdb-card-body cfg-fields">
              <div>
                <label className="xrdb-label" htmlFor={`${uid}-pid`}>Profile ID</label>
                <input
                  id={`${uid}-pid`}
                  className="xrdb-input"
                  value={profileId}
                  onChange={e => setProfileId(e.target.value)}
                  placeholder="my-profile"
                  aria-describedby={`${uid}-pid-hint`}
                />
                <span id={`${uid}-pid-hint`} className="xrdb-field-hint">Letters, numbers, hyphens, underscores</span>
              </div>
              <div>
                <label className="xrdb-label" htmlFor={`${uid}-pname`}>Display name</label>
                <input id={`${uid}-pname`} className="xrdb-input" value={profileName} onChange={e => setProfileName(e.target.value)} placeholder="My Profile" />
              </div>
              {recentProfiles.length > 0 && (
                <div>
                  <span className="xrdb-label" style={{ display: 'block' }}>Recent profiles</span>
                  <div className="cfg-recent-profiles">
                    {recentProfiles.map(id => (
                      <button
                        key={id}
                        className="xrdb-btn xrdb-btn-ghost cfg-recent-btn"
                        onClick={() => setProfileId(id)}
                        aria-label={`Load profile ${id}`}
                      >
                        {id}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="cfg-profile-actions">
                <button className="xrdb-btn xrdb-btn-primary cfg-btn-save" onClick={handleSaveProfile} disabled={isPending}>
                  <Save size={13} aria-hidden="true" />
                  Save profile
                </button>
                <button className="xrdb-btn xrdb-btn-ghost" onClick={handleExport} disabled={isPending} aria-label="Export profile as JSON">
                  <Download size={13} aria-hidden="true" />
                  Export
                </button>
                <button className="xrdb-btn xrdb-btn-ghost" onClick={() => setShowImport(v => !v)} aria-expanded={showImport} aria-label="Toggle import panel">
                  <Upload size={13} aria-hidden="true" />
                  Import
                </button>
              </div>
              {showImport && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <textarea
                    className="xrdb-input"
                    value={importText}
                    onChange={e => setImportText(e.target.value)}
                    placeholder='{"version":1,"profiles":[...]}'
                    rows={4}
                    spellCheck={false}
                    style={{ resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: '0.78rem' }}
                    aria-label="Import JSON payload"
                  />
                  <button className="xrdb-btn xrdb-btn-primary" onClick={handleImport} disabled={isPending || !importText.trim()}>
                    Import profiles
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
