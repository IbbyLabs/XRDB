import type { MediaType } from '@/lib/api';

export type { MediaType } from '@/lib/api';

// ── Option arrays ─────────────────────────────────────────────────────────────

export const MEDIA_TYPES: { id: MediaType; label: string; aspect: string }[] = [
  { id: 'poster',    label: 'Poster',    aspect: '2/3'  },
  { id: 'backdrop',  label: 'Backdrop',  aspect: '16/9' },
  { id: 'thumbnail', label: 'Thumbnail', aspect: '16/9' },
  { id: 'logo',      label: 'Logo',      aspect: '4/1'  },
];

export const ARTWORK_OPTIONS = [
  { id: 'tmdb',     label: 'TMDB' },
  { id: 'fanart',   label: 'Fanart.tv' },
  { id: 'cinemeta', label: 'Cinemeta' },
  { id: 'random',   label: 'Random' },
] as const;

export const SIZE_OPTIONS = [
  { id: 'normal', label: 'Normal' },
  { id: 'large',  label: 'Large'  },
  { id: '4k',     label: '4K'     },
] as const;

export const TEXT_PREF_OPTIONS = [
  { id: 'original',    label: 'Original'    },
  { id: 'clean',       label: 'Clean'       },
  { id: 'textless',    label: 'Textless'    },
  { id: 'alternative', label: 'Alternative' },
  { id: 'random',      label: 'Random'      },
] as const;

export const LANG_OPTIONS = ['en','de','fr','es','pt','it','ja','ko','zh'] as const;

export const LAYOUT_OPTIONS = [
  { id: 'bottom',     label: 'Bottom'      },
  { id: 'top',        label: 'Top'         },
  { id: 'split-side', label: 'Split sides' },
  { id: 'none',       label: 'Hidden'      },
] as const;

export const BADGE_STYLE_OPTIONS = [
  { id: 'pill',   label: 'Pill'    },
  { id: 'square', label: 'Square'  },
  { id: 'glass',  label: 'Outline' },
] as const;

export const BADGE_THEME_OPTIONS = [
  { id: 'dark',  label: 'Dark'  },
  { id: 'light', label: 'Light' },
] as const;

export const RATING_OPTIONS: { id: string; label: string; accent: string; group?: string }[] = [
  { id: 'imdb',       label: 'IMDb',        accent: '#f5c518' },
  { id: 'tmdb',       label: 'TMDB',        accent: '#01b4e4' },
  { id: 'rt',         label: 'RT critics',  accent: '#fa320a' },
  { id: 'rtaudience', label: 'RT audience', accent: '#fa320a' },
  { id: 'metacritic', label: 'Metacritic',  accent: '#ffcc34' },
  { id: 'letterboxd', label: 'Letterboxd',  accent: '#00a99d' },
  { id: 'mdblist',    label: 'MDBList',     accent: '#8b5cf6' },
  { id: 'trakt',      label: 'Trakt',       accent: '#ed1c24' },
  { id: 'simkl',      label: 'SIMKL',       accent: '#1cb0f6' },
  { id: 'mal',        label: 'MyAnimeList', accent: '#2c6fbb', group: 'anime' },
  { id: 'anilist',    label: 'AniList',     accent: '#02a9ff', group: 'anime' },
  { id: 'kitsu',      label: 'Kitsu',       accent: '#f76e18', group: 'anime' },
];

export const AGE_POS_OPTIONS = [
  { id: 'inherit', label: 'Auto'         },
  { id: 'tl',      label: 'Top left'     },
  { id: 'tr',      label: 'Top right'    },
  { id: 'bl',      label: 'Bottom left'  },
  { id: 'br',      label: 'Bottom right' },
] as const;

export const GENRE_POS_OPTIONS = [
  { id: 'inherit', label: 'Auto'         },
  { id: 'bl',      label: 'Bottom left'  },
  { id: 'br',      label: 'Bottom right' },
  { id: 'tl',      label: 'Top left'     },
  { id: 'tr',      label: 'Top right'    },
] as const;

export const RING_STYLE_OPTIONS = [
  { id: 'ring',    label: 'Ring'  },
  { id: 'compact', label: 'Wings' },
] as const;

export const RING_POS_OPTIONS = [
  { id: 'br', label: 'Bottom right' },
  { id: 'bl', label: 'Bottom left'  },
  { id: 'tr', label: 'Top right'    },
  { id: 'tl', label: 'Top left'     },
] as const;

export const QUALITY_BADGE_OPTIONS: { id: string; label: string }[] = [
  { id: '4k',        label: '4K'           },
  { id: 'hdr',       label: 'HDR'          },
  { id: 'hdr10',     label: 'HDR10'        },
  { id: 'hdr10plus', label: 'HDR10+'       },
  { id: 'dv',        label: 'Dolby Vision' },
  { id: 'atmos',     label: 'Atmos'        },
  { id: 'imax',      label: 'IMAX'         },
];

export const PREVIEW_DEBOUNCE_MS = 500;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ConfigState {
  size: string;
  artworkSource: string;
  language: string;
  textPreference: string;
  ratingsLayout: string;
  badgeStyle: string;
  badgeTheme: string;
  ratings: string[];
  ageRating: boolean;
  ageRatingPos: string;
  genre: boolean;
  genrePos: string;
  badges: string[];
  providers: boolean;
  aggregateBar: boolean;
  aggregateBarPos: string;
  trending: boolean;
  backdropAsPoster: boolean;
  ratingRing: boolean;
  ratingRingStyle: string;
  ratingRingPos: string;
  ratingRingColor: string;
}

export const DEFAULT_CONFIG: ConfigState = {
  size: 'normal',
  artworkSource: 'tmdb',
  language: 'en',
  textPreference: 'original',
  ratingsLayout: 'bottom',
  badgeStyle: 'pill',
  badgeTheme: 'dark',
  ratings: ['imdb', 'tmdb'],
  ageRating: false,
  ageRatingPos: 'inherit',
  genre: false,
  genrePos: 'inherit',
  badges: [],
  providers: false,
  aggregateBar: false,
  aggregateBarPos: 'bottom',
  trending: false,
  backdropAsPoster: false,
  ratingRing: false,
  ratingRingStyle: 'ring',
  ratingRingPos: 'br',
  ratingRingColor: '',
};

export type UpdateConfigFn = <K extends keyof ConfigState>(key: K, value: ConfigState[K]) => void;

// ── Utilities ─────────────────────────────────────────────────────────────────

export function readSession<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

// ── Shareable links ───────────────────────────────────────────────────────────
// The full configurator state travels in the URL hash (#c=…) so a look can be
// shared or bookmarked. base64url keeps it copy-paste safe in chat apps.

export interface ShareState {
  t: MediaType;
  id: string;
  title: string;
  cfg: ConfigState;
}

export function encodeShare(state: ShareState): string {
  const json = JSON.stringify(state);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeShare(fragment: string): ShareState | null {
  try {
    const b64 = fragment.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<ShareState>;
    if (!parsed || typeof parsed.id !== 'string' || typeof parsed.cfg !== 'object' || parsed.cfg === null) return null;
    const t = typeof parsed.t === 'string' && MEDIA_TYPES.some(m => m.id === parsed.t)
      ? (parsed.t as MediaType)
      : 'poster';
    return {
      t,
      id: parsed.id,
      title: typeof parsed.title === 'string' ? parsed.title : parsed.id,
      cfg: { ...DEFAULT_CONFIG, ...parsed.cfg },
    };
  } catch {
    return null;
  }
}

export function normalizeError(e: unknown): string {
  const msg = (e as Error).message ?? 'Unknown error';
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError'))
    return 'Could not reach the backend.';
  return msg;
}
