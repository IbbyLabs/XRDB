'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';
import { useConfiguratorContext } from '@/lib/configuratorProvider';
import { RATING_PROVIDER_OPTIONS } from '@/lib/ratingProviderCatalog';
import { QUALITY_BADGE_STYLE_OPTIONS, RATING_STYLE_OPTIONS, ICON_SHAPE_OPTIONS } from '@/lib/ratingAppearance';
import { QUALITY_BADGE_OPTIONS } from '@/lib/badgeCustomization';
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

  const logoBackgroundOptions = [
    { id: 'transparent' as const, label: 'Transparent' },
    { id: 'dark' as const, label: 'Dark' },
  ];

  return (
    <div className="xrdb-panel-style">
      <h2 className="xrdb-subtab-panel-title">Style</h2>

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

      const enabledCount = look.logoQualityBadgePreferences.length;

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
        </div>
      );
    }
