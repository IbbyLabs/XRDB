'use client';

import {
  useState, useCallback, useRef, useId, useEffect, useMemo,
} from 'react';
import { Settings2, Star, SlidersHorizontal, Film, Rocket, Link2, Maximize2, Undo2, Redo2, Check, X, Save } from 'lucide-react';
import { renderUrl, type MediaType, type Template } from '@/lib/api';
import { getRenderKey, setRenderKey } from '@/lib/render-key';
import { copyText } from '@/lib/clipboard';
import { syncShares } from '@/lib/shares';
import {
  MEDIA_TYPES, DEFAULT_CONFIG, DEFAULT_SURFACE_CONFIGS, PREVIEW_DEBOUNCE_MS,
  ALWAYS_SEND, DEFAULT_MEDIA_ID,
  readSession, encodeShare, decodeShare, cloneToAllSurfaces, fromStoredConfig,
  type ConfigState, type SurfaceConfigs,
} from './configurator-types';
import { Notice, DisplayPanel } from './configurator-display';
import { TemplateStrip, RatingsPanel } from './configurator-panels';
import { ProfilePanel, type LoadedProfile } from './profile-panel';
import { InstallPanel } from './install-panel';
import { MediaSearch } from './media-search';
import { tablistKeyNav } from './tablist';
import { BRAND_DISCORD_URL } from '@/lib/brand';

// A media id that already names a season and episode.
const EPISODE_ID_RE = /:\d+:\d+$/;

// Cap on the undo stack — deep enough for a real editing session, bounded so it
// can't grow without limit.
const HISTORY_MAX = 50;

// Remembers whether the fine-tuning controls are revealed. A preference about
// how the editor looks, not part of any config, so it outlives the session.
const FINE_KEY = 'xrdb-fine-tuning';

// Two kinds of destination share one tab row: the first two style the surface
// being previewed, the last two act on the whole saved config.
const SURFACE_TABS = [
  { id: 'display', label: 'Display', icon: <Settings2 size={13} aria-hidden /> },
  { id: 'ratings', label: 'Ratings', icon: <Star      size={13} aria-hidden /> },
] as const;

const CONFIG_TABS = [
  { id: 'profile', label: 'Profile', icon: <Film   size={13} aria-hidden /> },
  { id: 'install', label: 'Install', icon: <Rocket size={13} aria-hidden /> },
] as const;

type TabId = (typeof SURFACE_TABS)[number]['id'] | (typeof CONFIG_TABS)[number]['id'];

// Structural comparison: several config values are arrays or objects, where
// identity would report every render as a change.
function sameConfigValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => sameConfigValue(v, b[i]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    if (ka.length !== kb.length) return false;
    return ka.every(k =>
      Object.prototype.hasOwnProperty.call(b, k) &&
      sameConfigValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

export function ConfiguratorClient() {
  const uid = useId();

  const [mediaType, setMediaType] = useState<MediaType>('poster');
  const [mediaId, setMediaId] = useState(DEFAULT_MEDIA_ID);
  const [previewEpisode, setPreviewEpisode] = useState({ season: 1, episode: 1 });
  const [mediaTitle, setMediaTitle] = useState('The Dark Knight (2008)');
  const [configs, setConfigs] = useState<SurfaceConfigs>(DEFAULT_SURFACE_CONFIGS);
  const [hydrated, setHydrated] = useState(false);
  // Instance render key (XRDB_API_KEY). Empty on an open instance; on a keyed
  // one the operator enters it under the Install tab and it flows into the
  // preview/image URLs and profile saves.
  const [renderKey, setRenderKeyState] = useState('');
  // Reveals each badge's scale, offset and colour controls beneath the badge
  // itself. Off by default so the common controls stay a short list.
  const [fine, setFine] = useState(false);
  // The surface currently being edited / previewed. Each surface keeps its own
  // settings; switching the media-type tab switches which one these controls edit.
  const config = configs[mediaType];
  // Mirror of the live configs, so undo/redo can read the current state without a
  // stale closure and without mutating refs inside a setState updater. Event
  // handlers run after commit, so this stays current for them.
  const configsRef = useRef(configs);

  // Restore persisted state after mount: the page is statically prerendered,
  // so reading storage during the first render mismatches the server HTML
  // (React #418). The config merge keeps sessions saved before new fields
  // existed (e.g. badgeStyle/badgeTheme) complete.
  // A share link (#c=…) beats the stored session — someone sent this exact
  // look — and is consumed from the URL so refreshes fall back to the session.
  const [loadedProfile, setLoadedProfile] = useState<LoadedProfile | null>(null);
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
      setMediaId(readSession<string>('xrdb-media-id', DEFAULT_MEDIA_ID));
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
    // The loaded profile is restored alongside the settings. Autosave is gated
    // on it, so a reload that brought back every control but not the identity
    // left the editor looking normal and writing nothing.
    setLoadedProfile(readSession<LoadedProfile | null>('xrdb-loaded-profile', null));
    setRenderKeyState(getRenderKey());
    try { setFine(localStorage.getItem(FINE_KEY) === '1'); } catch { /* unavailable */ }
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  const [appliedTemplate, setAppliedTemplate] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'error' | 'success' | 'info'; message: string } | null>(null);

  const [previewSrc, setPreviewSrc] = useState('');
  const [previewKey, setPreviewKey] = useState(0);
  const [imgLoading, setImgLoading] = useState(false);
  const [imgError, setImgError]     = useState(false);
  // True from the moment a control changes until the debounced render fires, so
  // an edit is acknowledged immediately instead of feeling ignored for ~500ms.
  const [previewPending, setPreviewPending] = useState(false);

  const [activeTab, setActiveTab] = useState<TabId>('display');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Acknowledgement shown on the share button itself, so the result of the
  // click is visible without scrolling back up to the notice.
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const shareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (shareTimer.current) clearTimeout(shareTimer.current); }, []);
  // Undo history: every config mutation snapshots the previous surface set here,
  // so any change — a manual edit or a template — can be stepped back with the
  // Undo control or Cmd/Ctrl+Z. Capped so a long session can't grow it unbounded.
  const historyRef = useRef<SurfaceConfigs[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  // Undone states, for redo. Any fresh edit clears this (you can't redo down a
  // branch you've diverged from).
  const redoRef = useRef<SurfaceConfigs[]>([]);
  const [canRedo, setCanRedo] = useState(false);
  // Tracks the last-edited field so a burst of edits to one control (typing into
  // a number field) collapses into a single undo step instead of one per keystroke.
  const lastEditRef = useRef<{ key: string; t: number } | null>(null);

  useEffect(() => {
    if (!hydrated) return; // don't clobber storage with defaults pre-restore
    try {
      sessionStorage.setItem('xrdb-media-type', JSON.stringify(mediaType));
      sessionStorage.setItem('xrdb-media-id',   JSON.stringify(mediaId));
      sessionStorage.setItem('xrdb-media-title', JSON.stringify(mediaTitle));
      sessionStorage.setItem('xrdb-configs',     JSON.stringify(configs));
      // The password is deliberately not stored: it is held for the lifetime of
      // a tab and no longer. A restored profile that needs one comes back locked.
      if (loadedProfile) {
        sessionStorage.setItem('xrdb-loaded-profile', JSON.stringify({ ...loadedProfile, password: '' }));
      } else {
        sessionStorage.removeItem('xrdb-loaded-profile');
      }
    } catch { /* unavailable */ }
  }, [hydrated, mediaType, mediaId, mediaTitle, configs, loadedProfile]);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(FINE_KEY, fine ? '1' : '0'); } catch { /* unavailable */ }
  }, [hydrated, fine]);

  useEffect(() => { configsRef.current = configs; }, [configs]);

  const buildSrc = useCallback((type: MediaType, id: string, cfg: ConfigState) => {
    // Send what differs from the defaults, rather than naming each key. The
    // list this replaced had to be edited whenever a control was added, and it
    // was not: six keys reached the configurator and never reached a render.
    // Deriving the payload means a new key works with no change here at all.
    const payload: Record<string, unknown> = {};
    for (const key of Object.keys(cfg) as (keyof ConfigState)[]) {
      const value = cfg[key];
      const fallback = DEFAULT_CONFIG[key];
      if (ALWAYS_SEND.has(key as string) || !sameConfigValue(value, fallback)) {
        payload[key as string] = value;
      }
    }
    // Name the loaded profile so the preview applies its stored provider keys
    // to these unsaved edits; without it the preview always uses the shared key.
    const keysFrom = loadedProfile ? (loadedProfile.alias || loadedProfile.id) : undefined;
    return renderUrl(type, id || DEFAULT_MEDIA_ID, JSON.stringify(payload), renderKey, keysFrom);
  }, [renderKey, loadedProfile]);

  const applyRenderKey = useCallback((value: string) => {
    setRenderKeyState(value);
    setRenderKey(value);
  }, []);

  const triggerPreview = useCallback((type: MediaType, id: string, cfg: ConfigState, immediate = false) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const run = () => {
      setPreviewPending(false);
      setPreviewSrc(buildSrc(type, id, cfg));
      setPreviewKey(k => k + 1);
      setImgError(false);
      setImgLoading(true);
    };
    if (immediate) { run(); return; }
    setPreviewPending(true);
    debounceRef.current = setTimeout(run, PREVIEW_DEBOUNCE_MS);
  }, [buildSrc]);

  // Thumbnails are episode artwork, so the preview asks for one. A movie id
  // falls back to its normal artwork server-side.
  const previewId = useMemo(() => {
    if (mediaType !== 'thumbnail' || EPISODE_ID_RE.test(mediaId)) return mediaId;
    return `${mediaId}:${previewEpisode.season}:${previewEpisode.episode}`;
  }, [mediaType, mediaId, previewEpisode]);

  useEffect(() => {
    // A config/media change schedules a debounced render and marks the preview
    // pending right away; the synchronous set is intentional feedback, not a
    // cascade to avoid.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    triggerPreview(mediaType, previewId, config);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [mediaType, previewId, config, triggerPreview]);

  const aspect = MEDIA_TYPES.find(t => t.id === mediaType)?.aspect ?? '2/3';

  const otherSurfaceLabels = useMemo(() => {
    const names = MEDIA_TYPES.filter(t => t.id !== mediaType).map(t => t.label);
    if (names.length < 2) return names.join('');
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }, [mediaType]);

  const flash = useCallback((type: 'error' | 'success' | 'info', message: string, opts?: { persist?: boolean }) => {
    setNotice({ type, message });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    // Errors and persistent notices (e.g. a saved config key the user must copy)
    // stay until dismissed; ordinary confirmations clear themselves.
    if (type !== 'error' && !opts?.persist) {
      noticeTimer.current = setTimeout(() => setNotice(null), 5000);
    }
  }, []);

  // Snapshot the current surface set before a mutation so it can be undone. A
  // fresh edit invalidates any redo branch.
  const pushHistory = useCallback((current: SurfaceConfigs) => {
    const h = historyRef.current;
    h.push(current);
    if (h.length > HISTORY_MAX) h.shift();
    setCanUndo(true);
    if (redoRef.current.length > 0) {
      redoRef.current = [];
      setCanRedo(false);
    }
  }, []);

  const undo = useCallback(() => {
    const prev = historyRef.current.pop();
    if (!prev) return;
    lastEditRef.current = null;
    // Capture the state we're leaving so it can be redone.
    redoRef.current.push(configsRef.current);
    setConfigs(prev);
    setCanRedo(true);
    setCanUndo(historyRef.current.length > 0);
    setAppliedTemplate(null);
    setNotice(null);
  }, []);

  const redo = useCallback(() => {
    const next = redoRef.current.pop();
    if (!next) return;
    lastEditRef.current = null;
    historyRef.current.push(configsRef.current);
    setConfigs(next);
    setCanUndo(true);
    setCanRedo(redoRef.current.length > 0);
    setAppliedTemplate(null);
    setNotice(null);
  }, []);

  const updateConfig = <K extends keyof ConfigState>(key: K, value: ConfigState[K]) => {
    // Setting a value to what it already is (re-picking the active option) is a
    // no-op and shouldn't create an undo step.
    if (configs[mediaType][key] === value) return;
    // Coalesce a run of edits to the same field within a short window into one
    // undo step, so typing "150" is one Ctrl+Z, not three.
    const now = Date.now();
    const last = lastEditRef.current;
    if (!last || last.key !== String(key) || now - last.t > 500) {
      pushHistory(configs);
    }
    lastEditRef.current = { key: String(key), t: now };
    setAppliedTemplate(null);
    setConfigs(cs => ({ ...cs, [mediaType]: { ...cs[mediaType], [key]: value } }));
  };

  const moveRating = (r: string, dir: -1 | 1) => {
    lastEditRef.current = null;
    pushHistory(configs);
    setAppliedTemplate(null);
    setConfigs(cs => {
      const cur = cs[mediaType];
      const i = cur.ratings.indexOf(r);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= cur.ratings.length) return cs;
      const ratings = [...cur.ratings];
      [ratings[i], ratings[j]] = [ratings[j], ratings[i]];
      return { ...cs, [mediaType]: { ...cur, ratings } };
    });
  };

  const toggleRating = (r: string) => {
    lastEditRef.current = null;
    pushHistory(configs);
    setAppliedTemplate(null);
    setConfigs(cs => {
      const cur = cs[mediaType];
      const ratings = cur.ratings.includes(r)
        ? cur.ratings.filter(x => x !== r)
        : [...cur.ratings, r];
      return { ...cs, [mediaType]: {
        ...cur,
        ratings,
        // A tuned weighting is per-source, so changing which sources are in
        // play has to redistribute it or the new one would count for nothing.
        ratingProviderWeights: syncShares(ratings, cur.ratingProviderWeights),
      } };
    });
  };

  const renderTab = (tab: { id: TabId; label: string; icon: React.ReactNode }) => (
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
  );

  const toggleBadge = (b: string) => {
    lastEditRef.current = null;
    pushHistory(configs);
    setAppliedTemplate(null);
    setConfigs(cs => {
      const cur = cs[mediaType];
      return { ...cs, [mediaType]: {
        ...cur, badges: cur.badges.includes(b) ? cur.badges.filter(x => x !== b) : [...cur.badges, b],
      } };
    });
  };

  const applyTemplate = (t: Template) => {
    const parsed = t.config as Partial<ConfigState>;
    lastEditRef.current = null;
    pushHistory(configs);
    setConfigs(cs => ({ ...cs, [mediaType]: { ...cs[mediaType], ...parsed } }));
    setAppliedTemplate(t.id);
    flash('info', `Template "${t.name}" applied to ${mediaType}`);
  };

  const handleLoadConfigs = (loaded: SurfaceConfigs) => {
    lastEditRef.current = null;
    pushHistory(configs);
    setAppliedTemplate(null);
    setConfigs(loaded);
  };

  const copyToAllSurfaces = () => {
    lastEditRef.current = null;
    pushHistory(configs);
    setAppliedTemplate(null);
    setConfigs(cs => cloneToAllSurfaces(cs[mediaType]));
    flash('success', `Applied ${mediaType} settings to every surface`);
  };

  // Cmd/Ctrl+Z undoes the last config change — but not while typing in a field,
  // where the browser's own text undo should win.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k !== 'z' && k !== 'y') return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return;
      e.preventDefault();
      // Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y redoes.
      if (k === 'y' || (k === 'z' && e.shiftKey)) redo();
      else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const handleMediaSelect = (id: string, title: string) => {
    setMediaId(id);
    setMediaTitle(title);
  };

  const shareLook = async () => {
    const fragment = encodeShare({ t: mediaType, id: mediaId, title: mediaTitle, cfgs: configs });
    const link = `${window.location.origin}${window.location.pathname}#c=${fragment}`;
    const ok = await copyText(link);
    // The notice explains what the link does, but it renders at the top of the
    // page while this button sits down in the preview column, so on anything
    // shorter than the whole page it lands out of sight. The button says the
    // short version itself, where the click happened.
    setShareState(ok ? 'copied' : 'failed');
    if (shareTimer.current) clearTimeout(shareTimer.current);
    shareTimer.current = setTimeout(() => setShareState('idle'), 2000);
    if (ok) {
      flash('success', 'Share link copied — anyone who opens it sees this exact look');
    } else {
      flash('error', 'Could not copy the link — your browser blocked clipboard access');
    }
  };

  return (
    <div className="page-inner">
      <div className="page-head">
        <h1 className="page-title">Configurator</h1>
        <p className="page-sub">Pick a template, watch the preview update live, copy the URL.</p>
      </div>

      <details className="cfg-help">
        <summary>New to XRDB? How this works</summary>
        <ol className="cfg-help-steps">
          <li>Find a title — search by name, or paste an IMDb / TMDB ID.</li>
          <li>Adjust the controls; the preview updates live. Undo any change with Ctrl/Cmd+Z.</li>
          <li>Each surface (poster, backdrop, thumbnail, logo) is styled on its own — use <strong>Copy to all surfaces</strong> to match them.</li>
          <li>Save a profile to get a config key, then open <strong>Install</strong> to use it in your media setup.</li>
        </ol>
        <p className="hint" style={{ marginTop: 0 }}>
          Full guide in <a href="/help">Help</a>. Stuck?{' '}
          <a href={BRAND_DISCORD_URL} target="_blank" rel="noreferrer">Ask in the Discord</a>.
        </p>
      </details>

      {notice && (
        <div style={{ marginBottom: 'var(--sp-4)' }}>
          <Notice
            {...notice}
            onDismiss={() => setNotice(null)}
            actionLabel={canUndo && notice.type === 'info' ? 'Undo' : undefined}
            onAction={canUndo && notice.type === 'info' ? undo : undefined}
          />
        </div>
      )}

      <TemplateStrip appliedId={appliedTemplate} onApply={applyTemplate} />

      <div className="cfg-layout">

        {/* ── Preview column ───────────────────────────────────────── */}
        <div className="cfg-col cfg-col-preview">
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
            className={`preview-stage${previewPending ? ' is-updating' : ''}`}
            style={{
              aspectRatio: aspect,
              height: mediaType === 'poster' ? '560px' : mediaType === 'logo' ? '170px' : '330px',
              maxWidth: '100%',
              alignSelf: 'center',
            }}
          >
            {previewPending && !imgError && (
              <span className="preview-status" aria-hidden="true">Updating…</span>
            )}
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
              <button
                className={`btn btn-ghost btn-sm${shareState === 'failed' ? ' btn-danger' : ''}`}
                onClick={() => void shareLook()}
              >
                {shareState === 'copied' ? <Check size={13} aria-hidden />
                  : shareState === 'failed' ? <X size={13} aria-hidden />
                  : <Link2 size={13} aria-hidden />}
                {shareState === 'copied' ? 'Link copied'
                  : shareState === 'failed' ? 'Copy failed'
                  : 'Share this look'}
              </button>
              {!loadedProfile && (
                // Save lived only inside the Profile tab, so someone who set up
                // their whole look without opening it had nothing to keep. This
                // sits with the preview, which is where the work happens.
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setActiveTab('profile');
                    // Switching the tab alone leaves the reader wherever the
                    // page was scrolled, which on a long panel is the middle of
                    // a form they did not ask for.
                    requestAnimationFrame(() => {
                      document.getElementById(`${uid}-panel-profile`)
                        ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
                      // Focus follows, or a keyboard caller is left on the
                      // button they pressed with the panel changed behind them.
                      document.querySelector<HTMLInputElement>('[data-register-username]')?.focus();
                    });
                  }}
                  title="Save these settings to a profile"
                >
                  <Save size={13} aria-hidden />
                  Save
                </button>
              )}
              <button
                className="btn btn-ghost btn-sm"
                onClick={undo}
                disabled={!canUndo}
                title="Undo the last change (Ctrl/Cmd+Z)"
              >
                <Undo2 size={13} aria-hidden />
                Undo
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={redo}
                disabled={!canRedo}
                title="Redo (Ctrl/Cmd+Shift+Z)"
              >
                <Redo2 size={13} aria-hidden />
                Redo
              </button>
            </div>
          )}

          <MediaSearch
            mediaId={mediaId}
            mediaTitle={mediaTitle}
            onSelect={handleMediaSelect}
            onError={msg => flash('error', msg)}
          />

          {mediaType === 'thumbnail' && !EPISODE_ID_RE.test(mediaId) && (
            <div className="field" style={{ marginTop: 'var(--sp-3)' }}>
              <span className="label" id={`${uid}-ep-label`}>Preview episode</span>
              <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}
                role="group" aria-labelledby={`${uid}-ep-label`}>
                <label className="hint" htmlFor={`${uid}-ep-season`}>Season</label>
                <input
                  id={`${uid}-ep-season`}
                  className="input" type="number" inputMode="numeric"
                  min={0} max={99} value={previewEpisode.season}
                  onChange={e => setPreviewEpisode(p => ({ ...p, season: Math.max(0, Number(e.target.value) || 0) }))}
                  style={{ maxWidth: '5rem' }}
                />
                <label className="hint" htmlFor={`${uid}-ep-episode`}>Episode</label>
                <input
                  id={`${uid}-ep-episode`}
                  className="input" type="number" inputMode="numeric"
                  min={1} max={999} value={previewEpisode.episode}
                  onChange={e => setPreviewEpisode(p => ({ ...p, episode: Math.max(1, Number(e.target.value) || 1) }))}
                  style={{ maxWidth: '5rem' }}
                />
              </div>
              <span className="hint" style={{ marginTop: 'var(--sp-2)' }}>
                Thumbnails are episode artwork. A movie falls back to its own artwork.
              </span>
            </div>
          )}
        </div>

        {/* ── Controls column ──────────────────────────────────────── */}
        <div className="cfg-col">
          <div className="tabs" role="tablist" aria-label="Settings panel" onKeyDown={tablistKeyNav}>
            {SURFACE_TABS.map(renderTab)}

            {/* Profile and Install act on the whole config rather than the
                surface being styled, so they hold their own row instead of
                wrapping into one by chance. */}
            <span className="tabs-break" aria-hidden="true" />
            <span className="tabs-group" aria-hidden="true">This config</span>
            {CONFIG_TABS.map(renderTab)}
          </div>

          {(activeTab === 'display' || activeTab === 'ratings') && (
            <>
              <div className="surface-scope">
                <span className="surface-scope-text">
                  These settings apply to <strong>{MEDIA_TYPES.find(t => t.id === mediaType)?.label ?? mediaType}</strong> only.
                  {' '}{otherSurfaceLabels} keep their own, including which badges show.
                </span>
                <button className="btn btn-ghost btn-sm" onClick={copyToAllSurfaces}>
                  Copy to all surfaces
                </button>
              </div>

              <div className="fine-bar">
                <div>
                  <span className="fine-bar-label">
                    <SlidersHorizontal size={14} aria-hidden />
                    Fine tuning
                  </span>
                  <span className="fine-bar-hint">
                    Scale, offset and colour, shown with the badge itself. Blank fields use the default.
                  </span>
                </div>
                <button
                  role="switch"
                  aria-checked={fine}
                  className={`toggle${fine ? ' toggle--on' : ''}`}
                  onClick={() => setFine(v => !v)}
                  aria-label="Toggle fine tuning"
                >
                  <span className="toggle-thumb" />
                </button>
              </div>
            </>
          )}

          {activeTab === 'display' && (
            <div id={`${uid}-panel-display`} role="tabpanel" aria-labelledby={`${uid}-tab-display`} className="tabpanel-enter">
              <DisplayPanel uid={uid} mediaType={mediaType} config={config} onUpdate={updateConfig} onToggleBadge={toggleBadge} fine={fine} onReset={() => { lastEditRef.current = null; pushHistory(configs); setAppliedTemplate(null); setConfigs(cs => ({ ...cs, [mediaType]: { ...DEFAULT_CONFIG } })); }} />
            </div>
          )}

          {activeTab === 'ratings' && (
            <div id={`${uid}-panel-ratings`} role="tabpanel" aria-labelledby={`${uid}-tab-ratings`} className="tabpanel-enter">
              <RatingsPanel uid={uid} config={config} onUpdate={updateConfig} onToggleRating={toggleRating} onMoveRating={moveRating} fine={fine} />
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
                versionToken={loadedProfile?.versionToken}
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
