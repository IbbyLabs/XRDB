'use client';

import { useState, useEffect, useRef, useId, useCallback } from 'react';
import { Search, Shuffle, Pin, X } from 'lucide-react';
import { searchTitles, trendingTitles, renderIDFor, type TitleResult } from '@/lib/api';

export interface PinnedItem {
  id: string;    // render ID (tt-ID or TMDB numeric)
  title: string;
}

const PINS_KEY = 'xrdb-pins';

function readPins(): PinnedItem[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(PINS_KEY) ?? '[]') as PinnedItem[]; } catch { return []; }
}

const DIRECT_ID_RE = /^(tt\d+|\d+)$/;

interface MediaSearchProps {
  mediaId: string;
  mediaTitle: string;
  onSelect: (id: string, title: string) => void;
  onError: (message: string) => void;
}

export function MediaSearch({ mediaId, mediaTitle, onSelect, onError }: MediaSearchProps) {
  const uid = useId();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TitleResult[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [shuffling, setShuffling] = useState(false);
  const [pins, setPins] = useState<PinnedItem[]>(readPins);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const trendingRef = useRef<TitleResult[] | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const runSearch = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = q.trim();
    if (trimmed.length < 2 || DIRECT_ID_RE.test(trimmed)) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const hits = await searchTitles(trimmed);
        setResults(hits);
        setOpen(hits.length > 0);
      } catch {
        onError('Search is unavailable — check the TMDB key on this instance.');
      } finally {
        setSearching(false);
      }
    }, 350);
  }, [onError]);

  const selectResult = async (t: TitleResult) => {
    setOpen(false);
    setQuery('');
    const id = await renderIDFor(t);
    onSelect(id, t.year ? `${t.title} (${t.year})` : t.title);
  };

  const handleDirect = () => {
    const trimmed = query.trim();
    if (DIRECT_ID_RE.test(trimmed)) {
      onSelect(trimmed, trimmed);
      setQuery('');
      setOpen(false);
    } else if (results.length > 0) {
      void selectResult(results[0]);
    }
  };

  const shuffle = async () => {
    setShuffling(true);
    try {
      if (!trendingRef.current) {
        trendingRef.current = await trendingTitles();
      }
      const pool = trendingRef.current.filter(t => String(t.tmdbId) !== mediaId);
      if (pool.length === 0) return;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      const id = await renderIDFor(pick);
      if (id === mediaId && pool.length > 1) {
        const next = pool[(pool.indexOf(pick) + 1) % pool.length];
        onSelect(await renderIDFor(next), next.year ? `${next.title} (${next.year})` : next.title);
      } else {
        onSelect(id, pick.year ? `${pick.title} (${pick.year})` : pick.title);
      }
    } catch {
      onError('Shuffle is unavailable — check the TMDB key on this instance.');
    } finally {
      setShuffling(false);
    }
  };

  const isPinned = pins.some(p => p.id === mediaId);
  const togglePin = () => {
    setPins(prev => {
      const next = isPinned
        ? prev.filter(p => p.id !== mediaId)
        : [...prev, { id: mediaId, title: mediaTitle || mediaId }].slice(-8);
      try { localStorage.setItem(PINS_KEY, JSON.stringify(next)); } catch { /* unavailable */ }
      return next;
    });
  };

  const unpin = (id: string) => {
    setPins(prev => {
      const next = prev.filter(p => p.id !== id);
      try { localStorage.setItem(PINS_KEY, JSON.stringify(next)); } catch { /* unavailable */ }
      return next;
    });
  };

  return (
    <div className="media-search" ref={wrapRef}>
      <div className="media-current">
        <span className="media-current-title" title={mediaId}>{mediaTitle || mediaId}</span>
        <button
          className={`btn btn-ghost btn-sm${isPinned ? ' media-pin--on' : ''}`}
          onClick={togglePin}
          aria-pressed={isPinned}
          aria-label={isPinned ? 'Unpin this title' : 'Pin this title'}
        >
          <Pin size={13} aria-hidden />
          {isPinned ? 'Pinned' : 'Pin'}
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={shuffle}
          disabled={shuffling}
          aria-label="Shuffle to a trending title"
        >
          <Shuffle size={13} aria-hidden className={shuffling ? 'spin' : ''} />
          Shuffle
        </button>
      </div>

      <div className="field" style={{ position: 'relative' }}>
        <label className="label" htmlFor={`${uid}-q`}>Find a title</label>
        <div className="media-search-box">
          <Search size={14} aria-hidden className="media-search-icon" />
          <input
            id={`${uid}-q`}
            className="input media-search-input"
            value={query}
            onChange={e => { setQuery(e.target.value); runSearch(e.target.value); }}
            onKeyDown={e => { if (e.key === 'Enter') handleDirect(); }}
            onFocus={() => { if (results.length > 0) setOpen(true); }}
            placeholder="Search by name, or paste an IMDb / TMDB ID"
            role="combobox"
            aria-expanded={open}
            aria-controls={`${uid}-results`}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        {searching && <span className="hint">Searching…</span>}
        {open && (
          <ul id={`${uid}-results`} className="media-results" role="listbox">
            {results.map(t => (
              <li key={`${t.mediaType}-${t.tmdbId}`}>
                <button
                  className="media-result"
                  role="option"
                  aria-selected="false"
                  onClick={() => void selectResult(t)}
                >
                  <span className="media-result-title">{t.title}</span>
                  <span className="media-result-meta">
                    {t.year > 0 && `${t.year} · `}{t.mediaType === 'tv' ? 'Series' : 'Movie'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pins.length > 0 && (
        <div className="field">
          <span className="label">Pinned</span>
          <div className="pin-row">
            {pins.map(p => (
              <span key={p.id} className={`pin-chip${p.id === mediaId ? ' pin-chip--active' : ''}`}>
                <button
                  className="pin-chip-btn"
                  onClick={() => onSelect(p.id, p.title)}
                  title={p.id}
                >
                  {p.title}
                </button>
                <button className="pin-chip-x" onClick={() => unpin(p.id)} aria-label={`Unpin ${p.title}`}>
                  <X size={11} aria-hidden />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
