'use client';

import { useState, useEffect, useId, useRef } from 'react';
import { Save, Download, Upload, FolderOpen, Trash2, LogOut, RefreshCw, History, Wand2 } from 'lucide-react';
import {
  createProfile, getProfile, updateProfile, deleteProfile, exportProfile, importProfiles,
  renderOrigin, type MediaType,
} from '@/lib/api';
import { toStoredConfig, fromStoredConfig, type SurfaceConfigs } from './configurator-types';
import { migrateLegacyConfig, type MigrateResult } from '@/lib/api';
import { CopyButton } from './copy-button';

const ALIAS_RE = /^[a-z]{3,32}$/;

// ── Recent profiles (this browser only) ────────────────────────────────────

interface RecentProfile {
  key: string;  // alias when set, otherwise id
  name: string;
}

const RECENTS_KEY = 'xrdb-recent-profiles';

function readRecents(): RecentProfile[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    // Stored data can be corrupted or from an older shape — keep only
    // well-formed entries so consumers can trust .key and .name.
    return parsed.filter((item): item is RecentProfile =>
      typeof item === 'object' && item !== null
      && typeof (item as RecentProfile).key === 'string'
      && typeof (item as RecentProfile).name === 'string');
  } catch { return []; }
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
  versionToken: string;
  /** Providers this profile has its own key for. Names only — the values stay
   *  on the server. */
  keysSet?: string[];
}

interface ProfilePanelProps {
  configs: SurfaceConfigs;
  mediaType: MediaType;
  mediaId: string;
  loaded: LoadedProfile | null;
  setLoaded: (p: LoadedProfile | null) => void;
  onLoadConfigs: (configs: SurfaceConfigs) => void;
  flash: (type: 'error' | 'success' | 'info', message: string, opts?: { persist?: boolean }) => void;
}

// The providers a profile owner can supply their own credential for. Must stay
// in step with provider.SupportedKeys on the server.
const PROVIDER_KEY_FIELDS = [
  { id: 'tmdb',    label: 'TMDB' },
  { id: 'mdblist', label: 'MDBList' },
  { id: 'omdb',    label: 'OMDb' },
  { id: 'fanart',  label: 'Fanart.tv' },
  { id: 'trakt',   label: 'Trakt client ID' },
  { id: 'simkl',   label: 'SIMKL client ID' },
] as const;

export function ProfilePanel({
  configs, mediaType, mediaId, loaded, setLoaded, onLoadConfigs, flash,
}: ProfilePanelProps) {
  const uid = useId();
  const [alias, setAlias] = useState('');
  const [password, setPassword] = useState('');
  // Typed-in keys only; a saved value is never sent back to the browser.
  const [providerKeys, setProviderKeys] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const [legacyInput, setLegacyInput] = useState('');
  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState<MigrateResult | null>(null);
  const [migrateError, setMigrateError] = useState('');

  const [loadKey, setLoadKey] = useState('');
  const [loadPassword, setLoadPassword] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [recents, setRecents] = useState<RecentProfile[]>([]);
  // Serialized configs as last saved to / loaded from the server, so the panel
  // can tell the user when the current edit diverges from the stored profile.
  const [savedSnapshot, setSavedSnapshot] = useState('');
  // The config as it was loaded, created, or last saved by hand. Autosave does
  // not move it, so it stays a checkpoint worth returning to; the snapshot above
  // tracks the autosaved state and is only a fraction of a second behind.
  const [checkpoint, setCheckpoint] = useState('');
  const isDirty = loaded !== null && savedSnapshot !== '' && JSON.stringify(configs) !== savedSnapshot;
  // Autosave means there is no unsaved state to warn about, so the useful offer
  // is a way back to the checkpoint rather than a prompt to save.
  const canRevert = loaded !== null && checkpoint !== '' && JSON.stringify(configs) !== checkpoint;

  const handleRevert = () => {
    if (!canRevert) return;
    onLoadConfigs(JSON.parse(checkpoint) as SurfaceConfigs);
    flash('info', 'Settings put back to the last saved version');
  };

  // Restored after mount — localStorage reads during the first render
  // mismatch the statically prerendered HTML (React #418).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecents(readRecents());
  }, []);

  const configKey = loaded ? (loaded.alias || loaded.id) : '';
  const sampleUrl = configKey
    ? `${renderOrigin()}/${mediaType}/${encodeURIComponent(mediaId)}?config=${encodeURIComponent(configKey)}`
      + (loaded?.versionToken ? `&v=${encodeURIComponent(loaded.versionToken)}` : '')
    : '';

  const validateAlias = (value: string): boolean => {
    if (!value) {
      flash('error', 'Pick a username — it is what you sign in with');
      return false;
    }
    if (!ALIAS_RE.test(value)) {
      flash('error', 'Username must be 3-32 lowercase letters (a-z only)');
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
        alias: trimmedAlias,
        type: mediaType,
        config: toStoredConfig(configs),
        password: password || undefined,
      });
      setLoaded({
        id: created.id,
        alias: created.alias ?? '',
        name: created.name ?? '',
        hasPassword: !!password,
        password,
        versionToken: created.versionToken ?? '',
      });
      setAlias(''); setPassword('');
      setSavedSnapshot(JSON.stringify(configs));
      setCheckpoint(JSON.stringify(configs));
      setRecents(r => pushRecent(r, {
        key: created.alias || created.id,
        name: created.name || created.alias || created.id,
      }));
      flash('success', `Profile saved — your config key is "${created.alias || created.id}"`, { persist: true });
    } catch (e) {
      flash('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleLoad = async (keyOverride?: string) => {
    const key = (keyOverride ?? loadKey).trim();
    if (!key) { flash('error', 'Enter your username, or the profile ID if you made one before usernames'); return; }
    setBusy(true);
    try {
      const p = await getProfile(key, loadPassword || undefined);
      const loadedCfgs = fromStoredConfig(p.config);
      onLoadConfigs(loadedCfgs);
      setSavedSnapshot(JSON.stringify(loadedCfgs));
      setCheckpoint(JSON.stringify(loadedCfgs));
      setLoaded({
        id: p.id,
        alias: p.alias ?? '',
        name: p.name ?? '',
        hasPassword: !!p.hasPassword,
        password: loadPassword,
        versionToken: p.versionToken ?? '',
        keysSet: p.keysSet ?? [],
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

  const handleMigrate = async () => {
    setMigrating(true);
    setMigrateError('');
    setMigrateResult(null);
    try {
      const result = await migrateLegacyConfig(legacyInput);
      const cfgs = fromStoredConfig(result.config as Record<string, unknown>);
      onLoadConfigs(cfgs);
      setMigrateResult(result);
      flash('success', `Brought ${result.read} setting${result.read === 1 ? '' : 's'} across. Save it as a profile to keep it.`);
    } catch (e) {
      setMigrateError((e as Error).message);
    } finally {
      setMigrating(false);
    }
  };

  const handleUpdate = async (silent = false) => {
    if (!loaded) return;
    setBusy(true);
    try {
      const updated = await updateProfile(
        loaded.id,
        {
          name: loaded.name,
          type: mediaType,
          config: toStoredConfig(configs),
          // Only send keys the user actually typed, so an untouched field
          // leaves whatever is stored alone.
          ...(Object.keys(providerKeys).length > 0 ? { providerKeys } : {}),
        },
        loaded.password || undefined,
      );
      // Adopt the new token so the install URLs shown from here on point at the
      // edited profile rather than the revision the client already handed out.
      setLoaded({ ...loaded, versionToken: updated.versionToken ?? '', keysSet: updated.keysSet ?? loaded.keysSet });
      setProviderKeys({});
      setSavedSnapshot(JSON.stringify(configs));
      // Only a deliberate save moves the checkpoint; the autosave must not, or
      // there would be nothing left to revert to.
      if (!silent) setCheckpoint(JSON.stringify(configs));
      if (!silent) flash('success', 'Profile updated');
    } catch (e) {
      flash('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // A loaded profile saves itself: editing it is the intent, so there is
  // nothing to press. The write is debounced so dragging a slider stores one
  // revision rather than one per frame, and stays quiet so the panel does not
  // flash on every edit. Creating a profile still needs the button, because
  // that takes a name.
  const autoSave = useRef(handleUpdate);
  useEffect(() => { autoSave.current = handleUpdate; });
  useEffect(() => {
    if (!isDirty || busy) return;
    const timer = setTimeout(() => { void autoSave.current(true); }, 1500);
    return () => clearTimeout(timer);
  }, [isDirty, busy, configs]);

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
      const envelope = await exportProfile(loaded.id, loaded.password || undefined);
      const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `xrdb-profile-${loaded.id}.json`;
      // Anchor must be in the DOM for the click to register in some browsers
      // (notably mobile), and the object URL must outlive the click — revoking
      // it synchronously cancels the download.
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
      flash('success', 'Profile exported');
    } catch (e) {
      flash('error', (e as Error).message);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportFile = async (file: File) => {
    setBusy(true);
    try {
      const envelope = JSON.parse(await file.text());
      const result = await importProfiles(envelope);
      const parts = [`Imported ${result.imported} profile${result.imported === 1 ? '' : 's'}`];
      if (result.skipped) parts.push(`${result.skipped} skipped`);
      flash(result.imported > 0 ? 'success' : 'info', parts.join(', ') + '. Load one by its ID or alias.');
    } catch (e) {
      const msg = e instanceof SyntaxError ? 'not a valid XRDB profile file' : (e as Error).message;
      flash('error', `Import failed — ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  // ── Editing an unlocked profile ─────────────────────────────────────────
  if (loaded) {
    return (
      <div className="panel">
        <div className="panel-body cfg-fields">
          <div className="profile-banner">
            <span className="profile-banner-name">
              {loaded.name || loaded.alias || loaded.id}
              {isDirty && <span className="profile-dirty"> · Saving…</span>}
            </span>
            <span className="hint" style={{ marginTop: 0 }}>
              {isDirty
                ? 'Storing your changes to this profile.'
                : 'Editing this profile — changes are saved as you make them.'}
            </span>
            {canRevert && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleRevert}
                disabled={busy}
                title="Put the settings back to how they were when you opened this profile"
              >
                <History size={13} aria-hidden />
                Revert changes
              </button>
            )}
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
            <span className="hint">
              One example image, for previewing or sharing. This is not the value your
              addon wants — that is the config key above.
            </span>
          </div>

          <div className="field" style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--sp-4)' }}>
            <span className="label">Your own API keys</span>
            {!loaded.hasPassword ? (
              <div className="notice notice-warn" role="note">
                <span>
                  Set a password on this profile before adding your own API keys.
                  Without one, anyone who knows the profile ID can read it — and
                  that would include your keys.
                </span>
              </div>
            ) : (
              <>
                <span className="hint" style={{ marginTop: 0, marginBottom: 'var(--sp-2)' }}>
                  Optional. A key here is used for this profile instead of the
                  server&rsquo;s, which gets you your own rate limits. Leave a field
                  blank to keep using the server&rsquo;s key. Saved keys are never shown
                  again and never leave the server.
                </span>
                {PROVIDER_KEY_FIELDS.map(f => (
                  <div className="field" key={f.id} style={{ marginBottom: 'var(--sp-2)' }}>
                    <label className="label" htmlFor={`${uid}-key-${f.id}`}>
                      {f.label}
                      {loaded.keysSet?.includes(f.id) && (
                        <span className="hint" style={{ marginLeft: 'var(--sp-2)' }}>saved</span>
                      )}
                    </label>
                    <input
                      id={`${uid}-key-${f.id}`}
                      className="input"
                      type="password"
                      value={providerKeys[f.id] ?? ''}
                      onChange={e => setProviderKeys({ ...providerKeys, [f.id]: e.target.value })}
                      placeholder={loaded.keysSet?.includes(f.id) ? 'Saved — type to replace' : 'Using the server key'}
                      spellCheck={false}
                      autoComplete="off"
                    />
                  </div>
                ))}
                <span className="hint">
                  Removing the password removes the stored keys with it.
                </span>
              </>
            )}
          </div>

          <div className="cfg-actions">
            <button className="btn btn-primary" onClick={() => void handleUpdate()} disabled={busy}>
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
        <h3 className="label" style={{ margin: 0 }}>Sign in</h3>
        <div className="field">
          <label className="label" htmlFor={`${uid}-loadkey`}>Username</label>
          <span className="hint" style={{ marginTop: 0, marginBottom: 'var(--sp-1)' }}>
            A profile made before usernames signs in with its ID.
          </span>
          <input
            id={`${uid}-loadkey`}
            className="input"
            value={loadKey}
            onChange={e => setLoadKey(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void handleLoad(); }}
            placeholder="username or profile ID"
            spellCheck={false}
            autoComplete="username"
          />
        </div>
        <div className="field">
          <label className="label" htmlFor={`${uid}-loadpw`}>Password</label>
          <input
            id={`${uid}-loadpw`}
            className="input"
            type="password"
            value={loadPassword}
            onChange={e => setLoadPassword(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void handleLoad(); }}
            autoComplete="current-password"
          />
        </div>
        <button className="btn btn-ghost" onClick={() => void handleLoad()} disabled={busy}>
          <FolderOpen size={13} aria-hidden />
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--sp-4)' }}>
          <h3 className="label" style={{ margin: 0 }}>New here?</h3>
          <span className="hint" style={{ marginTop: 'var(--sp-1)', display: 'block' }}>
            Pick a username and a password, and the settings you have now are
            saved under them.
          </span>
        </div>

        <div className="field">
          <label className="label" htmlFor={`${uid}-alias`}>Username</label>
          <input
            id={`${uid}-alias`}
            className="input"
            value={alias}
            onChange={e => setAlias(e.target.value.toLowerCase())}
            placeholder="myposters"
            spellCheck={false}
            autoComplete="username"
          />
          <span className="hint">
            Three to thirty-two lowercase letters. This is what you sign in with
            and what your config key becomes.
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
          {busy ? 'Creating…' : 'Create profile'}
        </button>

        <div className="field" style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--sp-4)' }}>
          <label className="label" htmlFor={`${uid}-legacy`}>Coming from v2?</label>
          <span className="hint" style={{ marginTop: 0, marginBottom: 'var(--sp-2)' }}>
            Paste an old artwork URL, its query string, or the config JSON. Your
            settings are translated into this configurator, then you can save
            them as a profile.
          </span>
          <textarea
            id={`${uid}-legacy`}
            className="input"
            style={{ minHeight: '4.5rem', resize: 'vertical', fontFamily: 'var(--font-mono-stack)', fontSize: 'var(--text-xs)' }}
            value={legacyInput}
            onChange={e => { setLegacyInput(e.target.value); setMigrateError(''); }}
            placeholder="https://old-host/poster/imdb:tt0816692.jpg?posterRatings=imdb,tomatoes&lang=en"
            spellCheck={false}
            autoComplete="off"
            aria-describedby={migrateError ? `${uid}-legacy-error` : undefined}
            aria-invalid={migrateError ? true : undefined}
          />
          {migrateError && (
            <span className="hint hint-error" id={`${uid}-legacy-error`} role="alert">
              {migrateError}{' '}Copy the whole URL from your media app, including
              everything after the <code>?</code>.
            </span>
          )}
          {migrateResult && !migrateError && (
            <span className="hint" role="status">
              Brought {migrateResult.read} setting{migrateResult.read === 1 ? '' : 's'} across.
              {migrateResult.carriedUntouched?.length
                ? ` ${migrateResult.carriedUntouched.length} had no match here and were left off: ${migrateResult.carriedUntouched.join(', ')}.`
                : ' Everything had a match here.'}
              {' '}Check the preview, then save it as a profile below.
            </span>
          )}
          <button
            className="btn btn-ghost"
            style={{ marginTop: 'var(--sp-2)' }}
            onClick={() => void handleMigrate()}
            disabled={migrating || !legacyInput.trim()}
          >
            <Wand2 size={13} aria-hidden />
            {migrating ? 'Converting…' : 'Convert to v3'}
          </button>
        </div>


        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) void handleImportFile(file);
            e.target.value = ''; // allow re-importing the same file
          }}
        />
        <button
          className="btn btn-ghost"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          aria-label="Import a profile from a JSON file"
        >
          <Upload size={13} aria-hidden />
          Import from file
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
