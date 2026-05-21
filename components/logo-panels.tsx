'use client';

import Image from 'next/image';
import { Fragment, type DragEvent, type ReactNode, useRef } from 'react';
import { useConfiguratorContext } from '@/lib/configuratorProvider';
import { ControlPopupDialog } from '@/components/control-popup-dialog';
import { RATING_PROVIDER_OPTIONS, type RatingPreference } from '@/lib/ratingProviderCatalog';
import {
  AGGREGATE_ACCENT_MODE_OPTIONS,
  AGGREGATE_RATING_SOURCE_OPTIONS,
  MAX_AGGREGATE_ACCENT_BAR_OFFSET,
  MIN_AGGREGATE_ACCENT_BAR_OFFSET,
  RATING_PRESENTATION_OPTIONS,
} from '@/lib/ratingPresentation';
import { DynamicStopsEditor } from '@/components/dynamic-stops-editor';
import { QUALITY_BADGE_STYLE_OPTIONS, RATING_STYLE_OPTIONS, ICON_SHAPE_OPTIONS } from '@/lib/ratingAppearance';
import { SCOREBAR_STYLE_OPTIONS } from '@/lib/scorebarConfig';
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

function PanelSection({
  heading,
  description,
  children,
}: {
  heading: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="xrdb-panel-section">
      <div className="xrdb-panel-section-header">
        <h3 className="xrdb-panel-section-heading">{heading}</h3>
        {description ? (
          <p className="xrdb-panel-section-description">{description}</p>
        ) : null}
      </div>
      <div className="xrdb-panel-section-content">
        {children}
      </div>
    </div>
  );
}

export function ProvidersPanel() {
  const ctx = useConfiguratorContext();
  const ui = ctx.workspaceUiProps;
  const { ratingProviderRows, onReorderRatingPreference, onToggleRatingPreference, onSelectAllRatingPreferencesEnabled } =
    ctx.inputsPanelProps.providersProps;
  const dragFromIndexRef = useRef<number | null>(null);
  const providerPopupId = 'logo-provider-tuning';
  const topProviderIds: RatingPreference[] = ['tmdb', 'mdblist', 'imdb'];

  const allEnabled = ratingProviderRows.every((r) => r.enabled);
  const enabledCount = ratingProviderRows.filter((r) => r.enabled).length;
  const ratingsEnabled = enabledCount > 0;
  const topProviderRows = topProviderIds
    .map((id) => ratingProviderRows.find((row) => row.id === id))
    .filter((row): row is (typeof ratingProviderRows)[number] => row !== undefined);

  const handleEnableTopProviders = () => {
    onSelectAllRatingPreferencesEnabled(false);
    topProviderRows.forEach((row) => {
      if (!row.enabled) {
        onToggleRatingPreference(row.id);
      }
    });
  };

  const handleToggleRatings = () => {
    if (ratingsEnabled) {
      onSelectAllRatingPreferencesEnabled(false);
      return;
    }
    handleEnableTopProviders();
  };

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
        </div>
      </div>

      <ControlRow label="Ratings" inline>
        <button
          type="button"
          role="switch"
          aria-checked={ratingsEnabled}
          className={`xrdb-toggle${ratingsEnabled ? ' xrdb-toggle-on' : ''}`}
          onClick={handleToggleRatings}
        >
          {ratingsEnabled ? 'On' : 'Off'}
        </button>
        <p className="xrdb-control-description">When on, top providers turn on by default and presentation controls become available.</p>
      </ControlRow>

      {ratingsEnabled ? (
        <ControlRow label="Top providers">
          <div className="xrdb-option-pills" role="group" aria-label="Top provider quick toggles">
            {topProviderRows.map((row) => {
              const meta = RATING_PROVIDER_OPTIONS.find((p) => p.id === row.id);
              return (
                <button
                  key={row.id}
                  type="button"
                  className={`xrdb-option-pill${row.enabled ? ' xrdb-option-pill-active' : ''}`}
                  aria-pressed={row.enabled}
                  onClick={() => onToggleRatingPreference(row.id)}
                >
                  {meta?.label ?? row.id}
                </button>
              );
            })}
          </div>
        </ControlRow>
      ) : null}

      <button
        type="button"
        className="xrdb-btn-ghost"
        onClick={() => ui.openControlPopup(providerPopupId)}
        aria-label="Open provider tuning"
      >
        Open provider tuning
      </button>

      <ControlPopupDialog
        open={ui.activeControlPopupId === providerPopupId}
        title="Provider tuning"
        description="Enable providers, reorder preference, and tune source priority."
        onClose={ui.closeControlPopup}
      >
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
      </ControlPopupDialog>
    </div>
  );
}
export function StylePanel() {
  const ctx = useConfiguratorContext();
  const look = ctx.inputsPanelProps.lookProps;
  const pres = ctx.inputsPanelProps.presentationProps;
  const { ratingProviderRows, onToggleRatingPreference, onSelectAllRatingPreferencesEnabled } =
    ctx.inputsPanelProps.providersProps;
  const ui = ctx.workspaceUiProps;

  const presentationPopupId = 'logo-style-presentation';
  const aggregatePopupId = 'logo-style-aggregate';
  const scorebarPopupId = 'logo-style-scorebar';
  const appearancePopupId = 'logo-style-appearance';
  const topProviderIds: RatingPreference[] = ['tmdb', 'mdblist', 'imdb'];
  const ratingsEnabled = ratingProviderRows.some((row) => row.enabled);

  const topProviderRows = topProviderIds
    .map((id) => ratingProviderRows.find((row) => row.id === id))
    .filter((row): row is (typeof ratingProviderRows)[number] => row !== undefined);

  const handleEnableTopProviders = () => {
    onSelectAllRatingPreferencesEnabled(false);
    topProviderRows.forEach((row) => {
      if (!row.enabled) {
        onToggleRatingPreference(row.id);
      }
    });
  };

  const handleToggleRatings = () => {
    if (ratingsEnabled) {
      onSelectAllRatingPreferencesEnabled(false);
      return;
    }
    handleEnableTopProviders();
  };

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

      <PanelSection
        heading="Presentation and display"
        description="Controls how rating scores are displayed and the overall visual appearance of the logo."
      >
        <ControlRow label="Presentation" inline>
          <button
            type="button"
            className="xrdb-btn-ghost"
            onClick={() => ui.openControlPopup(presentationPopupId)}
            aria-label="Open presentation tuning"
            disabled={!ratingsEnabled}
          >
            Open presentation
          </button>
        </ControlRow>

        {ratingsEnabled && pres.usesAggregatePresentation ? (
          <ControlRow label="Aggregate tuning" inline>
            <button
              type="button"
              className="xrdb-btn-ghost"
              onClick={() => ui.openControlPopup(aggregatePopupId)}
              aria-label="Open advanced aggregate tuning"
            >
              Open advanced
            </button>
          </ControlRow>
        ) : null}

        {ratingsEnabled && pres.activeRatingPresentation === 'scorebar' ? (
          <ControlRow label="Scorebar tuning" inline>
            <button
              type="button"
              className="xrdb-btn-ghost"
              onClick={() => ui.openControlPopup(scorebarPopupId)}
              aria-label="Open advanced scorebar tuning"
            >
              Open advanced
            </button>
          </ControlRow>
        ) : null}

        <ControlRow label="Appearance tuning" inline>
          <button
            type="button"
            className="xrdb-btn-ghost"
            onClick={() => ui.openControlPopup(appearancePopupId)}
            aria-label="Open advanced appearance tuning"
            disabled={!ratingsEnabled}
          >
            Open advanced
          </button>
        </ControlRow>

        {!ratingsEnabled ? (
          <p className="xrdb-control-description">Enable Ratings in Providers to unlock style controls.</p>
        ) : null}
      </PanelSection>

      <ControlPopupDialog
        open={ui.activeControlPopupId === presentationPopupId}
        title="Presentation tuning"
        description="Choose how ratings are displayed on the logo."
        onClose={ui.closeControlPopup}
      >
        <ControlRow label="Presentation">
          <OptionPills
            options={presentationOptions}
            value={pres.activeRatingPresentation}
            onChange={pres.onSelectRatingPresentation}
          />
        </ControlRow>
      </ControlPopupDialog>

      <ControlPopupDialog
        open={ratingsEnabled && ui.activeControlPopupId === aggregatePopupId}
        title="Aggregate tuning"
        description="Advanced controls for aggregate presentation behaviour."
        onClose={ui.closeControlPopup}
      >
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
      </ControlPopupDialog>

      <ControlPopupDialog
        open={ratingsEnabled && ui.activeControlPopupId === scorebarPopupId}
        title="Scorebar tuning"
        description="Advanced controls for scorebar colours and thresholds."
        onClose={ui.closeControlPopup}
      >
        <ControlRow label="Bar style">
          <OptionPills
            options={SCOREBAR_STYLE_OPTIONS}
            value={look.scorebarStyle}
            onChange={look.onSelectScorebarStyle}
          />
        </ControlRow>
        <ControlRow label="Low colour">
          <div className="xrdb-color-control">
            <input
              type="color"
              className="xrdb-color-input"
              value={look.scorebarLowColor}
              onChange={(e) => look.onSelectScorebarLowColor(e.target.value)}
              aria-label="Scorebar low colour"
              title="Colour for scores below the low threshold."
            />
            <span className="xrdb-color-value">{look.scorebarLowColor}</span>
          </div>
        </ControlRow>
        <ControlRow label="Mid colour">
          <div className="xrdb-color-control">
            <input
              type="color"
              className="xrdb-color-input"
              value={look.scorebarMidColor}
              onChange={(e) => look.onSelectScorebarMidColor(e.target.value)}
              aria-label="Scorebar mid colour"
              title="Colour for scores between the low and high thresholds."
            />
            <span className="xrdb-color-value">{look.scorebarMidColor}</span>
          </div>
        </ControlRow>
        <ControlRow label="High colour">
          <div className="xrdb-color-control">
            <input
              type="color"
              className="xrdb-color-input"
              value={look.scorebarHighColor}
              onChange={(e) => look.onSelectScorebarHighColor(e.target.value)}
              aria-label="Scorebar high colour"
              title="Colour for scores at or above the high threshold."
            />
            <span className="xrdb-color-value">{look.scorebarHighColor}</span>
          </div>
        </ControlRow>
        <ControlRow label="Low threshold">
          <div className="xrdb-number-control">
            <input
              type="number"
              className="xrdb-number-input"
              value={look.scorebarLowThreshold}
              min={0}
              max={100}
              onChange={(e) => look.onSelectScorebarLowThreshold(Number(e.target.value))}
              aria-label="Scorebar low threshold"
              title="Scores below this value use the low colour."
            />
            <span className="xrdb-number-unit">%</span>
          </div>
        </ControlRow>
        <ControlRow label="High threshold">
          <div className="xrdb-number-control">
            <input
              type="number"
              className="xrdb-number-input"
              value={look.scorebarHighThreshold}
              min={0}
              max={100}
              onChange={(e) => look.onSelectScorebarHighThreshold(Number(e.target.value))}
              aria-label="Scorebar high threshold"
              title="Scores at or above this value use the high colour."
            />
            <span className="xrdb-number-unit">%</span>
          </div>
        </ControlRow>
      </ControlPopupDialog>

      <ControlPopupDialog
        open={ui.activeControlPopupId === appearancePopupId}
        title="Appearance tuning"
        description="Advanced controls for source, style, and rating visual behaviour."
        onClose={ui.closeControlPopup}
      >
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

        {ratingsEnabled ? (
          <ControlRow label="Quality badge style">
            <OptionPills
              options={QUALITY_BADGE_STYLE_OPTIONS}
              value={look.logoQualityBadgesStyle}
              onChange={look.onSelectLogoQualityBadgesStyle}
            />
          </ControlRow>
        ) : null}

        {ratingsEnabled ? (
          <ControlRow label="Rating style">
            <OptionPills
              options={RATING_STYLE_OPTIONS}
              value={look.activeRatingStyle}
              onChange={look.onSelectRatingStyle}
            />
          </ControlRow>
        ) : null}

        {ratingsEnabled ? (
          <ControlRow label="Rating values">
            <OptionPills
              options={RATING_VALUE_MODE_OPTIONS}
              value={look.ratingValueMode}
              onChange={look.onSelectRatingValueMode}
            />
          </ControlRow>
        ) : null}

        {ratingsEnabled ? (
          <ControlRow label="Icon shape">
            <OptionPills
              options={ICON_SHAPE_OPTIONS}
              value={look.iconShape}
              onChange={look.onSelectIconShape}
            />
          </ControlRow>
        ) : null}
      </ControlPopupDialog>
    </div>
  );
}

export function PositionPanel() {
  const ctx = useConfiguratorContext();
  const look = ctx.inputsPanelProps.lookProps;
  const { ratingProviderRows } = ctx.inputsPanelProps.providersProps;
  const ui = ctx.workspaceUiProps;
  const positionPopupId = 'logo-position-placement';
  const ratingsEnabled = ratingProviderRows.some((row) => row.enabled);

  return (
    <div className="xrdb-panel-position">
      <h2 className="xrdb-subtab-panel-title">Position</h2>

      <ControlRow label="Rating position" inline>
        <button
          type="button"
          className="xrdb-btn-ghost"
          onClick={() => ui.openControlPopup(positionPopupId)}
          aria-label="Open rating position settings"
          disabled={!ratingsEnabled}
        >
          Configure
        </button>
        {!ratingsEnabled ? (
          <p className="xrdb-control-description">Enable Ratings in Providers to unlock position controls.</p>
        ) : null}
      </ControlRow>

      <ControlPopupDialog
        open={ratingsEnabled && ui.activeControlPopupId === positionPopupId}
        title="Rating position"
        description="Badge row and size options for logo artwork. Layout is determined by aspect ratio."
        onClose={ui.closeControlPopup}
      >
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
      </ControlPopupDialog>
    </div>
  );
}

export function AdvancedPanel() {
  const ctx = useConfiguratorContext();
  const look = ctx.inputsPanelProps.lookProps;
  const ui = ctx.workspaceUiProps;
  const limitsPopupId = 'logo-advanced-limits';

  return (
    <div className="xrdb-panel-advanced">
      <h2 className="xrdb-subtab-panel-title">Advanced</h2>

      <PanelSection
        heading="Artwork behavior"
        description="Control readability helpers and optional badge limits for logo output."
      >
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

        <ControlRow label="Rating limits" inline>
          <button
            type="button"
            className="xrdb-btn-ghost"
            onClick={() => ui.openControlPopup(limitsPopupId)}
            aria-label="Open advanced rating limits"
          >
            Open advanced
          </button>
        </ControlRow>
      </PanelSection>

      <ControlPopupDialog
        open={ui.activeControlPopupId === limitsPopupId}
        title="Rating limits"
        description="Advanced controls for optional badge limits. Leave fields blank for automatic behavior."
        onClose={ui.closeControlPopup}
      >
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
      </ControlPopupDialog>
    </div>
  );
}

export function QualityPanel() {
  const ctx = useConfiguratorContext();
  const look = ctx.inputsPanelProps.lookProps;
  const q = ctx.inputsPanelProps.qualityProps;
  const ui = ctx.workspaceUiProps;
  const isAdvancedMode = ctx.experienceMode === 'advanced';
  const stylePopupId = 'logo-quality-style';
  const customIconsPopupId = 'logo-quality-custom-icons';

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

      <ControlRow label="Badge style" inline>
        <button
          type="button"
          className="xrdb-btn-ghost"
          onClick={() => ui.openControlPopup(stylePopupId)}
          aria-label="Open badge style settings"
        >
          Configure
        </button>
      </ControlRow>

      {isAdvancedMode ? (
        <ControlRow label="Custom icons" inline>
          <button
            type="button"
            className="xrdb-btn-ghost"
            onClick={() => ui.openControlPopup(customIconsPopupId)}
            aria-label="Open custom badge icon settings"
          >
            Configure
          </button>
        </ControlRow>
      ) : null}

      <ControlPopupDialog
        open={ui.activeControlPopupId === stylePopupId}
        title="Badge style"
        description="Style, theme, sizing, and limits for quality badges on logo artwork."
        onClose={ui.closeControlPopup}
      >
        <ControlRow label="Style">
          <OptionPills
            options={QUALITY_BADGE_STYLE_OPTIONS}
            value={look.logoQualityBadgesStyle}
            onChange={look.onSelectLogoQualityBadgesStyle}
          />
        </ControlRow>

        {look.logoQualityBadgesStyle === 'community-badge' ? (
          <ControlRow label="Theme">
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
      </ControlPopupDialog>

      <ControlPopupDialog
        open={ui.activeControlPopupId === customIconsPopupId}
        title="Custom badge icons"
        description="Advanced controls for icon URLs and display mode on enabled quality badges."
        onClose={ui.closeControlPopup}
      >
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
      </ControlPopupDialog>
    </div>
  );
}
