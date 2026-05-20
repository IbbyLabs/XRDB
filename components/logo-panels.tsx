'use client';

import Image from 'next/image';
import { Fragment, type DragEvent, type ReactNode, useRef } from 'react';
import { useConfiguratorContext } from '@/lib/configuratorProvider';
import { RATING_PROVIDER_OPTIONS } from '@/lib/ratingProviderCatalog';
import {
  AGGREGATE_ACCENT_MODE_OPTIONS,
  AGGREGATE_RATING_SOURCE_OPTIONS,
  MAX_AGGREGATE_ACCENT_BAR_OFFSET,
  MIN_AGGREGATE_ACCENT_BAR_OFFSET,
  RATING_PRESENTATION_OPTIONS,
} from '@/lib/ratingPresentation';
import { DynamicStopsEditor } from '@/components/dynamic-stops-editor';
import { QUALITY_BADGE_STYLE_OPTIONS, RATING_STYLE_OPTIONS, ICON_SHAPE_OPTIONS } from '@/lib/ratingAppearance';
import { QUALITY_BADGE_OPTIONS } from '@/lib/badgeCustomization';
import { COMMUNITY_BADGE_THEME_OPTIONS } from '@/lib/communityBadgeTheme';
import { RATING_VALUE_MODE_OPTIONS } from '@/lib/ratingDisplay';

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
  const { ratingProviderRows, onReorderRatingPreference, onToggleRatingPreference, onSelectAllRatingPreferencesEnabled } =
    ctx.inputsPanelProps.providersProps;
  const dragFromIndexRef = useRef<number | null>(null);

  const allEnabled = ratingProviderRows.every((r) => r.enabled);
  const enabledCount = ratingProviderRows.filter((r) => r.enabled).length;

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

  const logoBackgroundOptions = [
    { id: 'transparent' as const, label: 'Transparent' },
    { id: 'dark' as const, label: 'Dark' },
  ];

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
          options={look.logoArtworkSourceOptions}
          value={look.activeArtworkSource}
          onChange={look.onSelectLogoArtworkSource}
        />
        {look.activeArtworkSourceDescription ? (
          <p className="xrdb-control-description">{look.activeArtworkSourceDescription}</p>
        ) : null}
      </ControlRow>

      <ControlRow label="Background">
        <OptionPills
          options={logoBackgroundOptions}
          value={look.logoBackground}
          onChange={look.onSelectLogoBackground}
        />
      </ControlRow>

      <ControlRow label="Quality badge style">
        <OptionPills
          options={QUALITY_BADGE_STYLE_OPTIONS}
          value={look.logoQualityBadgesStyle}
          onChange={look.onSelectLogoQualityBadgesStyle}
        />
      </ControlRow>

      <ControlRow label="Rating style">
        <OptionPills
          options={RATING_STYLE_OPTIONS}
          value={look.activeRatingStyle}
          onChange={look.onSelectRatingStyle}
        />
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
    </div>
  );
}

export function PositionPanel() {
  const ctx = useConfiguratorContext();
  const look = ctx.inputsPanelProps.lookProps;

  return (
    <div className="xrdb-panel-position">
      <h2 className="xrdb-subtab-panel-title">Position</h2>

      <p className="xrdb-panel-note">Logo layout is determined by aspect ratio. No manual positioning available.</p>

      <ControlRow label="Bottom row" inline>
        <button
          type="button"
          role="switch"
          aria-checked={look.logoBottomRatingsRow}
          className={`xrdb-toggle${look.logoBottomRatingsRow ? ' xrdb-toggle-on' : ''}`}
          onClick={look.onToggleLogoBottomRatingsRow}
        >
          {look.logoBottomRatingsRow ? 'On' : 'Off'}
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

      <ControlRow label="Max ratings">
        <div className="xrdb-number-control">
          <input
            type="number"
            className="xrdb-number-input"
            value={look.logoRatingsMax ?? ''}
            min={1}
            max={40}
            placeholder="Auto"
            onChange={(e) =>
              look.onSelectLogoRatingsMax(e.target.value === '' ? null : Number(e.target.value))
            }
            aria-label="Maximum ratings"
            title="Maximum number of rating badges to show. Leave blank to let XRDB decide automatically."
          />
        </div>
      </ControlRow>

      <ControlRow label="Max quality badges">
        <div className="xrdb-number-control">
          <input
            type="number"
            className="xrdb-number-input"
            value={look.logoQualityBadgesMax ?? ''}
            min={0}
            max={20}
            placeholder="Auto"
            onChange={(e) =>
              look.onSelectLogoQualityBadgesMax(e.target.value === '' ? null : Number(e.target.value))
            }
            aria-label="Maximum quality badges"
            title="Maximum number of quality badges (resolution, format) to show."
          />
        </div>
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
      const look = ctx.inputsPanelProps.lookProps;
      const q = ctx.inputsPanelProps.qualityProps;
      const isAdvancedMode = ctx.experienceMode === 'advanced';

      const enabledCount = look.logoQualityBadgePreferences.length;
      const customizableBadgeOptions = QUALITY_BADGE_OPTIONS.filter(
        (badge) => badge.id !== 'certification' && badge.id !== 'releasestatus',
      );
      const enabledCustomizableBadges = customizableBadgeOptions.filter((badge) =>
        look.logoQualityBadgePreferences.includes(badge.id),
      );

      return (
        <div className="xrdb-panel-quality">
          <div className="xrdb-panel-header">
            <h2 className="xrdb-subtab-panel-title">Quality badges</h2>
            <div className="xrdb-panel-header-actions">
              <span className="xrdb-panel-summary">{enabledCount} of {QUALITY_BADGE_OPTIONS.length} enabled</span>
            </div>
          </div>

          <ControlRow label="Badge style">
            <OptionPills
              options={QUALITY_BADGE_STYLE_OPTIONS}
              value={look.logoQualityBadgesStyle}
              onChange={look.onSelectLogoQualityBadgesStyle}
            />
          </ControlRow>

          {look.logoQualityBadgesStyle === 'community-badge' ? (
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
                value={look.logoQualityBadgesMax ?? ''}
                min={0}
                max={20}
                placeholder="Auto"
                onChange={(e) =>
                  look.onSelectLogoQualityBadgesMax(e.target.value === '' ? null : Number(e.target.value))
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

          <ul className="xrdb-provider-list" role="list">
            {QUALITY_BADGE_OPTIONS.map((badge) => {
              const enabled = look.logoQualityBadgePreferences.includes(badge.id);
              return (
                <li key={badge.id} className="xrdb-provider-row">
                  <button
                    type="button"
                    className={`xrdb-provider-toggle${enabled ? ' xrdb-provider-toggle-on' : ''}`}
                    role="switch"
                    aria-checked={enabled}
                    onClick={() => look.onToggleQualityBadgePreference(badge.id)}
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
