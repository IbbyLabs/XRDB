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
  { id: 'tmdb',     label: 'TMDB',      desc: 'The Movie Database — broad, reliable poster coverage' },
  { id: 'fanart',   label: 'Fanart.tv', desc: 'Fanart.tv — high-resolution, often textless artwork' },
  { id: 'cinemeta', label: 'Cinemeta',  desc: "Stremio's Cinemeta catalogue artwork" },
  { id: 'omdb',     label: 'OMDb',      desc: 'OMDb poster art; posters only, and needs an OMDb API key' },
  { id: 'random',   label: 'Random',    desc: 'Pick a different source on each render' },
] as const;

export const SIZE_OPTIONS = [
  { id: 'small',  label: 'Small'  },
  { id: 'normal', label: 'Normal' },
  { id: 'large',  label: 'Large'  },
  { id: '4k',     label: 'Largest' },
] as const;

export const OUTPUT_FORMAT_OPTIONS = [
  { id: '',     label: 'Auto' },
  { id: 'jpeg', label: 'JPEG' },
  { id: 'png',  label: 'PNG'  },
] as const;

export const TOP_RATED_STYLE_OPTIONS = [
  { id: '',       label: 'Default' },
  { id: 'glass',  label: 'Glass'   },
  { id: 'square', label: 'Square'  },
  { id: 'plain',  label: 'Plain'   },
  { id: 'tile',   label: 'Tile'    },
  { id: 'silver', label: 'Silver'  },
] as const;

export const TEXT_PREF_OPTIONS = [
  { id: 'original',    label: 'Original',    desc: 'The poster as-is, including its title text' },
  { id: 'clean',       label: 'Clean',       desc: 'Prefer artwork with minimal text' },
  { id: 'textless',    label: 'Textless',    desc: 'Prefer artwork with no title text at all' },
  { id: 'alternative', label: 'Alternative', desc: 'An alternate poster where one is available' },
  { id: 'random',      label: 'Random',      desc: 'A different pick on each render' },
] as const;

// 'original' resolves per title from the language it was made in, so Seven
// Samurai renders Japanese art and The Matrix renders English from one setting.
export const ORIGINAL_LANGUAGE = 'original';

export const LANG_OPTIONS: { id: string; label: string }[] = [
  { id: ORIGINAL_LANGUAGE, label: "Original (the title's own)" },
  { id: 'en', label: 'English'    },
  { id: 'ar', label: 'Arabic'     },
  { id: 'bg', label: 'Bulgarian'  },
  { id: 'cs', label: 'Czech'      },
  { id: 'da', label: 'Danish'     },
  { id: 'nl', label: 'Dutch'      },
  { id: 'fi', label: 'Finnish'    },
  { id: 'fr', label: 'French'     },
  { id: 'de', label: 'German'     },
  { id: 'el', label: 'Greek'      },
  { id: 'he', label: 'Hebrew'     },
  { id: 'hi', label: 'Hindi'      },
  { id: 'hu', label: 'Hungarian'  },
  { id: 'id', label: 'Indonesian' },
  { id: 'it', label: 'Italian'    },
  { id: 'ja', label: 'Japanese'   },
  { id: 'ko', label: 'Korean'     },
  { id: 'no', label: 'Norwegian'  },
  { id: 'fa', label: 'Persian'    },
  { id: 'pl', label: 'Polish'     },
  { id: 'pt', label: 'Portuguese' },
  { id: 'ro', label: 'Romanian'   },
  { id: 'ru', label: 'Russian'    },
  { id: 'zh', label: 'Chinese'    },
  { id: 'es', label: 'Spanish'    },
  { id: 'sv', label: 'Swedish'    },
  { id: 'ta', label: 'Tamil'      },
  { id: 'te', label: 'Telugu'     },
  { id: 'th', label: 'Thai'       },
  { id: 'tr', label: 'Turkish'    },
  { id: 'uk', label: 'Ukrainian'  },
  { id: 'vi', label: 'Vietnamese' },
];

export const LAYOUT_OPTIONS = [
  { id: 'bottom',     label: 'Bottom'       },
  { id: 'top',        label: 'Top'          },
  { id: 'left',       label: 'Left'         },
  { id: 'right',      label: 'Right'        },
  { id: 'split-side', label: 'Split sides'  },
  { id: 'top-bottom', label: 'Top & bottom' },
  { id: 'none',       label: 'Hidden'       },
] as const;

// Layouts that stack ratings in a column against an edge, so they share the
// vertical-position and per-column cap controls.
export const SIDE_LAYOUTS: readonly string[] = ['split-side', 'left', 'right'];

export const BADGE_STYLE_OPTIONS = [
  { id: 'pill',    label: 'Pill'          },
  { id: 'square',  label: 'Square'        },
  { id: 'glass',   label: 'Glass'         },
  { id: 'tile',    label: 'Tile'          },
  { id: 'stacked', label: 'Stacked'       },
  { id: 'plain',   label: 'No background' },
] as const;

export const BADGE_THEME_OPTIONS = [
  { id: 'dark',  label: 'Dark'  },
  { id: 'light', label: 'Light' },
] as const;

export const TREND_STYLE_OPTIONS = [
  { id: 'arrow-word', label: 'Arrow + word' },
  { id: 'flame-word', label: 'Flame + word' },
  { id: 'arrow',      label: 'Arrow only'   },
  { id: 'flame',      label: 'Flame only'   },
  { id: 'word',       label: 'Word only'    },
] as const;

export const RATING_OPTIONS: { id: string; label: string; accent: string; icon: string; group?: string }[] = [
  { id: 'imdb',           label: 'IMDb',            accent: '#f5c518', icon: '/rating-logos/imdb.svg' },
  { id: 'tmdb',           label: 'TMDB',            accent: '#01b4e4', icon: '/rating-logos/tmdb.svg' },
  { id: 'rt',             label: 'RT critics',      accent: '#fa320a', icon: '/rating-logos/rt.svg' },
  { id: 'rtaudience',     label: 'RT audience',     accent: '#fa320a', icon: '/rating-logos/rtaudience.svg' },
  { id: 'metacritic',     label: 'Metacritic',      accent: '#ffcc34', icon: '/rating-logos/metacritic.svg' },
  { id: 'metacriticuser', label: 'Metacritic User', accent: '#ffcc34', icon: '/rating-logos/metacriticuser.svg' },
  { id: 'letterboxd',     label: 'Letterboxd',      accent: '#00a99d', icon: '/rating-logos/letterboxd.svg' },
  { id: 'mdblist',        label: 'MDBList',         accent: '#8b5cf6', icon: '/rating-logos/mdblist.svg' },
  { id: 'trakt',          label: 'Trakt',           accent: '#ed1c24', icon: '/rating-logos/trakt.svg' },
  { id: 'simkl',          label: 'SIMKL',           accent: '#1cb0f6', icon: '/rating-logos/simkl.svg' },
  { id: 'rogerebert',     label: 'Roger Ebert',     accent: '#c1121f', icon: '/rating-logos/rogerebert.png' },
  { id: 'allocine',       label: 'AlloCiné',        accent: '#fecc00', icon: '/rating-logos/allocine.svg' },
  { id: 'allocinepress',  label: 'AlloCiné Press',  accent: '#f59e0b', icon: '/rating-logos/allocinepress.svg' },
  { id: 'filmweb',        label: 'Filmweb',         accent: '#ecb014', icon: '/rating-logos/filmweb.png' },
  { id: 'mal',            label: 'MyAnimeList',     accent: '#2c6fbb', icon: '/rating-logos/mal.svg', group: 'anime' },
  { id: 'anilist',        label: 'AniList',         accent: '#02a9ff', icon: '/rating-logos/anilist.svg', group: 'anime' },
  { id: 'kitsu',          label: 'Kitsu',           accent: '#f76e18', icon: '/rating-logos/kitsu.svg', group: 'anime' },
];

export const AGE_POS_OPTIONS = [
  { id: 'inherit', label: 'Auto'         },
  { id: 'tl',      label: 'Top left'     },
  { id: 'tr',      label: 'Top right'    },
  { id: 'bl',      label: 'Bottom left'  },
  { id: 'br',      label: 'Bottom right' },
] as const;

export const GENRE_POS_OPTIONS = [
  { id: 'inherit', label: 'Auto'          },
  { id: 'tl',      label: 'Top left'      },
  { id: 'tc',      label: 'Top center'    },
  { id: 'tr',      label: 'Top right'     },
  { id: 'bl',      label: 'Bottom left'   },
  { id: 'bc',      label: 'Bottom center' },
  { id: 'br',      label: 'Bottom right'  },
] as const;

export const RING_POS_OPTIONS = [
  { id: 'br', label: 'Bottom right' },
  { id: 'bl', label: 'Bottom left'  },
  { id: 'tr', label: 'Top right'    },
  { id: 'tl', label: 'Top left'     },
] as const;

// Six-position placement (four corners + horizontal centres) for the advanced
// badge controls. "inherit" leaves the element at its default position.
export const SIX_POS_OPTIONS = [
  { id: 'inherit', label: 'Auto'          },
  { id: 'tl',      label: 'Top left'      },
  { id: 'tc',      label: 'Top center'    },
  { id: 'tr',      label: 'Top right'     },
  { id: 'bl',      label: 'Bottom left'   },
  { id: 'bc',      label: 'Bottom center' },
  { id: 'br',      label: 'Bottom right'  },
] as const;

// How an accent colour marks a pill that carries no label.
export const ACCENT_SHAPE_OPTIONS = [
  { id: 'outline', label: 'Outline', desc: 'Trace the pill in the accent colour and keep the body dark' },
  { id: 'strip',   label: 'Top strip', desc: 'A centred bar along the top edge of the pill' },
] as const;

export const RATING_PRESENTATION_OPTIONS = [
  { id: 'standard',  label: 'Standard',  desc: 'A row of individual rating badges' },
  { id: 'minimal',   label: 'Minimal',   desc: 'One pill with the overall average score' },
  { id: 'average',   label: 'Average',   desc: 'One pill labelled AVG with the overall average' },
  { id: 'dual',      label: 'Dual',      desc: 'Critics score on top, audience score below' },
  { id: 'dual-minimal', label: 'Dual (minimal)', desc: 'Critics and audience pills without labels' },
  { id: 'scorebar',  label: 'Score bar', desc: 'A full-width bar coloured by the average score' },
  { id: 'editorial', label: 'Editorial', desc: 'Magazine style: a genre label over a large score' },
  { id: 'none',      label: 'Hidden',    desc: 'Hide ratings on this surface entirely' },
] as const;

export const RATING_VALUE_MODE_OPTIONS = [
  { id: 'native',          label: 'Provider default', desc: 'Every source keeps its own scale, so Letterboxd stays out of five and Rotten Tomatoes stays a percentage' },
  { id: 'normalized',      label: 'Out of ten',       desc: 'Put every source on a ten point scale so the badges can be read against each other' },
  { id: 'normalizedclean', label: 'Out of ten, clean', desc: 'The same ten point scale with a trailing .0 trimmed, so 8.0 reads as 8' },
  { id: 'normalized100',   label: 'Out of a hundred', desc: 'Round every source to a whole number out of a hundred to keep badges compact' },
] as const;

export const ICON_SHAPE_OPTIONS = [
  { id: '',         label: 'Original' },
  { id: 'circle',   label: 'Circle'   },
  { id: 'squircle', label: 'Squircle' },
  { id: 'rounded',  label: 'Rounded'  },
] as const;

export const QUALITY_STYLE_OPTIONS = [
  { id: 'default', label: 'Glass' },
  { id: 'plain',   label: 'Plain' },
  { id: 'tile',    label: 'Tile'  },
] as const;

export const RELEASE_STATUS_STYLE_OPTIONS = [
  { id: '',       label: 'Accent'  },
  { id: 'glass',  label: 'Glass'   },
  { id: 'square',  label: 'Square' },
  { id: 'plain',  label: 'Plain'   },
  { id: 'silver', label: 'Silver'  },
  { id: 'tile',   label: 'Tile'    },
] as const;

export const LOGO_SHADOW_STYLE_OPTIONS = [
  { id: '',        label: 'Shadow'  },
  { id: 'extrude', label: 'Extrude' },
  { id: 'emboss', label: 'Emboss' },
  { id: 'gel',     label: 'Gel'     },
] as const;

export const AGE_STYLE_OPTIONS = [
  { id: 'default', label: 'Glass'  },
  { id: 'square',  label: 'Square' },
  { id: 'plain',   label: 'Plain'  },
  { id: 'tile',    label: 'Tile'   },
  { id: 'media',   label: 'Media'  },
  { id: 'silver',  label: 'Silver' },
] as const;

export const ANIME_GROUPING_OPTIONS = [
  { id: 'default',   label: 'Own badge',  desc: 'Anime gets its own ANIME badge' },
  { id: 'animation', label: 'As animation', desc: 'Anime is folded in with animation generally' },
  { id: 'secondary', label: 'Next genre', desc: 'Anime and animation defer to the next strongest genre' },
] as const;

export const GENRE_CASE_OPTIONS = [
  { id: 'default', label: 'Auto',       desc: 'Capitals for First only, the source\u2019s spelling otherwise' },
  { id: 'upper',   label: 'Capitals',   desc: 'Shout the label whichever one is chosen' },
  { id: 'normal',  label: 'As written', desc: 'Keep the spelling as the source has it' },
] as const;

export const GENRE_COUNT_OPTIONS = [
  { id: 'default', label: 'Auto', desc: 'Up to three, trimmed to whatever fits the artwork' },
  { id: '1',       label: 'One',  desc: 'The strongest genre only' },
  { id: '2',       label: 'Two',  desc: 'Two genres, where the second carries the meaning' },
  { id: '3',       label: 'Three', desc: 'Three, still trimmed if they do not fit' },
] as const;

export const GENRE_BORDER_OPTIONS = [
  { id: 'off',      label: 'Off' },
  { id: 'hairline', label: 'Hairline' },
  { id: 'custom',   label: 'Custom' },
] as const;

export const GENRE_MODE_OPTIONS = [
  { id: 'default', label: 'Text' },
  { id: 'icon',    label: 'Icon' },
  { id: 'both',    label: 'Both' },
] as const;

export const GENRE_STYLE_OPTIONS = [
  { id: 'default', label: 'Default' },
  { id: 'glass',   label: 'Glass'   },
  { id: 'pill',    label: 'Pill'    },
  { id: 'square',  label: 'Square'  },
  { id: 'plain',   label: 'Plain'   },
  { id: 'clean',   label: 'Clean'   },
  { id: 'tile',    label: 'Tile'    },
] as const;

export const GENRE_ACCENT_OPTIONS = [
  { id: 'default', label: 'Per style', desc: 'Square caps the label, the others carry no accent' },
  { id: 'left',    label: 'Left edge', desc: 'A stripe down the left of the plate, the way v2 drew it' },
  { id: 'top',     label: 'Above',     desc: 'A short bar centred above the label' },
  { id: 'none',    label: 'None',      desc: 'No accent' },
] as const;

export const GENRE_LABEL_OPTIONS = [
  { id: 'default', label: 'Genre list', desc: 'Up to three genres, as the source spells them' },
  { id: 'primary', label: 'First only', desc: 'The strongest genre alone, in capitals, the way v2 read' },
  { id: 'family',  label: 'Family name', desc: 'The group the genres resolve to, e.g. SCI FI, matching the glyph' },
] as const;

export const AGGREGATE_SOURCE_OPTIONS = [
  { id: 'overall',  label: 'Overall'  },
  { id: 'critics',  label: 'Critics'  },
  { id: 'audience', label: 'Audience' },
] as const;

export const TREND_TAG_STYLE_OPTIONS = [
  { id: '',       label: 'Glass'  },
  { id: 'square', label: 'Square' },
  { id: 'plain',  label: 'Plain'  },
] as const;

export const AGGREGATE_ACCENT_MODE_OPTIONS = [
  { id: 'default', label: 'Score bands' },
  { id: 'genre',   label: 'Genre'       },
  { id: 'source',  label: 'Source'      },
  { id: 'dynamic', label: 'By score'    },
  { id: 'custom',  label: 'Custom'      },
] as const;

export const SCOREBAR_STYLE_OPTIONS = [
  { id: 'progress', label: 'Progress' },
  { id: 'solid',    label: 'Solid'    },
  { id: 'gradient', label: 'Gradient' },
  { id: 'dynamic',  label: 'Dynamic'  },
] as const;

// Every token the renderer draws needs a chip here, or a config carrying one
// renders a badge the user has no way to switch off.
export const QUALITY_BADGE_OPTIONS: { id: string; label: string }[] = [
  { id: '4k',        label: '4K'           },
  { id: 'hd',        label: 'HD'           },
  { id: 'hdr',       label: 'HDR'          },
  { id: 'hdr10',     label: 'HDR10'        },
  { id: 'hdr10plus', label: 'HDR10+'       },
  { id: 'dv',        label: 'Dolby Vision' },
  { id: 'dts',       label: 'DTS'          },
  { id: 'atmos',     label: 'Atmos'        },
  { id: 'imax',      label: 'IMAX'         },
  { id: 'bluray',    label: 'Blu-ray'      },
  { id: 'remux',     label: 'Remux'        },
  { id: 'bdremux',   label: 'BD Remux'     },
];

// A higher-tier format already implies the ones below it, so the renderer draws
// only the highest selected and drops the rest. Mirrored here so the
// configurator can say which of your picks will not appear, rather than
// quietly rendering fewer badges than you selected.
const QUALITY_BADGE_IMPLIES: Record<string, readonly string[]> = {
  dv:        ['hdr10plus', 'hdr10', 'hdr'],
  hdr10plus: ['hdr10', 'hdr'],
  hdr10:     ['hdr'],
};

// suppressedQualityBadges maps each selected badge that will not be drawn to
// the selected badge that supersedes it.
export function suppressedQualityBadges(selected: readonly string[]): Record<string, string> {
  const picked = new Set(selected.map(s => s.toLowerCase()));
  const out: Record<string, string> = {};
  for (const [superior, implied] of Object.entries(QUALITY_BADGE_IMPLIES)) {
    if (!picked.has(superior)) continue;
    for (const token of implied) {
      if (picked.has(token)) out[token] = superior;
    }
  }
  return out;
}

export const PREVIEW_DEBOUNCE_MS = 500;

// The title the configurator opens on.
export const DEFAULT_MEDIA_ID = 'tt0468569';

// Keys the preview always sends, even at their default value.
export const ALWAYS_SEND = new Set(['ageRating', 'ratings']);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ConfigState {
  size: string;
  outputFormat: string; // '' = auto | jpeg | png
  outputQuality: number; // JPEG quality 40-100; 0 = default
  artworkSource: string;
  artworkSourceMovie: string; // '' = fall back to artworkSource
  artworkSourceSeries: string;
  artworkSourceAnime: string;
  randomPosterText: string; // any | text | textless
  randomPosterLanguage: string; // any | requested
  randomPosterMinVoteCount: number;
  randomPosterMinVoteAverage: number;
  randomPosterMinWidth: number;
  randomPosterMinHeight: number;
  randomPosterFallback: string; // best | original
  language: string;
  textPreference: string;
  ratingsLayout: string;
  badgeStyle: string;
  badgeTheme: string;
  ratings: string[];
  ageRating: boolean;
  releaseStatus: boolean;
  releaseStatusPos: string;
  releaseStatusScale: number;
  releaseStatusOffsetX: number;
  releaseStatusOffsetY: number;
  topRated: boolean;
  topRatedPos: string;
  topRatedScale: number;
  topRatedOffsetX: number;
  topRatedOffsetY: number;
  topRatedBadgeStyle: string; // '' = default | glass | square | plain | tile | silver
  topRatedTileColor: string; // '#RRGGBB' for the tile style
  awards: boolean;
  awardsPos: string; // 'inherit' | six positions
  awardsScale: number;
  awardsOffsetX: number;
  awardsOffsetY: number;
  stinger: boolean;
  stingerPos: string; // 'inherit' | six positions
  stingerScale: number;
  stingerOffsetX: number;
  stingerOffsetY: number;
  releaseStatusBadgeStyle: string; // glass | square | plain | tile | silver
  releaseStatusTileColor: string; // '#RRGGBB' for the tile style
  ageRatingPos: string;
  ageRatingScale: number; // percent; 0 = default (100%)
  ageRatingOffsetX: number; // px nudge; 0 = default
  ageRatingOffsetY: number;
  hideCinemetaRating: boolean;
  backdropLogo: boolean;
  genre: boolean;
  genrePos: string;
  badges: string[];
  providers: boolean;
  providersCountry: string; // ISO country for watch providers; '' = default
  networkTileColor: string; // '#RRGGBB' tile behind provider chips; '' = default
  providersPos: string; // 'inherit' | six positions
  providerBadgeScale: number;
  providerBadgeOffsetX: number;
  providerBadgeOffsetY: number;
  aggregateBar: boolean;
  aggregateBarPos: string;
  trending: boolean;
  trendingStyle: string;
  backdropAsPoster: boolean;
  logoWidth: number;
  logoScrimSize: number;
  logoScrimOpacity: number;
  logoShadowOffsetX: number;
  logoShadowOffsetY: number;
  logoShadowStyle: string; // '' = shadow | 'extrude' | 'gel' | 'emboss'
  logoShadowColor: string;
  logoHeight: number;
  logoPos: number;
  logoAnchor: string; // \'\' = centre on the position | \'bottom\'
  ratingRing: boolean;
  ratingRingPos: string;
  ratingRingColor: string;
  // Advanced (v2 parity) — fine-grained styling. Zero/empty means "default".
  ratingBadgeScale: number;
  ratingIconHidden: boolean;
  stackedLineHidden: boolean;
  ratingAccentBarHidden: boolean;
  ratingsMax: number; // 0 = no cap
  ratingBadgeOffsetX: number;
  ratingBadgeOffsetY: number;
  ratingXOffsetPillGlass: number;
  ratingYOffsetPillGlass: number;
  ratingXOffsetSquare: number;
  ratingYOffsetSquare: number;
  posterEdgeOffset: number; // 0..80 extra inset from the edge
  bottomRatingsRow: boolean; // keep every badge on one row instead of wrapping
  ratingsUniformWidth: boolean; // pad every badge to the widest so they share one edge
  ratingUnavailableMark: boolean; // draw an X where a held-out source's score would go
  badgeShadow: boolean; // draw the drop shadow under every badge
  ratingsAnchored: boolean; // flush the row to the poster edge with squared corners
  ratingPresentation: string; // standard|editorial|none
  ratingValueMode: string; // native|normalized|normalizedclean|normalized100
  ratingVoteCounts: boolean;
  hideNativeScale: boolean; // drop the /5 or /4 a native-scale badge carries
  ratingMinVotes: boolean;
  ratingMinVotesBySource: Record<string, number>; // source → minimum; absent = built-in default, 0 = no minimum
  iconShape: string; // '' = the mark's own outline; circle|squircle|rounded
  sideRatingsPosition: string; // top|middle|bottom|custom (split-side layout)
  sideRatingsOffset: number; // px vertical offset for the custom position
  ratingsMaxPerSide: number; // cap badges per side; 0 = no cap
  ratingProviderOverrides: Record<string, string>; // source id → hex accent; empty = none
  genreFamilyColors: Record<string, string>; // family id → hex accent; absent = built-in default
  ratingProviderIconScale: Record<string, number>; // source id → icon scale percent 50-150; no entry = 100
  ratingProviderWeights: Record<string, number>; // source id → weight; no entry = 1, 0 = ignore
  genreBadgeScale: number;
  genreBadgeOffsetX: number;
  genreBadgeOffsetY: number;
  genreBadgeBackgroundOpacity: number; // 0 = default
  genreBadgeBorderWidth: number; // px tile border; 0 = default hairline
  noBackgroundBadgeOutlineColor: string; // '#RRGGBB' outline for plain badges; '' = default
  noBackgroundBadgeOutlineWidth: number;
  noBackgroundBadgeOutlineGlow: boolean;
  qualityBadgesHidden: boolean; // draw none, keeping the chip selection
  qualityBadgesPos: string; // 'inherit' | six positions
  qualityBadgeScale: number;
  qualityBadgesMax: number; // 0 = show all
  qualityBadgeOffsetX: number;
  qualityBadgeOffsetY: number;
  qualityBadgesStyle: string; // 'default' | plain | tile
  qualityBadgesTileAccentColor: string;
  genreBadgeStyle: string; // 'default' | glass | pill | square | plain | clean | tile
  genreBadgeTileAccentColor: string; // '#RRGGBB' for the tile style; '' = default
  genreBadgeLabelColor: string; // '#RRGGBB'; '' = the genre family's colour
  genreBadgeBorderColor: string; // '#RRGGBB'; '' = the style's own border
  genreBadgeBorderOpacity: number; // 0-100; 0 = the style's own
  genreBadgeBorderSourceTint: boolean; // border takes the genre family's colour
  genreBadgeAccent: string; // 'default' | left | top | none
  genreBadgeLabel: string;
  genreBadgeCase: string;
  genreBadgeMaxGenres: number;
  genreBadgeShortNames: boolean;  // 'default' (list) | primary
  genreBadgeMode: string;  // 'default' (text) | icon | both
  genreBadgeAnimeGrouping: string; // 'default' (split) | animation | secondary
  aggregateAccentColor: string; // '' = auto score-band
  aggregateAccentMode: string;  // '' = auto score-band
  aggregateBarOffset: number;
  aggregateBarScale: number; // percent of the default bar height; 0 = 100 // px inward nudge, -12..12; 0 = flush
  aggregateRatingSource: string; // overall | critics | audience
  aggregatePillPos: string; // 'inherit' | six positions
  aggregateAccentShape: string; // outline | strip
  aggregateValueColor: string; // '' = white
  aggregateCriticsAccentColor: string; // '' = falls back to aggregateAccentColor
  aggregateAudienceAccentColor: string;
  aggregateCriticsValueColor: string; // '' = falls back to aggregateValueColor
  aggregateAudienceValueColor: string;
  aggregateDynamicStops: string; // 'score:#RRGGBB' pairs on a 0-100 scale; '' = built-in bands
  aggregateFillByScore: boolean; // fill the whole pill with the accent, not just the rail
  aggregatePillBodyTint: number; // 0-100: blend the accent into the dark body short of the full fill
  aggregatePillIcon: string; // rating mark drawn inside single-score pills; '' = none
  aggregateDualIcons: boolean; // mark dual pills with critics/audience glyphs
  aggregateAccentBarVisible: boolean; // the colour rail on an aggregate pill
  aggregateAccentBarOffset: number; // px nudge of that rail
  scorebarStyle: string; // progress | solid | gradient
  scorebarLowColor: string;
  scorebarMidColor: string;
  scorebarHighColor: string;
  scorebarLowThreshold: number; // 0 = default 5
  scorebarHighThreshold: number; // 0 = default 8
  trendingTextColor: string;
  trendingTagStyle: string; // '' = glass; square | plain
  trendingAccentColor: string; // '#RRGGBB' border/hairline tint; '' = default warm orange
  ageRatingBadgeStyle: string; // 'default' | plain | tile
  ageRatingTileColor: string;
  ageRatingBackgroundOpacity: number; // 0 = the style's own
  ageRatingBorderWidth: number;       // 0 = the style's own, <0 = off
  ageRatingBorderColor: string;
  ageRatingBorderOpacity: number;     // 0 = the style's own
  ageRatingLabelColor: string;
  trendingPos: string; // 'inherit' | six positions
  trendingScale: number;
  trendingOffsetX: number;
  trendingOffsetY: number;
  logoBackground: string; // 'transparent' | 'dark'
  episodeArtworkMode: string; // 'still' | 'series' | 'streaming' (thumbnail/backdrop episodes)
  fallbackLanguage: string; // '' = none
  ratingsMovie: string[];
  ratingsSeries: string[];
  ratingsAnime: string[];
  metaLine: boolean;
  metaLineAgeRating: boolean;
  metaLineScale: number;
  metaLineOffsetX: number;
  metaLineOffsetY: number; // percent; 0 = 100
  aggregateAccentWidth: number; // px; 0 = default
  ratingBadgeDensity: number; // percent of default padding; 0 = 100
  ratingBadgeBorderSourceTint: boolean;
  ratingBadgeBorderGlow: boolean;
  ratingBadgeBorderGlowStrength: number; // 0 = built-in default
  ratingBadgeBorderColor: string; // '' = per style
  ratingBadgeBorderOpacity: number; // 0 = default
  ratingBadgeBackgroundOpacity: number; // 0 = whatever the style and theme picked
  ratingBadgeBorderWidth: number; // -1 = off, 0 = hairline
  iconPlateFilled: boolean; // fill the mark's plate with the source's colour
  iconOutlineColor: string; // '' = none
  iconOutlineWidth: number; // 0 = none
  ringScale: number; // percent of the default ring size; 0 = 100
  ringCenterOpacity: number; // 0 = default
  ringOffsetX: number; // px nudge; 0 = default
  ringOffsetY: number;
  ringValueSource: string; // 'overall' | provider id
  ringProgressSource: string;
  ringCriticsPriority: string[]; // order 'Top critic' walks; [] = built-in
  ringAudiencePriority: string[]; // order 'Top audience' walks; [] = built-in
}

export const DEFAULT_CONFIG: ConfigState = {
  size: 'small',
  outputFormat: '',
  outputQuality: 0,
  artworkSource: 'tmdb',
  artworkSourceMovie: '',
  artworkSourceSeries: '',
  artworkSourceAnime: '',
  randomPosterText: 'any',
  randomPosterLanguage: 'any',
  randomPosterMinVoteCount: 0,
  randomPosterMinVoteAverage: 0,
  randomPosterMinWidth: 0,
  randomPosterMinHeight: 0,
  randomPosterFallback: 'best',
  language: 'en',
  textPreference: 'original',
  ratingsLayout: 'bottom',
  badgeStyle: 'pill',
  badgeTheme: 'dark',
  ratings: ['imdb', 'tmdb'],
  ageRating: false,
  releaseStatus: false,
  topRated: false,
  topRatedPos: 'inherit',
  topRatedScale: 0,
  topRatedOffsetX: 0,
  topRatedOffsetY: 0,
  topRatedBadgeStyle: '',
  topRatedTileColor: '',
  awards: false,
  awardsPos: 'inherit',
  awardsScale: 0,
  awardsOffsetX: 0,
  awardsOffsetY: 0,
  stinger: false,
  stingerPos: 'inherit',
  stingerScale: 0,
  stingerOffsetX: 0,
  stingerOffsetY: 0,
  releaseStatusBadgeStyle: '',
  releaseStatusTileColor: '',
  releaseStatusPos: 'inherit',
  releaseStatusScale: 0,
  releaseStatusOffsetX: 0,
  releaseStatusOffsetY: 0,
  ageRatingPos: 'inherit',
  ageRatingScale: 0,
  ageRatingOffsetX: 0,
  ageRatingOffsetY: 0,
  hideCinemetaRating: false,
  backdropLogo: false,
  genre: false,
  genrePos: 'inherit',
  badges: [],
  providers: false,
  providersCountry: '',
  networkTileColor: '',
  providersPos: 'inherit',
  providerBadgeScale: 0,
  providerBadgeOffsetX: 0,
  providerBadgeOffsetY: 0,
  aggregateBar: false,
  aggregateBarPos: 'bottom',
  trending: false,
  trendingStyle: 'arrow-word',
  backdropAsPoster: false,
  logoWidth: 0,
  logoScrimSize: 0,
  logoScrimOpacity: 0,
  logoShadowOffsetX: 0,
  logoShadowOffsetY: 0,
  logoShadowStyle: '',
  logoShadowColor: '',
  logoHeight: 0,
  logoPos: 0,
  logoAnchor: '',
  ratingRing: false,
  ratingRingPos: 'br',
  ratingRingColor: '',
  ratingBadgeScale: 0,
  ratingIconHidden: false,
  stackedLineHidden: false,
  ratingAccentBarHidden: false,
  ratingsMax: 0,
  ratingBadgeOffsetX: 0,
  ratingBadgeOffsetY: 0,
  ratingXOffsetPillGlass: 0,
  ratingYOffsetPillGlass: 0,
  ratingXOffsetSquare: 0,
  ratingYOffsetSquare: 0,
  posterEdgeOffset: 0,
  bottomRatingsRow: false,
  ratingsUniformWidth: false,
  ratingUnavailableMark: true,
  badgeShadow: true,
  ratingsAnchored: false,
  ratingPresentation: 'standard',
  ratingValueMode: 'native',
  ratingVoteCounts: false,
  hideNativeScale: false,
  ratingMinVotes: false,
  ratingMinVotesBySource: {},
  iconShape: '',
  sideRatingsPosition: 'middle',
  sideRatingsOffset: 0,
  ratingsMaxPerSide: 0,
  ratingProviderOverrides: {},
  genreFamilyColors: {},
  ratingProviderIconScale: {},
  ratingProviderWeights: {},
  genreBadgeScale: 0,
  genreBadgeOffsetX: 0,
  genreBadgeOffsetY: 0,
  genreBadgeBackgroundOpacity: 0,
  genreBadgeBorderWidth: 0,
  noBackgroundBadgeOutlineColor: '',
  noBackgroundBadgeOutlineWidth: 0,
  noBackgroundBadgeOutlineGlow: false,
  qualityBadgesHidden: false,
  qualityBadgesPos: 'inherit',
  qualityBadgeScale: 0,
  qualityBadgesMax: 0,
  qualityBadgeOffsetX: 0,
  qualityBadgeOffsetY: 0,
  qualityBadgesStyle: 'default',
  qualityBadgesTileAccentColor: '',
  genreBadgeStyle: 'default',
  genreBadgeTileAccentColor: '',
  genreBadgeLabelColor: '',
  genreBadgeBorderColor: '',
  genreBadgeBorderOpacity: 0,
  genreBadgeBorderSourceTint: false,
  genreBadgeAccent: 'default',
  genreBadgeLabel: 'default',
  genreBadgeCase: '',
  genreBadgeMaxGenres: 0,
  genreBadgeShortNames: false,
  genreBadgeMode: 'default',
  genreBadgeAnimeGrouping: 'default',
  aggregateAccentColor: '',
  aggregateAccentMode: '',
  aggregateBarOffset: 0,
  aggregateBarScale: 0,
  aggregateRatingSource: 'overall',
  aggregatePillPos: 'inherit',
  aggregateAccentShape: 'outline',
  aggregateValueColor: '',
  aggregateCriticsAccentColor: '',
  aggregateAudienceAccentColor: '',
  aggregateCriticsValueColor: '',
  aggregateAudienceValueColor: '',
  aggregateDynamicStops: '',
  aggregateFillByScore: false,
  aggregatePillBodyTint: 0,
  aggregatePillIcon: '',
  aggregateDualIcons: false,
  aggregateAccentBarVisible: true,
  aggregateAccentBarOffset: 0,
  scorebarStyle: 'progress',
  scorebarLowColor: '',
  scorebarMidColor: '',
  scorebarHighColor: '',
  scorebarLowThreshold: 0,
  scorebarHighThreshold: 0,
  trendingTextColor: '',
  trendingTagStyle: '',
  trendingAccentColor: '',
  ageRatingBadgeStyle: 'default',
  ageRatingTileColor: '',
  ageRatingBackgroundOpacity: 0,
  ageRatingBorderWidth: 0,
  ageRatingBorderColor: '',
  ageRatingBorderOpacity: 0,
  ageRatingLabelColor: '',
  trendingPos: 'inherit',
  trendingScale: 0,
  trendingOffsetX: 0,
  trendingOffsetY: 0,
  logoBackground: 'transparent',
  episodeArtworkMode: 'still',
  fallbackLanguage: '',
  ratingsMovie: [],
  ratingsSeries: [],
  ratingsAnime: [],
  metaLine: false,
  metaLineAgeRating: true,
  metaLineScale: 0,
  metaLineOffsetX: 0,
  metaLineOffsetY: 0,
  aggregateAccentWidth: 0,
  ratingBadgeDensity: 0,
  ratingBadgeBorderSourceTint: false,
  ratingBadgeBorderGlow: false,
  ratingBadgeBorderGlowStrength: 0,
  ratingBadgeBorderColor: '',
  ratingBadgeBorderOpacity: 0,
  ratingBadgeBackgroundOpacity: 0,
  ratingBadgeBorderWidth: 0,
  iconPlateFilled: false,
  iconOutlineColor: '',
  iconOutlineWidth: 0,
  ringScale: 0,
  ringCenterOpacity: 0,
  ringOffsetX: 0,
  ringOffsetY: 0,
  ringValueSource: 'overall',
  ringProgressSource: 'overall',
  ringCriticsPriority: [],
  ringAudiencePriority: [],
};

// The order the renderer walks for the 'Top critic' and 'Top audience' ring
// modes when a config sets none of its own. Mirrors defaultCriticsPriority /
// defaultAudiencePriority in internal/compose/badge_overlay.go.
export const DEFAULT_CRITICS_PRIORITY = ['rt', 'metacritic', 'rogerebert', 'allocinepress'];
export const DEFAULT_AUDIENCE_PRIORITY = [
  'imdb', 'tmdb', 'trakt', 'letterboxd', 'mdblist', 'rtaudience', 'simkl', 'allocine', 'filmweb',
];

export type UpdateConfigFn = <K extends keyof ConfigState>(key: K, value: ConfigState[K]) => void;

// ── Per-surface configs ─────────────────────────────────────────────────────────
// Each surface (poster, backdrop, thumbnail, logo) is styled independently.
// A single profile carries all four; the backend resolves the right one from
// the request path.

export type SurfaceConfigs = Record<MediaType, ConfigState>;

export const STORED_CONFIG_VERSION = 2;

export const DEFAULT_SURFACE_CONFIGS: SurfaceConfigs = {
  poster:    { ...DEFAULT_CONFIG },
  backdrop:  { ...DEFAULT_CONFIG },
  thumbnail: { ...DEFAULT_CONFIG },
  logo:      { ...DEFAULT_CONFIG },
};

/** Coerce only the string entries of an array-typed field; fall back to default. */
function coerceStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  return value.filter((v): v is string => typeof v === 'string');
}

// The renderer lowercases and alias-maps badge tokens every time it draws, but
// never writes that back. A config carrying "UHD" or "HDR10+" therefore draws a
// badge that no chip here matches, so it cannot be switched off. Mirrors
// qualityBadgeAliases and qualityBadgeTokens in internal/imageconfig.
const QUALITY_BADGE_ALIASES: Record<string, string> = {
  'dolbyvision':  'dv',
  'dolby-vision': 'dv',
  'dolby vision': 'dv',
  'dolbyatmos':   'atmos',
  'dolby-atmos':  'atmos',
  'dolby atmos':  'atmos',
  'hdr10+':       'hdr10plus',
  'uhd':          '4k',
};

/** Fold a stored badge list onto the tokens the chips use. */
export function canonicaliseBadges(tokens: readonly string[]): string[] {
  const known = new Set(QUALITY_BADGE_OPTIONS.map(o => o.id));
  const out: string[] = [];
  for (const raw of tokens) {
    const tok = raw.trim().toLowerCase();
    if (!tok) continue;
    const id = QUALITY_BADGE_ALIASES[tok] ?? tok;
    // A token with no tile is a v2 feature word, not a quality badge. Dropping
    // it here keeps the count pill honest about what will actually be drawn.
    if (known.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/** Keep only string→number entries of a map field; drop anything malformed. */
function coerceNumberMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[k] = v;
  }
  return out;
}

/** Keep only string→string entries of a map field; drop anything malformed. */
function coerceStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

/**
 * Fill any missing/invalid fields of a partial config from the defaults. Array
 * fields are validated explicitly — malformed stored/shared data (e.g.
 * `ratings: "imdb"` or `badges: {}`) would otherwise crash the controls that
 * call array methods on them.
 */
function coerceConfig(raw: unknown): ConfigState {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_CONFIG };
  const input = raw as Partial<Record<keyof ConfigState, unknown>>;
  return {
    ...DEFAULT_CONFIG,
    ...(raw as Partial<ConfigState>),
    ratings: coerceStringArray(input.ratings, DEFAULT_CONFIG.ratings),
    ratingsMovie: coerceStringArray(input.ratingsMovie, []),
    ratingsSeries: coerceStringArray(input.ratingsSeries, []),
    ratingsAnime: coerceStringArray(input.ratingsAnime, []),
    badges: canonicaliseBadges(coerceStringArray(input.badges, DEFAULT_CONFIG.badges)),
    ratingProviderOverrides: coerceStringMap(input.ratingProviderOverrides),
    genreFamilyColors: coerceStringMap(input.genreFamilyColors),
  ratingMinVotes: Boolean(input.ratingMinVotes),
  ratingMinVotesBySource: coerceNumberMap(input.ratingMinVotesBySource),
    ratingProviderWeights: coerceNumberMap(input.ratingProviderWeights),
    ratingProviderIconScale: coerceNumberMap(input.ratingProviderIconScale),
    ringCriticsPriority: coerceStringArray(input.ringCriticsPriority, []),
    ringAudiencePriority: coerceStringArray(input.ringAudiencePriority, []),
  };
}

/** Seed all four surfaces from one flat config (legacy → per-surface). */
export function cloneToAllSurfaces(cfg: ConfigState): SurfaceConfigs {
  return {
    poster:    { ...cfg },
    backdrop:  { ...cfg },
    thumbnail: { ...cfg },
    logo:      { ...cfg },
  };
}

/**
 * Build the stored profile config — the per-surface envelope. Saved profiles use
 * `{ v, surfaces: { poster, backdrop, thumbnail, logo } }` so every surface
 * renders with its own settings under a single profile key.
 */
export function toStoredConfig(configs: SurfaceConfigs): Record<string, unknown> {
  return {
    v: STORED_CONFIG_VERSION,
    surfaces: {
      poster:    configs.poster,
      backdrop:  configs.backdrop,
      thumbnail: configs.thumbnail,
      logo:      configs.logo,
    },
  };
}

/**
 * Parse a stored profile config back into per-surface state. Accepts both the
 * per-surface envelope and a legacy flat config (applied to every surface), so
 * profiles and share links saved before per-surface settings keep working.
 */
export function fromStoredConfig(raw: unknown): SurfaceConfigs {
  if (raw && typeof raw === 'object' && 'surfaces' in raw) {
    const surfaces = ((raw as { surfaces?: Record<string, unknown> }).surfaces) ?? {};
    return {
      poster:    coerceConfig(surfaces.poster),
      backdrop:  coerceConfig(surfaces.backdrop),
      thumbnail: coerceConfig(surfaces.thumbnail),
      logo:      coerceConfig(surfaces.logo),
    };
  }
  // Legacy flat config — apply uniformly to every surface.
  return cloneToAllSurfaces(coerceConfig(raw));
}

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
  cfgs: SurfaceConfigs;
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
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as
      Partial<ShareState> & { cfg?: unknown; cfgs?: unknown };
    if (!parsed || typeof parsed.id !== 'string') return null;
    // Accept the per-surface shape (cfgs) and the legacy single-config shape
    // (cfg, applied to every surface) so older links still resolve.
    const hasCfgs = !!parsed.cfgs && typeof parsed.cfgs === 'object';
    const hasCfg = !!parsed.cfg && typeof parsed.cfg === 'object';
    if (!hasCfgs && !hasCfg) return null;
    const cfgs = hasCfgs
      ? fromStoredConfig({ surfaces: parsed.cfgs })
      : cloneToAllSurfaces(coerceConfig(parsed.cfg));
    const t = typeof parsed.t === 'string' && MEDIA_TYPES.some(m => m.id === parsed.t)
      ? (parsed.t as MediaType)
      : 'poster';
    return {
      t,
      id: parsed.id,
      title: typeof parsed.title === 'string' ? parsed.title : parsed.id,
      cfgs,
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

// The preview URL a first visit asks for. Built from the same constants the
// client uses, so a change to DEFAULT_CONFIG or ALWAYS_SEND cannot leave a
// preloaded URL pointing at an image the page will not display.
export function defaultPreviewPayload(): string {
  const payload: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_CONFIG) as (keyof ConfigState)[]) {
    if (ALWAYS_SEND.has(key as string)) payload[key as string] = DEFAULT_CONFIG[key];
  }
  return JSON.stringify(payload);
}
