type ArtworkSourceId = 'tmdb' | 'fanart' | 'cinemeta' | 'omdb' | 'random' | 'blackbar';
type ArtworkTextPreference = 'original' | 'clean' | 'textless' | 'alternative' | 'random';
type RandomPosterTextMode = 'any' | 'text' | 'textless';

type ArtworkTextSupportScope = 'poster' | 'backdrop';

const TEXTLESS_ARTWORK_UNSUPPORTED_MESSAGE =
  'These providers currently do not supply textless artwork.';

const TEXTLESS_CAPABLE_ARTWORK_SOURCES: Record<ArtworkTextSupportScope, Set<ArtworkSourceId>> = {
  poster: new Set(['tmdb', 'fanart', 'random']),
  backdrop: new Set(['tmdb', 'fanart', 'random']),
};

export const artworkTextSelectionNeedsProviderTextlessSupport = (
  preference: ArtworkTextPreference,
  randomPosterTextMode: RandomPosterTextMode = 'any',
) =>
  preference === 'clean' ||
  preference === 'textless' ||
  (preference === 'random' && randomPosterTextMode === 'textless');

export const artworkSourceSupportsTextlessSelection = (
  scope: ArtworkTextSupportScope,
  source: ArtworkSourceId,
) => TEXTLESS_CAPABLE_ARTWORK_SOURCES[scope].has(source);