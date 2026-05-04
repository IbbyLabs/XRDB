'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useConfiguratorContext } from '@/lib/configuratorProvider';
import { normalizeSavedUiConfig } from '@/lib/uiConfig';
import type { SavedUiConfig } from '@/lib/uiConfig';
import { COMMUNITY_TEMPLATES, type CommunityTemplate } from '@/lib/community-templates';

export default function TemplatesPage() {
  const ctx = useConfiguratorContext();
  const router = useRouter();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);

  const [communityTemplates, setCommunityTemplates] = useState<CommunityTemplate[]>(COMMUNITY_TEMPLATES);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/templates')
      .then((r) => r.json())
      .then((data: { templates?: CommunityTemplate[] }) => {
        if (!cancelled && Array.isArray(data.templates)) {
          setCommunityTemplates(data.templates);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const [submitName, setSubmitName] = useState('');
  const [submitDescription, setSubmitDescription] = useState('');
  const [submitTags, setSubmitTags] = useState('');
  const [submitAuthor, setSubmitAuthor] = useState('');
  const [submitPending, setSubmitPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const applyTemplate = useCallback((id: string, config: Record<string, unknown>) => {
    const current = ctx.buildCurrentUiConfig();
    const normalizedTemplate = normalizeSavedUiConfig(config, { skipCrossTypeFallbacks: true });
    const merged: SavedUiConfig = {
      version: 1,
      settings: {
        ...normalizedTemplate.settings,
        xrdbKey: current.settings.xrdbKey,
        tmdbKey: current.settings.tmdbKey,
        tmdbIdScope: current.settings.tmdbIdScope,
        mdblistKey: current.settings.mdblistKey,
        fanartKey: current.settings.fanartKey,
        simklClientId: current.settings.simklClientId,
        lang: current.settings.lang,
      },
      proxy: {
        ...normalizedTemplate.proxy,
        manifestUrl: current.proxy.manifestUrl,
        translateMeta: current.proxy.translateMeta,
        translateMetaMode: current.proxy.translateMetaMode,
        debugMetaTranslation: current.proxy.debugMetaTranslation,
        proxyTypes: current.proxy.proxyTypes,
        episodeIdMode: current.proxy.episodeIdMode,
        catalogRules: current.proxy.catalogRules,
      },
    };

    ctx.applySavedUiConfig(merged);
    ctx.setActiveTemplateId(id);
    router.push('/poster');
  }, [ctx, router]);

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImportSuccess(false);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as SavedUiConfig;
        ctx.applySavedUiConfig(parsed);
        setImportSuccess(true);
        setTimeout(() => setImportSuccess(false), 3000);
      } catch {
        setImportError('Invalid config file. Make sure it is a valid XRDB JSON export.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [ctx]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(false);

    const name = submitName.trim();
    const description = submitDescription.trim();

    if (!name || !description) {
      setSubmitError('Name and description are required.');
      return;
    }

    const tags = submitTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const config = ctx.buildCurrentUiConfig();

    setSubmitPending(true);
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          author: submitAuthor.trim() || undefined,
          tags,
          config,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setSubmitError(data.error ?? 'Submission failed. Please try again.');
        return;
      }
      setSubmitSuccess(true);
      setSubmitName('');
      setSubmitDescription('');
      setSubmitTags('');
      setSubmitAuthor('');
    } catch {
      setSubmitError('Network error. Please check your connection and try again.');
    } finally {
      setSubmitPending(false);
    }
  }, [ctx, submitName, submitDescription, submitTags, submitAuthor]);

  return (
    <div className="xrdb-templates-page">
      <header className="xrdb-templates-header">
        <div className="xrdb-templates-header-inner">
          <div>
            <h1 className="xrdb-templates-title">Templates</h1>
            <p className="xrdb-templates-subtitle">Apply a community preset or import your own saved config.</p>
          </div>
          <Link href="/" className="xrdb-templates-back">
            &larr; Back
          </Link>
        </div>
      </header>

      <div className="xrdb-templates-body">

        {/* Community gallery */}
        <section className="xrdb-templates-section" aria-labelledby="gallery-heading">
          <h2 className="xrdb-templates-section-title" id="gallery-heading">Community presets</h2>
          <p className="xrdb-templates-section-desc">
            Presets apply visual settings only. Your API keys and proxy settings are never overwritten.
          </p>
          <div className="xrdb-templates-grid">
            {communityTemplates.map(t => (
              <article key={t.id} className={`xrdb-template-card${ctx.activeTemplateId === t.id ? ' xrdb-template-card-active' : ''}`}>
                <div className="xrdb-template-card-body">
                  <h3 className="xrdb-template-card-name">{t.name}</h3>
                  <p className="xrdb-template-card-desc">{t.description}</p>
                  {t.author && (
                    <p className="xrdb-template-card-author">by {t.author}</p>
                  )}
                  <div className="xrdb-template-card-tags">
                    {t.tags.map(tag => (
                      <span key={tag} className="xrdb-template-tag">{tag}</span>
                    ))}
                  </div>
                </div>
                <div className="xrdb-template-card-foot">
                  <button
                    className={`xrdb-template-apply-btn${ctx.activeTemplateId === t.id ? ' xrdb-template-apply-btn-active' : ''}`}
                    onClick={() => applyTemplate(t.id, t.config)}
                    type="button"
                  >
                    {ctx.activeTemplateId === t.id ? 'Active' : 'Apply preset'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Submit a preset */}
        <section className="xrdb-templates-section" aria-labelledby="submit-heading">
          <h2 className="xrdb-templates-section-title" id="submit-heading">Submit a preset</h2>
          <p className="xrdb-templates-section-desc">
            Share your current workspace settings with the community. Submitted presets are reviewed before going live.
          </p>
          {submitSuccess ? (
            <p className="xrdb-save-status xrdb-save-status-ok" role="status">
              Preset submitted. It will appear after review.
            </p>
          ) : (
            <form className="xrdb-templates-submit-form" onSubmit={handleSubmit} noValidate>
              <div className="xrdb-templates-field">
                <label htmlFor="submit-name" className="xrdb-templates-field-label">
                  Name <span aria-hidden="true">*</span>
                </label>
                <input
                  id="submit-name"
                  type="text"
                  className="xrdb-templates-field-input"
                  value={submitName}
                  onChange={(e) => setSubmitName(e.target.value)}
                  maxLength={80}
                  placeholder="e.g. Minimal ratings"
                  required
                  disabled={submitPending}
                />
              </div>
              <div className="xrdb-templates-field">
                <label htmlFor="submit-description" className="xrdb-templates-field-label">
                  Description <span aria-hidden="true">*</span>
                </label>
                <textarea
                  id="submit-description"
                  className="xrdb-templates-field-input xrdb-templates-field-textarea"
                  value={submitDescription}
                  onChange={(e) => setSubmitDescription(e.target.value)}
                  maxLength={280}
                  placeholder="Describe what this preset does and who it is for."
                  required
                  disabled={submitPending}
                  rows={3}
                />
              </div>
              <div className="xrdb-templates-field">
                <label htmlFor="submit-tags" className="xrdb-templates-field-label">
                  Tags <span className="xrdb-templates-field-hint">(comma separated, optional)</span>
                </label>
                <input
                  id="submit-tags"
                  type="text"
                  className="xrdb-templates-field-input"
                  value={submitTags}
                  onChange={(e) => setSubmitTags(e.target.value)}
                  placeholder="e.g. minimal, ratings, anime"
                  disabled={submitPending}
                />
              </div>
              <div className="xrdb-templates-field">
                <label htmlFor="submit-author" className="xrdb-templates-field-label">
                  Your name or handle <span className="xrdb-templates-field-hint">(optional)</span>
                </label>
                <input
                  id="submit-author"
                  type="text"
                  className="xrdb-templates-field-input"
                  value={submitAuthor}
                  onChange={(e) => setSubmitAuthor(e.target.value)}
                  maxLength={60}
                  placeholder="e.g. ibby"
                  disabled={submitPending}
                />
              </div>
              {submitError && (
                <p className="xrdb-save-status xrdb-save-status-error" role="alert">{submitError}</p>
              )}
              <button
                type="submit"
                className="xrdb-template-apply-btn"
                disabled={submitPending}
              >
                {submitPending ? 'Submitting\u2026' : 'Submit current workspace'}
              </button>
            </form>
          )}
        </section>

        {/* Upload your own */}
        <section className="xrdb-templates-section" aria-labelledby="upload-heading">
          <h2 className="xrdb-templates-section-title" id="upload-heading">Import your config</h2>
          <p className="xrdb-templates-section-desc">
            Upload a JSON file exported from Save &amp; Export. All settings will be restored exactly as saved.
          </p>
          <div className="xrdb-templates-upload-zone">
            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImport}
              className="xrdb-save-hidden-input"
              id="config-upload"
              aria-hidden="true"
            />
            <label htmlFor="config-upload" className="xrdb-templates-upload-label">
              <span className="xrdb-templates-upload-icon" aria-hidden="true">&#x2B06;</span>
              <span className="xrdb-templates-upload-text">
                Click to upload a config JSON file
              </span>
            </label>
            <button
              className="xrdb-template-apply-btn xrdb-templates-upload-btn"
              onClick={() => importInputRef.current?.click()}
              type="button"
            >
              Browse file
            </button>
          </div>
          {importError && <p className="xrdb-save-status xrdb-save-status-error" role="alert">{importError}</p>}
          {importSuccess && (
            <p className="xrdb-save-status xrdb-save-status-ok" role="status">
              Config imported. Head to <Link href="/poster" className="xrdb-templates-link">Poster</Link> to see your settings.
            </p>
          )}
        </section>

      </div>
    </div>
  );
}
