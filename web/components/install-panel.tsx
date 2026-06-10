'use client';

import { useState, useId } from 'react';
import { Rocket, ExternalLink } from 'lucide-react';
import { installToAIOM, renderOrigin } from '@/lib/api';
import { CopyButton } from './copy-button';

/** Artwork URL patterns for AIOMetadata's custom-art fields. */
export function aiomPatterns(configKey: string) {
  const origin = renderOrigin();
  const cfg = configKey ? `?config=${encodeURIComponent(configKey)}` : '';
  return {
    poster:    `${origin}/poster/{imdb_id}${cfg}`,
    backdrop:  `${origin}/backdrop/{imdb_id}${cfg}`,
    logo:      `${origin}/logo/{imdb_id}${cfg}`,
    thumbnail: `${origin}/thumbnail/{imdb_id}${cfg}`,
  };
}

interface InstallPanelProps {
  /** Saved profile key (alias preferred, else ID); empty = unsaved config. */
  configKey: string;
  onNotice: (type: 'error' | 'success' | 'info', message: string) => void;
}

export function InstallPanel({ configKey, onNotice }: InstallPanelProps) {
  const uid = useId();
  const [baseUrl, setBaseUrl] = useState('');
  const [userUUID, setUserUUID] = useState('');
  const [password, setPassword] = useState('');
  const [addonPassword, setAddonPassword] = useState('');
  const [installing, setInstalling] = useState(false);
  const [installUrl, setInstallUrl] = useState('');

  const patterns = aiomPatterns(configKey);

  const handleInstall = async () => {
    setInstalling(true);
    setInstallUrl('');
    try {
      const result = await installToAIOM({
        baseUrl,
        userUUID: userUUID.trim(),
        password,
        addonPassword: addonPassword || undefined,
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
        {!configKey && (
          <p className="hint" style={{ marginTop: 0 }}>
            Save a profile first — the install needs a config key so AIOMetadata
            can request your artwork.
          </p>
        )}

        <div className="field">
          <span className="label">AIOMetadata — one-click setup</span>
          <span className="hint" style={{ marginTop: 0 }}>
            Writes the XRDB artwork patterns into your AIOMetadata profile.
            Your AIOM credentials go directly to your chosen instance.
          </span>
        </div>

        <div className="field">
          <label className="label" htmlFor={`${uid}-base`}>Instance</label>
          <input
            id={`${uid}-base`}
            className="input"
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            placeholder="https://aiometadata.elfhosted.com"
            spellCheck={false}
          />
          <span className="hint">Leave empty for the ElfHosted public instance</span>
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

        <div className="field">
          <label className="label" htmlFor={`${uid}-apw`}>Addon password (self-hosted only)</label>
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

        <button
          className="btn btn-primary"
          onClick={handleInstall}
          disabled={installing || !configKey || !userUUID.trim() || !password}
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
      </div>
    </div>
  );
}
