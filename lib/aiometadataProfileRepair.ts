const AIOMETADATA_PLACEHOLDERS = [
  '{id}',
  '{tmdb_id}',
  '{imdb_id}',
  '{tvdb_id}',
  '{mal_id}',
  '{kitsu_id}',
  '{anilist_id}',
  '{anidb_id}',
  '{type}',
  '{season}',
  '{episode}',
  '{language}',
  '{language_short}',
  '{tmdb_key}',
  '{rpdb_key}',
  '{top_key}',
  '{mdblist_key}',
  '{fanart_key}',
  '{xrdb_key}',
  '{simkl_client_id}',
  '{user_agent}',
  '{blur}',
  '{thumbnail}',
] as const;

const AIOMETADATA_CUSTOM_ART_KEYS = [
  'customPosterUrlPattern',
  'customBackgroundUrlPattern',
  'customLogoUrlPattern',
  'customThumbnailUrlPattern',
] as const;

export const repairEncodedAiometadataPlaceholders = (value: string): string =>
  AIOMETADATA_PLACEHOLDERS.reduce(
    (current, placeholder) =>
      current.replaceAll(encodeURIComponent(placeholder), placeholder),
    value,
  );

export const repairAiometadataCustomArtPatterns = (
  config: Record<string, unknown>,
): { config: Record<string, unknown>; repairedKeys: string[] } => {
  const nextConfig = { ...config };
  const repairedKeys: string[] = [];

  for (const key of AIOMETADATA_CUSTOM_ART_KEYS) {
    const currentValue = nextConfig[key];
    if (typeof currentValue !== 'string' || !currentValue.includes('%7B')) {
      continue;
    }

    const repairedValue = repairEncodedAiometadataPlaceholders(currentValue);
    if (repairedValue !== currentValue) {
      nextConfig[key] = repairedValue;
      repairedKeys.push(key);
    }
  }

  return {
    config: nextConfig,
    repairedKeys,
  };
};

export const normalizeAiometadataOrigin = (value?: string): string | null => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return 'https://aiometadata.elfhosted.com';

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
};