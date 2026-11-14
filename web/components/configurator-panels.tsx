'use client';

import { useState, useEffect } from 'react';
import { Check, ChevronUp, ChevronDown } from 'lucide-react';
import { fetchTemplates, type Template } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { msg } from '@/lib/i18n-msg';
import type { ConfigState, UpdateConfigFn } from './configurator-types';
import {
  LAYOUT_OPTIONS, RATING_OPTIONS, BADGE_STYLE_OPTIONS, BADGE_THEME_OPTIONS, RING_POS_OPTIONS,
  SIDE_LAYOUTS,
} from './configurator-types';
import { NumField, RatingBadgesFine, ScoreColourFine, RatingRingFine, PILL_PRESENTATIONS, scoreColoursHaveAReader, drawsBadgeStrip, hasAnyRatingSource } from './configurator-fine';

// ── Template strip ────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  minimal:   msg('Minimal'),
  detailed:  msg('Detailed'),
  cinema:    msg('Cinema'),
  streaming: msg('Streaming'),
};

export function TemplateStrip({
  appliedId, onApply,
}: { appliedId: string | null; onApply: (tpl: Template) => void }) {
  const t = useT();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

  useEffect(() => {
    fetchTemplates()
      .then(setTemplates)
      .catch((e: unknown) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  // Templates are a shortcut, never a blocker — degrade silently to the
  // manual controls when the endpoint is unreachable.
  if (error) return null;

  return (
    <section aria-label={t('Templates')} style={{ marginBottom: 'var(--sp-4)' }}>
      <span className="label">{t('Start from a template')}</span>
      <div className="tpl-strip">
        {loading
          ? [0, 1, 2, 3].map(i => <div key={i} className="skeleton tpl-skeleton" />)
          : templates.map(tpl => {
              const applied = appliedId === tpl.id;
              return (
                <button
                  key={tpl.id}
                  className={`tpl-card${applied ? ' tpl-card--applied' : ''}`}
                  onClick={() => onApply(tpl)}
                  aria-pressed={applied}
                  aria-label={t('Apply template: {name}', { name: tpl.name })}
                >
                  <span className="tpl-cat">{CATEGORY_LABELS[tpl.category] ? t(CATEGORY_LABELS[tpl.category]) : tpl.category}</span>
                  <span className="tpl-name">
                    {applied && <Check size={13} aria-hidden />}
                    {tpl.name}
                  </span>
                  <span className="tpl-desc">{tpl.description}</span>
                </button>
              );
            })}
      </div>
    </section>
  );
}

// ── Ratings panel ─────────────────────────────────────────────────────────────

// Nuvio centre-crops the 16:9 thumbnail: cards (phone, desktop, TV) cut 4-7% per
// side, the square list image cuts 22%.
const NUVIO_INSET_PRESETS = [
  { value: 8, label: msg('Nuvio cards (phone, desktop, TV): 8%') },
  { value: 22, label: msg('Nuvio list: 22%') },
] as const;

interface RatingsPanelProps {
  uid: string;
  config: ConfigState;
  onUpdate: UpdateConfigFn;
  onToggleRating: (r: string) => void;
  onMoveRating: (r: string, dir: -1 | 1) => void;
  /** Reveals the per-badge scale, offset and colour controls in place. */
  fine: boolean;
  mediaType: string;
}

function SourceRow({ r, active, failed, onToggle, onLogoError }: {
  r: { id: string; label: string; icon?: string; accent: string };
  active: boolean;
  failed: boolean;
  onToggle: () => void;
  onLogoError: () => void;
}) {
  return (
    <button
      className={`src-row${active ? ' src-row--active' : ''}`}
      onClick={onToggle}
      aria-pressed={active}
    >
      {r.icon && !failed ? (
        <img className="src-logo" src={r.icon} alt="" aria-hidden width={18} height={18}
          loading="lazy" onError={onLogoError} />
      ) : (
        <span className="src-dot" style={{ background: r.accent }} aria-hidden />
      )}
      <span className="src-label">{r.label}</span>
      <span className="src-check" aria-hidden>{active ? <Check size={12} /> : null}</span>
    </button>
  );
}

// Swap id with its neighbour in dir; unchanged when it cannot move.
function moved(list: string[], id: string, dir: -1 | 1): string[] {
  const i = list.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

function SourceOrderList({ ids, labelId, logoFailed, onLogoError, onMove }: {
  ids: string[];
  labelId: string;
  logoFailed: Record<string, boolean>;
  onLogoError: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
}) {
  const t = useT();
  return (
    <ol className="src-order" aria-labelledby={labelId}>
      {ids.map((id, i) => {
        const opt = RATING_OPTIONS.find(o => o.id === id);
        return (
          <li className="src-order-row" key={id}>
            <span className="src-order-num" aria-hidden>{i + 1}</span>
            {opt?.icon && !logoFailed[id] ? (
              <img
                className="src-logo"
                src={opt.icon}
                alt=""
                aria-hidden
                width={18}
                height={18}
                loading="lazy"
                onError={() => onLogoError(id)}
              />
            ) : (
              <span className="src-dot" style={{ background: opt?.accent }} aria-hidden />
            )}
            <span className="src-label">{opt?.label ?? id}</span>
            <button
              className="src-order-btn"
              onClick={() => onMove(id, -1)}
              disabled={i === 0}
              aria-label={t('Move {label} earlier', { label: opt?.label ?? id })}
            >
              <ChevronUp size={13} aria-hidden />
            </button>
            <button
              className="src-order-btn"
              onClick={() => onMove(id, 1)}
              disabled={i === ids.length - 1}
              aria-label={t('Move {label} later', { label: opt?.label ?? id })}
            >
              <ChevronDown size={13} aria-hidden />
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function RatingsPanel({ uid, config, onUpdate, onToggleRating, onMoveRating, fine, mediaType }: RatingsPanelProps) {
  const t = useT();
  // Track source logos that fail to load so we fall back to the accent dot.
  const [logoFailed, setLogoFailed] = useState<Record<string, boolean>>({});
  return (
    <div className="panel">
      <div className="panel-body cfg-fields">
        {/* Only the badge strip is placed by this; the other presentations carry
            their own position control. */}
        {drawsBadgeStrip(config.ratingPresentation) && (
          <div className="field">
            <span className="label" id={`${uid}-layout-label`}>{t('Position')}</span>
            <div className="opt-grid" role="group" aria-labelledby={`${uid}-layout-label`}>
              {LAYOUT_OPTIONS.map(o => (
                <button
                  key={o.id}
                  className={`opt-btn${config.ratingsLayout === o.id ? ' opt-btn--active' : ''}`}
                  onClick={() => onUpdate('ratingsLayout', o.id)}
                  aria-pressed={config.ratingsLayout === o.id}
                >
                  {t(o.label)}
                </button>
              ))}
            </div>
          </div>
        )}

        {mediaType === 'thumbnail' && (
          <div className="field">
            <NumField id={`${uid}-thumb-safe-inset`} label={t('Safe inset (% of width)')} value={config.thumbnailSafeInset}
              onChange={v => onUpdate('thumbnailSafeInset', v)} min={0} max={25}
              hint={t('Keeps badges this far in from the left and right edges. Nuvio crops thumbnails into cards and square list images, so anything on the edge is cut. Top centre is the safe spot: a bottom-centre row is not cut, but the title text and its dark fade sit over it.')} />
            <div className="opt-grid" role="group" aria-label={t('Nuvio inset presets')} style={{ marginTop: 'var(--sp-2)' }}>
              {NUVIO_INSET_PRESETS.map(o => (
                <button
                  key={o.value}
                  className={`opt-btn${config.thumbnailSafeInset === o.value ? ' opt-btn--active' : ''}`}
                  onClick={() => onUpdate('thumbnailSafeInset', o.value)}
                  aria-pressed={config.thumbnailSafeInset === o.value}
                >
                  {t(o.label)}
                </button>
              ))}
            </div>
          </div>
        )}

        {drawsBadgeStrip(config.ratingPresentation) && SIDE_LAYOUTS.includes(config.ratingsLayout) && (
          <>
            <div className="field">
              <label className="label" htmlFor={`${uid}-side-pos`}>{t('Side ratings vertical')}</label>
              <select id={`${uid}-side-pos`} className="select" value={config.sideRatingsPosition}
                onChange={e => onUpdate('sideRatingsPosition', e.target.value)} style={{ maxWidth: '12rem' }}>
                <option value="middle">{t('Middle')}</option>
                <option value="top">{t('Top')}</option>
                <option value="bottom">{t('Bottom')}</option>
                <option value="custom">{t('Custom offset')}</option>
              </select>
            </div>
            {config.sideRatingsPosition === 'custom' && (
              <div className="field">
                <label className="label" htmlFor={`${uid}-side-offset`}>{t('Vertical offset (px)')}</label>
                <input id={`${uid}-side-offset`} className="input" type="number" inputMode="numeric"
                  min={-400} max={400} value={config.sideRatingsOffset || ''}
                  placeholder="0"
                  onChange={e => onUpdate('sideRatingsOffset', e.target.value === '' ? 0 : Number(e.target.value))}
                  style={{ maxWidth: '9rem' }} />
              </div>
            )}
            <div className="field">
              <label className="label" htmlFor={`${uid}-max-per-side`}>{t('Max per side')}</label>
              <input id={`${uid}-max-per-side`} className="input" type="number" inputMode="numeric"
                min={0} max={20} value={config.ratingsMaxPerSide || ''}
                placeholder={t('no cap')}
                onChange={e => onUpdate('ratingsMaxPerSide', e.target.value === '' ? 0 : Number(e.target.value))}
                style={{ maxWidth: '9rem' }} />
            </div>
          </>
        )}

        {((drawsBadgeStrip(config.ratingPresentation) && config.ratingsLayout !== 'none')
          || PILL_PRESENTATIONS.includes(config.ratingPresentation)) && (
          <>
            <div className="field">
              <span className="label" id={`${uid}-bstyle-label`}>{t('Badge style')}</span>
              <div className="opt-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }} role="group" aria-labelledby={`${uid}-bstyle-label`}>
                {BADGE_STYLE_OPTIONS.map(o => (
                  <button
                    key={o.id}
                    className={`opt-btn${config.badgeStyle === o.id ? ' opt-btn--active' : ''}`}
                    onClick={() => onUpdate('badgeStyle', o.id)}
                    aria-pressed={config.badgeStyle === o.id}
                  >
                    {t(o.label)}
                  </button>
                ))}
              </div>
              <span className="hint" style={{ marginTop: 'var(--sp-2)' }}>
                {t('Coming from v2? Its glass badges are')} <strong>{t('Pill')}</strong>
                {t(' here, and look closest with Icon shape set to Circle. Outline is a transparent style of its own.')}
              </span>
            </div>

            <div className="field">
              <span className="label" id={`${uid}-btheme-label`}>{t('Badge theme')}</span>
              <div className="opt-grid" role="group" aria-labelledby={`${uid}-btheme-label`}>
                {BADGE_THEME_OPTIONS.map(o => (
                  <button
                    key={o.id}
                    className={`opt-btn${config.badgeTheme === o.id ? ' opt-btn--active' : ''}`}
                    onClick={() => onUpdate('badgeTheme', o.id)}
                    aria-pressed={config.badgeTheme === o.id}
                  >
                    {t(o.label)}
                  </button>
                ))}
              </div>
            </div>

          </>
        )}

        {/* The pill presentations draw whatever the layout says, so hiding the
            badge strip must not take their controls with it. */}
        {fine && (config.ratingsLayout !== 'none' || PILL_PRESENTATIONS.includes(config.ratingPresentation)) && (
          <RatingBadgesFine uid={uid} config={config} onUpdate={onUpdate} />
        )}

        {/* Gated on its own readers rather than on the badge strip: the ring and
            the aggregate bar read these colours too, and a ring with no badges
            could not reach them. The mode gate inside the group is untouched. */}
        {fine && scoreColoursHaveAReader(config) && (
          <ScoreColourFine uid={uid} config={config} onUpdate={onUpdate} />
        )}

        {hasAnyRatingSource(config) && (
          <>
            <div className="field">
              <span className="label" id={`${uid}-ring-label`}>{t('Average ring')}</span>
              <div className="opt-grid" role="group" aria-labelledby={`${uid}-ring-label`}>
                <button
                  className={`opt-btn${!config.ratingRing ? ' opt-btn--active' : ''}`}
                  onClick={() => onUpdate('ratingRing', false)}
                  aria-pressed={!config.ratingRing}
                >
                  {t('Off')}
                </button>
                <button
                  className={`opt-btn${config.ratingRing ? ' opt-btn--active' : ''}`}
                  onClick={() => onUpdate('ratingRing', true)}
                  aria-pressed={config.ratingRing}
                >
                  {t('Ring')}
                </button>
              </div>
            </div>

            {config.ratingRing && (
              <>
                <div className="field">
                  <span className="label" id={`${uid}-ring-pos-label`}>{t('Ring position')}</span>
                  <div className="opt-grid" role="group" aria-labelledby={`${uid}-ring-pos-label`}>
                    {RING_POS_OPTIONS.map(o => (
                      <button
                        key={o.id}
                        className={`opt-btn${config.ratingRingPos === o.id ? ' opt-btn--active' : ''}`}
                        onClick={() => onUpdate('ratingRingPos', o.id)}
                        aria-pressed={config.ratingRingPos === o.id}
                      >
                        {t(o.label)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <label className="label" htmlFor={`${uid}-ring-color`}>{t('Ring color')}</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                    <input
                      id={`${uid}-ring-color`}
                      type="color"
                      value={config.ratingRingColor || '#27ae60'}
                      onChange={e => onUpdate('ratingRingColor', e.target.value)}
                      className="color-swatch"
                    />
                    <button
                      className={`opt-btn${!config.ratingRingColor ? ' opt-btn--active' : ''}`}
                      onClick={() => onUpdate('ratingRingColor', '')}
                      aria-pressed={!config.ratingRingColor}
                      style={{ flex: 1 }}
                    >
                      {t('Auto (score-based)')}
                    </button>
                  </div>
                  <span className="hint" style={{ marginTop: 'var(--sp-1)' }}>
                    {t('Auto follows your Score colours when you have set any, and green / amber / red otherwise. Pick a color to override.')}
                  </span>
                </div>

                <div className="field">
                  <label className="label" htmlFor={`${uid}-ring-placeholder-color`}>{t('Empty ring color')}</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                    <input
                      id={`${uid}-ring-placeholder-color`}
                      type="color"
                      value={config.ratingRingPlaceholderColor || '#7f8c8d'}
                      onChange={e => onUpdate('ratingRingPlaceholderColor', e.target.value)}
                      className="color-swatch"
                    />
                    <button
                      className={`opt-btn${!config.ratingRingPlaceholderColor ? ' opt-btn--active' : ''}`}
                      onClick={() => onUpdate('ratingRingPlaceholderColor', '')}
                      aria-pressed={!config.ratingRingPlaceholderColor}
                      style={{ flex: 1 }}
                    >
                      {t('Faint outline')}
                    </button>
                  </div>
                  <span className="hint" style={{ marginTop: 'var(--sp-1)' }}>
                    {t('The ring drawn for a title with no rating, when the empty ring placeholder is on. Faint outline is what it has always drawn.')}
                  </span>
                </div>

                {fine && <RatingRingFine uid={uid} config={config} onUpdate={onUpdate} />}
              </>
            )}
          </>
        )}

        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend className="label" style={{ marginBottom: 'var(--sp-2)' }}>
            {t('Sources')}
            {config.ratings.length > 0 && (
              <span className="count-pill">{config.ratings.length}</span>
            )}
          </legend>
          {([
            { key: 'general', label: msg('General'), items: RATING_OPTIONS.filter(r => !r.group) },
            { key: 'anime',   label: msg('Anime'),   items: RATING_OPTIONS.filter(r => r.group === 'anime') },
          ]).map(group => (
            <div key={group.key} style={{ marginBottom: 'var(--sp-2)' }}>
              <span className="hint" style={{ marginTop: 0, marginBottom: 'var(--sp-1)' }}>{t(group.label)}</span>
              <div className="src-list" role="group" aria-label={t('{label} rating sources', { label: t(group.label) })}>
                {group.items.map(r => (
                  <SourceRow
                    key={r.id}
                    r={r}
                    active={config.ratings.includes(r.id)}
                    failed={!!logoFailed[r.id]}
                    onToggle={() => onToggleRating(r.id)}
                    onLogoError={() => setLogoFailed(prev => ({ ...prev, [r.id]: true }))}
                  />
                ))}
              </div>
            </div>
          ))}
          <span className="hint" style={{ marginTop: 0 }}>
            {t('Only sources that have data for the specific title will appear — selecting a source does not guarantee it shows up if the provider has no rating for that title.')}
          </span>

          {config.ratings.includes('custom') && (
            <div className="field" style={{ marginTop: 'var(--sp-3)' }}>
              <label className="label" htmlFor={`${uid}-custom-label`}>{t('Custom Source Label')}</label>
              <input id={`${uid}-custom-label`} className="input" type="text" maxLength={12}
                value={config.customRatingLabel} placeholder={t('e.g. My Score')} spellCheck={false}
                onChange={e => onUpdate('customRatingLabel', e.target.value)} />
              <span className="hint">
                {t("Shown before the score unless you set a custom icon for it. The endpoint is set in your saved profile, under its keys, so it never appears in a poster link. It is called with the title's IMDb id and answers with JSON such as")} {'{'}&quot;score&quot;: 8.1, &quot;max&quot;: 10{'}'}.
              </span>
            </div>
          )}

          {config.ratings.length > 1 && (
            <div className="field" style={{ marginTop: 'var(--sp-3)' }}>
              <span className="label" id={`${uid}-order-label`}>{t('Order')}</span>
              <span className="hint" style={{ marginTop: 0, marginBottom: 'var(--sp-2)' }}>
                {t('Badges are drawn in this order, skipping any source with no rating for the title. With a maximum set, put the sources you want first at the top.')}
              </span>
              <SourceOrderList
                ids={config.ratings}
                labelId={`${uid}-order-label`}
                logoFailed={logoFailed}
                onLogoError={id => setLogoFailed(prev => ({ ...prev, [id]: true }))}
                onMove={onMoveRating}
              />
            </div>
          )}
        </fieldset>

        {fine && (
          <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend className="label" style={{ marginBottom: 'var(--sp-2)' }}>{t('Per-type sources')}</legend>
            <span className="hint" style={{ marginTop: 0, marginBottom: 'var(--sp-2)' }}>
              {t('Pick different sources for a media type. Leave a type empty to use the sources above, or choose No ratings to show none for that type alone.')}
            </span>
            {([
              { key: 'ratingsMovie' as const, label: msg('Movies') },
              { key: 'ratingsSeries' as const, label: msg('Series') },
              { key: 'ratingsAnime' as const, label: msg('Anime') },
            ]).map(pt => {
              // "none" is the stored spelling for a deliberately empty list; an
              // empty one means inherit, so the two cannot be the same state.
              const chosen = config[pt.key].filter(x => x !== 'none');
              const isNone = config[pt.key].includes('none');
              return (
              <div key={pt.key} style={{ marginBottom: 'var(--sp-2)' }}>
                <span className="hint" style={{ marginTop: 0, marginBottom: 'var(--sp-1)' }}>
                  {t(pt.label)}
                  {chosen.length > 0 && (
                    <span className="count-pill">{chosen.length}</span>
                  )}
                </span>
                <button
                  type="button"
                  className={`opt-btn${isNone ? ' opt-btn--active' : ''}`}
                  aria-pressed={isNone}
                  onClick={() => onUpdate(pt.key, isNone ? [] : ['none'])}
                  style={{ marginBottom: 'var(--sp-1)' }}
                >
                  {t('No ratings')}
                </button>
                <div className="src-list" role="group" aria-label={t('{label} rating source override', { label: t(pt.label) })}>
                  {RATING_OPTIONS.map(r => (
                    <SourceRow
                      key={r.id}
                      r={r}
                      active={chosen.includes(r.id)}
                      failed={!!logoFailed[r.id]}
                      onToggle={() => {
                        onUpdate(pt.key, chosen.includes(r.id)
                          ? chosen.filter(x => x !== r.id)
                          : [...chosen, r.id]);
                      }}
                      onLogoError={() => setLogoFailed(prev => ({ ...prev, [r.id]: true }))}
                    />
                  ))}
                </div>
                {chosen.length > 1 && (
                  <div className="field" style={{ marginTop: 'var(--sp-2)' }}>
                    <span className="label" id={`${uid}-${pt.key}-order-label`}>{t('{label} order', { label: t(pt.label) })}</span>
                    <SourceOrderList
                      ids={chosen}
                      labelId={`${uid}-${pt.key}-order-label`}
                      logoFailed={logoFailed}
                      onLogoError={id => setLogoFailed(prev => ({ ...prev, [id]: true }))}
                      onMove={(id, dir) => onUpdate(pt.key, moved(chosen, id, dir))}
                    />
                  </div>
                )}
              </div>
              );
            })}
          </fieldset>
        )}
      </div>
    </div>
  );
}
