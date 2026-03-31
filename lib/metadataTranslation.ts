export type MetadataTranslationMode =
  | 'fill-missing'
  | 'prefer-source'
  | 'prefer-requested-language'
  | 'prefer-tmdb';

export const DEFAULT_METADATA_TRANSLATION_MODE: MetadataTranslationMode = 'fill-missing';

export const METADATA_TRANSLATION_MODE_OPTIONS: Array<{
  id: MetadataTranslationMode;
  label: string;
  description: string;
}> = [
  {
    id: 'fill-missing',
    label: 'Fill Missing',
    description: 'Keep good source addon metadata, but replace blanks and placeholders.',
  },
  {
    id: 'prefer-source',
    label: 'Prefer Source',
    description: 'Keep source addon metadata that already has content and only fill truly absent fields.',
  },
  {
    id: 'prefer-requested-language',
    label: 'Prefer Language',
    description: 'Prefer exact translations for the requested language when they exist.',
  },
  {
    id: 'prefer-tmdb',
    label: 'Prefer TMDB',
    description: 'Prefer TMDB text when it is available, falling back only when needed.',
  },
];

const METADATA_TRANSLATION_MODE_SET = new Set<MetadataTranslationMode>(
  METADATA_TRANSLATION_MODE_OPTIONS.map((option) => option.id),
);

export const normalizeMetadataTranslationMode = (
  value: unknown,
  fallback: MetadataTranslationMode = DEFAULT_METADATA_TRANSLATION_MODE,
): MetadataTranslationMode => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return METADATA_TRANSLATION_MODE_SET.has(normalized as MetadataTranslationMode)
    ? (normalized as MetadataTranslationMode)
    : fallback;
};
