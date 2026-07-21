'use client';

import { Check, AlertCircle } from 'lucide-react';
import type { ConfigState, UpdateConfigFn } from './configurator-types';
import {
  ARTWORK_OPTIONS, SIZE_OPTIONS, TEXT_PREF_OPTIONS, LANG_OPTIONS,
  AGE_POS_OPTIONS, SIX_POS_OPTIONS, GENRE_POS_OPTIONS, QUALITY_BADGE_OPTIONS, TREND_STYLE_OPTIONS,
} from './configurator-types';
import { QualityFine, GenreFine, AggregateFine, AgeFine, TrendingFine } from './configurator-fine';

// ── Notice ────────────────────────────────────────────────────────────────────

export function Notice({
  type, message, onDismiss, actionLabel, onAction,
}: {
  type: 'error' | 'success' | 'info';
  message: string;
  onDismiss?: () => void;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div
      className={`notice notice-${type}`}
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
    >
      {type === 'error'
        ? <AlertCircle size={14} aria-hidden />
        : <Check size={14} aria-hidden />}
      <span style={{ flex: 1 }}>{message}</span>
      {actionLabel && onAction && (
        <button onClick={onAction} className="btn btn-ghost btn-sm">
          {actionLabel}
        </button>
      )}
      {onDismiss && (
        <button onClick={onDismiss} className="notice-dismiss" aria-label="Dismiss">
          <span aria-hidden>×</span>
        </button>
      )}
    </div>
  );
}

// ── Field ─────────────────────────────────────────────────────────────────────

export function Field({ label, hint, htmlFor, children }: {
  label: string; hint?: string; htmlFor?: string; children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

// ── Toggle row ────────────────────────────────────────────────────────────────

function ToggleRow({ label, hint, checked, onChange }: {
  label: string; hint: string; checked: boolean; onChange: () => void;
}) {
  return (
    <div className="toggle-row">
      <div>
        <span className="label" style={{ marginBottom: 0 }}>{label}</span>
        <span className="hint" style={{ marginTop: 0 }}>{hint}</span>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        className={`toggle${checked ? ' toggle--on' : ''}`}
        onClick={onChange}
        aria-label={`Toggle ${label.toLowerCase()}`}
      >
        <span className="toggle-thumb" />
      </button>
    </div>
  );
}

// ── DisplayPanel ──────────────────────────────────────────────────────────────

interface DisplayPanelProps {
  uid: string;
  mediaType: string;
  config: ConfigState;
  onUpdate: UpdateConfigFn;
  onToggleBadge: (b: string) => void;
  onReset: () => void;
  /** Reveals the per-badge scale, offset and colour controls in place. */
  fine: boolean;
}

export function DisplayPanel({ uid, mediaType, config, onUpdate, onToggleBadge, onReset, fine }: DisplayPanelProps) {
  return (
    <div className="panel">
      <div className="panel-body cfg-fields">

        <Field
          label="Artwork source"
          htmlFor={`${uid}-artwork`}
          hint={ARTWORK_OPTIONS.find(o => o.id === config.artworkSource)?.desc}
        >
          <select
            id={`${uid}-artwork`}
            className="select"
            value={config.artworkSource}
            onChange={e => onUpdate('artworkSource', e.target.value)}
          >
            {ARTWORK_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </Field>

        {config.artworkSource === 'random' && (
          <fieldset style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 'var(--sp-3)', margin: 0 }}>
            <legend className="label" style={{ padding: '0 var(--sp-1)' }}>Random filters</legend>
            <div className="cfg-fields">
              <Field label="Text" htmlFor={`${uid}-rp-text`}>
                <select id={`${uid}-rp-text`} className="select" value={config.randomPosterText}
                  onChange={e => onUpdate('randomPosterText', e.target.value)} style={{ maxWidth: '10rem' }}>
                  <option value="any">Any</option>
                  <option value="text">With text</option>
                  <option value="textless">Textless</option>
                </select>
              </Field>
              <Field label="Language" htmlFor={`${uid}-rp-lang`}>
                <select id={`${uid}-rp-lang`} className="select" value={config.randomPosterLanguage}
                  onChange={e => onUpdate('randomPosterLanguage', e.target.value)} style={{ maxWidth: '10rem' }}>
                  <option value="any">Any</option>
                  <option value="requested">Requested only</option>
                </select>
              </Field>
              <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                <Field label="Min votes" htmlFor={`${uid}-rp-vc`}>
                  <input id={`${uid}-rp-vc`} className="input" type="number" inputMode="numeric" min={0}
                    value={config.randomPosterMinVoteCount || ''} placeholder="0" style={{ maxWidth: '7rem' }}
                    onChange={e => onUpdate('randomPosterMinVoteCount', e.target.value === '' ? 0 : Number(e.target.value))} />
                </Field>
                <Field label="Min score" htmlFor={`${uid}-rp-va`}>
                  <input id={`${uid}-rp-va`} className="input" type="number" inputMode="decimal" min={0} max={10} step={0.5}
                    value={config.randomPosterMinVoteAverage || ''} placeholder="0" style={{ maxWidth: '7rem' }}
                    onChange={e => onUpdate('randomPosterMinVoteAverage', e.target.value === '' ? 0 : Number(e.target.value))} />
                </Field>
              </div>
              <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                <Field label="Min width" htmlFor={`${uid}-rp-w`}>
                  <input id={`${uid}-rp-w`} className="input" type="number" inputMode="numeric" min={0}
                    value={config.randomPosterMinWidth || ''} placeholder="0" style={{ maxWidth: '7rem' }}
                    onChange={e => onUpdate('randomPosterMinWidth', e.target.value === '' ? 0 : Number(e.target.value))} />
                </Field>
                <Field label="Min height" htmlFor={`${uid}-rp-h`}>
                  <input id={`${uid}-rp-h`} className="input" type="number" inputMode="numeric" min={0}
                    value={config.randomPosterMinHeight || ''} placeholder="0" style={{ maxWidth: '7rem' }}
                    onChange={e => onUpdate('randomPosterMinHeight', e.target.value === '' ? 0 : Number(e.target.value))} />
                </Field>
              </div>
              <Field label="Fallback" htmlFor={`${uid}-rp-fb`} hint="When nothing passes the filters.">
                <select id={`${uid}-rp-fb`} className="select" value={config.randomPosterFallback}
                  onChange={e => onUpdate('randomPosterFallback', e.target.value)} style={{ maxWidth: '10rem' }}>
                  <option value="best">Best rated</option>
                  <option value="original">Original pick</option>
                </select>
              </Field>
            </div>
          </fieldset>
        )}

        {(mediaType === 'thumbnail' || mediaType === 'backdrop') && (
          <Field
            label="Episode artwork"
            htmlFor={`${uid}-episode-art`}
            hint="What a TV episode uses: its own still, the series artwork, or the streaming thumbnail."
          >
            <select
              id={`${uid}-episode-art`}
              className="select"
              value={config.episodeArtworkMode}
              onChange={e => onUpdate('episodeArtworkMode', e.target.value)}
            >
              <option value="still">Episode still</option>
              <option value="series">Series artwork</option>
              <option value="streaming">Streaming thumbnail</option>
            </select>
          </Field>
        )}

        <Field label="Resolution" htmlFor={`${uid}-size`}>
          <select
            id={`${uid}-size`}
            className="select"
            value={config.size}
            onChange={e => onUpdate('size', e.target.value)}
          >
            {SIZE_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </Field>

        <Field label="Language" htmlFor={`${uid}-lang`} hint="Preferred language for posters and metadata">
          <select
            id={`${uid}-lang`}
            className="select"
            value={config.language}
            onChange={e => onUpdate('language', e.target.value)}
          >
            {LANG_OPTIONS.map(o => <option key={o} value={o}>{o.toUpperCase()}</option>)}
          </select>
        </Field>

        <Field
          label="Text on poster"
          htmlFor={`${uid}-text`}
          hint={TEXT_PREF_OPTIONS.find(o => o.id === config.textPreference)?.desc}
        >
          <select
            id={`${uid}-text`}
            className="select"
            value={config.textPreference}
            onChange={e => onUpdate('textPreference', e.target.value)}
          >
            {TEXT_PREF_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </Field>

        {mediaType === 'poster' && (
          <ToggleRow
            label="Use backdrop as poster"
            hint="Center-crop the backdrop image instead of the standard poster"
            checked={config.backdropAsPoster}
            onChange={() => onUpdate('backdropAsPoster', !config.backdropAsPoster)}
          />
        )}

        {mediaType === 'logo' && (
          <Field
            label="Logo background"
            htmlFor={`${uid}-logo-bg`}
            hint="A dark panel fills the transparent canvas so a light wordmark reads on a pale background."
          >
            <select
              id={`${uid}-logo-bg`}
              className="select"
              value={config.logoBackground}
              onChange={e => onUpdate('logoBackground', e.target.value)}
            >
              <option value="transparent">Transparent</option>
              <option value="dark">Dark panel</option>
            </select>
          </Field>
        )}

        <ToggleRow
          label="Age rating badge"
          hint="Show content rating in corner"
          checked={config.ageRating}
          onChange={() => onUpdate('ageRating', !config.ageRating)}
        />

        <ToggleRow
          label="Release status badge"
          hint="Mark films that are in cinemas or out on digital"
          checked={config.releaseStatus}
          onChange={() => onUpdate('releaseStatus', !config.releaseStatus)}
        />

        {config.releaseStatus && (
          <Field label="Release badge position" htmlFor={`${uid}-relpos`}>
            <select
              id={`${uid}-relpos`}
              className="select"
              value={config.releaseStatusPos}
              onChange={e => onUpdate('releaseStatusPos', e.target.value)}
            >
              {SIX_POS_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </Field>
        )}

        {config.ageRating && (
          <>
            <Field label="Age badge position" htmlFor={`${uid}-agepos`}>
              <select
                id={`${uid}-agepos`}
                className="select"
                value={config.ageRatingPos}
                onChange={e => onUpdate('ageRatingPos', e.target.value)}
              >
                {AGE_POS_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </Field>
            {fine && <AgeFine uid={uid} config={config} onUpdate={onUpdate} />}
          </>
        )}

        <ToggleRow
          label="Genre badge"
          hint="Show primary genres on the artwork"
          checked={config.genre}
          onChange={() => onUpdate('genre', !config.genre)}
        />

        {config.genre && (
          <>
            <Field label="Genre position" htmlFor={`${uid}-genrepos`}>
              <select
                id={`${uid}-genrepos`}
                className="select"
                value={config.genrePos}
                onChange={e => onUpdate('genrePos', e.target.value)}
              >
                {GENRE_POS_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </Field>
            {fine && <GenreFine uid={uid} config={config} onUpdate={onUpdate} />}
          </>
        )}

        <ToggleRow
          label="Where to watch"
          hint="Show streaming provider chips (Netflix, Prime…)"
          checked={config.providers}
          onChange={() => onUpdate('providers', !config.providers)}
        />

        {config.providers && (
          <>
            <Field
              label="Provider country"
              htmlFor={`${uid}-provider-country`}
              hint="ISO country code for availability (e.g. US, GB). Blank uses the default."
            >
              <input
                id={`${uid}-provider-country`}
                className="input"
                value={config.providersCountry}
                onChange={e => onUpdate('providersCountry', e.target.value.toUpperCase().slice(0, 2))}
                placeholder="default"
                maxLength={2}
                style={{ maxWidth: '6rem', textTransform: 'uppercase' }}
              />
            </Field>
            <div className="field">
              <label className="label" htmlFor={`${uid}-network-tile`}>Chip tile color</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                <input
                  id={`${uid}-network-tile`}
                  type="color"
                  value={config.networkTileColor || '#14161a'}
                  onChange={e => onUpdate('networkTileColor', e.target.value)}
                  className="color-swatch"
                />
                <button
                  className={`opt-btn${!config.networkTileColor ? ' opt-btn--active' : ''}`}
                  onClick={() => onUpdate('networkTileColor', '')}
                  aria-pressed={!config.networkTileColor}
                  style={{ flex: 1 }}
                >
                  Default
                </button>
              </div>
            </div>
          </>
        )}

        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend className="label" style={{ marginBottom: 'var(--sp-2)' }}>
            Quality badges
            {config.badges.length > 0 && (
              <span className="count-pill">{config.badges.length}</span>
            )}
          </legend>
          <div className="chip-row">
            {QUALITY_BADGE_OPTIONS.map(b => {
              const active = config.badges.includes(b.id);
              return (
                <button
                  key={b.id}
                  className={`chip${active ? ' chip--active' : ''}`}
                  onClick={() => onToggleBadge(b.id)}
                  aria-pressed={active}
                >
                  {b.label}
                </button>
              );
            })}
          </div>
          <span className="hint" style={{ marginTop: 'var(--sp-2)' }}>
            Rendered in the top-right corner
          </span>
          {fine && config.badges.length > 0 && (
            <QualityFine uid={uid} config={config} onUpdate={onUpdate} />
          )}
        </fieldset>

        {config.ratings.length > 0 && (
          <>
            <ToggleRow
              label="Aggregate bar"
              hint="Score bar across the image edge"
              checked={config.aggregateBar}
              onChange={() => onUpdate('aggregateBar', !config.aggregateBar)}
            />

            {config.aggregateBar && (
              <>
                <Field label="Bar position" htmlFor={`${uid}-barpos`}>
                  <select
                    id={`${uid}-barpos`}
                    className="select"
                    value={config.aggregateBarPos}
                    onChange={e => onUpdate('aggregateBarPos', e.target.value)}
                  >
                    <option value="bottom">Bottom</option>
                    <option value="top">Top</option>
                  </select>
                </Field>
                {fine && <AggregateFine uid={uid} config={config} onUpdate={onUpdate} />}
              </>
            )}
          </>
        )}

        <ToggleRow
          label="Trending badge"
          hint="Show a trending badge in the top-left corner"
          checked={config.trending}
          onChange={() => onUpdate('trending', !config.trending)}
        />

        {config.trending && (
          <>
            <Field label="Trending style" htmlFor={`${uid}-trendstyle`}>
              <select
                id={`${uid}-trendstyle`}
                className="select"
                value={config.trendingStyle}
                onChange={e => onUpdate('trendingStyle', e.target.value)}
              >
                {TREND_STYLE_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </Field>
            {fine && <TrendingFine uid={uid} config={config} onUpdate={onUpdate} />}
          </>
        )}

        <div>
          <button
            className="btn btn-ghost btn-sm"
            style={{ alignSelf: 'flex-start' }}
            onClick={onReset}
            title={`Reset every setting for the ${mediaType} surface, including ratings and fine tuning`}
          >
            Reset {mediaType} to defaults
          </button>
          <span className="hint" style={{ marginTop: 'var(--sp-2)' }}>
            Resets all {mediaType} settings, including anything set under fine tuning. Undoable with Ctrl/Cmd+Z.
          </span>
        </div>
      </div>
    </div>
  );
}
