export const normalizeKitsuId = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const asInt = Math.trunc(value);
    return asInt > 0 ? String(asInt) : null;
  }

  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.toLowerCase().startsWith('kitsu:') ? trimmed.slice(6) : trimmed;
  if (!normalized) return null;
  const match = normalized.match(/\d+/);
  return match ? match[0] : null;
};

export const normalizeTmdbId = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const asInt = Math.trunc(value);
    return asInt > 0 ? String(asInt) : null;
  }

  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/\d+/);
  return match ? match[0] : null;
};

export const normalizeMalId = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const asInt = Math.trunc(value);
    return asInt > 0 ? String(asInt) : null;
  }

  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.toLowerCase().startsWith('mal:')
    ? trimmed.slice(4)
    : trimmed.toLowerCase().startsWith('myanimelist:')
      ? trimmed.slice('myanimelist:'.length)
      : trimmed;
  if (!normalized) return null;
  const match = normalized.match(/\d+/);
  return match ? match[0] : null;
};

export const extractKitsuIdFromAnimemapping = (payload: any) => {
  const candidates = [
    payload?.requested?.resolvedKitsuId,
    payload?.kitsu?.id,
    payload?.mappings?.ids?.kitsu,
    payload?.data?.requested?.resolvedKitsuId,
    payload?.data?.kitsu?.id,
    payload?.data?.mappings?.ids?.kitsu,
  ];

  for (const candidate of candidates) {
    const kitsuId = normalizeKitsuId(candidate);
    if (kitsuId) return kitsuId;
  }

  return null;
};

export const extractAniListIdFromAnimemapping = (payload: any) => {
  const candidates = [
    payload?.requested?.resolvedAniListId,
    payload?.mappings?.ids?.anilist,
    payload?.data?.requested?.resolvedAniListId,
    payload?.data?.mappings?.ids?.anilist,
  ];

  for (const candidate of candidates) {
    const aniListId = normalizeTmdbId(candidate);
    if (aniListId) return aniListId;
  }

  return null;
};

export const extractMalIdFromAnimemapping = (payload: any) => {
  const candidates = [
    payload?.requested?.resolvedMalId,
    payload?.requested?.resolvedMyAnimeListId,
    payload?.mappings?.ids?.mal,
    payload?.mappings?.ids?.myanimelist,
    payload?.data?.requested?.resolvedMalId,
    payload?.data?.requested?.resolvedMyAnimeListId,
    payload?.data?.mappings?.ids?.mal,
    payload?.data?.mappings?.ids?.myanimelist,
  ];

  for (const candidate of candidates) {
    const malId = normalizeMalId(candidate);
    if (malId) return malId;
  }

  return null;
};

export const extractTmdbIdFromAnimemapping = (payload: any) => {
  const candidates = [
    payload?.mappings?.ids?.tmdb,
    payload?.data?.mappings?.ids?.tmdb,
  ];

  for (const candidate of candidates) {
    const tmdbId = normalizeTmdbId(candidate);
    if (tmdbId) return tmdbId;
  }

  return null;
};

export const extractAnimeSubtypeFromAnimemapping = (payload: any) => {
  const candidates = [
    payload?.requested?.subtype,
    payload?.subtype,
    payload?.kitsu?.subtype,
    payload?.mappings?.subtype,
    payload?.data?.requested?.subtype,
    payload?.data?.subtype,
    payload?.data?.kitsu?.subtype,
    payload?.data?.mappings?.subtype,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const normalized = candidate.trim().toLowerCase();
    if (normalized) return normalized;
  }

  return null;
};
