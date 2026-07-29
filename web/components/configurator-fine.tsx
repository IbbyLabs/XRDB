'use client';

import type { ConfigState, UpdateConfigFn } from './configurator-types';
import {
  RATING_OPTIONS, SIX_POS_OPTIONS, QUALITY_STYLE_OPTIONS, GENRE_STYLE_OPTIONS,
  AGE_STYLE_OPTIONS, GENRE_MODE_OPTIONS, ANIME_GROUPING_OPTIONS,
  GENRE_ACCENT_OPTIONS, GENRE_LABEL_OPTIONS,
  AGGREGATE_SOURCE_OPTIONS, AGGREGATE_ACCENT_MODE_OPTIONS, SCOREBAR_STYLE_OPTIONS,
  RATING_PRESENTATION_OPTIONS, RATING_VALUE_MODE_OPTIONS, RELEASE_STATUS_STYLE_OPTIONS,
  ICON_SHAPE_OPTIONS, TREND_TAG_STYLE_OPTIONS,
  DEFAULT_CRITICS_PRIORITY, DEFAULT_AUDIENCE_PRIORITY,
} from './configurator-types';
import { resolveShares, rebalance } from '@/lib/shares';

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
 * The shell every fine-tuning group shares. The indent and hairline tie the
 * controls to the one above them visually; the label does the same for screen
 * readers, which can't see the indent.
 */
function FineGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="fine-group" role="group" aria-label={`${label} fine tuning`}>
      {children}
    </div>
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
const PILL_PRESENTATIONS: string[] = ['minimal', 'average', 'dual', 'dual-minimal'];

export function RatingBadgesFine({ uid, config, onUpdate }: GroupProps) {
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
      <StyleGrid
        id={`${uid}-rating-value-mode-label`}
        label="Value scale"
        options={RATING_VALUE_MODE_OPTIONS}
        value={config.ratingValueMode}
        onChange={v => onUpdate('ratingValueMode', v)}
        hint={RATING_VALUE_MODE_OPTIONS.find(o => o.id === config.ratingValueMode)?.desc}
      />
      <StyleGrid
        id={`${uid}-icon-shape-label`}
        label="Icon shape"
        options={ICON_SHAPE_OPTIONS}
        value={config.iconShape}
        onChange={v => onUpdate('iconShape', v)}
        columns={4}
        hint="Trim each provider's mark to a shape. Original keeps its own outline."
      />
      <NumField id={`${uid}-rating-scale`} label="Scale (%)" value={config.ratingBadgeScale}
        onChange={v => onUpdate('ratingBadgeScale', v)} min={70} max={400} step={5}
        hint="70–400. Blank keeps the default size." />
      <ToggleField id={`${uid}-rating-hide-icon`} label="Hide provider marks"
        checked={config.ratingIconHidden}
        onChange={v => onUpdate('ratingIconHidden', v)}
        hint="Show the score on its own, without the provider's logo." />
      <ToggleField id={`${uid}-stacked-line`} label="Hide the stacked accent bar"
        checked={config.stackedLineHidden}
        onChange={v => onUpdate('stackedLineHidden', v)}
        hint="Drops the coloured bar above the mark in the stacked style." />
      <NumField id={`${uid}-ratings-max`} label="Max badges" value={config.ratingsMax}
        onChange={v => onUpdate('ratingsMax', v)} min={0} max={20} placeholder="no cap"
        hint="0 shows all selected sources that have data." />
      <div className="numfield-pair">
        <NumField id={`${uid}-rating-ox`} label="Offset X" value={config.ratingBadgeOffsetX}
          onChange={v => onUpdate('ratingBadgeOffsetX', v)} min={-320} max={320} zeroIsDefault={false} />
        <NumField id={`${uid}-rating-oy`} label="Offset Y" value={config.ratingBadgeOffsetY}
          onChange={v => onUpdate('ratingBadgeOffsetY', v)} min={-320} max={320} zeroIsDefault={false} />
      </div>
      <ToggleField id={`${uid}-vote-counts`} label="Show vote counts"
        checked={config.ratingVoteCounts}
        onChange={v => onUpdate('ratingVoteCounts', v)}
        hint="Append the number of votes to each score. Only IMDb, MDBList and TMDB report one; other sources show the score alone." />
      <ToggleField id={`${uid}-bottom-row`} label="Single bottom row"
        checked={config.bottomRatingsRow}
        onChange={v => onUpdate('bottomRatingsRow', v)}
        hint="Keep every badge on one row along the bottom edge." />
      <NumField id={`${uid}-edge-offset`} label="Edge inset (px)" value={config.posterEdgeOffset}
        onChange={v => onUpdate('posterEdgeOffset', v)} min={0} max={80}
        hint="Push the strip further in from the edge it sits against." />
      <details className="adv-details">
        <summary>Per-style nudges</summary>
        <div className="cfg-fields" style={{ marginTop: 'var(--sp-2)' }}>
          <p className="hint">A nudge kept separately for each badge style, so switching style keeps both positions.</p>
          <div className="numfield-pair">
            <NumField id={`${uid}-off-x-glass`} label="Glass/pill X" value={config.ratingXOffsetPillGlass}
              onChange={v => onUpdate('ratingXOffsetPillGlass', v)} min={-320} max={320} zeroIsDefault={false} />
            <NumField id={`${uid}-off-y-glass`} label="Glass/pill Y" value={config.ratingYOffsetPillGlass}
              onChange={v => onUpdate('ratingYOffsetPillGlass', v)} min={-320} max={320} zeroIsDefault={false} />
          </div>
          <div className="numfield-pair">
            <NumField id={`${uid}-off-x-square`} label="Square X" value={config.ratingXOffsetSquare}
              onChange={v => onUpdate('ratingXOffsetSquare', v)} min={-320} max={320} zeroIsDefault={false} />
            <NumField id={`${uid}-off-y-square`} label="Square Y" value={config.ratingYOffsetSquare}
              onChange={v => onUpdate('ratingYOffsetSquare', v)} min={-320} max={320} zeroIsDefault={false} />
          </div>
        </div>
      </details>
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
      <NumField id={`${uid}-ring-center-op`} label="Center opacity (%)" value={config.ringCenterOpacity}
        onChange={v => onUpdate('ringCenterOpacity', v)} min={0} max={100} step={5}
        hint="Opacity of the disc behind the ring's number. Blank keeps the default." />
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
        onChange={v => onUpdate('qualityBadgeScale', v)} min={70} max={200} step={5} />
      <NumField id={`${uid}-quality-max`} label="Max badges" value={config.qualityBadgesMax}
        onChange={v => onUpdate('qualityBadgesMax', v)} min={0} max={12} placeholder="all"
        hint="0 shows every badge you selected." />
      <div className="numfield-pair">
        <NumField id={`${uid}-quality-ox`} label="Offset X" value={config.qualityBadgeOffsetX}
          onChange={v => onUpdate('qualityBadgeOffsetX', v)} min={-320} max={320} zeroIsDefault={false} />
        <NumField id={`${uid}-quality-oy`} label="Offset Y" value={config.qualityBadgeOffsetY}
          onChange={v => onUpdate('qualityBadgeOffsetY', v)} min={-320} max={320} zeroIsDefault={false} />
      </div>
      <StyleGrid
        id={`${uid}-quality-style-label`}
        label="Style"
        options={QUALITY_STYLE_OPTIONS}
        value={config.qualityBadgesStyle}
        onChange={v => onUpdate('qualityBadgesStyle', v)}
      />
      {config.qualityBadgesStyle === 'tile' && (
        <div className="field">
          <label className="label" htmlFor={`${uid}-quality-tile-color`}>Tile color</label>
          <input
            id={`${uid}-quality-tile-color`}
            type="color"
            value={config.qualityBadgesTileAccentColor || '#3355ff'}
            onChange={e => onUpdate('qualityBadgesTileAccentColor', e.target.value)}
            className="color-swatch"
          />
        </div>
      )}
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
      <div className="field">
        <label className="label" htmlFor={`${uid}-genre-accent`}>Accent</label>
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
      <NumField id={`${uid}-genre-scale`} label="Scale (%)" value={config.genreBadgeScale}
        onChange={v => onUpdate('genreBadgeScale', v)} min={70} max={200} step={5} />
      <div className="numfield-pair">
        <NumField id={`${uid}-genre-ox`} label="Offset X" value={config.genreBadgeOffsetX}
          onChange={v => onUpdate('genreBadgeOffsetX', v)} min={-320} max={320} zeroIsDefault={false} />
        <NumField id={`${uid}-genre-oy`} label="Offset Y" value={config.genreBadgeOffsetY}
          onChange={v => onUpdate('genreBadgeOffsetY', v)} min={-320} max={320} zeroIsDefault={false} />
      </div>
      <NumField id={`${uid}-genre-op`} label="Background opacity (%)" value={config.genreBadgeBackgroundOpacity}
        onChange={v => onUpdate('genreBadgeBackgroundOpacity', v)} min={5} max={100} step={5} />
      <NumField id={`${uid}-genre-border`} label="Border width (px)" value={config.genreBadgeBorderWidth}
        onChange={v => onUpdate('genreBadgeBorderWidth', v)} min={0} max={6} placeholder="hairline"
        hint="Outline thickness on the genre tile." />
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
          Text outline for background-less (plain) badges.
        </span>
      </div>
      <NumField id={`${uid}-plain-outline-w`} label="Outline width (px)" value={config.noBackgroundBadgeOutlineWidth}
        onChange={v => onUpdate('noBackgroundBadgeOutlineWidth', v)} min={0} max={6} placeholder="default" />
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
        onChange={v => onUpdate('aggregateBarOffset', v)} min={-12} max={12} zeroIsDefault={false}
        hint="Nudge the bar inward from its edge (−12 to 12)." />
      <StyleGrid
        id={`${uid}-agg-accent-mode-label`}
        label="Accent source"
        options={AGGREGATE_ACCENT_MODE_OPTIONS}
        value={config.aggregateAccentMode || 'default'}
        onChange={v => onUpdate('aggregateAccentMode', v === 'default' ? '' : v)}
        columns={2}
        hint="Genre colors the bar by the title's genre; Source colors it by the chosen rating source."
      />
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
        <div className="field">
          <label className="label" htmlFor={`${uid}-agg-stops`}>Colour stops</label>
          <input
            id={`${uid}-agg-stops`}
            type="text"
            className="input"
            value={config.aggregateDynamicStops}
            placeholder="0:#7f1d1d,40:#dc2626,75:#84cc16"
            onChange={e => onUpdate('aggregateDynamicStops', e.target.value)}
          />
          <p className="hint">Score to colour, on a 0–100 scale. Colours blend between stops. Blank uses the built-in bands.</p>
        </div>
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
          <ToggleField id={`${uid}-agg-rail`} label="Accent rail"
            checked={config.aggregateAccentBarVisible}
            onChange={v => onUpdate('aggregateAccentBarVisible', v)}
            hint="The colour block behind a critics or audience label. On a presentation with no labels it outlines the pill instead." />
          <NumField id={`${uid}-agg-rail-offset`} label="Rail offset (px)" value={config.aggregateAccentBarOffset}
            onChange={v => onUpdate('aggregateAccentBarOffset', v)} min={-40} max={40} zeroIsDefault={false} />
        </div>
      </details>
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
      {config.releaseStatusBadgeStyle === 'tile' && (
        <ColorField id={`${uid}-release-tile-color`} label="Tile colour"
          value={config.releaseStatusTileColor}
          onChange={v => onUpdate('releaseStatusTileColor', v)}
          fallback="#38bdf8" resetLabel="Auto" />
      )}
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
      {config.ageRatingBadgeStyle === 'tile' && (
        <div className="field">
          <label className="label" htmlFor={`${uid}-age-tile-color`}>Tile color</label>
          <input
            id={`${uid}-age-tile-color`}
            type="color"
            value={config.ageRatingTileColor || '#3355ff'}
            onChange={e => onUpdate('ageRatingTileColor', e.target.value)}
            className="color-swatch"
          />
        </div>
      )}
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
    </FineGroup>
  );
}
