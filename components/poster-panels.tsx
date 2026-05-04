'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';
import { useConfiguratorContext } from '@/lib/configuratorProvider';
import { RATING_PROVIDER_OPTIONS } from '@/lib/ratingProviderCatalog';
import { RATING_STYLE_OPTIONS, ICON_SHAPE_OPTIONS, QUALITY_BADGE_STYLE_OPTIONS } from '@/lib/ratingAppearance';
import { POSTER_RATING_LAYOUT_OPTIONS } from '@/lib/posterLayoutOptions';
import { RATING_VALUE_MODE_OPTIONS } from '@/lib/ratingDisplay';
import { GENRE_BADGE_MODE_OPTIONS, GENRE_BADGE_STYLE_OPTIONS, GENRE_BADGE_POSITION_OPTIONS } from '@/lib/genreBadge';
import { SIDE_RATING_POSITION_OPTIONS } from '@/lib/sideRatingPosition';
import { QUALITY_BADGE_OPTIONS } from '@/lib/badgeCustomization';
import { RATING_PRESENTATION_OPTIONS } from '@/lib/ratingPresentation';

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
  const { ratingProviderRows, onToggleRatingPreference, onSelectAllRatingPreferencesEnabled } =
    ctx.inputsPanelProps.providersProps;

  const allEnabled = ratingProviderRows.every((r) => r.enabled);
  const enabledCount = ratingProviderRows.filter((r) => r.enabled).length;

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
        {ratingProviderRows.map((row) => {
          const meta = RATING_PROVIDER_OPTIONS.find((p) => p.id === row.id);
          return (
            <li key={row.id} className="xrdb-provider-row">
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

  return (
    <div className="xrdb-panel-style">
      <h2 className="xrdb-subtab-panel-title">Style</h2>

      <ControlRow label="Presentation">
        <OptionPills
          options={presentationOptions}
          value={pres.activeRatingPresentation}
          onChange={pres.onSelectRatingPresentation}
        />
          <p className="xrdb-control-description">Controls how rating scores are displayed — as a card, an icon with a number, or a compact badge row.</p>
      </ControlRow>

      <ControlRow label="Artwork source">
        <OptionPills
          options={look.activeArtworkSourceOptions}
          value={look.activeArtworkSource}
          onChange={look.onSelectPosterArtworkSource}
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
          <p className="xrdb-control-description">Adds a strip of genre labels to the poster. Choose to highlight the primary genre or show all genres.</p>
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
              <p className="xrdb-control-description">Where on the poster the genre label strip appears.</p>
          </ControlRow>
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
          options={POSTER_RATING_LAYOUT_OPTIONS}
          value={look.posterRatingsLayout}
          onChange={look.onSelectPosterRatingsLayout}
        />
          <p className="xrdb-control-description">How rating badges are arranged on the poster — stacked in corners, side by side, or in a horizontal bar.</p>
      </ControlRow>

      <ControlRow label="Edge offset">
        <div className="xrdb-number-control">
          <input
            type="number"
            className="xrdb-number-input"
            value={look.posterEdgeOffset}
            min={0}
            max={200}
            onChange={(e) => look.onSelectPosterEdgeOffset(Number(e.target.value))}
            aria-label="Edge offset in pixels"
            title="Distance in pixels between badge stacks and the image edge."
          />
          <span className="xrdb-number-unit">px</span>
        </div>
      </ControlRow>

      {look.shouldShowSideRatingPlacement ? (
        <ControlRow label="Side ratings">
          <OptionPills
            options={SIDE_RATING_POSITION_OPTIONS}
            value={look.activeSideRatingsPosition}
            onChange={look.onSelectSideRatingsPosition}
          />
        </ControlRow>
      ) : null}
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
            value={look.posterRatingsMax ?? ''}
            min={1}
            max={40}
            placeholder="Auto"
            onChange={(e) =>
              look.onSelectPosterRatingsMax(e.target.value === '' ? null : Number(e.target.value))
            }
            aria-label="Maximum ratings total"
            title="Maximum number of rating badges to show. Leave blank to let XRDB decide automatically."
          />
        </div>
      </ControlRow>

      <ControlRow label="Max per side">
        <div className="xrdb-number-control">
          <input
            type="number"
            className="xrdb-number-input"
            value={look.posterRatingsMaxPerSide ?? ''}
            min={1}
            max={20}
            placeholder="Auto"
            onChange={(e) =>
              look.onSelectPosterRatingsMaxPerSide(
                e.target.value === '' ? null : Number(e.target.value),
              )
            }
            aria-label="Maximum ratings per side"
            title="Maximum badges on each side of the image when using side layout."
          />
        </div>
      </ControlRow>

      <ControlRow label="Image size">
        <OptionPills
          options={look.posterImageSizeOptions}
          value={look.posterImageSize}
          onChange={look.onSelectPosterImageSize}
        />
        {look.activePosterImageSizeDescription ? (
          <p className="xrdb-control-description">{look.activePosterImageSizeDescription}</p>
        ) : null}
      </ControlRow>

      <ControlRow label="Black bar" inline>
        <button
          type="button"
          role="switch"
          aria-checked={look.activeBlackBarEnabled}
          className={`xrdb-toggle${look.activeBlackBarEnabled ? ' xrdb-toggle-on' : ''}`}
          onClick={look.onToggleBlackBar}
                  title="Adds a semi-transparent bar behind rating badges to improve readability on bright or textured images."
        >
          {look.activeBlackBarEnabled ? 'On' : 'Off'}
        </button>
      </ControlRow>

      {look.activeArtworkSource === 'random' ? (
        <>
          <ControlRow label="Random text">
            <OptionPills
              options={[
                { id: 'any' as const, label: 'Any' },
                { id: 'text' as const, label: 'Text' },
                { id: 'textless' as const, label: 'Textless' },
              ]}
              value={look.randomPosterText}
              onChange={look.onSelectRandomPosterText}
            />
          </ControlRow>

          <ControlRow label="Random language">
            <OptionPills
              options={[
                { id: 'any' as const, label: 'Any' },
                { id: 'requested' as const, label: 'Requested' },
                { id: 'fallback' as const, label: 'Fallback' },
              ]}
              value={look.randomPosterLanguage}
              onChange={look.onSelectRandomPosterLanguage}
            />
          </ControlRow>

          <ControlRow label="Random fallback">
            <OptionPills
              options={[
                { id: 'best' as const, label: 'Best match' },
                { id: 'original' as const, label: 'Original' },
              ]}
              value={look.randomPosterFallback}
              onChange={look.onSelectRandomPosterFallback}
            />
          </ControlRow>

          <ControlRow label="Min votes">
            <div className="xrdb-number-control">
              <input
                type="number"
                className="xrdb-number-input"
                value={look.randomPosterMinVoteCount ?? ''}
                min={0}
                placeholder="Any"
                onChange={(e) =>
                  look.onSelectRandomPosterMinVoteCount(
                    e.target.value === '' ? null : Number(e.target.value),
                  )
                }
                aria-label="Minimum vote count"
              />
            </div>
          </ControlRow>
        </>
      ) : null}
    </div>
  );
}
export function QualityPanel() {
  const ctx = useConfiguratorContext();
  const q = ctx.inputsPanelProps.qualityProps;

  const allEnabled = q.activeQualityBadgePreferences.length === QUALITY_BADGE_OPTIONS.length;
  const enabledCount = q.activeQualityBadgePreferences.length;

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

      {q.shouldShowQualityBadgesPosition ? (
        <ControlRow label="Badge position">
          <OptionPills
            options={q.qualityBadgePositionOptions}
            value={q.posterQualityBadgesPosition}
            onChange={q.onSelectPosterQualityBadgePosition}
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
    </div>
  );
}