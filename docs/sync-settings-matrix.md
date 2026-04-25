# Sync Settings Matrix

This file is auto-generated from `lib/crossTypeSync.ts` by `scripts/generate-sync-settings-matrix.mjs`.

Any setting not listed in this table is not synchronized by Sync to all, Sync to [type], or Pull from [type].

## Matrix

| Field | Poster key | Backdrop key | Thumbnail key | Logo key |
| --- | --- | --- | --- | --- |
| aggregateAccentBarOffset | aggregateAccentBarOffset | aggregateAccentBarOffset | aggregateAccentBarOffset | aggregateAccentBarOffset |
| aggregateAccentBarVisible | aggregateAccentBarVisible | aggregateAccentBarVisible | aggregateAccentBarVisible | aggregateAccentBarVisible |
| aggregateAccentColor | aggregateAccentColor | aggregateAccentColor | aggregateAccentColor | aggregateAccentColor |
| aggregateAccentMode | aggregateAccentMode | aggregateAccentMode | aggregateAccentMode | aggregateAccentMode |
| aggregateAudienceAccentColor | aggregateAudienceAccentColor | aggregateAudienceAccentColor | aggregateAudienceAccentColor | aggregateAudienceAccentColor |
| aggregateAudienceValueColor | aggregateAudienceValueColor | aggregateAudienceValueColor | aggregateAudienceValueColor | aggregateAudienceValueColor |
| aggregateCriticsAccentColor | aggregateCriticsAccentColor | aggregateCriticsAccentColor | aggregateCriticsAccentColor | aggregateCriticsAccentColor |
| aggregateCriticsValueColor | aggregateCriticsValueColor | aggregateCriticsValueColor | aggregateCriticsValueColor | aggregateCriticsValueColor |
| aggregateDynamicStops | aggregateDynamicStops | aggregateDynamicStops | aggregateDynamicStops | aggregateDynamicStops |
| aggregateProviderWeights | posterAggregateProviderWeights | backdropAggregateProviderWeights | thumbnailAggregateProviderWeights | logoAggregateProviderWeights |
| aggregateRatingSource | posterAggregateRatingSource | backdropAggregateRatingSource | thumbnailAggregateRatingSource | logoAggregateRatingSource |
| aggregateValueColor | aggregateValueColor | aggregateValueColor | aggregateValueColor | aggregateValueColor |
| genreBadgeAnimeGrouping | posterGenreBadgeAnimeGrouping | backdropGenreBadgeAnimeGrouping | thumbnailGenreBadgeAnimeGrouping | logoGenreBadgeAnimeGrouping |
| genreBadgeBackgroundOpacity | posterGenreBadgeBackgroundOpacity | backdropGenreBadgeBackgroundOpacity | thumbnailGenreBadgeBackgroundOpacity | logoGenreBadgeBackgroundOpacity |
| genreBadgeBorderWidth | posterGenreBadgeBorderWidth | backdropGenreBadgeBorderWidth | thumbnailGenreBadgeBorderWidth | logoGenreBadgeBorderWidth |
| genreBadgeMode | posterGenreBadgeMode | backdropGenreBadgeMode | thumbnailGenreBadgeMode | logoGenreBadgeMode |
| genreBadgePosition | posterGenreBadgePosition | backdropGenreBadgePosition | thumbnailGenreBadgePosition | logoGenreBadgePosition |
| genreBadgeScale | posterGenreBadgeScale | backdropGenreBadgeScale | thumbnailGenreBadgeScale | logoGenreBadgeScale |
| genreBadgeStyle | posterGenreBadgeStyle | backdropGenreBadgeStyle | thumbnailGenreBadgeStyle | logoGenreBadgeStyle |
| iconShape | posterIconShape | backdropIconShape | thumbnailIconShape | logoIconShape |
| qualityBadgePreferences | posterQualityBadgePreferences | backdropQualityBadgePreferences | thumbnailQualityBadgePreferences | logoQualityBadgePreferences |
| qualityBadgeScale | posterQualityBadgeScale | backdropQualityBadgeScale | thumbnailQualityBadgeScale | logoQualityBadgeScale |
| qualityBadgesMax | posterQualityBadgesMax | backdropQualityBadgesMax | thumbnailQualityBadgesMax | logoQualityBadgesMax |
| qualityBadgesStyle | posterQualityBadgesStyle | backdropQualityBadgesStyle | thumbnailQualityBadgesStyle | logoQualityBadgesStyle |
| ratingBadgeScale | posterRatingBadgeScale | backdropRatingBadgeScale | thumbnailRatingBadgeScale | logoRatingBadgeScale |
| ratingPreferences | posterRatingPreferences | backdropRatingPreferences | thumbnailRatingPreferences | logoRatingPreferences |
| ratingPresentation | posterRatingPresentation | backdropRatingPresentation | thumbnailRatingPresentation | logoRatingPresentation |
| ratingStyle | posterRatingStyle | backdropRatingStyle | thumbnailRatingStyle | logoRatingStyle |
| ratingValueMode | ratingValueMode | ratingValueMode | ratingValueMode | ratingValueMode |
| streamBadges | posterStreamBadges | backdropStreamBadges | thumbnailStreamBadges | - |

## Special Rules

- Only the fields listed in the matrix are synchronized across types.
- Poster-only presentations are coerced to standard on backdrop, thumbnail, and logo targets.
- Thumbnail provider sync keeps only episode-safe providers.
- Stream badges are excluded when syncing into logo.
