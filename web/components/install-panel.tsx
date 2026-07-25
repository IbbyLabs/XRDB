'use client';

import { useState, useId } from 'react';
import { Rocket, ExternalLink } from 'lucide-react';
import { installToAIOM, renderOrigin } from '@/lib/api';
import { CopyButton } from './copy-button';

const PUBLIC_INSTANCES = [
  { label: 'ElfHosted', url: 'https://aiometadata.elfhosted.com' },
  { label: 'Midnight',  url: 'https://aiometadatafortheweebs.midnightignite.me' },
  { label: 'Kuu',       url: 'https://aiometadata.stremio.ru' },
  { label: 'Viren',     url: 'https://aiometadata.viren070.me' },
  { label: 'Yeb',       url: 'https://aiometadata.fortheweak.cloud' },
  { label: 'Nhyira',    url: 'https://aiometadatafortheweak.nhyira.dev' },
  { label: 'Omni',      url: 'https://aiometadata.12312023.xyz' },
  { label: 'ATBP',      url: 'https://aiomd.atbphosting.com' },
  { label: 'Wizaardd',  url: 'https://aiometadata.forthewizards.uk' },
];

function normaliseOrigin(raw: string): string {
  try {
    return new URL(raw.trim()).origin;
  } catch {
    return raw;
  }
}

function isValidUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch { return false; }
}

const PUBLIC_URLS = new Set(PUBLIC_INSTANCES.map(i => normaliseOrigin(i.url)));

/** Artwork URL patterns for AIOMetadata's custom-art fields. On a keyed
 *  instance the render key rides along so AIOMetadata's server-side fetches
 *  authenticate. */
export function aiomPatterns(configKey: string, renderKey?: string, versionToken?: string) {
  const origin = renderOrigin();
  const params = new URLSearchParams();
  if (configKey) params.set('config', configKey);
  if (renderKey) params.set('key', renderKey);
  // Stremio holds poster images for 24-48h client-side regardless of the TTL
  // the server sends, so an edited profile only becomes visible if the URL
  // itself changes. The server ignores this parameter when rendering.
  if (versionToken) params.set('v', versionToken);
  const qs = params.toString();
  const suffix = qs ? `?${qs}` : '';
  return {
    poster:    `${origin}/poster/{imdb_id}${suffix}`,
    backdrop:  `${origin}/backdrop/{imdb_id}${suffix}`,
    logo:      `${origin}/logo/{imdb_id}${suffix}`,
    // Episode thumbnails carry the season/episode so XRDB renders and rates the
    // specific episode. {season}/{episode} are AIOMetadata placeholders.
    thumbnail: `${origin}/thumbnail/{imdb_id}:{season}:{episode}${suffix}`,
  };
}

interface InstallPanelProps {
  /** Saved profile key (alias preferred, else ID); empty = unsaved config. */
  configKey: string;
  /** Instance render key (XRDB_API_KEY) the operator entered, if any. */
  renderKey: string;
  /** Profile revision token, folded into the emitted URLs. */
  versionToken?: string;
  onRenderKeyChange: (value: string) => void;
  onNotice: (type: 'error' | 'success' | 'info', message: string) => void;
}

export function InstallPanel({ configKey, renderKey, versionToken, onRenderKeyChange, onNotice }: InstallPanelProps) {
  const uid = useId();
  const [selectedInstance, setSelectedInstance] = useState(PUBLIC_INSTANCES[0].url);
  const [customUrl, setCustomUrl] = useState('');
  const isCustom = selectedInstance === '__custom__';
  const baseUrl = isCustom ? customUrl.trim() : selectedInstance;
  const isPublic = PUBLIC_URLS.has(normaliseOrigin(baseUrl));
  const customUrlIsValid = !isCustom || isValidUrl(customUrl.trim());
  const [userUUID, setUserUUID] = useState('');
  const [password, setPassword] = useState('');
  const [addonPassword, setAddonPassword] = useState('');
  const [installing, setInstalling] = useState(false);
  const [installUrl, setInstallUrl] = useState('');

  const patterns = aiomPatterns(configKey, renderKey, versionToken);

  const handleInstall = async () => {
    setInstalling(true);
    setInstallUrl('');
    try {
      const result = await installToAIOM({
        baseUrl,
        userUUID: userUUID.trim(),
        password,
        addonPassword: !isPublic && addonPassword ? addonPassword : undefined,
        posterUrlPattern: patterns.poster,
        backgroundUrlPattern: patterns.backdrop,
        logoUrlPattern: patterns.logo,
        episodeThumbnailUrlPattern: patterns.thumbnail,
      });
      setInstallUrl(result.installUrl);
      onNotice('success', result.message);
    } catch (e) {
      onNotice('error', (e as Error).message);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="panel">
      <div className="panel-body cfg-fields">
        <div className="field">
          <label className="label" htmlFor={`${uid}-instance-key`}>Instance API key</label>
          <input
            id={`${uid}-instance-key`}
            className="input"
            type="password"
            value={renderKey}
            onChange={e => onRenderKeyChange(e.target.value)}
            placeholder="Only if this instance sets XRDB_API_KEY"
            spellCheck={false}
            autoComplete="off"
            aria-label="Instance API key"
          />
          <span className="hint">
            Needed only when the server sets <code>XRDB_API_KEY</code>. It&apos;s woven
            into the preview, image URLs, and the patterns below, and lets you save
            profiles. Kept in this browser session only.
          </span>
        </div>

        {!configKey && (
          <p className="hint" style={{ marginTop: 0 }}>
            Save a profile first in the <strong>Profile</strong> tab. The
            one-click install and the artwork URL patterns both need a saved
            config key — without one the links carry no styling and AIOMetadata
            falls back to default art.
          </p>
        )}

        {configKey && (<>
        <div className="field">
          <span className="label">AIOMetadata — one-click setup</span>
          <span className="hint" style={{ marginTop: 0 }}>
            Writes the XRDB artwork patterns into your AIOMetadata profile.
            Your AIOM credentials go directly to your chosen instance.
          </span>
        </div>

        <div className="field">
          <label className="label" htmlFor={`${uid}-base`}>Instance</label>
          <select
            id={`${uid}-base`}
            className="select"
            value={selectedInstance}
            onChange={e => setSelectedInstance(e.target.value)}
          >
            {PUBLIC_INSTANCES.map(i => (
              <option key={i.url} value={i.url}>{i.label}</option>
            ))}
            <option value="__custom__">Custom URL…</option>
          </select>
          {isCustom && (
            <input
              type="url"
              className="input"
              style={{ marginTop: 'var(--sp-2)' }}
              value={customUrl}
              onChange={e => setCustomUrl(e.target.value)}
              placeholder="https://your-aiom-instance.example.com"
              spellCheck={false}
              required
              aria-label="Custom instance URL"
            />
          )}
        </div>

        <div className="field">
          <label className="label" htmlFor={`${uid}-uuid`}>AIOM profile UUID</label>
          <input
            id={`${uid}-uuid`}
            className="input"
            value={userUUID}
            onChange={e => setUserUUID(e.target.value)}
            placeholder="e.g. 1f0a4b…"
            spellCheck={false}
            autoComplete="off"
          />
        </div>

        <div className="field">
          <label className="label" htmlFor={`${uid}-pw`}>AIOM profile password</label>
          <input
            id={`${uid}-pw`}
            className="input"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="off"
          />
        </div>

        {!isPublic && (
          <div className="field">
            <label className="label" htmlFor={`${uid}-apw`}>Addon password</label>
            <input
              id={`${uid}-apw`}
              className="input"
              type="password"
              value={addonPassword}
              onChange={e => setAddonPassword(e.target.value)}
              autoComplete="off"
            />
            <span className="hint">Only needed when your instance sets ADDON_PASSWORD</span>
          </div>
        )}

        <button
          className="btn btn-primary"
          onClick={handleInstall}
          disabled={installing || !configKey || !userUUID.trim() || !password || !customUrlIsValid}
        >
          <Rocket size={14} aria-hidden />
          {installing ? 'Installing…' : 'Install to AIOMetadata'}
        </button>

        {installUrl && (
          <div className="field">
            <span className="label">Stremio install link</span>
            <div className="urlbar">
              <code className="urlbar-code" title={installUrl}>{installUrl}</code>
              <CopyButton text={installUrl} label="Copy install link" />
              <a className="btn btn-ghost btn-sm" href={installUrl} target="_blank" rel="noreferrer" aria-label="Open install link">
                <ExternalLink size={13} aria-hidden />
              </a>
            </div>
          </div>
        )}

        <div className="field" style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--sp-4)' }}>
          <span className="label">Manual setup</span>
          <span className="hint" style={{ marginTop: 0 }}>
            Prefer doing it yourself? Paste these into AIOMetadata&apos;s custom
            artwork fields (set poster provider to “custom”).
          </span>
        </div>

        {([
          ['Poster URL pattern', patterns.poster],
          ['Background URL pattern', patterns.backdrop],
          ['Logo URL pattern', patterns.logo],
          ['Episode thumbnail URL pattern', patterns.thumbnail],
        ] as const).map(([label, value]) => (
          <div className="field" key={label}>
            <span className="label">{label}</span>
            <div className="urlbar">
              <code className="urlbar-code" title={value}>{value}</code>
              <CopyButton text={value} label={`Copy ${label.toLowerCase()}`} />
            </div>
          </div>
        ))}
        </>)}
      </div>
    </div>
  );
}
