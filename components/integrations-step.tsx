'use client';

import Link from 'next/link';
import { ExternalLink, Eye, EyeOff } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { XrdbDropdown } from '@/components/xrdb-dropdown';
import { useConfiguratorContext } from '@/lib/configuratorProvider';

type ProviderIntegrationId = 'tmdb' | 'mdblist' | 'fanart' | 'simkl';

type ProviderIntegrationStatus = {
  present: boolean;
  working: boolean | null;
  checkedAt: number | null;
};

type IntegrationStatusPayload = {
  checkedAt: number;
  requestProtectionEnabled: boolean;
  providers: Record<ProviderIntegrationId, ProviderIntegrationStatus>;
};

type ProviderDraftField = 'tmdbKey' | 'mdblistKey' | 'fanartKey' | 'simklClientId';

type ProviderConfig = {
  id: ProviderIntegrationId;
  field: ProviderDraftField;
  title: string;
  href: string;
  placeholder: string;
  help: string;
};

const PROVIDERS: ProviderConfig[] = [
  {
    id: 'tmdb',
    field: 'tmdbKey',
    title: 'TMDB',
    href: 'https://www.themoviedb.org/settings/api',
    placeholder: 'Paste your TMDB API key',
    help: 'Used for title search, media resolve, previews, and live TMDB artwork requests.',
  },
  {
    id: 'mdblist',
    field: 'mdblistKey',
    title: 'MDBList',
    href: 'https://mdblist.com/preferences/#accounts',
    placeholder: 'Paste your MDBList API key',
    help: 'Used for live rating requests and server backed output that depends on MDBList data.',
  },
  {
    id: 'fanart',
    field: 'fanartKey',
    title: 'Fanart',
    href: 'https://fanart.tv/get-an-api-key/',
    placeholder: 'Paste your fanart.tv API key',
    help: 'Used when you prefer fanart.tv artwork for posters, backdrops, or logos.',
  },
  {
    id: 'simkl',
    field: 'simklClientId',
    title: 'SIMKL Client ID',
    href: 'https://simkl.com/settings/developer/new/',
    placeholder: 'Paste your SIMKL client ID',
    help: 'Used for live SIMKL rating lookups when that provider is enabled.',
  },
];

const EMPTY_DRAFT = {
  tmdbKey: '',
  mdblistKey: '',
  fanartKey: '',
  simklClientId: '',
};

const EMPTY_DIRTY = {
  tmdbKey: false,
  mdblistKey: false,
  fanartKey: false,
  simklClientId: false,
};

const EMPTY_REVEAL = {
  xrdbKey: false,
  tmdbKey: false,
  mdblistKey: false,
  fanartKey: false,
  simklClientId: false,
};

const formatCheckTime = (value: number | null) => {
  if (!value) {
    return 'Not checked yet';
  }

  return new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
};

const describeProviderMessage = (status: ProviderIntegrationStatus | undefined) => {
  if (!status?.present) {
    return 'This instance is not providing this key. Add your own if you want this provider to work here.';
  }

  if (status.working) {
    return 'This instance already has a working host key. Your own key is optional.';
  }

  return 'This instance has a host key configured, but the latest check failed. Add your own key if you need this provider right now.';
};

export function IntegrationsStep() {
  const { inputsPanelProps } = useConfiguratorContext();
  const accessKeys = inputsPanelProps.accessKeysProps;
  const [hostStatus, setHostStatus] = useState<IntegrationStatusPayload | null>(null);
  const [statusLoadState, setStatusLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [statusError, setStatusError] = useState<string | null>(null);
  const [showAdvancedHostOptions, setShowAdvancedHostOptions] = useState(false);
  const [showRequestKey, setShowRequestKey] = useState(false);
  const [draftValues, setDraftValues] = useState(EMPTY_DRAFT);
  const [dirtyFields, setDirtyFields] = useState(EMPTY_DIRTY);
  const [revealedFields, setRevealedFields] = useState(EMPTY_REVEAL);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [clientHostname, setClientHostname] = useState('');

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setClientHostname(window.location.hostname.toLowerCase());
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    let active = true;

    void (async () => {
      setStatusLoadState('loading');
      const response = await fetch('/api/configurator-integrations-status', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Unable to load host integration status.');
      }
      const payload = (await response.json()) as IntegrationStatusPayload;
      if (!active) {
        return;
      }
      setHostStatus(payload);
      setStatusError(null);
      setStatusLoadState('ready');
    })().catch((error: unknown) => {
      if (!active) {
        return;
      }
      setHostStatus(null);
      setStatusLoadState('error');
      setStatusError(error instanceof Error ? error.message : 'Unable to load host integration status.');
    });

    return () => {
      active = false;
    };
  }, []);

  const personalStatusById = accessKeys.personalProviderKeyStatus;
  const personalMaskedPreviewById = accessKeys.personalProviderKeyMaskedPreview;

  const isNewbieHost =
    clientHostname === 'extendedratings.com'
    || clientHostname === 'www.extendedratings.com'
    || clientHostname.endsWith('.extendedratings.com');

  const hasPendingChanges = useMemo(
    () => Object.values(dirtyFields).some(Boolean),
    [dirtyFields],
  );

  const hostStatusLoading = statusLoadState === 'loading';

  const requestKeyMessage = hostStatusLoading
    ? 'Checking host request protection settings now.'
    : hostStatus?.requestProtectionEnabled
      ? 'This host requires an XRDB request key. Ask your host for one, then paste it here.'
      : 'This host does not require an XRDB request key right now.';

  const hideAdvancedHostOptions = isNewbieHost && !showAdvancedHostOptions;

  const handleDraftChange = (field: ProviderDraftField, value: string) => {
    setDraftValues((current) => ({
      ...current,
      [field]: value,
    }));
    setDirtyFields((current) => ({
      ...current,
      [field]: true,
    }));
    setSaveState('idle');
    setSaveError(null);
  };

  const handleClearField = (field: ProviderDraftField) => {
    handleDraftChange(field, '');
  };

  const toggleRevealField = (field: keyof typeof EMPTY_REVEAL) => {
    setRevealedFields((current) => ({
      ...current,
      [field]: !current[field],
    }));
  };

  const handleSave = async () => {
    if (!hasPendingChanges) {
      return;
    }

    setSaveState('saving');
    setSaveError(null);

    try {
      const updates: Partial<typeof draftValues> = {};

      for (const provider of PROVIDERS) {
        if (dirtyFields[provider.field]) {
          updates[provider.field] = draftValues[provider.field].trim();
        }
      }

      await accessKeys.onSavePersonalProviderKeys(updates);
      setDraftValues(EMPTY_DRAFT);
      setDirtyFields(EMPTY_DIRTY);
      setSaveState('saved');
    } catch (error) {
      setSaveState('error');
      setSaveError(error instanceof Error ? error.message : 'Unable to save your provider keys.');
    }
  };

  return (
    <section className="xrdb-step-shell xrdb-page" aria-label="Integrations step shell">
      <div className="w-full px-4 py-6 md:px-6 md:py-8">
        <div className="mx-auto max-w-6xl space-y-4">
          <div className="xrdb-panel rounded-2xl p-5 md:p-6 space-y-3">
            <div className="space-y-2">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
                Step 1
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-[color:var(--ink)] sm:text-3xl">
                Integrations
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-[color:var(--muted)]">
                Most people can keep this simple. If the host already shows ready, skip personal keys and continue.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
              <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--bg-surface)] px-3 py-1.5">
                Host status is optional
              </span>
              <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--bg-surface)] px-3 py-1.5">
                Keep personal keys local
              </span>
            </div>
            {hostStatusLoading ? (
              <p className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-surface)] px-3 py-2 text-[12px] leading-5 text-[color:var(--muted)]">
                <span className="h-2 w-2 rounded-full bg-[color:var(--accent)] animate-pulse" aria-hidden="true" />
                Checking host integrations now.
              </p>
            ) : null}
            {statusLoadState === 'error' && statusError ? (
              <p className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-surface)] px-3 py-2 text-[12px] leading-5 text-[color:var(--muted)]">
                {statusError} Refresh to try again.
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="space-y-4">
              {hideAdvancedHostOptions ? (
                <div className="xrdb-panel rounded-2xl p-5 space-y-3">
                  <h2 className="text-sm font-semibold text-[color:var(--ink)]">Host settings</h2>
                  <p className="text-[13px] leading-6 text-[color:var(--muted)]">
                    {requestKeyMessage} Advanced host options are hidden by default for this site.
                  </p>
                  <button
                    type="button"
                    className="xrdb-btn xrdb-btn-secondary"
                    onClick={() => setShowAdvancedHostOptions(true)}
                  >
                    Show advanced host options
                  </button>
                </div>
              ) : (
                <div className="xrdb-panel rounded-2xl p-5 space-y-4">
                  <div className="space-y-2">
                    <h2 className="text-sm font-semibold text-[color:var(--ink)]">Host settings</h2>
                    <p className="text-[13px] leading-6 text-[color:var(--muted)]">{requestKeyMessage}</p>
                  </div>

                  <label className="block space-y-2">
                    <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
                      XRDB request key
                    </span>
                    <div className="relative">
                      <input
                        type={showRequestKey ? 'text' : 'password'}
                        value={accessKeys.xrdbKey}
                        onChange={(event) => accessKeys.onXrdbKeyChange(event.target.value)}
                        placeholder="Optional host key"
                        className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-surface)] py-3 pl-3 pr-11 text-[13px] leading-5 text-[color:var(--ink)] outline-none transition-colors placeholder:text-[color:var(--muted)] focus:border-[color:var(--accent)]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRequestKey((current) => !current)}
                        className="absolute right-1 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-[color:var(--muted)] transition-colors hover:text-[color:var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bg-surface)]"
                        aria-label={showRequestKey ? 'Hide XRDB request key' : 'Show XRDB request key'}
                      >
                        {showRequestKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </label>

                  <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-surface)] p-4">
                    <label className="block space-y-2">
                      <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
                        TMDB ID scope
                      </span>
                      <XrdbDropdown
                        value={accessKeys.tmdbIdScope}
                        onChange={(nextValue) => accessKeys.onTmdbIdScopeChange(nextValue as typeof accessKeys.tmdbIdScope)}
                        ariaLabel="TMDB ID scope"
                        options={accessKeys.tmdbIdScopeOptions.map((option) => ({
                          value: option.id,
                          label: option.label,
                        }))}
                      />
                    </label>
                    <p className="mt-3 text-[12px] leading-6 text-[color:var(--muted)]">
                      {accessKeys.xrdbRequestKeyHelpCopy}
                    </p>
                  </div>
                </div>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                {PROVIDERS.map((provider) => {
                  const host = hostStatus?.providers[provider.id];
                  const maskedPreview = personalMaskedPreviewById[provider.id];
                  const hasPersonalValue = personalStatusById[provider.id];
                  const draftValue = draftValues[provider.field];
                  const isDirty = dirtyFields[provider.field];
                  const revealFieldKey = provider.field as keyof typeof EMPTY_REVEAL;
                  const hostBadge = hostStatusLoading
                    ? 'Checking host'
                    : host?.working
                      ? 'Host ready'
                      : host?.present
                        ? 'Host check failed'
                        : 'Bring your own';
                  const hostDotClass = hostStatusLoading
                    ? 'bg-[color:var(--accent)] animate-pulse'
                    : host?.working
                      ? 'bg-[color:var(--accent)]'
                      : host?.present
                        ? 'bg-[color:var(--status-warning)]'
                        : 'bg-[color:var(--muted)]';

                  return (
                    <div key={provider.id} className="xrdb-panel rounded-2xl p-5 space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-2">
                          <a
                            href={provider.href}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-base font-semibold text-[color:var(--ink)] transition-colors hover:text-[color:var(--accent)]"
                          >
                            <span>{provider.title}</span>
                            <ExternalLink className="h-4 w-4" />
                          </a>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
                            <span className="inline-flex h-8 items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--bg-surface)] px-3">
                              <span className={`h-2 w-2 rounded-full ${hostDotClass}`} aria-hidden="true" />
                              {hostBadge}
                            </span>
                            <span className={`inline-flex h-8 items-center rounded-full border px-3 ${hasPersonalValue ? 'border-[color:var(--accent)] bg-[color:var(--bg-surface)] text-[color:var(--ink)]' : 'border-[color:var(--border)] bg-transparent text-[color:var(--muted)]'}`}>
                              {hasPersonalValue ? 'Personal saved' : 'No personal key'}
                            </span>
                          </div>
                          <p className="text-[13px] leading-6 text-[color:var(--muted)]">{provider.help}</p>
                        </div>
                      </div>

                      <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-surface)] p-4 space-y-3">
                        <p className="text-[12px] leading-6 text-[color:var(--muted)]">
                          {hostStatusLoading ? 'Checking whether this host already has a working key for this provider.' : describeProviderMessage(host)}
                        </p>
                        <p className="text-[12px] leading-5 text-[color:var(--muted)]">
                          Latest host check: {hostStatusLoading ? 'Checking now' : formatCheckTime(host?.checkedAt ?? null)}
                        </p>
                      </div>

                      <label className="block space-y-2">
                        <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
                          Your key
                        </span>
                        <div className="relative">
                          <input
                            type={revealedFields[revealFieldKey] ? 'text' : 'password'}
                            value={draftValue}
                            onChange={(event) => handleDraftChange(provider.field, event.target.value)}
                            placeholder={!isDirty && maskedPreview ? maskedPreview : provider.placeholder}
                            autoCapitalize="none"
                            autoComplete="new-password"
                            spellCheck={false}
                            className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-base)] py-3 pl-3 pr-20 text-[13px] leading-5 text-[color:var(--ink)] outline-none transition-colors placeholder:text-[color:var(--muted)] focus:border-[color:var(--accent)]"
                          />
                          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => toggleRevealField(revealFieldKey)}
                              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[color:var(--muted)] transition-colors hover:text-[color:var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bg-base)]"
                              aria-label={revealedFields[revealFieldKey] ? `Hide ${provider.title}` : `Show ${provider.title}`}
                            >
                              {revealedFields[revealFieldKey] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                      </label>

                      <div className="flex items-center justify-between gap-3 text-[12px] leading-5 text-[color:var(--muted)]">
                        <span>
                          {isDirty
                            ? draftValue.trim()
                              ? hasPersonalValue
                                ? 'Will replace your saved key.'
                                : 'Will save a new personal key.'
                              : hasPersonalValue
                                ? 'Will remove your saved key.'
                                : 'Will keep this field empty.'
                            : hasPersonalValue
                              ? maskedPreview
                                ? `Saved as ${maskedPreview}.`
                                : 'Saved on this session.'
                              : 'Not saved yet.'}
                        </span>
                        {(hasPersonalValue || draftValue) ? (
                          <button
                            type="button"
                            onClick={() => handleClearField(provider.field)}
                            className="rounded-full border border-[color:var(--border)] px-2.5 py-1 font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)] transition-colors hover:border-[color:var(--accent)] hover:text-[color:var(--ink)]"
                          >
                            Clear
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4">
              <div className="xrdb-panel rounded-2xl p-5 space-y-4">
                <h2 className="text-sm font-semibold text-[color:var(--ink)]">Save your changes</h2>
                <p className="text-[13px] leading-6 text-[color:var(--muted)]">
                  Save only the fields you changed. You can keep every provider blank when the host already shows as ready.
                </p>
                <p className="text-[12px] leading-6 text-[color:var(--muted)]">
                  Personal keys stay in this browser session and are not added to saved profiles or exported links.
                </p>
                {statusError ? (
                  <p className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-surface)] px-3 py-2 text-[12px] leading-5 text-[color:var(--muted)]">
                    {statusError}
                  </p>
                ) : null}
                {saveError ? (
                  <p className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-surface)] px-3 py-2 text-[12px] leading-5 text-[color:var(--muted)]">
                    {saveError}
                  </p>
                ) : null}
                {saveState === 'saved' ? (
                  <p className="rounded-xl border border-[color:var(--accent)] bg-[color:var(--bg-surface)] px-3 py-2 text-[12px] leading-5 text-[color:var(--ink)]">
                    Personal provider keys updated for this session.
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={!hasPendingChanges || saveState === 'saving'}
                  className="xrdb-btn xrdb-btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saveState === 'saving' ? 'Saving' : hasPendingChanges ? 'Save personal keys' : 'Nothing to save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="xrdb-step-nav-sticky" role="navigation" aria-label="Step navigation">
        <Link href="/poster" className="xrdb-btn xrdb-btn-primary">
          Next
        </Link>
      </div>
    </section>
  );
}