'use client';

import Image from 'next/image';
import { Fragment, type DragEvent, type ReactNode, useRef } from 'react';
import { useConfiguratorContext } from '@/lib/configuratorProvider';
import { RATING_PROVIDER_OPTIONS } from '@/lib/ratingProviderCatalog';
import { RATING_STYLE_OPTIONS, ICON_SHAPE_OPTIONS, QUALITY_BADGE_STYLE_OPTIONS } from '@/lib/ratingAppearance';
import { RATING_VALUE_MODE_OPTIONS } from '@/lib/ratingDisplay';
import { GENRE_BADGE_MODE_OPTIONS, GENRE_BADGE_STYLE_OPTIONS, GENRE_BADGE_POSITION_OPTIONS } from '@/lib/genreBadge';
import {
  AGGREGATE_ACCENT_MODE_OPTIONS,
  AGGREGATE_RATING_SOURCE_OPTIONS,
  MAX_AGGREGATE_ACCENT_BAR_OFFSET,
  MIN_AGGREGATE_ACCENT_BAR_OFFSET,
  RATING_PRESENTATION_OPTIONS,
} from '@/lib/ratingPresentation';
import { DynamicStopsEditor } from '@/components/dynamic-stops-editor';
import { ColorSwatchControl } from '@/components/color-swatch-control';
import { BACKDROP_RATING_LAYOUT_OPTIONS } from '@/lib/backdropLayoutOptions';
import { QUALITY_BADGE_OPTIONS } from '@/lib/badgeCustomization';
import { COMMUNITY_BADGE_THEME_OPTIONS } from '@/lib/communityBadgeTheme';

function ControlRow({
  label,
  children,
  inline = false,
}: {
  label: string;
  children: ReactNode;
  inline?: boolean;
}) {
  return (
    <div className={`xrdb-control-row${inline ? ' xrdb-control-row-inline' : ''}`}>
      <span className="xrdb-control-label">{label}</span>
      <div className="xrdb-control-field">{children}</div>
    </div>
  );
}

function OptionPills<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="xrdb-option-pills" role="group">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className={`xrdb-option-pill${value === opt.id ? ' xrdb-option-pill-active' : ''}`}
          aria-pressed={value === opt.id}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function ProvidersPanel() {
  const ctx = useConfiguratorContext();
  const {
    ratingProviderRows,
    ratingProviderAppearanceOverrides,
    activeProviderEditorId,
    onReorderRatingPreference,
    onToggleRatingPreference,
    onSelectAllRatingPreferencesEnabled,
    onSelectActiveProviderEditorId,
    onUpdateProviderAppearanceOverride,
  } = ctx.inputsPanelProps.providersProps;
  const dragFromIndexRef = useRef<number | null>(null);

  const allEnabled = ratingProviderRows.every((r) => r.enabled);
  const enabledCount = ratingProviderRows.filter((r) => r.enabled).length;
  const activeProviderMeta =
    RATING_PROVIDER_OPTIONS.find((provider) => provider.id === activeProviderEditorId) ||
    RATING_PROVIDER_OPTIONS[0] ||
    null;
  const activeProviderOverride = activeProviderMeta
    ? ratingProviderAppearanceOverrides[activeProviderMeta.id] || {}
    : {};
  const activeProviderIconUrl =
    typeof activeProviderOverride.iconUrl === 'string' ? activeProviderOverride.iconUrl : '';

  const handleProviderDragOver = (event: DragEvent<HTMLLIElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleProviderDrop = (toIndex: number) => {
    const fromIndex = dragFromIndexRef.current;
    dragFromIndexRef.current = null;
    if (fromIndex === null || fromIndex === toIndex) {
      return;
    }
    onReorderRatingPreference(fromIndex, toIndex);
  };

  return (
    <div className="xrdb-panel-providers">
      <div className="xrdb-panel-header">
        <h2 className="xrdb-subtab-panel-title">Rating providers</h2>
        <div className="xrdb-panel-header-actions">
          <span className="xrdb-panel-summary">{enabledCount} of {ratingProviderRows.length} enabled</span>
          <button
            type="button"
            className="xrdb-btn-ghost"
            onClick={() => onSelectAllRatingPreferencesEnabled(!allEnabled)}
          >
            {allEnabled ? 'Disable all' : 'Enable all'}
          </button>
        </div>
      </div>

      <ul className="xrdb-provider-list" role="list">
        {ratingProviderRows.map((row, index) => {
          const meta = RATING_PROVIDER_OPTIONS.find((p) => p.id === row.id);
          return (
            <li
              key={row.id}
              className="xrdb-provider-row"
              draggable
              onDragStart={() => {
                dragFromIndexRef.current = index;
              }}
              onDragOver={handleProviderDragOver}
              onDrop={() => handleProviderDrop(index)}
              onDragEnd={() => {
                dragFromIndexRef.current = null;
              }}
            >
              <button
                type="button"
                className={`xrdb-provider-toggle${row.enabled ? ' xrdb-provider-toggle-on' : ''}`}
                role="switch"
                aria-checked={row.enabled}
                onClick={() => onToggleRatingPreference(row.id)}
              >
                {meta?.iconUrl ? (
                  <Image
                    src={meta.iconUrl}
                    alt=""
                    className="xrdb-provider-icon"
                    width={20}
                    height={20}
                    aria-hidden="true"
                    unoptimized
                  />
                ) : null}
                <span className="xrdb-provider-name">{meta?.label ?? row.id}</span>
                <span className="xrdb-provider-status-dot" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>

      {activeProviderMeta ? (
        <>
          <ControlRow label="Edit provider">
            <OptionPills
              options={ratingProviderRows.flatMap((row) => {
                const meta = RATING_PROVIDER_OPTIONS.find((provider) => provider.id === row.id);
                return meta ? [{ id: meta.id, label: meta.label }] : [];
              })}
              value={activeProviderMeta.id}
              onChange={onSelectActiveProviderEditorId}
            />
          </ControlRow>

          <ControlRow label="Custom icon URL">
            <div className="xrdb-control-stack">
              <input
                type="url"
                className="xrdb-url-input"
                value={activeProviderIconUrl}
                placeholder="https://example.com/provider.png or https://example.com/provider.svg"
                onChange={(event) =>
                  onUpdateProviderAppearanceOverride(activeProviderMeta.id, (current) => ({
                    ...current,
                    iconUrl: event.target.value,
                  }))
                }
                aria-label={`${activeProviderMeta.label} custom icon URL`}
              />
              {activeProviderIconUrl ? (
                <button
                  type="button"
                  className="xrdb-btn-ghost"
                  onClick={() =>
                    onUpdateProviderAppearanceOverride(activeProviderMeta.id, (current) => ({
                      ...current,
                      iconUrl: '',
                    }))
                  }
                >
                  Reset
                </button>
              ) : null}
            </div>
          </ControlRow>

          <ControlRow label="Preview">
            <div className="xrdb-provider-toggle xrdb-provider-toggle-on" aria-live="polite">
              {(activeProviderIconUrl || activeProviderMeta.iconUrl) ? (
                <Image
                  src={activeProviderIconUrl || activeProviderMeta.iconUrl}
                  alt={`${activeProviderMeta.label} icon preview`}
                  className="xrdb-provider-icon"
                  width={20}
                  height={20}
                  unoptimized
                />
              ) : null}
              <span className="xrdb-provider-name">{activeProviderMeta.label}</span>
            </div>
          </ControlRow>
        </>
      ) : null}
    </div>
  );
}

export function StylePanel() {
  const ctx = useConfiguratorContext();
  const look = ctx.inputsPanelProps.lookProps;
  const pres = ctx.inputsPanelProps.presentationProps;

  const presentationOptions = pres.presentationOrder
    .map((id) => RATING_PRESENTATION_OPTIONS.find((o) => o.id === id))
    .filter((o): o is (typeof RATING_PRESENTATION_OPTIONS)[number] => o !== undefined);

  return (
    <div className="xrdb-panel-style">
      <h2 className="xrdb-subtab-panel-title">Style</h2>

      <ControlRow label="Presentation">
        <OptionPills
          options={presentationOptions}
          value={pres.activeRatingPresentation}
          onChange={pres.onSelectRatingPresentation}
        />
      </ControlRow>

      {pres.usesAggregatePresentation ? (
        <>
          {pres.showsAggregateRatingSource ? (
            <ControlRow label="Aggregate source">
              <OptionPills
                options={AGGREGATE_RATING_SOURCE_OPTIONS}
                value={pres.activeAggregateRatingSource}
                onChange={pres.onSelectAggregateRatingSource}
              />
            </ControlRow>
          ) : null}

          <ControlRow label="Accent mode">
            <OptionPills
              options={AGGREGATE_ACCENT_MODE_OPTIONS}
              value={pres.aggregateAccentMode}
              onChange={pres.onSelectAggregateAccentMode}
            />
          </ControlRow>

          {pres.aggregateAccentMode === 'dynamic' ? (
            <ControlRow label="Dynamic stops">
              <DynamicStopsEditor
                value={pres.aggregateDynamicStops}
                onChange={pres.onSelectAggregateDynamicStops}
              />
            </ControlRow>
          ) : null}

          {pres.aggregateAccentMode === 'custom' ? (
            <>
              <ControlRow label="Accent colour">
                <ColorSwatchControl
                  value={pres.aggregateAccentColor}
                  onChange={pres.onSelectAggregateAccentColor}
                  ariaLabel="Aggregate accent colour"
                  title="Custom accent colour for aggregate badges and overlays."
                />
              </ControlRow>
              <ControlRow label="Critics accent colour">
                <ColorSwatchControl
                  value={pres.aggregateCriticsAccentColor}
                  onChange={pres.onSelectAggregateCriticsAccentColor}
                  ariaLabel="Critics accent colour"
                  title="Custom accent colour used when the aggregate source is critics."
                />
              </ControlRow>
              <ControlRow label="Audience accent colour">
                <ColorSwatchControl
                  value={pres.aggregateAudienceAccentColor}
                  onChange={pres.onSelectAggregateAudienceAccentColor}
                  ariaLabel="Audience accent colour"
                  title="Custom accent colour used when the aggregate source is audience."
                />
              </ControlRow>
              <ControlRow label="Value colour">
                <ColorSwatchControl
                  value={pres.aggregateValueColor}
                  onChange={pres.onSelectAggregateValueColor}
                  ariaLabel="Aggregate value colour"
                  title="Text colour for custom aggregate badges and overlays."
                />
              </ControlRow>
              <ControlRow label="Critics value colour">
                <ColorSwatchControl
                  value={pres.aggregateCriticsValueColor}
                  onChange={pres.onSelectAggregateCriticsValueColor}
                  ariaLabel="Critics value colour"
                  title="Text colour used when the aggregate source is critics."
                />
              </ControlRow>
              <ControlRow label="Audience value colour">
                <ColorSwatchControl
                  value={pres.aggregateAudienceValueColor}
                  onChange={pres.onSelectAggregateAudienceValueColor}
                  ariaLabel="Audience value colour"
                  title="Text colour used when the aggregate source is audience."
                />
              </ControlRow>
            </>
          ) : null}

          {pres.showsAggregateAccentBarOffset ? (
            <>
              <ControlRow label="Accent bar" inline>
                <button
                  type="button"
                  role="switch"
                  aria-checked={pres.aggregateAccentBarVisible}
                  className={`xrdb-toggle${pres.aggregateAccentBarVisible ? ' xrdb-toggle-on' : ''}`}
                  onClick={pres.onToggleAggregateAccentBarVisible}
                >
                  {pres.aggregateAccentBarVisible ? 'On' : 'Off'}
                </button>
              </ControlRow>

              <ControlRow label="Accent bar offset">
                <div className="xrdb-number-control">
                  <input
                    type="number"
                    className="xrdb-number-input"
                    value={pres.aggregateAccentBarOffset}
                    min={MIN_AGGREGATE_ACCENT_BAR_OFFSET}
                    max={MAX_AGGREGATE_ACCENT_BAR_OFFSET}
                    onChange={(event) =>
                      pres.onSelectAggregateAccentBarOffset(Number(event.target.value))
                    }
                    aria-label="Aggregate accent bar offset"
                    title="Vertical offset for compact accent bars."
                  />
                  <span className="xrdb-number-unit">px</span>
                </div>
              </ControlRow>
            </>
          ) : null}
        </>
      ) : null}

      <ControlRow label="Artwork source">
        <OptionPills
          options={look.activeArtworkSourceOptions}
          value={look.activeArtworkSource}
          onChange={look.onSelectThumbnailArtworkSource}
        />
        {look.activeArtworkSourceDescription ? (
          <p className="xrdb-control-description">{look.activeArtworkSourceDescription}</p>
        ) : null}
      </ControlRow>

      <ControlRow label="Rating style">
        <OptionPills
          options={RATING_STYLE_OPTIONS}
          value={look.activeRatingStyle}
          onChange={look.onSelectRatingStyle}
        />
      </ControlRow>

      <ControlRow label="Image text">
        <OptionPills
          options={look.activeImageTextOptions}
          value={look.activeImageText}
          onChange={look.onSelectImageText}
        />
        {look.activeImageTextDescription ? (
          <p className="xrdb-control-description">{look.activeImageTextDescription}</p>
        ) : null}
      </ControlRow>

      <ControlRow label="Rating values">
        <OptionPills
          options={RATING_VALUE_MODE_OPTIONS}
          value={look.ratingValueMode}
          onChange={look.onSelectRatingValueMode}
        />
      </ControlRow>

      <ControlRow label="Icon shape">
        <OptionPills
          options={ICON_SHAPE_OPTIONS}
          value={look.iconShape}
          onChange={look.onSelectIconShape}
        />
      </ControlRow>

      <ControlRow label="Genre badges">
        <OptionPills
          options={GENRE_BADGE_MODE_OPTIONS}
          value={look.activeGenreBadgeMode}
          onChange={look.onSelectGenreBadgeMode}
        />
      </ControlRow>

      {look.activeGenreBadgeMode !== 'off' ? (
        <>
          <ControlRow label="Genre style">
            <OptionPills
              options={GENRE_BADGE_STYLE_OPTIONS}
              value={look.activeGenreBadgeStyle}
              onChange={look.onSelectGenreBadgeStyle}
            />
          </ControlRow>
          <ControlRow label="Genre position">
            <OptionPills
              options={GENRE_BADGE_POSITION_OPTIONS}
              value={look.activeGenreBadgePosition}
              onChange={look.onSelectGenreBadgePosition}
            />
          </ControlRow>
          <ControlRow label="Genre size">
            <div className="xrdb-number-control">
              <input
                type="number"
                className="xrdb-number-input"
                value={look.activeGenreBadgeScale}
                min={70}
                max={200}
                onChange={(e) => look.onSelectGenreBadgeScale(Number(e.target.value))}
                aria-label="Genre badge size"
                title="Scale genre badges relative to their default size. 100 is default."
              />
              <span className="xrdb-number-unit">%</span>
            </div>
          </ControlRow>
          {look.activeGenreBadgeStyle === 'clean' ? (
            <ControlRow label="Clean overlay strength">
              <div className="xrdb-number-control">
                <input
                  type="number"
                  className="xrdb-number-input"
                  value={look.activeGenreBadgeBackgroundOpacity}
                  min={0}
                  max={100}
                  onChange={(e) => look.onSelectGenreBadgeBackgroundOpacity(Number(e.target.value))}
                  aria-label="Clean genre overlay strength"
                  title="Controls the black gradient strength behind clean genre text. 0 disables it."
                />
                <span className="xrdb-number-unit">%</span>
              </div>
            </ControlRow>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function PositionPanel() {
  const ctx = useConfiguratorContext();
  const look = ctx.inputsPanelProps.lookProps;

  return (
    <div className="xrdb-panel-position">
      <h2 className="xrdb-subtab-panel-title">Position</h2>

      <ControlRow label="Ratings layout">
        <OptionPills
          options={BACKDROP_RATING_LAYOUT_OPTIONS}
          value={look.thumbnailRatingsLayout}
          onChange={look.onSelectThumbnailRatingsLayout}
        />
      </ControlRow>

      <ControlRow label="Bottom row" inline>
        <button
          type="button"
          role="switch"
          aria-checked={look.thumbnailBottomRatingsRow}
          className={`xrdb-toggle${look.thumbnailBottomRatingsRow ? ' xrdb-toggle-on' : ''}`}
          onClick={look.onToggleThumbnailBottomRatingsRow}
        >
          {look.thumbnailBottomRatingsRow ? 'On' : 'Off'}
        </button>
      </ControlRow>

      <ControlRow label="Rating size">
        <div className="xrdb-number-control">
          <input
            type="number"
            className="xrdb-number-input"
            value={look.activeRatingBadgeScale}
            min={70}
            max={200}
            onChange={(e) => look.onSelectRatingBadgeScale(Number(e.target.value))}
            aria-label="Rating badge size"
            title="Scale rating badges relative to their default size. 100 is default."
          />
          <span className="xrdb-number-unit">%</span>
        </div>
      </ControlRow>
    </div>
  );
}

export function AdvancedPanel() {
  const ctx = useConfiguratorContext();
  const look = ctx.inputsPanelProps.lookProps;

  return (
    <div className="xrdb-panel-advanced">
      <h2 className="xrdb-subtab-panel-title">Advanced</h2>

      <ControlRow label="Max ratings total">
        <div className="xrdb-number-control">
          <input
            type="number"
            className="xrdb-number-input"
            value={look.thumbnailRatingsMax ?? ''}
            min={1}
            max={40}
            placeholder="Auto"
            onChange={(e) =>
              look.onSelectThumbnailRatingsMax(e.target.value === '' ? null : Number(e.target.value))
            }
            aria-label="Maximum ratings total"
            title="Maximum number of rating badges to show. Leave blank to let XRDB decide automatically."
          />
        </div>
      </ControlRow>

      <ControlRow label="Episode artwork">
        <OptionPills
          options={[
            { id: 'still' as const, label: 'Still' },
            { id: 'series' as const, label: 'Series' },
            { id: 'streaming' as const, label: 'Streaming' },
          ]}
          value={look.thumbnailEpisodeArtwork}
          onChange={look.onSelectThumbnailEpisodeArtwork}
        />
      </ControlRow>

      <ControlRow label="Black bar" inline>
        <button
          type="button"
          role="switch"
          aria-checked={look.activeBlackBarEnabled}
          className={`xrdb-toggle${look.activeBlackBarEnabled ? ' xrdb-toggle-on' : ''}`}
          onClick={look.onToggleBlackBar}
        >
          {look.activeBlackBarEnabled ? 'On' : 'Off'}
            </button>
          </ControlRow>
        </div>
      );
    }

    export function QualityPanel() {
      const ctx = useConfiguratorContext();
      const q = ctx.inputsPanelProps.qualityProps;
      const look = ctx.inputsPanelProps.lookProps;
      const isAdvancedMode = ctx.experienceMode === 'advanced';

      const allEnabled = q.activeQualityBadgePreferences.length === QUALITY_BADGE_OPTIONS.length;
      const enabledCount = q.activeQualityBadgePreferences.length;
      const customizableBadgeOptions = QUALITY_BADGE_OPTIONS.filter(
        (badge) => badge.id !== 'certification' && badge.id !== 'releasestatus',
      );
      const enabledCustomizableBadges = customizableBadgeOptions.filter((badge) =>
        q.activeQualityBadgePreferences.includes(badge.id),
      );

      return (
        <div className="xrdb-panel-quality">
          <div className="xrdb-panel-header">
            <h2 className="xrdb-subtab-panel-title">Quality badges</h2>
            <div className="xrdb-panel-header-actions">
              <span className="xrdb-panel-summary">{enabledCount} of {QUALITY_BADGE_OPTIONS.length} enabled</span>
              <button
                type="button"
                className="xrdb-btn-ghost"
                onClick={() => q.onSelectAllQualityBadgePreferencesEnabled(!allEnabled)}
              >
                {allEnabled ? 'Disable all' : 'Enable all'}
              </button>
            </div>
          </div>

          <ControlRow label="Stream badges">
            <OptionPills
              options={q.streamBadgeOptions}
              value={q.activeStreamBadges}
              onChange={q.onSelectStreamBadges}
            />
          </ControlRow>

          <ControlRow label="Badge style">
            <OptionPills
              options={QUALITY_BADGE_STYLE_OPTIONS}
              value={q.activeQualityBadgesStyle}
              onChange={q.onSelectQualityBadgeStyle}
            />
          </ControlRow>

          {q.activeQualityBadgesStyle === 'community-badge' ? (
            <ControlRow label="Badge theme">
              <OptionPills
                options={COMMUNITY_BADGE_THEME_OPTIONS}
                value={q.communityBadgeTheme}
                onChange={q.onSelectCommunityBadgeTheme}
              />
            </ControlRow>
          ) : null}

          <ControlRow label="Max badges">
            <div className="xrdb-number-control">
              <input
                type="number"
                className="xrdb-number-input"
                value={q.activeQualityBadgesMax ?? ''}
                min={0}
                max={20}
                placeholder="Auto"
                onChange={(e) =>
                  q.onSelectQualityBadgesMax(e.target.value === '' ? null : Number(e.target.value))
                }
                aria-label="Maximum quality badges"
                title="Maximum number of quality badges to show. Leave blank for automatic."
              />
            </div>
          </ControlRow>

          <ControlRow label="Badge size">
            <div className="xrdb-number-control">
              <input
                type="number"
                className="xrdb-number-input"
                value={look.activeQualityBadgeScale}
                min={70}
                max={200}
                onChange={(e) => look.onSelectQualityBadgeScale(Number(e.target.value))}
                aria-label="Quality badge size"
                title="Scale quality badges relative to their default size. 100 is default."
              />
              <span className="xrdb-number-unit">%</span>
            </div>
          </ControlRow>

          {q.shouldShowAgeRatingBadgePosition && q.ageRatingBadgePositionOptions.length > 0 ? (
            <ControlRow label="Age rating position">
              <OptionPills
                options={q.ageRatingBadgePositionOptions}
                value={q.activeAgeRatingBadgePosition}
                onChange={q.onSelectAgeRatingBadgePosition}
              />
            </ControlRow>
          ) : null}

          {q.shouldShowQualityBadgesSide ? (
            <ControlRow label="Badge side">
              <OptionPills
                options={q.qualityBadgeSideOptions}
                value={q.qualityBadgesSide}
                onChange={q.onSelectQualityBadgesSide}
              />
            </ControlRow>
          ) : null}

          <ul className="xrdb-provider-list" role="list">
            {QUALITY_BADGE_OPTIONS.map((badge) => {
              const enabled = q.activeQualityBadgePreferences.includes(badge.id);
              return (
                <li key={badge.id} className="xrdb-provider-row">
                  <button
                    type="button"
                    className={`xrdb-provider-toggle${enabled ? ' xrdb-provider-toggle-on' : ''}`}
                    role="switch"
                    aria-checked={enabled}
                    onClick={() => q.onToggleQualityBadgePreference(badge.id)}
                  >
                    <span className="xrdb-provider-name">{badge.label}</span>
                    <span className="xrdb-provider-status-dot" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>

          {isAdvancedMode ? (
            <>
              <div className="xrdb-panel-header">
                <h2 className="xrdb-subtab-panel-title">Custom badge icons</h2>
              </div>
              {enabledCustomizableBadges.length > 0 ? (
                enabledCustomizableBadges.map((badge) => {
                  const iconUrl = q.qualityBadgeAppearanceOverrides[badge.id]?.iconUrl ?? '';
                  const isLogoOnly = q.qualityBadgeAppearanceOverrides[badge.id]?.fullBadge === true;
                  return (
                    <Fragment key={badge.id}>
                      <ControlRow label={`${badge.label} URL`}>
                        <input
                          type="url"
                          className="xrdb-url-input"
                          value={iconUrl}
                          placeholder="https://example.com/badge.png or https://example.com/badge.svg"
                          onChange={(event) => {
                            const nextUrl = event.target.value.trim();
                            q.onUpdateQualityBadgeAppearanceOverride((current) => {
                              const next = { ...current };
                              if (!nextUrl) {
                                delete next[badge.id];
                                return next;
                              }
                              next[badge.id] = {
                                ...(current[badge.id] ?? {}),
                                iconUrl: nextUrl,
                              };
                              return next;
                            });
                          }}
                          aria-label={`${badge.label} custom icon URL`}
                        />
                      </ControlRow>
                      {iconUrl ? (
                        <ControlRow label="Display">
                          <OptionPills
                            options={[
                              { id: 'text', label: 'Logo + text' },
                              { id: 'icon', label: 'Logo only' },
                            ] as const}
                            value={isLogoOnly ? 'icon' : 'text'}
                            onChange={(mode) => {
                              q.onUpdateQualityBadgeAppearanceOverride((current) => {
                                const existing = current[badge.id];
                                if (!existing?.iconUrl) return current;
                                const next = { ...existing };
                                if (mode === 'icon') {
                                  next.fullBadge = true;
                                } else {
                                  delete next.fullBadge;
                                }
                                return { ...current, [badge.id]: next };
                              });
                            }}
                          />
                        </ControlRow>
                      ) : null}
                    </Fragment>
                  );
                })
              ) : (
                <p className="xrdb-control-description">
                  Enable at least one quality badge to customise its icon URL.
                </p>
              )}
            </>
          ) : null}
        </div>
      );
    }
