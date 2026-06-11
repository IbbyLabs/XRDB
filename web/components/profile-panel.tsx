'use client';

import { useState, useEffect, useId } from 'react';
import { Save, Download, FolderOpen, Trash2, LogOut, RefreshCw, History } from 'lucide-react';
import {
  createProfile, getProfile, updateProfile, deleteProfile, exportProfile,
  renderOrigin, type MediaType,
} from '@/lib/api';
import type { ConfigState } from './configurator-types';
import { CopyButton } from './copy-button';

const ALIAS_RE = /^[a-z]{3,32}$/;

// ── Recent profiles (this browser only) ────────────────────────────────────

interface RecentProfile {
  key: string;  // alias when set, otherwise id
  name: string;
}

const RECENTS_KEY = 'xrdb-recent-profiles';

function readRecents(): RecentProfile[] {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]') as RecentProfile[]; } catch { return []; }
}

function writeRecents(list: RecentProfile[]): RecentProfile[] {
  try { localStorage.setItem(RECENTS_KEY, JSON.stringify(list)); } catch { /* unavailable */ }
  return list;
}

function pushRecent(list: RecentProfile[], entry: RecentProfile): RecentProfile[] {
  return writeRecents([entry, ...list.filter(r => r.key !== entry.key)].slice(0, 5));
}

function dropRecent(list: RecentProfile[], ...keys: string[]): RecentProfile[] {
  return writeRecents(list.filter(r => !keys.includes(r.key)));
}

/** A profile this browser session has unlocked. */
export interface LoadedProfile {
  id: string;
  alias: string;
  name: string;
  hasPassword: boolean;
  password: string; // held in memory for this session only
}

interface ProfilePanelProps {
  config: ConfigState;
  mediaType: MediaType;
  mediaId: string;
  loaded: LoadedProfile | null;
  setLoaded: (p: LoadedProfile | null) => void;
  onLoadConfig: (config: Partial<ConfigState>) => void;
  flash: (type: 'error' | 'success' | 'info', message: string) => void;
}

export function ProfilePanel({
  config, mediaType, mediaId, loaded, setLoaded, onLoadConfig, flash,
}: ProfilePanelProps) {
  const uid = useId();
  const [name, setName] = useState('');
  const [alias, setAlias] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const [loadKey, setLoadKey] = useState('');
  const [loadPassword, setLoadPassword] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [recents, setRecents] = useState<RecentProfile[]>([]);

  // Restored after mount — localStorage reads during the first render
  // mismatch the statically prerendered HTML (React #418).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecents(readRecents());
  }, []);

  const configKey = loaded ? (loaded.alias || loaded.id) : '';
  const sampleUrl = configKey
    ? `${renderOrigin()}/${mediaType}/${encodeURIComponent(mediaId)}?config=${encodeURIComponent(configKey)}`
    : '';

  const validateAlias = (value: string): boolean => {
    if (value && !ALIAS_RE.test(value)) {
      flash('error', 'Alias must be 3-32 lowercase letters (a-z only)');
      return false;
    }
    return true;
  };

  const handleCreate = async () => {
    const trimmedAlias = alias.trim().toLowerCase();
    if (!validateAlias(trimmedAlias)) return;
    setBusy(true);
    try {
      const created = await createProfile({
        name: name.trim(),
        alias: trimmedAlias || undefined,
        type: mediaType,
        config: config as unknown as Record<string, unknown>,
        password: password || undefined,
      });
      setLoaded({
        id: created.id,
        alias: created.alias ?? '',
        name: created.name ?? '',
        hasPassword: !!password,
        password,
      });
      setName(''); setAlias(''); setPassword('');
      setRecents(r => pushRecent(r, {
        key: created.alias || created.id,
        name: created.name || created.alias || created.id,
      }));
      flash('success', `Profile saved — your config key is "${created.alias || created.id}"`);
    } catch (e) {
      flash('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleLoad = async (keyOverride?: string) => {
    const key = (keyOverride ?? loadKey).trim();
    if (!key) { flash('error', 'Enter a profile ID or alias'); return; }
    setBusy(true);
    try {
      const p = await getProfile(key, loadPassword || undefined);
      onLoadConfig(p.config as Partial<ConfigState>);
      setLoaded({
        id: p.id,
        alias: p.alias ?? '',
        name: p.name ?? '',
        hasPassword: !!p.hasPassword,
        password: loadPassword,
      });
      setLoadKey(''); setLoadPassword('');
      setRecents(r => pushRecent(r, {
        key: p.alias || p.id,
        name: p.name || p.alias || p.id,
      }));
      flash('success', `Loaded "${p.name || p.alias || p.id}" — you're now editing it`);
    } catch (e) {
      flash('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async () => {
    if (!loaded) return;
    setBusy(true);
    try {
      await updateProfile(
        loaded.id,
        {
          name: loaded.name,
          type: mediaType,
          config: config as unknown as Record<string, unknown>,
        },
        loaded.password || undefined,
      );
      flash('success', 'Profile updated');
    } catch (e) {
      flash('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!loaded) return;
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setBusy(true);
    try {
      await deleteProfile(loaded.id, loaded.password || undefined);
      setRecents(r => dropRecent(r, loaded.id, loaded.alias));
      setLoaded(null);
      setConfirmDelete(false);
      flash('success', 'Profile deleted');
    } catch (e) {
      flash('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    if (!loaded) return;
    try {
      const envelope = await exportProfile(loaded.id);
      const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `xrdb-profile-${loaded.id}.json`;
      a.click(); URL.revokeObjectURL(url);
      flash('success', 'Profile exported');
    } catch (e) {
      flash('error', (e as Error).message);
    }
  };

  // ── Editing an unlocked profile ─────────────────────────────────────────
  if (loaded) {
    return (
      <div className="panel">
        <div className="panel-body cfg-fields">
          <div className="profile-banner">
            <span className="profile-banner-name">{loaded.name || loaded.alias || loaded.id}</span>
            <span className="hint" style={{ marginTop: 0 }}>
              Editing this profile — changes apply when you press Update.
            </span>
          </div>

          <div className="field">
            <span className="label">Config key</span>
            <div className="urlbar">
              <code className="urlbar-code">{configKey}</code>
              <CopyButton text={configKey} label="Copy config key" />
            </div>
            {loaded.alias && (
              <span className="hint">Alias “{loaded.alias}” — ID {loaded.id} also works</span>
            )}
          </div>

          <div className="field">
            <span className="label">Artwork URL for this title</span>
            <div className="urlbar">
              <code className="urlbar-code" title={sampleUrl}>{sampleUrl}</code>
              <CopyButton text={sampleUrl} label="Copy artwork URL" />
            </div>
          </div>

          <div className="cfg-actions">
            <button className="btn btn-primary" onClick={handleUpdate} disabled={busy}>
              <RefreshCw size={13} aria-hidden />
              Update profile
            </button>
            <button className="btn btn-ghost" onClick={handleExport} disabled={busy} aria-label="Export profile as JSON">
              <Download size={13} aria-hidden />
              Export
            </button>
          </div>

          <div className="cfg-actions">
            <button
              className="btn btn-ghost"
              onClick={() => { setLoaded(null); setConfirmDelete(false); }}
              disabled={busy}
            >
              <LogOut size={13} aria-hidden />
              Close
            </button>
            <button className="btn btn-danger" onClick={handleDelete} disabled={busy}>
              <Trash2 size={13} aria-hidden />
              {confirmDelete ? 'Press again to delete' : 'Delete'}
            </button>
          </div>
          {confirmDelete && (
            <span className="hint hint-error" role="alert">
              Deleting removes this profile permanently — every URL using it stops working.
            </span>
          )}
        </div>
      </div>
    );
  }

  // ── Create new / load existing ──────────────────────────────────────────
  return (
    <div className="panel">
      <div className="panel-body cfg-fields">
        <div className="field">
          <label className="label" htmlFor={`${uid}-name`}>Name</label>
          <input
            id={`${uid}-name`}
            className="input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="My living room setup"
          />
        </div>

        <div className="field">
          <label className="label" htmlFor={`${uid}-alias`}>Alias</label>
          <input
            id={`${uid}-alias`}
            className="input"
            value={alias}
            onChange={e => setAlias(e.target.value.toLowerCase())}
            placeholder="myposters"
            spellCheck={false}
            autoComplete="off"
          />
          <span className="hint">
            Optional memorable handle for URLs — lowercase letters only.
            Without one you get a generated ID.
          </span>
        </div>

        <div className="field">
          <label className="label" htmlFor={`${uid}-pw`}>Password</label>
          <input
            id={`${uid}-pw`}
            className="input"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <span className="hint">Protects your profile from edits — recommended</span>
        </div>

        <button className="btn btn-primary" onClick={handleCreate} disabled={busy}>
          <Save size={13} aria-hidden />
          {busy ? 'Saving…' : 'Save profile'}
        </button>

        <div className="field" style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--sp-4)' }}>
          <label className="label" htmlFor={`${uid}-loadkey`}>Load an existing profile</label>
          <input
            id={`${uid}-loadkey`}
            className="input"
            value={loadKey}
            onChange={e => setLoadKey(e.target.value)}
            placeholder="ID or alias"
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        <div className="field">
          <label className="label" htmlFor={`${uid}-loadpw`}>Profile password</label>
          <input
            id={`${uid}-loadpw`}
            className="input"
            type="password"
            value={loadPassword}
            onChange={e => setLoadPassword(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void handleLoad(); }}
            autoComplete="off"
          />
        </div>
        <button className="btn btn-ghost" onClick={() => void handleLoad()} disabled={busy}>
          <FolderOpen size={13} aria-hidden />
          {busy ? 'Loading…' : 'Load profile'}
        </button>

        {recents.length > 0 && (
          <div className="field">
            <span className="label">
              <History size={12} aria-hidden style={{ verticalAlign: '-2px', marginRight: 'var(--sp-1)' }} />
              Recent on this browser
            </span>
            <div className="pin-row">
              {recents.map(r => (
                <button
                  key={r.key}
                  className="chip"
                  onClick={() => void handleLoad(r.key)}
                  disabled={busy}
                  title={`Load "${r.name}" (${r.key})`}
                >
                  {r.name}
                </button>
              ))}
            </div>
            <span className="hint">
              Password-protected profiles still need their password above.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
