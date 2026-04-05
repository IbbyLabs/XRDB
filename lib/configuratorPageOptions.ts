import { type GenreBadgeAnimeGrouping, type GenreBadgeMode } from '@/lib/genreBadge';
import { type EpisodeIdMode } from '@/lib/episodeIdentity';
import { type RatingPresentation } from '@/lib/ratingPresentation';
import {
  type AgeRatingBadgePosition,
  type ArtworkSource,
  type BackdropImageSize,
  type BackdropImageTextPreference,
  type PosterImageSize,
  type PosterImageTextPreference,
  type PosterQualityBadgesPosition,
  type QualityBadgesSide,
  type StreamBadgesSetting,
  type TmdbIdScopeMode,
} from '@/lib/uiConfig';

export type SupportedLanguageOption = {
  code: string;
  flag: string;
  label: string;
};

export const SUPPORTED_LANGUAGES: SupportedLanguageOption[] = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'it', label: 'Italian', flag: '🇮🇹' },
  { code: 'es', label: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', label: 'French', flag: '🇫🇷' },
  { code: 'de', label: 'German', flag: '🇩🇪' },
  { code: 'pt', label: 'Portuguese', flag: '🇵🇹' },
  { code: 'ru', label: 'Russian', flag: '🇷🇺' },
  { code: 'ja', label: 'Japanese', flag: '🇯🇵' },
  { code: 'zh', label: 'Chinese', flag: '🇨🇳' },
  { code: 'tr', label: 'Turkish', flag: '🇹🇷' },
];

export const POSTER_IMAGE_SIZE_OPTIONS: Array<{
  id: PosterImageSize;
  label: string;
  description: string;
}> = [
  { id: 'normal', label: 'Normal', description: '580x859. Default poster ratio and balanced bandwidth.' },
  { id: 'large', label: 'Large', description: '1280x1896. Higher detail for larger displays.' },
  { id: '4k', label: '4K', description: '2000x2926. Maximum detail, slower transfers.' },
];

export const BACKDROP_IMAGE_SIZE_OPTIONS: Array<{
  id: BackdropImageSize;
  label: string;
  description: string;
}> = [
  { id: 'normal', label: 'Normal', description: '1280x720. Default backdrop output.' },
  { id: 'large', label: 'Large', description: '1920x1080. Higher detail for large screens.' },
  { id: '4k', label: '4K', description: '3840x2160. Maximum detail, slower transfers.' },
];

export const POSTER_IMAGE_TEXT_OPTIONS: Array<{
  id: PosterImageTextPreference;
  label: string;
  description: string;
}> = [
  { id: 'original', label: 'Original', description: 'Use the default poster art from the selected source.' },
  { id: 'clean', label: 'Clean', description: 'Prefer textless poster art from sources that expose it and add a controlled title and logo overlay.' },
  { id: 'textless', label: 'Textless', description: 'Prefer poster art without embedded text from sources that expose it. No title overlay added.' },
  { id: 'alternative', label: 'Alternative', description: 'Use a different poster from the selected source when one exists.' },
  { id: 'random', label: 'Random', description: 'Pick a seeded random poster variation for this title.' },
];

export const POSTER_ARTWORK_SOURCE_OPTIONS: Array<{
  id: ArtworkSource;
  label: string;
  description: string;
}> = [
  { id: 'tmdb', label: 'TMDB', description: 'Use the normal TMDB clean poster selection.' },
  { id: 'fanart', label: 'Fanart', description: 'Prefer fanart.tv artwork when a fanart key is available, then fall back to TMDB.' },
  { id: 'cinemeta', label: 'IMDb', description: 'Use IMDb artwork via MetaHub Cinemeta when an IMDb ID is available, then fall back to TMDB.' },
  { id: 'omdb', label: 'OMDb', description: 'Use the OMDb poster when a server OMDb key and IMDb ID are available, then fall back to TMDB.' },
  { id: 'blackbar', label: 'Black Bar', description: 'Render ratings on a solid black strip while keeping the selected poster artwork.' },
  { id: 'random', label: 'Random', description: 'Pick a seeded random poster source between TMDB, fanart, IMDb, and OMDb when available.' },
];

export const BACKDROP_ARTWORK_SOURCE_OPTIONS: Array<{
  id: ArtworkSource;
  label: string;
  description: string;
}> = [
  { id: 'tmdb', label: 'TMDB', description: 'Use the normal TMDB clean backdrop selection.' },
  { id: 'fanart', label: 'Fanart', description: 'Prefer fanart.tv backdrop art when a fanart key is available, then fall back to TMDB.' },
  { id: 'cinemeta', label: 'IMDb', description: 'Use IMDb backdrop artwork via MetaHub Cinemeta when an IMDb ID is available, then fall back to TMDB.' },
  { id: 'blackbar', label: 'Black Bar', description: 'Render ratings on a solid black strip while keeping the selected backdrop artwork.' },
  { id: 'random', label: 'Random', description: 'Pick a seeded random backdrop source between TMDB, fanart, and IMDb when available.' },
];

export const LOGO_ARTWORK_SOURCE_OPTIONS: Array<{
  id: ArtworkSource;
  label: string;
  description: string;
}> = [
  { id: 'tmdb', label: 'TMDB', description: 'Use the normal TMDB logo selection.' },
  { id: 'fanart', label: 'Fanart', description: 'Prefer fanart.tv logo assets when a fanart key is available, then fall back to TMDB.' },
  { id: 'cinemeta', label: 'IMDb', description: 'Use IMDb logo artwork via MetaHub Cinemeta when an IMDb ID is available, then fall back to TMDB.' },
  { id: 'blackbar', label: 'Black Bar', description: 'Render ratings on a solid black strip while keeping the selected logo artwork.' },
  { id: 'random', label: 'Random', description: 'Pick a seeded random logo source between TMDB, fanart, and IMDb when available.' },
];

export const BACKDROP_IMAGE_TEXT_OPTIONS: Array<{
  id: BackdropImageTextPreference;
  label: string;
  description: string;
}> = [
  { id: 'original', label: 'Original', description: 'Use the default backdrop art from the selected source.' },
  { id: 'clean', label: 'Clean', description: 'Prefer textless backdrop art from sources that expose it and add a controlled title and logo overlay.' },
  { id: 'textless', label: 'Textless', description: 'Prefer backdrop art without embedded text from sources that expose it. No title overlay added.' },
  { id: 'alternative', label: 'Alternative', description: 'Use a different backdrop from the selected source when one exists.' },
  { id: 'random', label: 'Random', description: 'Pick a seeded random backdrop variation for this title.' },
];

export const STREAM_BADGE_OPTIONS: Array<{ id: StreamBadgesSetting; label: string }> = [
  { id: 'auto', label: 'Auto' },
  { id: 'on', label: 'On' },
  { id: 'off', label: 'Off' },
];

export const TMDB_ID_SCOPE_MODE_OPTIONS: Array<{
  id: TmdbIdScopeMode;
  label: string;
  description: string;
}> = [
  {
    id: 'soft',
    label: 'Soft',
    description: 'Default. Accepts tmdb:id for compatibility.',
  },
  {
    id: 'strict',
    label: 'Strict',
    description: 'Prevents logo and backdrop collisions by requiring tmdb:movie:id or tmdb:tv:id.',
  },
];

export const QUALITY_BADGE_SIDE_OPTIONS: Array<{ id: QualityBadgesSide; label: string }> = [
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
];

export const QUALITY_BADGE_POSITION_OPTIONS: Array<{ id: PosterQualityBadgesPosition; label: string }> = [
  { id: 'auto', label: 'Auto' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
];

export const AGE_RATING_BADGE_POSITION_OPTIONS: Array<{
  id: AgeRatingBadgePosition;
  label: string;
}> = [
  { id: 'inherit', label: 'Inherit' },
  { id: 'top-left', label: 'Top Left' },
  { id: 'top-center', label: 'Top Center' },
  { id: 'top-right', label: 'Top Right' },
  { id: 'bottom-left', label: 'Bottom Left' },
  { id: 'bottom-center', label: 'Bottom Center' },
  { id: 'bottom-right', label: 'Bottom Right' },
  { id: 'left-top', label: 'Left Top' },
  { id: 'left-center', label: 'Left Center' },
  { id: 'left-bottom', label: 'Left Bottom' },
  { id: 'right-top', label: 'Right Top' },
  { id: 'right-center', label: 'Right Center' },
  { id: 'right-bottom', label: 'Right Bottom' },
];

export const EPISODE_ID_MODE_OPTIONS: Array<{
  id: EpisodeIdMode;
  label: string;
  description: string;
}> = [
  {
    id: 'imdb',
    label: 'IMDb',
    description: 'Use the series IMDb ID with season and episode placeholders.',
  },
  {
    id: 'xrdbid',
    label: 'XRDBID',
    description: 'Use the XRDBID episode resolver for stronger long run episode matching.',
  },
  {
    id: 'tvdb',
    label: 'TVDB',
    description: 'Use TVDB aired order IDs when your source exposes TVDB episode mapping.',
  },
  {
    id: 'kitsu',
    label: 'Kitsu',
    description: 'Use Kitsu IDs for anime sources that emit Kitsu episode metadata.',
  },
  {
    id: 'anilist',
    label: 'AniList',
    description: 'Use AniList IDs when your source already speaks AniList episode mapping.',
  },
  {
    id: 'mal',
    label: 'MAL',
    description: 'Use MyAnimeList IDs for MAL based episode metadata.',
  },
  {
    id: 'anidb',
    label: 'AniDB',
    description: 'Use AniDB IDs when your source emits AniDB episode mapping.',
  },
];

export const SAMPLE_GENRE_BADGE_MODE_DEFAULT: GenreBadgeMode = 'both';

export const GENRE_BADGE_ANIME_GROUPING_OPTIONS: Array<{
  id: GenreBadgeAnimeGrouping;
  label: string;
  description: string;
}> = [
  {
    id: 'split',
    label: 'Split',
    description: 'Keep anime and animation as separate badge families.',
  },
  {
    id: 'animation',
    label: 'Group as Animation',
    description: 'Render anime content under the animation badge family.',
  },
];

export const PRESENTATION_SECTION_ORDER: RatingPresentation[] = [
  'standard',
  'editorial',
  'ring',
  'average',
  'dual',
  'minimal',
  'dual-minimal',
  'blockbuster',
  'none',
];

export const WORKSPACE_CENTER_VIEW_OPTIONS: Array<{
  id: 'showcase' | 'preview' | 'guide';
  label: string;
  description: string;
}> = [
  { id: 'showcase', label: 'Showcase', description: 'Rich visual board with the live result and support samples.' },
  { id: 'preview', label: 'Preview', description: 'Focused live result with the fewest distractions.' },
  { id: 'guide', label: 'Guide', description: 'Summary view that explains the current setup and next steps.' },
];

export const FANART_KEY_HELP_COPY =
  'Optional. Recommended. Your key is used first. If left blank, XRDB falls back to the service key when one exists. This helps if the shared service key is rate limited or blocked later.';

export const XRDB_REQUEST_KEY_HELP_COPY =
  'Optional. Only needed when the XRDB host enables request protection. When present, the configurator carries it into previews, config strings, proxy manifests, and exported URL patterns.';
