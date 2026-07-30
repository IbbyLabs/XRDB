'use client';

import {
  useState, useCallback, useRef, useId, useEffect, useMemo,
} from 'react';
import { Settings2, Star, SlidersHorizontal, Film, Rocket, Link2, Maximize2, Undo2, Redo2, Check, X } from 'lucide-react';
import { renderUrl, type MediaType, type Template } from '@/lib/api';
import { getRenderKey, setRenderKey } from '@/lib/render-key';
import { copyText } from '@/lib/clipboard';
import { syncShares } from '@/lib/shares';
import {
  MEDIA_TYPES, DEFAULT_CONFIG, DEFAULT_SURFACE_CONFIGS, PREVIEW_DEBOUNCE_MS,
  readSession, encodeShare, decodeShare, cloneToAllSurfaces, fromStoredConfig,
  type ConfigState, type SurfaceConfigs,
} from './configurator-types';
import { Notice, DisplayPanel } from './configurator-display';
import { TemplateStrip, RatingsPanel } from './configurator-panels';
import { ProfilePanel, type LoadedProfile } from './profile-panel';
import { InstallPanel } from './install-panel';
import { MediaSearch } from './media-search';
import { CopyButton } from './copy-button';
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

export function ConfiguratorClient() {
  const uid = useId();

  const [mediaType, setMediaType] = useState<MediaType>('poster');
  const [mediaId, setMediaId] = useState('tt0468569');
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
    try { setFine(localStorage.getItem(FINE_KEY) === '1'); } catch { /* unavailable */ }
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
    } catch { /* unavailable */ }
  }, [hydrated, mediaType, mediaId, mediaTitle, configs]);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(FINE_KEY, fine ? '1' : '0'); } catch { /* unavailable */ }
  }, [hydrated, fine]);

  useEffect(() => { configsRef.current = configs; }, [configs]);

  const buildSrc = useCallback((type: MediaType, id: string, cfg: ConfigState) => {
    const payload: Record<string, unknown> = {
      size: cfg.size, artworkSource: cfg.artworkSource, language: cfg.language,
      randomPosterText: cfg.randomPosterText === 'any' ? '' : cfg.randomPosterText,
      randomPosterLanguage: cfg.randomPosterLanguage === 'any' ? '' : cfg.randomPosterLanguage,
      randomPosterMinVoteCount: cfg.randomPosterMinVoteCount,
      randomPosterMinVoteAverage: cfg.randomPosterMinVoteAverage,
      randomPosterMinWidth: cfg.randomPosterMinWidth,
      randomPosterMinHeight: cfg.randomPosterMinHeight,
      randomPosterFallback: cfg.randomPosterFallback === 'best' ? '' : cfg.randomPosterFallback,
      textPreference: cfg.textPreference, ratingsLayout: cfg.ratingsLayout,
      badgeStyle: cfg.badgeStyle, badgeTheme: cfg.badgeTheme,
      ratings: cfg.ratings, ageRating: cfg.ageRating, ageRatingPos: cfg.ageRatingPos,
      releaseStatus: cfg.releaseStatus,
      topRated: cfg.topRated,
      topRatedPos: cfg.topRatedPos === 'inherit' ? '' : cfg.topRatedPos,
      releaseStatusPos: cfg.releaseStatusPos === 'inherit' ? '' : cfg.releaseStatusPos,
      releaseStatusBadgeStyle: cfg.releaseStatusBadgeStyle,
      releaseStatusTileColor: cfg.releaseStatusTileColor,
      genre: cfg.genre, genrePos: cfg.genrePos, badges: cfg.badges,
      providers: cfg.providers, providersCountry: cfg.providersCountry,
      networkTileColor: cfg.networkTileColor, aggregateBar: cfg.aggregateBar,
      aggregateBarPos: cfg.aggregateBarPos, trending: cfg.trending,
      trendingStyle: cfg.trendingStyle,
      backdropAsPoster: cfg.backdropAsPoster,
      logoWidth: cfg.logoWidth,
      logoHeight: cfg.logoHeight,
      logoPos: cfg.logoPos,
      logoAnchor: cfg.logoAnchor,
      ratingRing: cfg.ratingRing,
      ratingRingPos: cfg.ratingRingPos, ratingRingColor: cfg.ratingRingColor,
      // Advanced styling. Zero-valued numbers mean "default" and are harmless to
      // send; ratingsMax is the exception — 0 there would cap to zero badges, so
      // it is only included when the user set a real cap.
      ratingBadgeScale: cfg.ratingBadgeScale,
      ratingBadgeOffsetX: cfg.ratingBadgeOffsetX,
      ratingBadgeOffsetY: cfg.ratingBadgeOffsetY,
      ratingXOffsetPillGlass: cfg.ratingXOffsetPillGlass,
      ratingYOffsetPillGlass: cfg.ratingYOffsetPillGlass,
      ratingXOffsetSquare: cfg.ratingXOffsetSquare,
      ratingYOffsetSquare: cfg.ratingYOffsetSquare,
      posterEdgeOffset: cfg.posterEdgeOffset,
      bottomRatingsRow: cfg.bottomRatingsRow || undefined,
      ratingPresentation: cfg.ratingPresentation === 'standard' ? '' : cfg.ratingPresentation,
      ratingValueMode: cfg.ratingValueMode === 'native' ? '' : cfg.ratingValueMode,
      ratingVoteCounts: cfg.ratingVoteCounts,
      iconShape: cfg.iconShape,
      sideRatingsPosition: cfg.sideRatingsPosition === 'middle' ? '' : cfg.sideRatingsPosition,
      sideRatingsOffset: cfg.sideRatingsOffset,
      ratingsMaxPerSide: cfg.ratingsMaxPerSide,
      genreBadgeScale: cfg.genreBadgeScale,
      genreBadgeOffsetX: cfg.genreBadgeOffsetX,
      genreBadgeOffsetY: cfg.genreBadgeOffsetY,
      genreBadgeBackgroundOpacity: cfg.genreBadgeBackgroundOpacity,
      genreBadgeBorderWidth: cfg.genreBadgeBorderWidth,
      noBackgroundBadgeOutlineColor: cfg.noBackgroundBadgeOutlineColor,
      noBackgroundBadgeOutlineWidth: cfg.noBackgroundBadgeOutlineWidth,
      qualityBadgesHidden: cfg.qualityBadgesHidden || undefined,
      providersPos: cfg.providersPos,
      providerBadgeScale: cfg.providerBadgeScale,
      providerBadgeOffsetX: cfg.providerBadgeOffsetX,
      providerBadgeOffsetY: cfg.providerBadgeOffsetY,
      qualityBadgesPos: cfg.qualityBadgesPos,
      qualityBadgeScale: cfg.qualityBadgeScale,
      qualityBadgeOffsetX: cfg.qualityBadgeOffsetX,
      qualityBadgeOffsetY: cfg.qualityBadgeOffsetY,
      qualityBadgesStyle: cfg.qualityBadgesStyle === 'default' ? '' : cfg.qualityBadgesStyle,
      qualityBadgesTileAccentColor: cfg.qualityBadgesTileAccentColor,
      genreBadgeStyle: cfg.genreBadgeStyle === 'default' ? '' : cfg.genreBadgeStyle,
      genreBadgeMode: cfg.genreBadgeMode === 'default' ? '' : cfg.genreBadgeMode,
      genreBadgeAccent: cfg.genreBadgeAccent === 'default' ? '' : cfg.genreBadgeAccent,
      genreBadgeLabel: cfg.genreBadgeLabel === 'default' ? '' : cfg.genreBadgeLabel,
      genreBadgeAnimeGrouping: cfg.genreBadgeAnimeGrouping === 'default' ? '' : cfg.genreBadgeAnimeGrouping,
      aggregateAccentColor: cfg.aggregateAccentColor,
      aggregateAccentMode: cfg.aggregateAccentMode,
      aggregatePillPos: cfg.aggregatePillPos,
      aggregateAccentShape: cfg.aggregateAccentShape === 'outline' ? '' : cfg.aggregateAccentShape,
      aggregateBarOffset: cfg.aggregateBarOffset,
      aggregateValueColor: cfg.aggregateValueColor,
      aggregateCriticsAccentColor: cfg.aggregateCriticsAccentColor,
      aggregateAudienceAccentColor: cfg.aggregateAudienceAccentColor,
      aggregateCriticsValueColor: cfg.aggregateCriticsValueColor,
      aggregateAudienceValueColor: cfg.aggregateAudienceValueColor,
      aggregateDynamicStops: cfg.aggregateDynamicStops,
      aggregateFillByScore: cfg.aggregateFillByScore || undefined,
      // Only sent when turned off, so a default config stays free of the key.
      aggregateAccentBarVisible: cfg.aggregateAccentBarVisible ? undefined : false,
      aggregateAccentBarOffset: cfg.aggregateAccentBarOffset,
      aggregateRatingSource: cfg.aggregateRatingSource === 'overall' ? '' : cfg.aggregateRatingSource,
      scorebarStyle: cfg.scorebarStyle === 'progress' ? '' : cfg.scorebarStyle,
      scorebarLowColor: cfg.scorebarLowColor,
      scorebarMidColor: cfg.scorebarMidColor,
      scorebarHighColor: cfg.scorebarHighColor,
      scorebarLowThreshold: cfg.scorebarLowThreshold,
      scorebarHighThreshold: cfg.scorebarHighThreshold,
      trendingTextColor: cfg.trendingTextColor,
      trendingTagStyle: cfg.trendingTagStyle,
      ageRatingBadgeStyle: cfg.ageRatingBadgeStyle === 'default' ? '' : cfg.ageRatingBadgeStyle,
      ageRatingTileColor: cfg.ageRatingTileColor,
      trendingPos: cfg.trendingPos,
      logoBackground: cfg.logoBackground,
      episodeArtworkMode: cfg.episodeArtworkMode === 'still' ? '' : cfg.episodeArtworkMode,
      ringCenterOpacity: cfg.ringCenterOpacity,
      ringValueSource: cfg.ringValueSource === 'overall' ? '' : cfg.ringValueSource,
      ringProgressSource: cfg.ringProgressSource === 'overall' ? '' : cfg.ringProgressSource,
    };
    if (cfg.ratingsMax > 0) payload.ratingsMax = cfg.ratingsMax;
    if (cfg.qualityBadgesMax > 0) payload.qualityBadgesMax = cfg.qualityBadgesMax;
    if (Object.keys(cfg.ratingProviderOverrides).length > 0) {
      payload.ratingProviderOverrides = cfg.ratingProviderOverrides;
    }
    if (Object.keys(cfg.ratingProviderIconScale).length > 0) {
      payload.ratingProviderIconScale = cfg.ratingProviderIconScale;
    }
    if (Object.keys(cfg.ratingProviderWeights).length > 0) {
      payload.ratingProviderWeights = cfg.ratingProviderWeights;
    }
    if (cfg.ringCriticsPriority.length > 0) payload.ringCriticsPriority = cfg.ringCriticsPriority;
    if (cfg.ringAudiencePriority.length > 0) payload.ringAudiencePriority = cfg.ringAudiencePriority;
    return renderUrl(type, id || 'tt0468569', JSON.stringify(payload), renderKey);
  }, [renderKey]);

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
