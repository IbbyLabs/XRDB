'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';
import { useConfiguratorContext } from '@/lib/configuratorProvider';
import { RATING_PROVIDER_OPTIONS } from '@/lib/ratingProviderCatalog';
import { RATING_STYLE_OPTIONS, ICON_SHAPE_OPTIONS } from '@/lib/ratingAppearance';
import { RATING_VALUE_MODE_OPTIONS } from '@/lib/ratingDisplay';
import { GENRE_BADGE_MODE_OPTIONS, GENRE_BADGE_STYLE_OPTIONS, GENRE_BADGE_POSITION_OPTIONS } from '@/lib/genreBadge';
import { RATING_PRESENTATION_OPTIONS } from '@/lib/ratingPresentation';
import { BACKDROP_RATING_LAYOUT_OPTIONS } from '@/lib/backdropLayoutOptions';

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
          {!allEnabled && (
            <button
              type="button"
              className="xrdb-btn-ghost"
              onClick={() => onSelectAllRatingPreferencesEnabled(true)}
            >
              Enable all
            </button>
          )}
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
      </ControlRow>

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
