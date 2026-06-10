'use client';

import { Check, AlertCircle } from 'lucide-react';
import type { ConfigState, UpdateConfigFn } from './configurator-types';
import {
  ARTWORK_OPTIONS, SIZE_OPTIONS, TEXT_PREF_OPTIONS, LANG_OPTIONS,
  AGE_POS_OPTIONS, GENRE_POS_OPTIONS, QUALITY_BADGE_OPTIONS,
} from './configurator-types';

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
  config: ConfigState;
  onUpdate: UpdateConfigFn;
  onToggleBadge: (b: string) => void;
  onReset: () => void;
}

export function DisplayPanel({ uid, config, onUpdate, onToggleBadge, onReset }: DisplayPanelProps) {
  return (
    <div className="panel">
      <div className="panel-body cfg-fields">

        <Field label="Artwork source" htmlFor={`${uid}-artwork`}>
          <select
            id={`${uid}-artwork`}
            className="select"
            value={config.artworkSource}
            onChange={e => onUpdate('artworkSource', e.target.value)}
          >
            {ARTWORK_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </Field>

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

        <Field label="Text on poster" htmlFor={`${uid}-text`} hint="Whether to prefer text-free artwork">
          <select
            id={`${uid}-text`}
            className="select"
            value={config.textPreference}
            onChange={e => onUpdate('textPreference', e.target.value)}
          >
            {TEXT_PREF_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </Field>

        <ToggleRow
          label="Age rating badge"
          hint="Show content rating in corner"
          checked={config.ageRating}
          onChange={() => onUpdate('ageRating', !config.ageRating)}
        />

        {config.ageRating && (
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
        )}

        <ToggleRow
          label="Genre badge"
          hint="Show primary genres on the artwork"
          checked={config.genre}
          onChange={() => onUpdate('genre', !config.genre)}
        />

        {config.genre && (
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
        )}

        <ToggleRow
          label="Where to watch"
          hint="Show streaming provider chips (Netflix, Prime…)"
          checked={config.providers}
          onChange={() => onUpdate('providers', !config.providers)}
        />

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
        </fieldset>

        <ToggleRow
          label="Aggregate bar"
          hint="Score bar across the image edge"
          checked={config.aggregateBar}
          onChange={() => onUpdate('aggregateBar', !config.aggregateBar)}
        />

        {config.aggregateBar && (
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
        )}

        <ToggleRow
          label="Trending badge"
          hint="Show TRENDING label in top-left corner"
          checked={config.trending}
          onChange={() => onUpdate('trending', !config.trending)}
        />

        <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={onReset}>
          Reset to defaults
        </button>
      </div>
    </div>
  );
}
