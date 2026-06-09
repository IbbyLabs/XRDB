'use client';

import { Check, AlertCircle, Settings2 } from 'lucide-react';
import type {
  ConfigState, UpdateConfigFn,
} from './configurator-types';
import {
  ARTWORK_OPTIONS, SIZE_OPTIONS, TEXT_PREF_OPTIONS, LANG_OPTIONS,
  AGE_POS_OPTIONS, GENRE_POS_OPTIONS, QUALITY_BADGE_OPTIONS, DEFAULT_CONFIG,
} from './configurator-types';

// ── Notice ────────────────────────────────────────────────────────────────────

export function Notice({
  type, message, onDismiss,
}: { type: 'error' | 'success' | 'info'; message: string; onDismiss?: () => void }) {
  return (
    <div
      className={`xrdb-notice xrdb-notice-${type}`}
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
    >
      {type === 'error'
        ? <AlertCircle size={14} aria-hidden />
        : <Check size={14} aria-hidden />}
      <span style={{ flex: 1 }}>{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="xrdb-notice-dismiss" aria-label="Dismiss">
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
    <div className="cfg-field">
      <label className="xrdb-label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <span className="xrdb-field-hint">{hint}</span>}
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
    <div className="xrdb-card">
      <div className="xrdb-card-header">
        <Settings2 size={14} aria-hidden style={{ color: 'var(--muted)' }} />
        <span className="xrdb-card-title">Display settings</span>
        <button
          className="xrdb-btn xrdb-btn-ghost"
          style={{ marginLeft: 'auto', fontSize: '0.72rem', padding: '0.2rem 0.55rem', minHeight: '2rem' }}
          onClick={onReset}
        >
          Reset
        </button>
      </div>
      <div className="xrdb-card-body cfg-fields">
        <Field label="Artwork source" htmlFor={`${uid}-artwork`}>
          <select
            id={`${uid}-artwork`}
            className="xrdb-select"
            value={config.artworkSource}
            onChange={e => onUpdate('artworkSource', e.target.value)}
          >
            {ARTWORK_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </Field>

        <Field label="Resolution" htmlFor={`${uid}-size`}>
          <select
            id={`${uid}-size`}
            className="xrdb-select"
            value={config.size}
            onChange={e => onUpdate('size', e.target.value)}
          >
            {SIZE_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </Field>

        <Field label="Language" htmlFor={`${uid}-lang`} hint="Preferred language for posters and metadata">
          <select
            id={`${uid}-lang`}
            className="xrdb-select"
            value={config.language}
            onChange={e => onUpdate('language', e.target.value)}
          >
            {LANG_OPTIONS.map(o => <option key={o} value={o}>{o.toUpperCase()}</option>)}
          </select>
        </Field>

        <Field label="Text on poster" htmlFor={`${uid}-text`} hint="Whether to prefer text-free artwork">
          <select
            id={`${uid}-text`}
            className="xrdb-select"
            value={config.textPreference}
            onChange={e => onUpdate('textPreference', e.target.value)}
          >
            {TEXT_PREF_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </Field>

        <div className="cfg-toggle-row">
          <div>
            <span className="xrdb-label" style={{ display: 'block' }}>Age rating badge</span>
            <span className="xrdb-field-hint">Show content rating in corner</span>
          </div>
          <button
            role="switch"
            aria-checked={config.ageRating}
            className={`cfg-toggle${config.ageRating ? ' cfg-toggle--on' : ''}`}
            onClick={() => onUpdate('ageRating', !config.ageRating)}
            aria-label="Toggle age rating badge"
          >
            <span className="cfg-toggle-thumb" />
          </button>
        </div>

        {config.ageRating && (
          <Field label="Age badge position" htmlFor={`${uid}-agepos`}>
            <select
              id={`${uid}-agepos`}
              className="xrdb-select"
              value={config.ageRatingPos}
              onChange={e => onUpdate('ageRatingPos', e.target.value)}
            >
              {AGE_POS_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </Field>
        )}

        <div className="cfg-toggle-row">
          <div>
            <span className="xrdb-label" style={{ display: 'block' }}>Genre badge</span>
            <span className="xrdb-field-hint">Show primary genres on the artwork</span>
          </div>
          <button
            role="switch"
            aria-checked={config.genre}
            className={`cfg-toggle${config.genre ? ' cfg-toggle--on' : ''}`}
            onClick={() => onUpdate('genre', !config.genre)}
            aria-label="Toggle genre badge"
          >
            <span className="cfg-toggle-thumb" />
          </button>
        </div>

        {config.genre && (
          <Field label="Genre position" htmlFor={`${uid}-genrepos`}>
            <select
              id={`${uid}-genrepos`}
              className="xrdb-select"
              value={config.genrePos}
              onChange={e => onUpdate('genrePos', e.target.value)}
            >
              {GENRE_POS_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </Field>
        )}

        <div className="cfg-toggle-row">
          <div>
            <span className="xrdb-label" style={{ display: 'block' }}>Where to watch</span>
            <span className="xrdb-field-hint">Show streaming provider chips (Netflix, Prime…)</span>
          </div>
          <button
            role="switch"
            aria-checked={config.providers}
            className={`cfg-toggle${config.providers ? ' cfg-toggle--on' : ''}`}
            onClick={() => onUpdate('providers', !config.providers)}
            aria-label="Toggle provider badges"
          >
            <span className="cfg-toggle-thumb" />
          </button>
        </div>

        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend className="xrdb-label" style={{ marginBottom: '0.5rem' }}>
            Quality badges
            {config.badges.length > 0 && (
              <span className="cfg-ratings-count">{config.badges.length}</span>
            )}
          </legend>
          <div className="cfg-quality-chips">
            {QUALITY_BADGE_OPTIONS.map(b => {
              const active = config.badges.includes(b.id);
              return (
                <button
                  key={b.id}
                  className={`cfg-quality-chip${active ? ' cfg-quality-chip--active' : ''}`}
                  onClick={() => onToggleBadge(b.id)}
                  aria-pressed={active}
                >
                  {b.label}
                </button>
              );
            })}
          </div>
          <span className="xrdb-field-hint" style={{ marginTop: '0.4rem', display: 'block' }}>
            Rendered in the top-right corner
          </span>
        </fieldset>

        <div className="cfg-toggle-row">
          <div>
            <span className="xrdb-label" style={{ display: 'block' }}>Aggregate bar</span>
            <span className="xrdb-field-hint">Score bar across the image edge</span>
          </div>
          <button
            role="switch"
            aria-checked={config.aggregateBar}
            className={`cfg-toggle${config.aggregateBar ? ' cfg-toggle--on' : ''}`}
            onClick={() => onUpdate('aggregateBar', !config.aggregateBar)}
            aria-label="Toggle aggregate rating bar"
          >
            <span className="cfg-toggle-thumb" />
          </button>
        </div>
        {config.aggregateBar && (
          <div className="cfg-field">
            <label className="xrdb-label" htmlFor={`${uid}-barpos`}>Bar position</label>
            <select
              id={`${uid}-barpos`}
              className="xrdb-input"
              value={config.aggregateBarPos}
              onChange={e => onUpdate('aggregateBarPos', e.target.value)}
            >
              <option value="bottom">Bottom</option>
              <option value="top">Top</option>
            </select>
          </div>
        )}

        <div className="cfg-toggle-row">
          <div>
            <span className="xrdb-label" style={{ display: 'block' }}>Trending badge</span>
            <span className="xrdb-field-hint">Show TRENDING label in top-left corner</span>
          </div>
          <button
            role="switch"
            aria-checked={config.trending}
            className={`cfg-toggle${config.trending ? ' cfg-toggle--on' : ''}`}
            onClick={() => onUpdate('trending', !config.trending)}
            aria-label="Toggle trending badge"
          >
            <span className="cfg-toggle-thumb" />
          </button>
        </div>
      </div>
    </div>
  );
}
