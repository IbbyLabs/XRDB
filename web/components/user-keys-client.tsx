'use client';

import { useState, useId } from 'react';
import { Check, AlertCircle, KeyRound, FolderOpen, Save } from 'lucide-react';
import { getProfile, updateProfile, type Profile } from '@/lib/api';
import { INTEGRATIONS } from './integrations-client';

// Your own API keys, per profile. The server keeps the values and never sends
// them back, so this page shows which providers have one rather than what it
// is. A profile needs a password before it can hold any: without one, anyone
// who knows the profile ID could read it.

interface Loaded {
  id: string;
  password: string;
  keysSet: string[];
}

export function UserKeysClient() {
  const uid = useId();
  const [idInput, setIdInput] = useState('');
  const [pwInput, setPwInput] = useState('');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const p: Profile = await getProfile(idInput.trim(), pwInput || undefined);
      if (!p.hasPassword) {
        setNotice({
          kind: 'err',
          text: 'Set a password on this profile first. Without one, anyone who knows the ID can read it — and that would include your keys.',
        });
        return;
      }
      setLoaded({ id: p.id, password: pwInput, keysSet: p.keysSet ?? [] });
      setKeys({});
    } catch (e) {
      setNotice({ kind: 'err', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!loaded) return;
    setBusy(true);
    setNotice(null);
    try {
      const updated = await updateProfile(
        loaded.id,
        { providerKeys: keys },
        loaded.password || undefined,
      );
      setLoaded({ ...loaded, keysSet: updated.keysSet ?? loaded.keysSet });
      setKeys({});
      setNotice({ kind: 'ok', text: 'Saved. Your renders now use these keys.' });
    } catch (e) {
      setNotice({ kind: 'err', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-inner">
      <div className="admin-header">
        <div>
          <h1 className="page-title">Your API keys</h1>
          <p className="page-sub">
            Optional. A key here is used for your profile&rsquo;s renders instead of
            this server&rsquo;s, which gets you your own rate limits.
          </p>
        </div>
      </div>

      {notice && (
        <div className={`notice ${notice.kind === 'ok' ? 'notice-success' : 'notice-error'}`} role="alert">
          {notice.kind === 'ok' ? <Check size={16} aria-hidden /> : <AlertCircle size={16} aria-hidden />}
          <span>{notice.text}</span>
        </div>
      )}

      {!loaded ? (
        <div className="panel">
          <div className="panel-body cfg-fields">
            <p className="hint" style={{ marginTop: 0 }}>
              Load the profile you want the keys to apply to. It needs a password —
              that is what keeps the keys private.
            </p>
            <div className="field">
              <label className="label" htmlFor={`${uid}-id`}>Profile ID or alias</label>
              <input
                id={`${uid}-id`}
                className="input"
                value={idInput}
                onChange={e => setIdInput(e.target.value)}
                placeholder="myposters"
                spellCheck={false}
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label className="label" htmlFor={`${uid}-pw`}>Profile password</label>
              <input
                id={`${uid}-pw`}
                className="input"
                type="password"
                value={pwInput}
                onChange={e => setPwInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void load(); }}
                autoComplete="off"
              />
            </div>
            <button className="btn btn-primary" onClick={() => void load()} disabled={busy || !idInput.trim()}>
              <FolderOpen size={13} aria-hidden />
              {busy ? 'Loading…' : 'Load profile'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="panel">
            <div className="panel-body cfg-fields">
              <p className="hint" style={{ marginTop: 0 }}>
                Editing <strong>{loaded.id}</strong>. A saved key is never shown again —
                leave a field blank to keep what is stored, or clear it to go back to
                this server&rsquo;s key.
              </p>
            </div>
          </div>

          {INTEGRATIONS.map(provider => {
            const isSet = loaded.keysSet.includes(provider.id);
            return (
              <div className="panel" key={provider.id} style={{ marginTop: 'var(--sp-3)' }}>
                <div className="panel-body cfg-fields">
                  <div className="field">
                    <label className="label" htmlFor={`${uid}-${provider.id}`}>
                      <span style={{ color: provider.accent }}>●</span> {provider.name}
                      {isSet && <span className="hint" style={{ marginLeft: 'var(--sp-2)' }}>saved</span>}
                    </label>
                    <span className="hint" style={{ marginTop: 0, marginBottom: 'var(--sp-2)' }}>
                      {provider.description}{' '}
                      <a href={provider.docsUrl} target="_blank" rel="noreferrer">Where to get one</a>
                    </span>
                    <input
                      id={`${uid}-${provider.id}`}
                      className="input"
                      type="password"
                      value={keys[provider.id] ?? ''}
                      onChange={e => setKeys({ ...keys, [provider.id]: e.target.value })}
                      placeholder={isSet ? 'Saved — type to replace' : 'Using this server’s key'}
                      spellCheck={false}
                      autoComplete="off"
                    />
                  </div>
                </div>
              </div>
            );
          })}

          <div className="cfg-actions" style={{ marginTop: 'var(--sp-4)' }}>
            <button className="btn btn-primary" onClick={() => void save()} disabled={busy || Object.keys(keys).length === 0}>
              <Save size={13} aria-hidden />
              {busy ? 'Saving…' : 'Save keys'}
            </button>
            <button className="btn btn-ghost" onClick={() => { setLoaded(null); setKeys({}); setNotice(null); }} disabled={busy}>
              <KeyRound size={13} aria-hidden />
              Close
            </button>
          </div>
        </>
      )}
    </div>
  );
}
