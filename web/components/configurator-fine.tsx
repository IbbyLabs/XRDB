'use client';

import { useEffect, useState } from 'react';
import type { ConfigState, UpdateConfigFn } from './configurator-types';
import {
  RATING_OPTIONS, SIX_POS_OPTIONS, QUALITY_STYLE_OPTIONS, GENRE_STYLE_OPTIONS,
  AGE_STYLE_OPTIONS, GENRE_MODE_OPTIONS, ANIME_GROUPING_OPTIONS,
  GENRE_ACCENT_OPTIONS, GENRE_LABEL_OPTIONS, GENRE_BORDER_OPTIONS,
  GENRE_CASE_OPTIONS, GENRE_COUNT_OPTIONS,
  AGGREGATE_SOURCE_OPTIONS, AGGREGATE_ACCENT_MODE_OPTIONS, SCOREBAR_STYLE_OPTIONS,
  RATING_PRESENTATION_OPTIONS, RATING_VALUE_MODE_OPTIONS, RELEASE_STATUS_STYLE_OPTIONS,
  ICON_SHAPE_OPTIONS, TREND_TAG_STYLE_OPTIONS, ACCENT_SHAPE_OPTIONS,
  LOGO_SHADOW_STYLE_OPTIONS,
  DEFAULT_CRITICS_PRIORITY, DEFAULT_AUDIENCE_PRIORITY,
} from './configurator-types';
import { resolveShares, rebalance } from '@/lib/shares';
import { fetchGenreFamilies, type GenreFamily } from '@/lib/api';

// The sources a vote minimum can act on. The rest either report no count or
// count reviewing publications, where a minimum means nothing.
const MIN_VOTE_SOURCES = [
  { id: 'imdb', label: 'IMDb' },
  { id: 'letterboxd', label: 'Letterboxd' },
  { id: 'metacriticuser', label: 'Metacritic users' },
  { id: 'trakt', label: 'Trakt' },
  { id: 'tmdb', label: 'TMDB' },
  { id: 'simkl', label: 'SIMKL' },
];

/**
 * The fine-tuning controls for one badge: scale, position, offset, opacity and
 * colour. They live directly beneath the badge they style, so a badge is
 * configured in one place rather than split across a basic and an advanced
 * destination. Every group is gated on the configurator's fine-tuning switch.
 */

interface GroupProps {
  uid: string;
  config: ConfigState;
  onUpdate: UpdateConfigFn;
}

/**
 * The shell every fine-tuning group shares: a bordered box with the group's name
 * as a legend, matching the other panel sections so the fine groups read as
 * distinct rather than one long column. The legend is the accessible name too,
 * so a screen reader announces the boundary a sighted user now also sees.
 */
function FineGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="fine-group">
      <legend className="fine-group-legend label">{label}</legend>
      {children}
    </fieldset>
  );
}

// ── Field primitives ──────────────────────────────────────────────────────────

/**
 * A labelled numeric field paired with a range slider so the valid range is
 * visible and values can be scrubbed against the live preview, not just typed.
 * Zero renders the number as the "default" placeholder. For most fields 0 is a
 * "use the default" sentinel below the real range; pass `zeroIsDefault={false}`
 * for fields where 0 is a genuine value (e.g. a centred offset).
 *
 * The placeholder carries the "this is the default" signal on its own — spelling
 * it out per field stacked the same sentence under a dozen controls at once.
 */
function NumField({
  id, label, value, onChange, min, max, step = 1, placeholder = 'default', hint, zeroIsDefault = true,
}: {
  id: string; label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step?: number; placeholder?: string; hint?: string; zeroIsDefault?: boolean;
}) {
  const isDefault = zeroIsDefault && value === 0;
  // When the value is the default sentinel the slider rests at min; otherwise it
  // mirrors the current value, clamped so a stale out-of-range value still shows.
  const sliderValue = isDefault ? min : Math.max(min, Math.min(max, value));
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{label}</label>
      <div className="numfield-row">
        <input
          id={id}
          className="input numfield-num"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={step}
          value={isDefault ? '' : value}
          placeholder={placeholder}
          onChange={e => {
            const n = e.target.value === '' ? 0 : Number(e.target.value);
            onChange(Number.isFinite(n) ? n : 0);
          }}
          onBlur={() => {
            // Snap an out-of-range entry back into [min, max] on commit. 0 is the
            // "default" sentinel and is always allowed through.
            if (value === 0) return;
            const clamped = Math.max(min, Math.min(max, value));
            if (clamped !== value) onChange(clamped);
          }}
        />
        <input
          type="range"
          className="numfield-range"
          min={min}
          max={max}
          step={step}
          value={sliderValue}
          onChange={e => onChange(Number(e.target.value))}
          aria-label={`${label} slider`}
        />
      </div>
      {hint && <span className="hint" style={{ marginTop: 'var(--sp-1)' }}>{hint}</span>}
    </div>
  );
}

/** A labelled color field with an "auto/none" reset when a fallback exists. */
type ScoreStop = { id: number; score: number; color: string };

const STOP_HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * The renderer's own rules: comma-separated `score:#hex`, score 0-100, and a
 * part it cannot read is dropped rather than failing the whole string.
 */
function parseScoreStops(raw: string): { score: number; color: string }[] {
  return (raw || '').split(',').flatMap(part => {
    const at = part.indexOf(':');
    if (at < 0) return [];
    const score = Number(part.slice(0, at).trim());
    const color = part.slice(at + 1).trim();
    if (!Number.isFinite(score) || score < 0 || score > 100) return [];
    if (!STOP_HEX_RE.test(color)) return [];
    return [{ score, color }];
  });
}

function serializeScoreStops(rows: ScoreStop[]): string {
  return rows.map(r => `${Number(r.score.toFixed(2))}:${r.color}`).join(',');
}

/** The ramp as CSS, which is the same interpolation the renderer does. */
function stopsGradient(rows: ScoreStop[]): string {
  const sorted = [...rows].sort((a, b) => a.score - b.score);
  if (sorted.length === 0) return '';
  if (sorted.length === 1) return sorted[0].color;
  return `linear-gradient(to right, ${sorted.map(r => `${r.color} ${r.score}%`).join(', ')})`;
}

function seedStops(raw: string, start: number) {
  const parsed = parseScoreStops(raw);
  return {
    rows: parsed.map((s, i) => ({ ...s, id: start + i })),
    nextId: start + parsed.length,
    written: raw,
  };
}

/**
 * Colour stops as rows rather than as the string they are stored in. The format
 * is unchanged, so an existing config still loads and a shared link still works.
 *
 * The preview bar is the point of it: one stop per band reads as correct and
 * renders a gradient, and the bar shows that before a render does.
 */
function ScoreStopsField({ uid, value, onChange }: {
  uid: string; value: string; onChange: (v: string) => void;
}) {
  const [state, setState] = useState(() => seedStops(value, 0));
  // A preset, an undo or a shared link replaces the string from outside. React
  // allows adjusting state during render for exactly this, and it avoids the
  // round trip an effect would add.
  if (value !== state.written) setState(seedStops(value, state.nextId));

  const { rows } = state;
  const commit = (next: ScoreStop[], nextId = state.nextId) => {
    const raw = serializeScoreStops(next);
    setState({ rows: next, nextId, written: raw });
    onChange(raw);
  };
  const lastScore = rows.length ? rows[rows.length - 1].score : -10;
  const nextScore = Math.min(100, Math.max(0, lastScore + 10));
  const addStops = (added: { score: number; color: string }[]) =>
    commit(
      [...rows, ...added.map((s, i) => ({ ...s, id: state.nextId + i }))],
      state.nextId + added.length,
    );

  const gradient = stopsGradient(rows);
  return (
    <div className="field" role="group" aria-labelledby={`${uid}-stops-label`}>
      <span className="label" id={`${uid}-stops-label`}>Colour stops</span>
      {rows.length > 0 && (
        <div
          className="stops-preview"
          style={gradient.startsWith('linear-gradient') ? { backgroundImage: gradient } : { background: gradient }}
          aria-hidden="true"
        />
      )}
      {rows.map((row, i) => (
        <div className="stops-row" key={row.id}>
          <input
            className="input stops-score"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            step={1}
            value={row.score}
            aria-label={`Stop ${i + 1} score`}
            onChange={e => {
              const n = Number(e.target.value);
              commit(rows.map(r => (r.id === row.id
                ? { ...r, score: Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0 }
                : r)));
            }}
          />
          <input
            className="color-swatch"
            type="color"
            value={row.color}
            aria-label={`Stop ${i + 1} colour`}
            onChange={e => commit(rows.map(r => (r.id === row.id ? { ...r, color: e.target.value } : r)))}
          />
          <button
            type="button"
            className="opt-btn stops-remove"
            aria-label={`Remove stop ${i + 1}`}
            onClick={() => commit(rows.filter(r => r.id !== row.id))}
          >
            Remove
          </button>
        </div>
      ))}
      <div className="stops-actions">
        <button
          type="button"
          className="opt-btn"
          onClick={() => addStops([{ score: nextScore, color: '#3355ff' }])}
        >
          Add stop
        </button>
        <button
          type="button"
          className="opt-btn"
          onClick={() => addStops([
            { score: nextScore, color: '#3355ff' },
            { score: Math.min(100, nextScore + 9), color: '#3355ff' },
          ])}
        >
          Add flat band
        </button>
      </div>
      <p className="hint">
        Score to colour, on a 0–100 scale, so 4 out of 10 is 40. Colours blend
        between stops: a band of one flat colour needs the same colour at both
        ends, which is what Add flat band does. Blank uses the built-in bands.
      </p>
    </div>
  );
}

function ColorField({
  id, label, value, onChange, fallback = '#3355ff', resetLabel,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  fallback?: string; resetLabel?: string;
}) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
        <input
          id={id}
          type="color"
          value={value || fallback}
          onChange={e => onChange(e.target.value)}
          className="color-swatch"
        />
        {resetLabel && (
          <button
            className={`opt-btn${!value ? ' opt-btn--active' : ''}`}
            onClick={() => onChange('')}
            aria-pressed={!value}
            style={{ flex: 1 }}
          >
            {resetLabel}
          </button>
        )}
      </div>
    </div>
  );
}

/** A labelled on/off switch, matching the display panel's toggle rows. */
function ToggleField({ id, label, hint, checked, onChange }: {
  id: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="toggle-row">
      <div>
        <span className="label" style={{ marginBottom: 0 }} id={`${id}-label`}>{label}</span>
        {hint ? <span className="hint" style={{ marginTop: 0 }}>{hint}</span> : null}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        className={`toggle${checked ? ' toggle--on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="toggle-thumb" />
      </button>
    </div>
  );
}

/** A six-position picker backed by a native select for compactness. */
function PosSelect({
  id, label, value, onChange,
}: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{label}</label>
      <select id={id} className="select" value={value} onChange={e => onChange(e.target.value)} style={{ maxWidth: '12rem' }}>
        {SIX_POS_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  );
}

/** An option grid of mutually exclusive styles, the shape most groups repeat. */
function StyleGrid({
  id, label, options, value, onChange, columns = 3, hint,
}: {
  id: string; label: string; options: readonly { id: string; label: string }[];
  value: string; onChange: (v: string) => void; columns?: number; hint?: React.ReactNode;
}) {
  return (
    <div className="field">
      <span className="label" id={id}>{label}</span>
      <div
        className="opt-grid"
        style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
        role="group"
        aria-labelledby={id}
      >
        {options.map(o => (
          <button
            key={o.id}
            className={`opt-btn${value === o.id ? ' opt-btn--active' : ''}`}
            onClick={() => onChange(o.id)}
            aria-pressed={value === o.id}
          >
            {o.label}
          </button>
        ))}
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

// ── Ratings groups ────────────────────────────────────────────────────────────

/**
 * ProviderOverrides lets each selected rating source use a custom accent colour
 * instead of its brand default. Only the sources currently in the poster show
 * up here, so the list tracks the Sources selection.
 */
function ProviderOverrides({ uid, config, onUpdate }: GroupProps) {
  const selected = RATING_OPTIONS.filter(r => config.ratings.includes(r.id));
  if (selected.length === 0) return null;

  const setOverride = (id: string, hex: string) => {
    onUpdate('ratingProviderOverrides', { ...config.ratingProviderOverrides, [id]: hex });
  };
  const clearOverride = (id: string) => {
    const next = { ...config.ratingProviderOverrides };
    delete next[id];
    onUpdate('ratingProviderOverrides', next);
  };
  const setScale = (id: string, pct: number) => {
    const next = { ...config.ratingProviderIconScale };
    if (pct === 100 || !pct) delete next[id];
    else next[id] = pct;
    onUpdate('ratingProviderIconScale', next);
  };

  return (
    <details className="adv-details">
      <summary>
        Per-provider colors
      </summary>
      <div className="cfg-fields" style={{ marginTop: 'var(--sp-2)' }}>
        <p className="hint" style={{ marginTop: 0 }}>
          Override a source&apos;s accent colour and mark size. Sources left alone keep their brand colour at full size.
        </p>
        {selected.map(r => {
          const override = config.ratingProviderOverrides[r.id];
          return (
            <div className="field" key={r.id}>
              <label className="label" htmlFor={`${uid}-provover-${r.id}`}>{r.label}</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                <input
                  id={`${uid}-provover-${r.id}`}
                  type="color"
                  value={override || r.accent}
                  onChange={e => setOverride(r.id, e.target.value)}
                  className="color-swatch"
                />
                <button
                  className={`opt-btn${!override ? ' opt-btn--active' : ''}`}
                  onClick={() => clearOverride(r.id)}
                  aria-pressed={!override}
                  style={{ flex: 1 }}
                >
                  Brand default
                </button>
              </div>
              <NumField id={`${uid}-provscale-${r.id}`} label={`${r.label} mark size (%)`}
                value={config.ratingProviderIconScale[r.id] ?? 0}
                onChange={v => setScale(r.id, v)} min={50} max={150} step={5} placeholder="100" />
            </div>
          );
        })}
      </div>
    </details>
  );
}

/**
 * ProviderWeights splits 100% between the selected sources, deciding how much
 * each one counts wherever XRDB combines several into one number: the rating
 * ring, the aggregate bar, and the averaged presentations. It changes those
 * scores, never the individual badges.
 *
 * Moving one source moves the others, so the split always totals 100 and there
 * is no invalid state to warn about or correct.
 */
function ProviderWeights({ uid, config, onUpdate }: GroupProps) {
  const selected = RATING_OPTIONS.filter(r => config.ratings.includes(r.id));
  if (selected.length === 0) return null;

  const ids = selected.map(r => r.id);
  const shares = resolveShares(ids, config.ratingProviderWeights);
  const isEven = Object.keys(config.ratingProviderWeights).length === 0;

  const setShare = (id: string, share: number) => {
    onUpdate('ratingProviderWeights', rebalance(ids, shares, id, share));
  };

  return (
    <details className="adv-details">
      <summary>
        Source weighting
      </summary>
      <div className="cfg-fields" role="group" aria-label="Source weighting" style={{ marginTop: 'var(--sp-2)' }}>
        <p className="hint" style={{ marginTop: 0 }}>
          How the ring, the score bar and the averaged presentations divide their
          score between sources. Moving one adjusts the rest to keep the total at
          100%. A source on 0% stops counting but keeps its own badge, and one
          with no rating for a title hands its share to the others.
        </p>
        {selected.map(r => (
          <NumField
            key={r.id}
            id={`${uid}-weight-${r.id}`}
            label={`${r.label} (%)`}
            value={shares[r.id] ?? 0}
            onChange={v => setShare(r.id, v)}
            min={0}
            max={100}
            step={1}
            zeroIsDefault={false}
          />
        ))}
        <div className="share-total">
          <span>Total</span>
          <span className="share-total-value">
            {ids.reduce((sum, id) => sum + (shares[id] ?? 0), 0)}%
          </span>
        </div>
        <button
          className={`opt-btn${isEven ? ' opt-btn--active' : ''}`}
          onClick={() => onUpdate('ratingProviderWeights', {})}
          aria-pressed={isEven}
        >
          Even split
        </button>
      </div>
    </details>
  );
}

// The presentations that draw score pills rather than the badge strip, so they
// are the ones the pill placement reaches.
export const PILL_PRESENTATIONS: string[] = ['minimal', 'average', 'dual', 'dual-minimal'];

// Every element that reads the score colours. The group has to render when any
// of them can draw: gating it on one consumer is what made the colours
// unreachable for a ring with no badges, and hid them behind the aggregate bar
// before that. Add a reader here when one starts consuming the stops.
export function scoreColoursHaveAReader(config: ConfigState): boolean {
  return config.ratingsLayout !== 'none'
    || PILL_PRESENTATIONS.includes(config.ratingPresentation)
    || config.aggregateBar
    || config.ratingRing;
}

// Only the standard presentation draws the badge strip. Every other one puts
// something else in its place, and the strip's own controls stop reaching the
// image, so they are not offered.
export const drawsBadgeStrip = (presentation: string) =>
  presentation === '' || presentation === 'standard';

// A rating source can be chosen on the general list or on any of the per-type
// lists, and the renderer reads all four. A control gated on the general list
// alone disappears for a config the backend supports, with nothing on screen
// saying why. Go answers this with RatingsCandidates; this is the same question.
export const hasAnyRatingSource = (config: ConfigState) =>
  config.ratings.length > 0 ||
  config.ratingsMovie.length > 0 ||
  config.ratingsSeries.length > 0 ||
  config.ratingsAnime.length > 0;

// Of those, the ones whose pills carry no label, so an accent colour has no
// rail to fill and marks the capsule itself.
const LABELLESS_PRESENTATIONS: string[] = ['minimal', 'dual-minimal'];

// A stored width doubles as an off switch at -1 and a hairline at 0, which a box
// labelled in pixels does not suggest. The picker names the three states and
// reveals the number only when one is being chosen. Shared by both badge
// families so they read the same.
function genreBorderMode(width: number): string {
  if (width < 0) return 'off';
  if (width === 0) return 'hairline';
  return 'custom';
}

export function RatingBadgesFine({ uid, config, onUpdate }: GroupProps) {
  const strip = drawsBadgeStrip(config.ratingPresentation);
  const pills = PILL_PRESENTATIONS.includes(config.ratingPresentation);
  return (
    <FineGroup label="Rating badges">
      <StyleGrid
        id={`${uid}-rating-pres-label`}
        label="Presentation"
        options={RATING_PRESENTATION_OPTIONS}
        value={config.ratingPresentation}
        onChange={v => onUpdate('ratingPresentation', v)}
        hint={RATING_PRESENTATION_OPTIONS.find(o => o.id === config.ratingPresentation)?.desc}
      />
      {PILL_PRESENTATIONS.includes(config.ratingPresentation) && (
        <PosSelect id={`${uid}-aggregate-pill-pos`} label="Pill position"
          value={config.aggregatePillPos}
          onChange={v => onUpdate('aggregatePillPos', v)} />
      )}
      {config.ratingPresentation !== 'scorebar' && (
        <StyleGrid
          id={`${uid}-rating-value-mode-label`}
          label="Value scale"
          options={RATING_VALUE_MODE_OPTIONS}
          value={config.ratingValueMode}
          onChange={v => onUpdate('ratingValueMode', v)}
          hint={RATING_VALUE_MODE_OPTIONS.find(o => o.id === config.ratingValueMode)?.desc}
        />
      )}
      {strip && (
        <StyleGrid
          id={`${uid}-icon-shape-label`}
          label="Icon shape"
          options={ICON_SHAPE_OPTIONS}
          value={config.iconShape}
          onChange={v => onUpdate('iconShape', v)}
          columns={4}
          hint="Trim each provider's mark to a shape. Original keeps its own outline."
        />
      )}
      {strip && (
        <ToggleField id={`${uid}-icon-plate-filled`} label="Fill the mark's plate"
          checked={config.iconPlateFilled}
          onChange={v => onUpdate('iconPlateFilled', v)}
          hint="Fills the shape behind each provider mark with that site's own colour. Needs an icon shape other than Original." />
      )}
      {(strip || pills) && (
        <NumField id={`${uid}-rating-scale`} label="Scale (%)" value={config.ratingBadgeScale}
          onChange={v => onUpdate('ratingBadgeScale', v)} min={70} max={400} step={5}
          hint="70–400. Blank keeps the default size." />
      )}
      {strip && (
        <>
          <ToggleField id={`${uid}-rating-hide-icon`} label="Hide provider marks"
            checked={config.ratingIconHidden}
            onChange={v => onUpdate('ratingIconHidden', v)}
            hint="Show the score on its own, without the provider's logo." />
          <ToggleField id={`${uid}-stacked-line`} label="Hide the stacked accent bar"
            checked={config.stackedLineHidden}
            onChange={v => onUpdate('stackedLineHidden', v)}
            hint="Drops the coloured bar above the mark in the stacked style." />
          <ToggleField id={`${uid}-rating-accent-bar`} label="Hide the accent stripe"
            checked={config.ratingAccentBarHidden}
            onChange={v => onUpdate('ratingAccentBarHidden', v)}
            hint="Drops the coloured stripe down the left edge, keeping the badge shape." />
          <NumField id={`${uid}-ratings-max`} label="Max badges" value={config.ratingsMax}
            onChange={v => onUpdate('ratingsMax', v)} min={0} max={20} placeholder="no cap"
            hint="0 shows all selected sources that have data." />
        </>
      )}
      {(strip || pills) && (
        <div className="numfield-pair">
          <NumField id={`${uid}-rating-ox`} label="Offset X" value={config.ratingBadgeOffsetX}
            onChange={v => onUpdate('ratingBadgeOffsetX', v)} min={-1200} max={1200} zeroIsDefault={false} />
          <NumField id={`${uid}-rating-oy`} label="Offset Y" value={config.ratingBadgeOffsetY}
            onChange={v => onUpdate('ratingBadgeOffsetY', v)} min={-1200} max={1200} zeroIsDefault={false} />
        </div>
      )}
      {strip && (
        <>
          <ToggleField id={`${uid}-vote-counts`} label="Show vote counts"
            checked={config.ratingVoteCounts}
            onChange={v => onUpdate('ratingVoteCounts', v)}
            hint="Append the number of votes to each score. Only IMDb, MDBList and TMDB report one; other sources show the score alone." />
          <ToggleField id={`${uid}-hide-native-scale`} label="Hide the score's scale"
            checked={config.hideNativeScale}
            onChange={v => onUpdate('hideNativeScale', v)}
            hint="Draw a five- or four-point score bare, so Letterboxd reads 4.6 rather than 4.6/5. The scale is what stops a high five-point score being read as a low ten-point one, so leave it on unless every source in your row shares a scale." />
          <ToggleField id={`${uid}-min-votes`} label="Hide thin ratings"
            checked={config.ratingMinVotes}
            onChange={v => onUpdate('ratingMinVotes', v)}
            hint="Hide a score resting on too few votes to mean anything. Applies to IMDb, Letterboxd, Trakt, TMDB, SIMKL and Metacritic's user score. Metacritic, Rotten Tomatoes and Popcorn are never hidden: their counts measure how many critics reviewed a title, not how confident the score is. A source that reports no count is left alone." />
          {config.ratingMinVotes && (
            <details className="adv-details">
              <summary>Minimum votes per source</summary>
              <div className="cfg-fields" style={{ marginTop: 'var(--sp-2)' }}>
                <p className="hint" style={{ marginTop: 0 }}>
                  Leave a source empty to follow the built-in minimum, or set 0 to
                  stop hiding that source.
                </p>
                {MIN_VOTE_SOURCES.map(src => (
                  <NumField key={src.id} id={`${uid}-minvotes-${src.id}`} label={src.label}
                    value={config.ratingMinVotesBySource[src.id] ?? 0}
                    onChange={v => {
                      const next = { ...config.ratingMinVotesBySource };
                      if (v === 0) delete next[src.id]; else next[src.id] = v;
                      onUpdate('ratingMinVotesBySource', next);
                    }}
                    min={0} max={1000000} zeroIsDefault />
                ))}
              </div>
            </details>
          )}
          <ToggleField id={`${uid}-bottom-row`} label="Single row"
            checked={config.bottomRatingsRow}
            onChange={v => onUpdate('bottomRatingsRow', v)}
            hint="Keep every badge on one row instead of wrapping. The row follows the ratings layout." />
          <ToggleField id={`${uid}-unavailable-mark`} label="Mark a source that is unavailable"
            checked={config.ratingUnavailableMark}
            onChange={v => onUpdate('ratingUnavailableMark', v)}
            hint="Draw an X where a source's score would go while it is briefly held out. Off hides it, and a missing score then reads as the source having no rating for this title." />
          <ToggleField id={`${uid}-uniform-width`} label="Match badge widths"
            checked={config.ratingsUniformWidth}
            onChange={v => onUpdate('ratingsUniformWidth', v)}
            hint="Pad every badge to the widest so they share one edge. Marks differ in width, so matching the value scale alone will not line them up. Costs a little width in a row." />
          <ToggleField id={`${uid}-ratings-anchored`} label="Anchor badges to the edge"
            checked={config.ratingsAnchored}
            onChange={v => onUpdate('ratingsAnchored', v)}
            hint="Row flush to the poster edge with squared corners." />
          <NumField id={`${uid}-edge-offset`} label="Edge inset (px)" value={config.posterEdgeOffset}
            onChange={v => onUpdate('posterEdgeOffset', v)} min={0} max={80}
            hint="Push the strip further in from the edge it sits against." />
          <details className="adv-details">
            <summary>Per-style nudges</summary>
            <div className="cfg-fields" style={{ marginTop: 'var(--sp-2)' }}>
              <p className="hint">A nudge kept separately for each badge style, so switching style keeps both positions.</p>
              <div className="numfield-pair">
                <NumField id={`${uid}-off-x-glass`} label="Other styles X" value={config.ratingXOffsetPillGlass}
                  onChange={v => onUpdate('ratingXOffsetPillGlass', v)} min={-1200} max={1200} zeroIsDefault={false} />
                <NumField id={`${uid}-off-y-glass`} label="Other styles Y" value={config.ratingYOffsetPillGlass}
                  onChange={v => onUpdate('ratingYOffsetPillGlass', v)} min={-1200} max={1200} zeroIsDefault={false} />
              </div>
              <div className="numfield-pair">
                <NumField id={`${uid}-off-x-square`} label="Square X" value={config.ratingXOffsetSquare}
                  onChange={v => onUpdate('ratingXOffsetSquare', v)} min={-1200} max={1200} zeroIsDefault={false} />
                <NumField id={`${uid}-off-y-square`} label="Square Y" value={config.ratingYOffsetSquare}
                  onChange={v => onUpdate('ratingYOffsetSquare', v)} min={-1200} max={1200} zeroIsDefault={false} />
              </div>
            </div>
          </details>
        </>
      )}
      <NumField id={`${uid}-badge-density`} label="Badge density (%)" value={config.ratingBadgeDensity}
        onChange={v => onUpdate('ratingBadgeDensity', v)} min={60} max={140} step={5}
        hint="Padding inside each badge and the gap to its logo. Lower hugs the contents." />
      <div className="field">
        <label className="label" htmlFor={`${uid}-badge-border`}>Badge outline</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
          <input
            id={`${uid}-badge-border`}
            type="color"
            value={config.ratingBadgeBorderColor || '#ffffff'}
            onChange={e => onUpdate('ratingBadgeBorderColor', e.target.value)}
            className="color-swatch"
          />
          <button
            className={`opt-btn${!config.ratingBadgeBorderColor ? ' opt-btn--active' : ''}`}
            onClick={() => onUpdate('ratingBadgeBorderColor', '')}
            aria-pressed={!config.ratingBadgeBorderColor}
            style={{ flex: 1 }}
          >
            Per style
          </button>
        </div>
        <span className="hint" style={{ marginTop: 'var(--sp-1)' }}>
          Traces the capsule itself, so it reads as a defined chip.
        </span>
      </div>
      <ToggleField id={`${uid}-badge-border-tint`} label="Outline in each rating site's colour"
        hint="Draws every badge's outline in that site's own colour. On the Tile style this gives the classic outlined chip; on Glass it's a floating coloured ring."
        checked={config.ratingBadgeBorderSourceTint}
        onChange={() => onUpdate('ratingBadgeBorderSourceTint', !config.ratingBadgeBorderSourceTint)} />
      <ToggleField id={`${uid}-badge-border-glow`} label="Bloom the badge outline"
        hint="Fades the outline outward instead of a hard edge, so a source-tinted border reads as a halo around the badge."
        checked={config.ratingBadgeBorderGlow}
        onChange={() => onUpdate('ratingBadgeBorderGlow', !config.ratingBadgeBorderGlow)} />
      {config.ratingBadgeBorderGlow && (
        <NumField id={`${uid}-badge-border-glow-strength`} label="Bloom strength (%)"
          value={config.ratingBadgeBorderGlowStrength}
          onChange={v => onUpdate('ratingBadgeBorderGlowStrength', v)}
          min={5} max={100} step={5} placeholder="default"
          hint="How far the bloom reaches and how strongly it reads. Blank keeps the default." />
      )}
      <NumField id={`${uid}-badge-border-op`} label="Badge outline opacity (%)" value={config.ratingBadgeBorderOpacity}
        onChange={v => onUpdate('ratingBadgeBorderOpacity', v)} min={5} max={100} step={5} placeholder="solid" />
      <StyleGrid
        id={`${uid}-badge-border-mode-label`}
        label="Badge border"
        options={GENRE_BORDER_OPTIONS}
        value={genreBorderMode(config.ratingBadgeBorderWidth)}
        onChange={v => onUpdate('ratingBadgeBorderWidth', v === 'off' ? -1 : v === 'hairline' ? 0 : 2)}
      />
      {genreBorderMode(config.ratingBadgeBorderWidth) === 'custom' && (
        <NumField id={`${uid}-badge-border-w`} label="Badge border width (px)" value={config.ratingBadgeBorderWidth}
          onChange={v => onUpdate('ratingBadgeBorderWidth', v)} min={1} max={6} zeroIsDefault={false} />
      )}
      <NumField id={`${uid}-badge-bg-op`} label="Badge background opacity (%)" value={config.ratingBadgeBackgroundOpacity}
        onChange={v => onUpdate('ratingBadgeBackgroundOpacity', v)} min={5} max={100} step={5} placeholder="per style"
        hint="How much artwork shows through the badge body. Blank keeps what the style and theme picked." />
      <ProviderOverrides uid={uid} config={config} onUpdate={onUpdate} />
      <ProviderWeights uid={uid} config={config} onUpdate={onUpdate} />
    </FineGroup>
  );
}

/** The value/fill sources a ring can read, beyond the individual providers. */
const RING_SOURCE_OPTIONS = [
  { id: 'overall',           label: 'Overall average' },
  { id: 'critics',           label: 'Critics average' },
  { id: 'audience',          label: 'Audience average' },
  { id: 'priority-critics',  label: 'Top critic' },
  { id: 'priority-audience', label: 'Top audience' },
  { id: 'highest',           label: 'Highest score' },
] as const;

function RingSourceSelect({
  id, label, value, onChange,
}: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{label}</label>
      <select id={id} className="select" value={value} onChange={e => onChange(e.target.value)} style={{ maxWidth: '12rem' }}>
        {RING_SOURCE_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        {RATING_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  );
}

const sourceLabel = (id: string) => RATING_OPTIONS.find(o => o.id === id)?.label ?? id;

/**
 * PriorityList orders the sources a "top critic" / "top audience" ring walks:
 * the first one this title actually has a score for is the one shown. The list
 * starts on the built-in order and only stores an order of its own once it is
 * rearranged, so leaving it alone keeps whatever the default becomes.
 */
function PriorityList({
  label, hint, order, fallback, onChange,
}: {
  label: string; hint: string; order: string[]; fallback: string[];
  onChange: (next: string[]) => void;
}) {
  const effective = order.length > 0 ? order : fallback;
  const swap = (i: number, j: number) => {
    if (j < 0 || j >= effective.length) return;
    const next = [...effective];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="field" role="group" aria-label={label}>
      <span className="label">{label}</span>
      <span className="hint" style={{ marginTop: 0, marginBottom: 'var(--sp-1)' }}>{hint}</span>
      <ol className="priority-list">
        {effective.map((id, i) => (
          <li key={id} className="priority-row">
            <span className="priority-rank" aria-hidden>{i + 1}</span>
            <span className="priority-name">{sourceLabel(id)}</span>
            <button
              className="opt-btn priority-move"
              onClick={() => swap(i, i - 1)}
              disabled={i === 0}
              aria-label={`Move ${sourceLabel(id)} up`}
            >
              ↑
            </button>
            <button
              className="opt-btn priority-move"
              onClick={() => swap(i, i + 1)}
              disabled={i === effective.length - 1}
              aria-label={`Move ${sourceLabel(id)} down`}
            >
              ↓
            </button>
          </li>
        ))}
      </ol>
      <button
        className={`opt-btn${order.length === 0 ? ' opt-btn--active' : ''}`}
        onClick={() => onChange([])}
        aria-pressed={order.length === 0}
        style={{ marginTop: 'var(--sp-1)' }}
      >
        Default order
      </button>
    </div>
  );
}

export function RatingRingFine({ uid, config, onUpdate }: GroupProps) {
  return (
    <FineGroup label="Rating ring">
      <NumField id={`${uid}-ring-scale`} label="Ring size (%)" value={config.ringScale}
        onChange={v => onUpdate('ringScale', v)} min={70} max={250} step={5}
        hint="Size of the ring and the number inside it. Blank keeps the default." />
      <NumField id={`${uid}-ring-center-op`} label="Center opacity (%)" value={config.ringCenterOpacity}
        onChange={v => onUpdate('ringCenterOpacity', v)} min={0} max={100} step={5}
        hint="Opacity of the disc behind the ring's number. Blank keeps the default." />
      <div className="numfield-pair">
        <NumField id={`${uid}-ring-ox`} label="Offset X (px)" value={config.ringOffsetX}
          onChange={v => onUpdate('ringOffsetX', v)} min={-1200} max={1200} zeroIsDefault={false} />
        <NumField id={`${uid}-ring-oy`} label="Offset Y (px)" value={config.ringOffsetY}
          onChange={v => onUpdate('ringOffsetY', v)} min={-1200} max={1200} zeroIsDefault={false} />
      </div>
      <RingSourceSelect id={`${uid}-ring-value-src`} label="Value source"
        value={config.ringValueSource} onChange={v => onUpdate('ringValueSource', v)} />
      <RingSourceSelect id={`${uid}-ring-prog-src`} label="Fill source"
        value={config.ringProgressSource} onChange={v => onUpdate('ringProgressSource', v)} />
      <details className="adv-details">
        <summary>
          Top critic / top audience order
        </summary>
        <div className="cfg-fields" style={{ marginTop: 'var(--sp-2)' }}>
          <PriorityList
            label="Critics"
            hint="Used by the Top critic source."
            order={config.ringCriticsPriority}
            fallback={DEFAULT_CRITICS_PRIORITY}
            onChange={v => onUpdate('ringCriticsPriority', v)}
          />
          <PriorityList
            label="Audience"
            hint="Used by the Top audience source."
            order={config.ringAudiencePriority}
            fallback={DEFAULT_AUDIENCE_PRIORITY}
            onChange={v => onUpdate('ringAudiencePriority', v)}
          />
        </div>
      </details>
    </FineGroup>
  );
}

// ── Display groups ────────────────────────────────────────────────────────────

export function QualityFine({ uid, config, onUpdate }: GroupProps) {
  return (
    <FineGroup label="Quality badges">
      <PosSelect id={`${uid}-quality-pos`} label="Position" value={config.qualityBadgesPos}
        onChange={v => onUpdate('qualityBadgesPos', v)} />
      <NumField id={`${uid}-quality-scale`} label="Scale (%)" value={config.qualityBadgeScale}
        onChange={v => onUpdate('qualityBadgeScale', v)} min={70} max={400} step={5} />
      <NumField id={`${uid}-quality-max`} label="Max badges" value={config.qualityBadgesMax}
        onChange={v => onUpdate('qualityBadgesMax', v)} min={0} max={12} placeholder="all"
        hint="0 shows every badge you selected." />
      <div className="numfield-pair">
        <NumField id={`${uid}-quality-ox`} label="Offset X" value={config.qualityBadgeOffsetX}
          onChange={v => onUpdate('qualityBadgeOffsetX', v)} min={-1200} max={1200} zeroIsDefault={false} />
        <NumField id={`${uid}-quality-oy`} label="Offset Y" value={config.qualityBadgeOffsetY}
          onChange={v => onUpdate('qualityBadgeOffsetY', v)} min={-1200} max={1200} zeroIsDefault={false} />
      </div>
      <StyleGrid
        id={`${uid}-quality-style-label`}
        label="Style"
        options={QUALITY_STYLE_OPTIONS}
        value={config.qualityBadgesStyle}
        onChange={v => onUpdate('qualityBadgesStyle', v)}
      />
      <ColorField id={`${uid}-quality-tile-color`}
        label={config.qualityBadgesStyle === 'tile' ? 'Tile color' : 'Accent color'}
        value={config.qualityBadgesTileAccentColor}
        onChange={v => onUpdate('qualityBadgesTileAccentColor', v)}
        fallback="#3355ff" resetLabel="Default"
      />
    </FineGroup>
  );
}

export function GenreFine({ uid, config, onUpdate }: GroupProps) {
  return (
    <FineGroup label="Genre badge">
      <StyleGrid
        id={`${uid}-genre-mode-label`}
        label="Display"
        options={GENRE_MODE_OPTIONS}
        value={config.genreBadgeMode}
        onChange={v => onUpdate('genreBadgeMode', v)}
        hint={config.genreBadgeMode === 'default'
          ? 'Lists up to three genre names.'
          : 'Shows a glyph for the title’s main genre. The Clean and Tile styles stay text-only.'}
      />
      <div className="field">
        <label className="label" htmlFor={`${uid}-anime-grouping`}>Anime</label>
        <select
          id={`${uid}-anime-grouping`}
          className="select"
          value={config.genreBadgeAnimeGrouping}
          onChange={e => onUpdate('genreBadgeAnimeGrouping', e.target.value)}
        >
          {ANIME_GROUPING_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <p className="hint">
          {ANIME_GROUPING_OPTIONS.find(o => o.id === config.genreBadgeAnimeGrouping)?.desc}
        </p>
      </div>
      <StyleGrid
        id={`${uid}-genre-style-label`}
        label="Style"
        options={GENRE_STYLE_OPTIONS}
        value={config.genreBadgeStyle}
        onChange={v => onUpdate('genreBadgeStyle', v)}
      />
      {config.genreBadgeStyle !== 'plain' && (
        <ColorField id={`${uid}-genre-tile-color`}
          label={config.genreBadgeStyle === 'tile' ? 'Tile colour' : 'Border/accent colour'}
          value={config.genreBadgeTileAccentColor}
          onChange={v => onUpdate('genreBadgeTileAccentColor', v)}
          fallback="#3355ff" resetLabel="Auto" />
      )}
      <div className="field">
        <label className="label" htmlFor={`${uid}-genre-accent`}>Accent stripe</label>
        <select
          id={`${uid}-genre-accent`}
          className="select"
          value={config.genreBadgeAccent}
          onChange={e => onUpdate('genreBadgeAccent', e.target.value)}
        >
          {GENRE_ACCENT_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <p className="hint">
          {GENRE_ACCENT_OPTIONS.find(o => o.id === config.genreBadgeAccent)?.desc}
        </p>
      </div>
      <div className="field">
        <label className="label" htmlFor={`${uid}-genre-label`}>Label</label>
        <select
          id={`${uid}-genre-label`}
          className="select"
          value={config.genreBadgeLabel}
          onChange={e => onUpdate('genreBadgeLabel', e.target.value)}
        >
          {GENRE_LABEL_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <p className="hint">
          {GENRE_LABEL_OPTIONS.find(o => o.id === config.genreBadgeLabel)?.desc}
        </p>
      </div>
      <StyleGrid
        id={`${uid}-genre-case-label`}
        label="Case"
        options={GENRE_CASE_OPTIONS}
        value={config.genreBadgeCase || 'default'}
        onChange={v => onUpdate('genreBadgeCase', v === 'default' ? '' : v)}
        hint={GENRE_CASE_OPTIONS.find(o => o.id === (config.genreBadgeCase || 'default'))?.desc}
      />
      <ToggleField id={`${uid}-genre-short`} label="Short genre names"
        checked={config.genreBadgeShortNames}
        onChange={v => onUpdate('genreBadgeShortNames', v)}
        hint="Science Fiction reads Sci-Fi, Action &amp; Adventure reads Action. Off keeps the source's own spelling." />
      <StyleGrid
        id={`${uid}-genre-count-label`}
        label="How many genres"
        options={GENRE_COUNT_OPTIONS}
        value={config.genreBadgeMaxGenres ? String(config.genreBadgeMaxGenres) : 'default'}
        onChange={v => onUpdate('genreBadgeMaxGenres', v === 'default' ? 0 : Number(v))}
        columns={4}
        hint={GENRE_COUNT_OPTIONS.find(o => o.id === (config.genreBadgeMaxGenres ? String(config.genreBadgeMaxGenres) : 'default'))?.desc}
      />
      <NumField id={`${uid}-genre-scale`} label="Scale (%)" value={config.genreBadgeScale}
        onChange={v => onUpdate('genreBadgeScale', v)} min={70} max={300} step={5} />
      <div className="numfield-pair">
        <NumField id={`${uid}-genre-ox`} label="Offset X" value={config.genreBadgeOffsetX}
          onChange={v => onUpdate('genreBadgeOffsetX', v)} min={-1200} max={1200} zeroIsDefault={false} />
        <NumField id={`${uid}-genre-oy`} label="Offset Y" value={config.genreBadgeOffsetY}
          onChange={v => onUpdate('genreBadgeOffsetY', v)} min={-1200} max={1200} zeroIsDefault={false} />
      </div>
      <NumField id={`${uid}-genre-op`} label="Background opacity (%)" value={config.genreBadgeBackgroundOpacity}
        onChange={v => onUpdate('genreBadgeBackgroundOpacity', v)} min={5} max={100} step={5} />
      <StyleGrid
        id={`${uid}-genre-border-mode-label`}
        label="Border"
        options={GENRE_BORDER_OPTIONS}
        value={genreBorderMode(config.genreBadgeBorderWidth)}
        onChange={v => onUpdate('genreBadgeBorderWidth', v === 'off' ? -1 : v === 'hairline' ? 0 : 2)}
      />
      {genreBorderMode(config.genreBadgeBorderWidth) === 'custom' && (
        <NumField id={`${uid}-genre-border`} label="Border width (px)" value={config.genreBadgeBorderWidth}
          onChange={v => onUpdate('genreBadgeBorderWidth', v)} min={1} max={6} zeroIsDefault={false} />
      )}
      <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
        <ColorField id={`${uid}-genre-label-color`} label="Label colour" value={config.genreBadgeLabelColor}
          onChange={v => onUpdate('genreBadgeLabelColor', v)} fallback="#ffffff" resetLabel="By genre" />
        <ColorField id={`${uid}-genre-border-color`} label="Border colour" value={config.genreBadgeBorderColor}
          onChange={v => onUpdate('genreBadgeBorderColor', v)} fallback="#ffffff" resetLabel="Per style" />
      </div>
      <ToggleField id={`${uid}-genre-border-tint`} label="Outline in the genre's colour"
        hint="Draws the border in the family's own colour, so the outline reads by genre while the label stays where you put it."
        checked={config.genreBadgeBorderSourceTint}
        onChange={() => onUpdate('genreBadgeBorderSourceTint', !config.genreBadgeBorderSourceTint)} />
      <NumField id={`${uid}-genre-border-op`} label="Border opacity (%)" value={config.genreBadgeBorderOpacity}
        onChange={v => onUpdate('genreBadgeBorderOpacity', v)} min={5} max={100} step={5} placeholder="per style" />
      <p className="hint">
        The label and the border take their colour separately. Blank leaves each
        following the genre family, which is what one shared accent used to do.
      </p>
      <GenreFamilyColors uid={uid} config={config} onUpdate={onUpdate} />
    </FineGroup>
  );
}

/**
 * GenreFamilyColors lets a family be drawn in a chosen colour instead of its
 * built-in accent. The families come from the renderer, so a swatch cannot
 * disagree with what a poster draws.
 *
 * Only families that have been given a colour get a row; the rest are reached
 * through the picker. Clearing one removes the entry rather than writing the
 * built-in value, so it goes back to following the default.
 */
function GenreFamilyColors({ uid, config, onUpdate }: GroupProps) {
  const [families, setFamilies] = useState<GenreFamily[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetchGenreFamilies()
      .then(f => { if (live) setFamilies(f); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);

  const set = (id: string, hex: string) => {
    onUpdate('genreFamilyColors', { ...config.genreFamilyColors, [id]: hex });
  };
  const clear = (id: string) => {
    const next = { ...config.genreFamilyColors };
    delete next[id];
    onUpdate('genreFamilyColors', next);
  };

  const chosen = families.filter(f => config.genreFamilyColors[f.id] !== undefined);
  const rest = families.filter(f => config.genreFamilyColors[f.id] === undefined);

  return (
    <details className="adv-details">
      <summary>Genre family colours</summary>
      <div className="cfg-fields" style={{ marginTop: 'var(--sp-2)' }}>
        <p className="hint" style={{ marginTop: 0 }}>
          Give a family its own colour. Families left alone follow the built-in
          palette, and keep following it if that palette changes.
        </p>
        {failed && (
          <p className="hint" role="status">
            The family list could not be loaded, so there is nothing to pick from.
            Any colours already set are still in the config.
          </p>
        )}
        {chosen.map(f => (
          <div className="field" key={f.id}>
            <label className="label" htmlFor={`${uid}-genrefam-${f.id}`}>{f.label}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
              <input
                id={`${uid}-genrefam-${f.id}`}
                type="color"
                value={config.genreFamilyColors[f.id] || f.accent}
                onChange={e => set(f.id, e.target.value)}
                className="color-swatch"
              />
              <button
                type="button"
                className="opt-btn"
                onClick={() => clear(f.id)}
                style={{ flex: 1 }}
              >
                Built-in default
              </button>
            </div>
          </div>
        ))}
        {rest.length > 0 && (
          <div className="field">
            <label className="label" htmlFor={`${uid}-genrefam-add`}>Add a family</label>
            <select
              id={`${uid}-genrefam-add`}
              className="select"
              style={{ maxWidth: '12rem' }}
              value=""
              onChange={e => { const f = rest.find(x => x.id === e.target.value); if (f) set(f.id, f.accent); }}
            >
              <option value="">Choose a family…</option>
              {rest.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </div>
        )}
      </div>
    </details>
  );
}

/**
 * Outline controls that cross badge families: the plain-style text outline, the
 * score pill's accent width, and the rating logo trace. They are rendered
 * outside any badge's own toggle, since each reaches badges other than the one
 * it would otherwise sit under.
 */
export function OutlineFine({ uid, config, onUpdate }: GroupProps) {
  return (
    <FineGroup label="Outlines">
      <div className="field">
        <label className="label" htmlFor={`${uid}-plain-outline`}>Plain-style outline</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
          <input
            id={`${uid}-plain-outline`}
            type="color"
            value={config.noBackgroundBadgeOutlineColor || '#000000'}
            onChange={e => onUpdate('noBackgroundBadgeOutlineColor', e.target.value)}
            className="color-swatch"
          />
          <button
            className={`opt-btn${!config.noBackgroundBadgeOutlineColor ? ' opt-btn--active' : ''}`}
            onClick={() => onUpdate('noBackgroundBadgeOutlineColor', '')}
            aria-pressed={!config.noBackgroundBadgeOutlineColor}
            style={{ flex: 1 }}
          >
            Default shadow
          </button>
        </div>
        <span className="hint" style={{ marginTop: 'var(--sp-1)' }}>
          Text outline for background-less (plain) badges — genre, age rating,
          release status, top rated, trending, and the rating badges themselves.
        </span>
      </div>
      <NumField id={`${uid}-plain-outline-w`} label="Outline width (px)" value={config.noBackgroundBadgeOutlineWidth}
        onChange={v => onUpdate('noBackgroundBadgeOutlineWidth', v)} min={0} max={6} placeholder="default" />
      <ToggleField id={`${uid}-plain-outline-glow`} label="Soften the outline into a glow"
        hint="Fades the outline outward instead of a hard edge. Applies to every plain-style badge and no-background rating badges."
        checked={config.noBackgroundBadgeOutlineGlow}
        onChange={() => onUpdate('noBackgroundBadgeOutlineGlow', !config.noBackgroundBadgeOutlineGlow)} />
      <NumField id={`${uid}-accent-width`} label="Accent outline width (px)" value={config.aggregateAccentWidth}
        onChange={v => onUpdate('aggregateAccentWidth', v)} min={1} max={8} placeholder="2"
        hint="Thickness of the score pill's accent outline." />
      <div className="field">
        <label className="label" htmlFor={`${uid}-icon-outline`}>Logo outline</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
          <input
            id={`${uid}-icon-outline`}
            type="color"
            value={config.iconOutlineColor || '#000000'}
            onChange={e => onUpdate('iconOutlineColor', e.target.value)}
            className="color-swatch"
          />
          <button
            className={`opt-btn${!config.iconOutlineColor ? ' opt-btn--active' : ''}`}
            onClick={() => onUpdate('iconOutlineColor', '')}
            aria-pressed={!config.iconOutlineColor}
            style={{ flex: 1 }}
          >
            None
          </button>
        </div>
        <span className="hint" style={{ marginTop: 'var(--sp-1)' }}>
          Traces each rating logo, for artwork it would blend into.
        </span>
      </div>
      <NumField id={`${uid}-icon-outline-w`} label="Logo outline width (px)" value={config.iconOutlineWidth}
        onChange={v => onUpdate('iconOutlineWidth', v)} min={0} max={6} placeholder="none" />
    </FineGroup>
  );
}

/**
 * Colour controls for the score pills and the aggregate bar. These used to live
 * inside the Aggregate bar group, which is only rendered once that bar is
 * switched on, so every colour setting for the pill presentations was unreachable
 * without enabling a bar the user did not want drawn.
 */
export function ScoreColourFine({ uid, config, onUpdate }: GroupProps) {
  return (
    <FineGroup label="Score colours">
      <StyleGrid
        id={`${uid}-agg-accent-mode-label`}
        label="Accent source"
        options={AGGREGATE_ACCENT_MODE_OPTIONS}
        value={config.aggregateAccentMode || 'default'}
        onChange={v => onUpdate('aggregateAccentMode', v === 'default' ? '' : v)}
        columns={2}
        hint="Applies to the score pills and the aggregate bar. Genre colours by the title's genre; Source colours by the chosen rating source."
      />
      <div className="field">
        <label className="label" htmlFor={`${uid}-agg-pill-icon`}>Pill icon</label>
        <select
          id={`${uid}-agg-pill-icon`}
          className="select"
          value={config.aggregatePillIcon}
          onChange={e => onUpdate('aggregatePillIcon', e.target.value)}
          style={{ maxWidth: '12rem' }}
        >
          <option value="">None</option>
          {RATING_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <p className="hint">A rating mark drawn inside the single-score minimal and average pills.</p>
      </div>
      <ToggleField id={`${uid}-agg-dual-icons`} label="Dual icons"
        checked={config.aggregateDualIcons}
        onChange={v => onUpdate('aggregateDualIcons', v)}
        hint="Mark the dual critics and audience pills with their glyphs instead of text labels." />
      {config.aggregateAccentMode === 'custom' && (
        <div className="field">
          <label className="label" htmlFor={`${uid}-agg-color`}>Accent color</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
            <input
              id={`${uid}-agg-color`}
              type="color"
              value={config.aggregateAccentColor || '#3355ff'}
              onChange={e => onUpdate('aggregateAccentColor', e.target.value)}
              className="color-swatch"
            />
            <button
              className={`opt-btn${!config.aggregateAccentColor ? ' opt-btn--active' : ''}`}
              onClick={() => onUpdate('aggregateAccentColor', '')}
              aria-pressed={!config.aggregateAccentColor}
              style={{ flex: 1 }}
            >
              Auto (score-based)
            </button>
          </div>
        </div>
      )}
      {config.aggregateAccentMode === 'custom' && (
        <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
          <ColorField id={`${uid}-agg-critics-accent`} label="Critics accent" value={config.aggregateCriticsAccentColor}
            onChange={v => onUpdate('aggregateCriticsAccentColor', v)} fallback="#22c55e" resetLabel="Shared" />
          <ColorField id={`${uid}-agg-audience-accent`} label="Audience accent" value={config.aggregateAudienceAccentColor}
            onChange={v => onUpdate('aggregateAudienceAccentColor', v)} fallback="#38bdf8" resetLabel="Shared" />
        </div>
      )}
      {config.aggregateAccentMode === 'dynamic' && (
        <ScoreStopsField
          uid={uid}
          value={config.aggregateDynamicStops}
          onChange={v => onUpdate('aggregateDynamicStops', v)}
        />
      )}
      <details className="adv-details">
        <summary>Score value colours</summary>
        <div className="cfg-fields" style={{ marginTop: 'var(--sp-2)' }}>
          <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
            <ColorField id={`${uid}-agg-value`} label="Value" value={config.aggregateValueColor}
              onChange={v => onUpdate('aggregateValueColor', v)} fallback="#ffffff" resetLabel="White" />
            <ColorField id={`${uid}-agg-critics-value`} label="Critics value" value={config.aggregateCriticsValueColor}
              onChange={v => onUpdate('aggregateCriticsValueColor', v)} fallback="#ffffff" resetLabel="Shared" />
            <ColorField id={`${uid}-agg-audience-value`} label="Audience value" value={config.aggregateAudienceValueColor}
              onChange={v => onUpdate('aggregateAudienceValueColor', v)} fallback="#ffffff" resetLabel="Shared" />
          </div>
          <ToggleField id={`${uid}-agg-fill`} label="Fill by score"
            checked={config.aggregateFillByScore}
            onChange={v => onUpdate('aggregateFillByScore', v)}
            hint="Colour the whole pill with the accent instead of only the rail. With Accent source set to Dynamic this tints the badge by the score." />
          <NumField id={`${uid}-agg-body-tint`} label="Body tint (%)"
            value={config.aggregatePillBodyTint}
            onChange={v => onUpdate('aggregatePillBodyTint', v)}
            min={0} max={100} step={5} zeroIsDefault={true}
            hint="Blends the accent into the dark body short of the full fill: a dark-accent capsule that keeps a bright rail. 0 keeps the body dark. Ignored when Fill by score is on." />
          <ToggleField id={`${uid}-agg-rail`} label="Accent rail"
            checked={config.aggregateAccentBarVisible}
            onChange={v => onUpdate('aggregateAccentBarVisible', v)}
            hint="The colour block behind a critics or audience label. On a presentation with no labels it marks the pill instead." />
          <NumField id={`${uid}-agg-rail-offset`} label="Rail offset (px)" value={config.aggregateAccentBarOffset}
            onChange={v => onUpdate('aggregateAccentBarOffset', v)} min={-40} max={40} zeroIsDefault={false} />
          {LABELLESS_PRESENTATIONS.includes(config.ratingPresentation) && (
            <StyleGrid
              id={`${uid}-agg-accent-shape-label`}
              label="Accent shape"
              options={ACCENT_SHAPE_OPTIONS}
              value={config.aggregateAccentShape}
              onChange={v => onUpdate('aggregateAccentShape', v)}
              columns={2}
              hint={ACCENT_SHAPE_OPTIONS.find(o => o.id === config.aggregateAccentShape)?.desc}
            />
          )}
        </div>
      </details>
    </FineGroup>
  );
}

export function AggregateFine({ uid, config, onUpdate }: GroupProps) {
  return (
    <FineGroup label="Aggregate bar">
      <div className="field">
        <label className="label" htmlFor={`${uid}-agg-source`}>Rating source</label>
        <select id={`${uid}-agg-source`} className="select" value={config.aggregateRatingSource}
          onChange={e => onUpdate('aggregateRatingSource', e.target.value)} style={{ maxWidth: '12rem' }}>
          {AGGREGATE_SOURCE_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>
      <StyleGrid
        id={`${uid}-scorebar-style-label`}
        label="Bar style"
        options={SCOREBAR_STYLE_OPTIONS}
        value={config.scorebarStyle}
        onChange={v => onUpdate('scorebarStyle', v)}
      />
      <NumField id={`${uid}-agg-offset`} label="Bar offset (px)" value={config.aggregateBarOffset}
        onChange={v => onUpdate('aggregateBarOffset', v)} min={-1200} max={1200} zeroIsDefault={false}
        hint="Nudge the bar inward from its edge, in pixels of a normal-size render. The value is a share of the poster, so it lands in the same place at every size. Past the height of the image the bar leaves it entirely." />
      <NumField id={`${uid}-agg-scale`} label="Bar thickness (%)" value={config.aggregateBarScale}
        onChange={v => onUpdate('aggregateBarScale', v)} min={25} max={400} zeroIsDefault
        hint="Height of the bar as a percent of its default. Blank or 0 leaves it at 100." />
      <details className="adv-details">
        <summary>Scorebar bands (when accent is auto)</summary>
        <div className="cfg-fields" style={{ marginTop: 'var(--sp-2)' }}>
          <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
            <ColorField id={`${uid}-sb-low`} label="Low" value={config.scorebarLowColor} onChange={v => onUpdate('scorebarLowColor', v)} fallback="#c0392b" resetLabel="Auto" />
            <ColorField id={`${uid}-sb-mid`} label="Mid" value={config.scorebarMidColor} onChange={v => onUpdate('scorebarMidColor', v)} fallback="#e67e22" resetLabel="Auto" />
            <ColorField id={`${uid}-sb-high`} label="High" value={config.scorebarHighColor} onChange={v => onUpdate('scorebarHighColor', v)} fallback="#27ae60" resetLabel="Auto" />
          </div>
          <div className="numfield-pair">
            <NumField id={`${uid}-sb-lowt`} label="Low threshold" value={config.scorebarLowThreshold} onChange={v => onUpdate('scorebarLowThreshold', v)} min={0} max={10} step={0.5} placeholder="5" />
            <NumField id={`${uid}-sb-hight`} label="High threshold" value={config.scorebarHighThreshold} onChange={v => onUpdate('scorebarHighThreshold', v)} min={0} max={10} step={0.5} placeholder="8" />
          </div>
        </div>
      </details>
    </FineGroup>
  );
}

// NumericConfigKey is a config key whose value is a number, so a shared scale or
// offset control can bind to it without losing type safety.
type NumericConfigKey = { [K in keyof ConfigState]: ConfigState[K] extends number ? K : never }[keyof ConfigState];

// ScaleOffsetFields renders the Scale/Offset X/Offset Y trio a corner badge
// carries, so every badge exposes the same controls rather than each rolling its
// own.
export function ScaleOffsetFields({ uid, config, onUpdate, scaleKey, offXKey, offYKey }: {
  uid: string;
  config: ConfigState;
  onUpdate: UpdateConfigFn;
  scaleKey: NumericConfigKey;
  offXKey: NumericConfigKey;
  offYKey: NumericConfigKey;
}) {
  return (
    <>
      <NumField id={`${uid}-${scaleKey}`} label="Scale (%)" value={config[scaleKey]}
        onChange={v => onUpdate(scaleKey, v)} min={70} max={400} step={5}
        hint="70–400. Blank keeps the default size." />
      <NumField id={`${uid}-${offXKey}`} label="Offset X" value={config[offXKey]}
        onChange={v => onUpdate(offXKey, v)} min={-1200} max={1200} zeroIsDefault={false} />
      <NumField id={`${uid}-${offYKey}`} label="Offset Y" value={config[offYKey]}
        onChange={v => onUpdate(offYKey, v)} min={-1200} max={1200} zeroIsDefault={false} />
    </>
  );
}

export function ReleaseStatusFine({ uid, config, onUpdate }: GroupProps) {
  return (
    <FineGroup label="Release status badge">
      <StyleGrid
        id={`${uid}-release-style-label`}
        label="Style"
        options={RELEASE_STATUS_STYLE_OPTIONS}
        value={config.releaseStatusBadgeStyle}
        onChange={v => onUpdate('releaseStatusBadgeStyle', v)}
        columns={3}
        hint="Accent keeps the coloured border that marks cinema and digital releases."
      />
      {config.releaseStatusBadgeStyle !== 'plain' && (
        <ColorField id={`${uid}-release-tile-color`}
          label={config.releaseStatusBadgeStyle === 'tile' ? 'Tile colour' : 'Border colour'}
          value={config.releaseStatusTileColor}
          onChange={v => onUpdate('releaseStatusTileColor', v)}
          fallback="#38bdf8" resetLabel="Auto" />
      )}
      <ScaleOffsetFields uid={uid} config={config} onUpdate={onUpdate}
        scaleKey="releaseStatusScale" offXKey="releaseStatusOffsetX" offYKey="releaseStatusOffsetY" />
    </FineGroup>
  );
}

/**
 * The title logo drawn over clean posters and backdrops. Its box and placement
 * were three constants in the renderer, so nothing a config said could reach
 * them. Position is the logo's centre, which keeps it still while the size
 * slider moves.
 */
export function TitleLogoFine({ uid, config, onUpdate }: GroupProps) {
  return (
    <FineGroup label="Title logo">
      <NumField id={`${uid}-logo-width`} label="Width (%)" value={config.logoWidth}
        onChange={v => onUpdate('logoWidth', v)} min={10} max={100} step={5}
        hint="Share of the artwork width the logo may fill. Blank keeps the default." />
      <NumField id={`${uid}-logo-height`} label="Height (%)" value={config.logoHeight}
        onChange={v => onUpdate('logoHeight', v)} min={5} max={60} step={5}
        hint="Its aspect ratio is kept, so the logo fits inside the box and never stretches." />
      <NumField id={`${uid}-logo-pos`} label="Position (%)" value={config.logoPos}
        onChange={v => onUpdate('logoPos', v)} min={1} max={100} step={1}
        hint="How far down the artwork the logo sits. Blank keeps the default." />
      <StyleGrid id={`${uid}-logo-shadow-style`} label="Shadow style"
        options={LOGO_SHADOW_STYLE_OPTIONS} value={config.logoShadowStyle}
        onChange={v => onUpdate('logoShadowStyle', v)}
        hint="Shadow is a soft drop shadow, Extrude a solid 3D stack behind the letters, Gel a raised edge with a lit highlight." />
      <NumField id={`${uid}-logo-scrim-size`} label="Shadow spread (%)" value={config.logoScrimSize}
        onChange={v => onUpdate('logoScrimSize', v)} min={0} max={200} step={10}
        hint="How far the shadow reaches past the logo, as a share of the logo's height." />
      <NumField id={`${uid}-logo-scrim-opacity`} label="Shadow strength (%)" value={config.logoScrimOpacity}
        onChange={v => onUpdate('logoScrimOpacity', v)} min={0} max={100} step={5}
        hint="How dark the shadow gets at its strongest. Lower it on pale artwork, raise it when the logo is hard to read." />
      <NumField id={`${uid}-logo-shadow-x`} label="Shadow offset X (px)" value={config.logoShadowOffsetX}
        onChange={v => onUpdate('logoShadowOffsetX', v)} min={-200} max={200} step={1}
        hint="Negative moves it left, positive right. Leave both offsets blank for the style's own drop." />
      <NumField id={`${uid}-logo-shadow-y`} label="Shadow offset Y (px)" value={config.logoShadowOffsetY}
        onChange={v => onUpdate('logoShadowOffsetY', v)} min={-200} max={200} step={1}
        hint="Negative moves it up, positive down." />
      <ColorField id={`${uid}-logo-shadow-color`} label="Shadow colour" value={config.logoShadowColor}
        onChange={v => onUpdate('logoShadowColor', v)} fallback="#000000" resetLabel="Black" />
      <ToggleField id={`${uid}-logo-anchor`} label="Anchor to bottom"
        checked={config.logoAnchor === 'bottom'}
        onChange={v => onUpdate('logoAnchor', v ? 'bottom' : '')}
        hint="Pin the lower edge at that position, so a bigger logo grows upward instead of both ways." />
    </FineGroup>
  );
}

export function ProvidersFine({ uid, config, onUpdate }: GroupProps) {
  return (
    <FineGroup label="Where to watch chips">
      <PosSelect id={`${uid}-provider-pos`} label="Position" value={config.providersPos}
        onChange={v => onUpdate('providersPos', v)} />
      <NumField id={`${uid}-provider-scale`} label="Scale (%)" value={config.providerBadgeScale}
        onChange={v => onUpdate('providerBadgeScale', v)} min={70} max={400} step={5}
        hint="70\u2013200. Blank keeps the default size." />
      <NumField id={`${uid}-provider-offset-x`} label="Offset X (px)" value={config.providerBadgeOffsetX}
        onChange={v => onUpdate('providerBadgeOffsetX', v)} min={-1200} max={1200} zeroIsDefault={false} />
      <NumField id={`${uid}-provider-offset-y`} label="Offset Y (px)" value={config.providerBadgeOffsetY}
        onChange={v => onUpdate('providerBadgeOffsetY', v)} min={-1200} max={1200} zeroIsDefault={false} />
    </FineGroup>
  );
}

export function AgeFine({ uid, config, onUpdate }: GroupProps) {
  return (
    <FineGroup label="Age rating badge">
      <StyleGrid
        id={`${uid}-age-style-label`}
        label="Style"
        options={AGE_STYLE_OPTIONS}
        value={config.ageRatingBadgeStyle}
        onChange={v => onUpdate('ageRatingBadgeStyle', v)}
        columns={2}
      />
      {config.ageRatingBadgeStyle !== 'plain' && config.ageRatingBadgeStyle !== 'media' && (
        <ColorField id={`${uid}-age-tile-color`}
          label={config.ageRatingBadgeStyle === 'tile' ? 'Tile color' : 'Border color'}
          value={config.ageRatingTileColor}
          onChange={v => onUpdate('ageRatingTileColor', v)}
          fallback="#3355ff" resetLabel="Default" />
      )}
      {config.ageRatingBadgeStyle !== 'plain' && (
        <>
          <NumField id={`${uid}-age-op`} label="Background opacity (%)" value={config.ageRatingBackgroundOpacity}
            onChange={v => onUpdate('ageRatingBackgroundOpacity', v)} min={5} max={100} step={5}
            placeholder="per style" />
          <StyleGrid
            id={`${uid}-age-border-mode-label`}
            label="Border"
            options={GENRE_BORDER_OPTIONS}
            value={genreBorderMode(config.ageRatingBorderWidth)}
            onChange={v => onUpdate('ageRatingBorderWidth', v === 'off' ? -1 : v === 'hairline' ? 0 : 2)}
          />
          {genreBorderMode(config.ageRatingBorderWidth) === 'custom' && (
            <NumField id={`${uid}-age-border`} label="Border width (px)" value={config.ageRatingBorderWidth}
              onChange={v => onUpdate('ageRatingBorderWidth', v)} min={1} max={6} zeroIsDefault={false} />
          )}
          <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
            <ColorField id={`${uid}-age-label-color`} label="Label colour" value={config.ageRatingLabelColor}
              onChange={v => onUpdate('ageRatingLabelColor', v)} fallback="#ffffff" resetLabel="Per style" />
            <ColorField id={`${uid}-age-border-color`} label="Border colour" value={config.ageRatingBorderColor}
              onChange={v => onUpdate('ageRatingBorderColor', v)} fallback="#ffffff" resetLabel="Per style" />
          </div>
          <NumField id={`${uid}-age-border-op`} label="Border opacity (%)" value={config.ageRatingBorderOpacity}
            onChange={v => onUpdate('ageRatingBorderOpacity', v)} min={5} max={100} step={5} placeholder="per style" />
        </>
      )}
      <NumField id={`${uid}-age-scale`} label="Scale (%)" value={config.ageRatingScale}
        onChange={v => onUpdate('ageRatingScale', v)} min={50} max={300} step={5} />
      <div className="numfield-pair">
        <NumField id={`${uid}-age-ox`} label="Offset X (px)" value={config.ageRatingOffsetX}
          onChange={v => onUpdate('ageRatingOffsetX', v)} min={-1200} max={1200} zeroIsDefault={false} />
        <NumField id={`${uid}-age-oy`} label="Offset Y (px)" value={config.ageRatingOffsetY}
          onChange={v => onUpdate('ageRatingOffsetY', v)} min={-1200} max={1200} zeroIsDefault={false} />
      </div>
    </FineGroup>
  );
}

export function TrendingFine({ uid, config, onUpdate }: GroupProps) {
  return (
    <FineGroup label="Trending badge">
      <StyleGrid
        id={`${uid}-trending-tag-style-label`}
        label="Surface"
        options={TREND_TAG_STYLE_OPTIONS}
        value={config.trendingTagStyle}
        onChange={v => onUpdate('trendingTagStyle', v)}
        hint="Glass keeps the warm capsule; plain drops the surface behind the tag."
      />
      <PosSelect id={`${uid}-trending-pos`} label="Position" value={config.trendingPos}
        onChange={v => onUpdate('trendingPos', v)} />
      <ColorField id={`${uid}-trending-color`} label="Text color" value={config.trendingTextColor}
        onChange={v => onUpdate('trendingTextColor', v)} fallback="#fff4ee" resetLabel="Default" />
      {config.trendingTagStyle !== 'plain' && (
        <ColorField id={`${uid}-trending-accent`} label="Border color" value={config.trendingAccentColor}
          onChange={v => onUpdate('trendingAccentColor', v)} fallback="#ff7e2a" resetLabel="Default" />
      )}
      <ScaleOffsetFields uid={uid} config={config} onUpdate={onUpdate}
        scaleKey="trendingScale" offXKey="trendingOffsetX" offYKey="trendingOffsetY" />
    </FineGroup>
  );
}
