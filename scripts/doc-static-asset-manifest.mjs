export const DOC_STATIC_ASSET_PATHS = {
  moviePosterComparison: 'docs/images/render-comparisons/movie-poster-comparison.png',
  showBackdropComparison: 'docs/images/render-comparisons/show-backdrop-comparison.png',
  animeLogoComparison: 'docs/images/render-comparisons/anime-logo-comparison.png',
  proxyTranslationFillMissingMovieFr: 'docs/images/metadata-translation/proxy-translation-fill-missing-movie-fr.png',
  proxyTranslationPreferLanguageShowFrBe:
    'docs/images/metadata-translation/proxy-translation-prefer-language-show-fr-be.png',
  proxyTranslationAnimeFallbackEnGb:
    'docs/images/metadata-translation/proxy-translation-anime-fallback-en-gb.png',
  posterWorkspace: 'docs/images/demo-videos/poster-workspace.png',
  proxyWorkspace: 'docs/images/demo-videos/proxy-workspace.png',
};

export const DOC_RENDER_COMPARISON_OUTPUTS = [
  DOC_STATIC_ASSET_PATHS.moviePosterComparison,
  DOC_STATIC_ASSET_PATHS.showBackdropComparison,
  DOC_STATIC_ASSET_PATHS.animeLogoComparison,
];

export const DOC_METADATA_EXAMPLE_OUTPUTS = [
  DOC_STATIC_ASSET_PATHS.proxyTranslationFillMissingMovieFr,
  DOC_STATIC_ASSET_PATHS.proxyTranslationPreferLanguageShowFrBe,
  DOC_STATIC_ASSET_PATHS.proxyTranslationAnimeFallbackEnGb,
];

export const DOC_WORKSPACE_CAPTURE_OUTPUTS = [
  DOC_STATIC_ASSET_PATHS.posterWorkspace,
  DOC_STATIC_ASSET_PATHS.proxyWorkspace,
];

export const GENERATED_DOC_STATIC_ASSET_PATHS = [
  ...DOC_RENDER_COMPARISON_OUTPUTS,
  ...DOC_METADATA_EXAMPLE_OUTPUTS,
  ...DOC_WORKSPACE_CAPTURE_OUTPUTS,
];
