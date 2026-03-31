import { DEFAULT_QUALITY_BADGE_PREFERENCES } from './badgeCustomization.ts';
import type { MediaFeatureBadgeKey } from './mediaFeatures.ts';
import type { MetadataTranslationMode } from './metadataTranslation.ts';
import {
  ALL_RATING_PREFERENCES,
  type RatingPreference,
} from './ratingProviderCatalog.ts';
import type { SavedProxySettings, SavedUiConfig, SharedXrdbSettings } from './uiConfig.ts';
import { normalizeSavedUiConfig } from './uiConfig.ts';

export type ConfiguratorExperienceMode = 'simple' | 'advanced';
export type ConfiguratorPresetId = 'starter' | 'balanced' | 'public-fast' | 'full-stack';

type ConfiguratorPresetPatch = {
  settings: Partial<SharedXrdbSettings>;
  proxy?: Partial<SavedProxySettings>;
};

export type ConfiguratorPresetDefinition = {
  id: ConfiguratorPresetId;
  label: string;
  badge: string;
  description: string;
  bullets: string[];
  accentColor: string;
  recommendedExperienceMode: ConfiguratorExperienceMode;
  patch: ConfiguratorPresetPatch;
};

export type ConfiguratorWizardAnswers = {
  deployment: 'personal' | 'public';
  density: 'minimal' | 'balanced' | 'maximal';
  tuning: 'guided' | 'hands-on';
};

export type ConfiguratorWizardQuestionId = keyof ConfiguratorWizardAnswers;

type ConfiguratorWizardOptionMap = {
  [K in ConfiguratorWizardQuestionId]: ReadonlyArray<{
    value: ConfiguratorWizardAnswers[K];
    label: string;
    description: string;
  }>;
};

export type ConfiguratorWizardQuestion<K extends ConfiguratorWizardQuestionId> = {
  id: K;
  title: string;
  description: string;
  options: ConfiguratorWizardOptionMap[K];
};

export const DEFAULT_CONFIGURATOR_EXPERIENCE_MODE: ConfiguratorExperienceMode = 'simple';
export const DEFAULT_CONFIGURATOR_PRESET_ID: ConfiguratorPresetId = 'balanced';

const CORE_RATING_STACK: RatingPreference[] = ['imdb', 'tmdb'];
const RECOMMENDED_RATING_STACK: RatingPreference[] = ['imdb', 'tmdb', 'mdblist'];
const STARTER_QUALITY_BADGES: MediaFeatureBadgeKey[] = ['certification', '4k', 'hdr'];
const BALANCED_QUALITY_BADGES: MediaFeatureBadgeKey[] = [
  'certification',
  '4k',
  'hdr',
  'dolbyvision',
  'dolbyatmos',
];

const DEFAULT_TRANSLATION_MODE: MetadataTranslationMode = 'fill-missing';

export const CONFIGURATOR_PRESETS: readonly ConfiguratorPresetDefinition[] = [
  {
    id: 'starter',
    label: 'Starter',
    badge: 'Minimal',
    description: 'Lean defaults for a first setup with a quieter output and fewer moving parts.',
    bullets: [
      'Keeps ratings to IMDb and TMDB only.',
      'Uses compact average badges for a low noise look.',
      'Turns off stream badges and keeps metadata translation on.',
    ],
    accentColor: '#7c9cff',
    recommendedExperienceMode: 'simple',
    patch: {
      settings: {
        posterRatingPreferences: CORE_RATING_STACK,
        backdropRatingPreferences: CORE_RATING_STACK,
        logoRatingPreferences: CORE_RATING_STACK,
        posterStreamBadges: 'off',
        backdropStreamBadges: 'off',
        posterQualityBadgePreferences: STARTER_QUALITY_BADGES,
        backdropQualityBadgePreferences: STARTER_QUALITY_BADGES,
        posterQualityBadgesStyle: 'plain',
        backdropQualityBadgesStyle: 'plain',
        posterRatingPresentation: 'minimal',
        backdropRatingPresentation: 'minimal',
        logoRatingPresentation: 'average',
        posterRatingsLayout: 'bottom',
        backdropRatingsLayout: 'center',
        posterImageText: 'clean',
        backdropImageText: 'clean',
      },
      proxy: {
        translateMeta: true,
        translateMetaMode: DEFAULT_TRANSLATION_MODE,
        debugMetaTranslation: false,
      },
    },
  },
  {
    id: 'balanced',
    label: 'Balanced',
    badge: 'Recommended',
    description: 'The best default for most XRDB installs: expressive output without a heavy provider stack.',
    bullets: [
      'Uses IMDb, TMDB, and MDBList for posters and backdrops.',
      'Keeps the default badge layouts and clean artwork text.',
      'Leaves stream badges on auto and metadata translation enabled.',
    ],
    accentColor: '#8b5cf6',
    recommendedExperienceMode: 'simple',
    patch: {
      settings: {
        posterRatingPreferences: RECOMMENDED_RATING_STACK,
        backdropRatingPreferences: RECOMMENDED_RATING_STACK,
        logoRatingPreferences: CORE_RATING_STACK,
        posterStreamBadges: 'auto',
        backdropStreamBadges: 'auto',
        posterQualityBadgePreferences: BALANCED_QUALITY_BADGES,
        backdropQualityBadgePreferences: BALANCED_QUALITY_BADGES,
        posterQualityBadgesStyle: 'glass',
        backdropQualityBadgesStyle: 'glass',
        posterRatingPresentation: 'standard',
        backdropRatingPresentation: 'standard',
        logoRatingPresentation: 'standard',
        posterRatingsLayout: 'bottom',
        backdropRatingsLayout: 'center',
        posterImageText: 'clean',
        backdropImageText: 'clean',
      },
      proxy: {
        translateMeta: true,
        translateMetaMode: DEFAULT_TRANSLATION_MODE,
        debugMetaTranslation: false,
      },
    },
  },
  {
    id: 'public-fast',
    label: 'Public Fast',
    badge: 'Public Instance',
    description: 'Optimized for public XRDB instances where predictable latency matters more than long tail coverage.',
    bullets: [
      'Matches the README Public Fast guidance for ratings and proxy translation.',
      'Disables poster and backdrop stream badges to avoid latency spikes.',
      'Keeps logo ratings trimmed to IMDb and TMDB.',
    ],
    accentColor: '#34d399',
    recommendedExperienceMode: 'simple',
    patch: {
      settings: {
        posterRatingPreferences: RECOMMENDED_RATING_STACK,
        backdropRatingPreferences: RECOMMENDED_RATING_STACK,
        logoRatingPreferences: CORE_RATING_STACK,
        posterStreamBadges: 'off',
        backdropStreamBadges: 'off',
        posterQualityBadgePreferences: STARTER_QUALITY_BADGES,
        backdropQualityBadgePreferences: STARTER_QUALITY_BADGES,
        posterQualityBadgesStyle: 'plain',
        backdropQualityBadgesStyle: 'plain',
        posterRatingPresentation: 'standard',
        backdropRatingPresentation: 'standard',
        logoRatingPresentation: 'standard',
        posterRatingsLayout: 'bottom',
        backdropRatingsLayout: 'center',
        posterImageText: 'clean',
        backdropImageText: 'clean',
      },
      proxy: {
        translateMeta: true,
        translateMetaMode: DEFAULT_TRANSLATION_MODE,
        debugMetaTranslation: false,
      },
    },
  },
  {
    id: 'full-stack',
    label: 'Full Stack',
    badge: 'Fully Fledged',
    description: 'Dense, feature rich rendering for people who want the whole XRDB surface turned on.',
    bullets: [
      'Enables the full provider list with stacked and blockbuster heavy presentation defaults.',
      'Keeps every quality badge visible with richer media marks.',
      'Best paired with advanced mode for manual tuning after the preset lands.',
    ],
    accentColor: '#f97316',
    recommendedExperienceMode: 'advanced',
    patch: {
      settings: {
        posterRatingPreferences: [...ALL_RATING_PREFERENCES],
        backdropRatingPreferences: [...ALL_RATING_PREFERENCES],
        logoRatingPreferences: [...ALL_RATING_PREFERENCES],
        posterStreamBadges: 'auto',
        backdropStreamBadges: 'auto',
        posterQualityBadgePreferences: [...DEFAULT_QUALITY_BADGE_PREFERENCES],
        backdropQualityBadgePreferences: [...DEFAULT_QUALITY_BADGE_PREFERENCES],
        posterQualityBadgesStyle: 'media',
        backdropQualityBadgesStyle: 'media',
        posterRatingPresentation: 'blockbuster',
        backdropRatingPresentation: 'blockbuster',
        logoRatingPresentation: 'dual-minimal',
        posterRatingStyle: 'stacked',
        backdropRatingStyle: 'stacked',
        posterRatingsLayout: 'left-right',
        backdropRatingsLayout: 'right-vertical',
        posterRatingsMaxPerSide: 4,
        posterGenreBadgeMode: 'both',
        backdropGenreBadgeMode: 'both',
        logoGenreBadgeMode: 'both',
      },
      proxy: {
        translateMeta: true,
        translateMetaMode: DEFAULT_TRANSLATION_MODE,
        debugMetaTranslation: false,
      },
    },
  },
] as const;

const PRESET_BY_ID = Object.fromEntries(
  CONFIGURATOR_PRESETS.map((preset) => [preset.id, preset]),
) as Record<ConfiguratorPresetId, ConfiguratorPresetDefinition>;

export const CONFIGURATOR_WIZARD_QUESTION_ORDER = [
  'deployment',
  'density',
  'tuning',
] as const satisfies readonly ConfiguratorWizardQuestionId[];

export const CONFIGURATOR_WIZARD_QUESTIONS = {
  deployment: {
    id: 'deployment',
    title: 'Where will this XRDB setup run?',
    description: 'Public hosts should stay lighter by default so cold renders remain predictable.',
    options: [
      {
        value: 'personal',
        label: 'Personal library',
        description: 'Prioritize richer artwork for a personal setup or a small private group.',
      },
      {
        value: 'public',
        label: 'Shared or public host',
        description: 'Bias toward lower latency and safer shared defaults.',
      },
    ],
  },
  density: {
    id: 'density',
    title: 'How dense should the artwork feel?',
    description: 'This controls whether the preset stays minimal, balanced, or fully badge rich.',
    options: [
      {
        value: 'minimal',
        label: 'Clean and quiet',
        description: 'Use fewer sources and a calmer visual treatment.',
      },
      {
        value: 'balanced',
        label: 'Balanced',
        description: 'Keep strong coverage without turning everything up.',
      },
      {
        value: 'maximal',
        label: 'Show everything',
        description: 'Prefer richer badge stacks and broader provider coverage.',
      },
    ],
  },
  tuning: {
    id: 'tuning',
    title: 'How much tuning do you expect to do later?',
    description: 'This only nudges the recommendation. You can still change every detail afterwards.',
    options: [
      {
        value: 'guided',
        label: 'Keep it guided',
        description: 'Start from a preset and change only a few essentials.',
      },
      {
        value: 'hands-on',
        label: 'Manual tuning',
        description: 'Start from a richer base and plan to tune the details manually.',
      },
    ],
  },
} as const satisfies {
  [K in ConfiguratorWizardQuestionId]: ConfiguratorWizardQuestion<K>;
};

export const isConfiguratorExperienceMode = (
  value: unknown,
): value is ConfiguratorExperienceMode => value === 'simple' || value === 'advanced';

export const isConfiguratorPresetId = (value: unknown): value is ConfiguratorPresetId =>
  typeof value === 'string' && value in PRESET_BY_ID;

export const getConfiguratorPreset = (presetId: ConfiguratorPresetId) => PRESET_BY_ID[presetId];

export const recommendConfiguratorPreset = (
  answers: Partial<ConfiguratorWizardAnswers>,
): ConfiguratorPresetId => {
  if (answers.deployment === 'public') {
    return 'public-fast';
  }
  if (answers.density === 'minimal') {
    return 'starter';
  }
  if (answers.density === 'maximal' || answers.tuning === 'hands-on') {
    return 'full-stack';
  }
  return DEFAULT_CONFIGURATOR_PRESET_ID;
};

export const applyConfiguratorPreset = (
  currentConfig: SavedUiConfig,
  presetId: ConfiguratorPresetId,
): SavedUiConfig => {
  const preset = getConfiguratorPreset(presetId);
  return normalizeSavedUiConfig({
    version: 1,
    settings: {
      ...currentConfig.settings,
      ...preset.patch.settings,
    },
    proxy: {
      ...currentConfig.proxy,
      ...preset.patch.proxy,
    },
  });
};
