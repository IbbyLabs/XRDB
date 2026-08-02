'use client';

import { Check, AlertCircle } from 'lucide-react';
import type { ConfigState, UpdateConfigFn } from './configurator-types';
import {
  ARTWORK_OPTIONS, SIZE_OPTIONS, TEXT_PREF_OPTIONS, LANG_OPTIONS, ORIGINAL_LANGUAGE,
  AGE_POS_OPTIONS, SIX_POS_OPTIONS, GENRE_POS_OPTIONS, QUALITY_BADGE_OPTIONS, TREND_STYLE_OPTIONS,
  OUTPUT_FORMAT_OPTIONS, TOP_RATED_STYLE_OPTIONS,
  suppressedQualityBadges,
} from './configurator-types';
import { QualityFine, GenreFine, AggregateFine, AgeFine, ProvidersFine, TitleLogoFine, ReleaseStatusFine, TrendingFine } from './configurator-fine';

// An unset position falls back to the top right, matching the renderer.
function qualityPosLabel(pos: string): string {
  const id = !pos || pos === 'inherit' ? 'tr' : pos;
  return `in the ${(SIX_POS_OPTIONS.find(o => o.id === id)?.label ?? 'Top right').toLowerCase()}`;
}

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
  const suppressed = suppressedQualityBadges(config.badges);
  const supersededLabels = Object.keys(suppressed)
    .map(id => QUALITY_BADGE_OPTIONS.find(o => o.id === id)?.label)
    .filter((l): l is string => Boolean(l));
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

        <fieldset style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 'var(--sp-3)', margin: 0 }}>
          <legend className="label" style={{ padding: '0 var(--sp-1)' }}>Per type artwork source</legend>
          <div className="cfg-fields">
            <Field label="Movies" htmlFor={`${uid}-artwork-movie`} hint="Overrides the artwork source for films.">
              <select id={`${uid}-artwork-movie`} className="select" value={config.artworkSourceMovie}
                onChange={e => onUpdate('artworkSourceMovie', e.target.value)}>
                <option value="">Same as default</option>
                {ARTWORK_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Series" htmlFor={`${uid}-artwork-series`} hint="Overrides the artwork source for TV.">
              <select id={`${uid}-artwork-series`} className="select" value={config.artworkSourceSeries}
                onChange={e => onUpdate('artworkSourceSeries', e.target.value)}>
                <option value="">Same as default</option>
                {ARTWORK_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Anime" htmlFor={`${uid}-artwork-anime`} hint="Overrides the artwork source for anime.">
              <select id={`${uid}-artwork-anime`} className="select" value={config.artworkSourceAnime}
                onChange={e => onUpdate('artworkSourceAnime', e.target.value)}>
                <option value="">Same as default</option>
                {ARTWORK_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </Field>
          </div>
        </fieldset>

        <fieldset style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 'var(--sp-3)', margin: 0 }}>
          <legend className="label" style={{ padding: '0 var(--sp-1)' }}>Output</legend>
          <div className="cfg-fields">
            <Field label="Format" htmlFor={`${uid}-output-format`} hint="Auto picks the best encoding for the artwork.">
              <select id={`${uid}-output-format`} className="select" value={config.outputFormat}
                onChange={e => onUpdate('outputFormat', e.target.value)} style={{ maxWidth: '10rem' }}>
                {OUTPUT_FORMAT_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="JPEG quality" htmlFor={`${uid}-output-quality`} hint="40–100. Blank keeps the default.">
              <input id={`${uid}-output-quality`} className="input" type="number" inputMode="numeric" min={40} max={100}
                value={config.outputQuality || ''} placeholder="default" style={{ maxWidth: '7rem' }}
                onChange={e => onUpdate('outputQuality', e.target.value === '' ? 0 : Number(e.target.value))} />
            </Field>
          </div>
        </fieldset>

        <ToggleRow
          label="Hide Cinemeta rating"
          hint="Serve Cinemeta metadata without its own rating"
          checked={config.hideCinemetaRating}
          onChange={() => onUpdate('hideCinemetaRating', !config.hideCinemetaRating)}
        />

        <ToggleRow
          label="Backdrop logo"
          hint="Overlay the title logo on the backdrop"
          checked={config.backdropLogo}
          onChange={() => onUpdate('backdropLogo', !config.backdropLogo)}
        />

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

        <Field
          label="Language"
          htmlFor={`${uid}-lang`}
          hint={config.language === ORIGINAL_LANGUAGE
            ? 'Artwork in whichever language each title was made in'
            : config.fallbackLanguage
              ? 'Preferred language for artwork, then the fallback below'
              : 'Preferred language for artwork, falling back to English'}
        >
          <select
            id={`${uid}-lang`}
            className="select"
            value={config.language}
            onChange={e => onUpdate('language', e.target.value)}
          >
            {/* The renderer accepts any code, so one set by hand has to appear
                here too, or the select shows blank and overwrites it. */}
            {!LANG_OPTIONS.some(o => o.id === config.language) && config.language && (
              <option value={config.language}>{config.language.toUpperCase()}</option>
            )}
            {LANG_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </Field>

        <Field
          label="Fallback language"
          htmlFor={`${uid}-fallback-lang`}
          hint="Tried when a title has no artwork in the language above, before English."
        >
          <select
            id={`${uid}-fallback-lang`}
            className="select"
            value={config.fallbackLanguage}
            onChange={e => onUpdate('fallbackLanguage', e.target.value)}
          >
            <option value="">None</option>
            {LANG_OPTIONS.filter(o => o.id !== ORIGINAL_LANGUAGE).map(o => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
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

        {/* The title logo is drawn on a backdrop-as-poster and on clean artwork,
            so its controls appear on exactly the surfaces that carry one. */}
        {fine && (
          (mediaType === 'poster' && (config.backdropAsPoster || config.textPreference === 'clean'))
          || (mediaType === 'backdrop' && config.textPreference === 'clean')
        ) && (
          <TitleLogoFine uid={uid} config={config} onUpdate={onUpdate} />
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

        {config.releaseStatus && fine && <ReleaseStatusFine uid={uid} config={config} onUpdate={onUpdate} />}

        <ToggleRow
          label="Top rated badge"
          hint="Mark films in the top-rated ranking. Needs the IMDb dataset with XRDB_IMDB_TOP_RATED enabled on the server."
          checked={config.topRated}
          onChange={() => onUpdate('topRated', !config.topRated)}
        />

        {config.topRated && (
          <Field label="Top rated badge position" htmlFor={`${uid}-toppos`}>
            <select
              id={`${uid}-toppos`}
              className="select"
              value={config.topRatedPos}
              onChange={e => onUpdate('topRatedPos', e.target.value)}
            >
              {SIX_POS_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </Field>
        )}

        {config.topRated && fine && (
          <>
            <Field label="Top rated badge style" htmlFor={`${uid}-topstyle`}>
              <select
                id={`${uid}-topstyle`}
                className="select"
                value={config.topRatedBadgeStyle}
                onChange={e => onUpdate('topRatedBadgeStyle', e.target.value)}
              >
                {TOP_RATED_STYLE_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </Field>
            {config.topRatedBadgeStyle !== 'plain' && (
              <Field label={config.topRatedBadgeStyle === 'tile' ? 'Top rated tile color' : 'Top rated border color'} htmlFor={`${uid}-toptile`}>
                <input
                  id={`${uid}-toptile`}
                  type="color"
                  value={config.topRatedTileColor || '#3355ff'}
                  onChange={e => onUpdate('topRatedTileColor', e.target.value)}
                  className="color-swatch"
                />
              </Field>
            )}
          </>
        )}

        <ToggleRow
          label="Awards badge"
          hint="Oscar/Emmy win or nomination"
          checked={config.awards}
          onChange={() => onUpdate('awards', !config.awards)}
        />

        {config.awards && (
          <Field label="Awards badge position" htmlFor={`${uid}-awardspos`}>
            <select
              id={`${uid}-awardspos`}
              className="select"
              value={config.awardsPos}
              onChange={e => onUpdate('awardsPos', e.target.value)}
            >
              {SIX_POS_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </Field>
        )}

        <ToggleRow
          label="Stinger badge"
          hint="After/during-credits scene"
          checked={config.stinger}
          onChange={() => onUpdate('stinger', !config.stinger)}
        />

        {config.stinger && (
          <Field label="Stinger badge position" htmlFor={`${uid}-stingerpos`}>
            <select
              id={`${uid}-stingerpos`}
              className="select"
              value={config.stingerPos}
              onChange={e => onUpdate('stingerPos', e.target.value)}
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
            {fine && <ProvidersFine uid={uid} config={config} onUpdate={onUpdate} />}
          </>
        )}

        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend className="label" style={{ marginBottom: 'var(--sp-2)' }}>
            Quality badges
            {config.badges.length > 0 && (
              <span className="count-pill">{config.badges.length}</span>
            )}
          </legend>
          {/* A release format belongs to a file, not to a title, so no metadata
              source carries it. Checking means asking a stream addon, which the
              instance either has or does not. */}
          <span className="hint" style={{ marginBottom: 'var(--sp-2)' }}>
            Pick the formats you care about. Each one is drawn on a title only
            when that title is actually available in it.
          </span>
          <ToggleRow
            label="Show quality badges"
            hint="Turn them all off without losing which ones you picked"
            checked={!config.qualityBadgesHidden}
            onChange={() => onUpdate('qualityBadgesHidden', !config.qualityBadgesHidden)}
          />
          <div className="chip-row" style={config.qualityBadgesHidden ? { opacity: 0.45 } : undefined}>
            {QUALITY_BADGE_OPTIONS.map(b => {
              const active = config.badges.includes(b.id);
              const supersededBy = suppressed[b.id];
              const label = QUALITY_BADGE_OPTIONS.find(o => o.id === supersededBy)?.label;
              return (
                <button
                  key={b.id}
                  className={`chip${active ? ' chip--active' : ''}${supersededBy ? ' chip--superseded' : ''}`}
                  onClick={() => onToggleBadge(b.id)}
                  aria-pressed={active}
                  title={supersededBy ? `${label} already covers ${b.label}, so it is not drawn` : undefined}
                >
                  {b.label}
                </button>
              );
            })}
          </div>
          <span className="hint" style={{ marginTop: 'var(--sp-2)' }}>
            {`Rendered ${qualityPosLabel(config.qualityBadgesPos)}. Corner positions stack into a column; the centre ones form a row.`}
            {supersededLabels.length > 0 &&
              ` ${supersededLabels.join(' and ')} ${supersededLabels.length > 1 ? 'are' : 'is'} already covered by a higher format you picked, so ${supersededLabels.length > 1 ? 'they are' : 'it is'} not drawn.`}
          </span>
          {fine && !config.qualityBadgesHidden && config.badges.length > 0 && (
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
          label="Info line"
          hint="Age rating, year and genre on one line at the foot of the artwork"
          checked={config.metaLine}
          onChange={() => onUpdate('metaLine', !config.metaLine)}
        />

        {config.metaLine && (
          <Field label="Info line scale (%)" htmlFor={`${uid}-metaline-scale`}
            hint="60–200. Blank keeps the default size.">
            <input id={`${uid}-metaline-scale`} className="input" type="number" inputMode="numeric"
              min={60} max={200} step={5} value={config.metaLineScale || ''} placeholder="default"
              style={{ maxWidth: '7rem' }}
              onChange={e => onUpdate('metaLineScale', e.target.value === '' ? 0 : Number(e.target.value))} />
          </Field>
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
