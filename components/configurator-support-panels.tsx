'use client';

import { ChevronRight } from 'lucide-react';

import type { MetadataTranslationMode } from '@/lib/metadataTranslation';
import type { ConfiguratorExperienceMode } from '@/lib/configuratorPresets';
import type { ProxyCatalogRule } from '@/lib/proxyCatalogRules';
import type { ProxyMediaType } from '@/lib/uiConfig';

export type CurrentSetupItem = {
  label: string;
  value: string;
};

export function ConfiguratorSupportPanels({
  isCurrentSetupOpen,
  isQuickActionsOpen,
  onToggleCurrentSetup,
  onToggleQuickActions,
  currentSetupItems,
  onJumpToCenter,
  onJumpToExport,
  onFocusPreview,
}: {
  isAddonProxyOpen: boolean;
  isCurrentSetupOpen: boolean;
  isQuickActionsOpen: boolean;
  onToggleAddonProxy: () => void;
  onToggleCurrentSetup: () => void;
  onToggleQuickActions: () => void;
  proxyManifestUrl: string;
  onChangeProxyManifestUrl: (value: string) => void;
  proxyTranslateMeta: boolean;
  onToggleProxyTranslateMeta: (value: boolean) => void;
  experienceMode: ConfiguratorExperienceMode;
  proxyTranslateMetaMode: MetadataTranslationMode;
  onSelectProxyTranslateMetaMode: (value: MetadataTranslationMode) => void;
  proxyDebugMetaTranslation: boolean;
  onToggleProxyDebugMetaTranslation: (value: boolean) => void;
  proxyTypes: ProxyMediaType[];
  onChangeProxyTypes: (value: ProxyMediaType[]) => void;
  proxyCatalogRules: ProxyCatalogRule[];
  onChangeProxyCatalogRules: (value: ProxyCatalogRule[]) => void;
  tmdbKey: string;
  mdblistKey: string;
  displayedProxyUrl: string;
  proxyUrl: string;
  baseUrl: string;
  canGenerateProxy: boolean;
  proxyCopied: boolean;
  onCopyProxy: () => void;
  showProxyUrl: boolean;
  onToggleShowProxyUrl: () => void;
  currentSetupItems: CurrentSetupItem[];
  onJumpToCenter: () => void;
  onJumpToExport: () => void;
  onFocusPreview: () => void;
}) {
  return (
    <div className="space-y-3">
          <div className="xrdb-panel xrdb-panel-preview rounded-3xl border border-white/10 bg-zinc-900/60 p-4">
            <button
              type="button"
              onClick={onToggleCurrentSetup}
              className="xrdb-panel-head flex w-full items-center justify-between gap-4 text-left"
            >
              <div>
                <p className="xrdb-panel-eyebrow font-mono">Support</p>
                <h3 className="text-lg font-semibold text-white">Current Setup</h3>
                <p className="mt-1 text-sm text-zinc-400">
                  A compact snapshot of the active output so the right rail stays useful while the configurator keeps scrolling.
                </p>
              </div>
              <ChevronRight className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${isCurrentSetupOpen ? 'rotate-90 text-violet-300' : ''}`} />
            </button>
            <div className="xrdb-accordion-body" data-open={isCurrentSetupOpen}>
              <div className="xrdb-accordion-inner">
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  {currentSetupItems.map((item) => (
                    <div key={item.label} className="min-w-0 rounded-xl border border-white/10 bg-zinc-950/70 px-3 py-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{item.label}</div>
                      <div className="mt-1 min-w-0 break-words text-sm font-semibold leading-5 text-white">
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="xrdb-panel xrdb-panel-preview rounded-3xl border border-white/10 bg-zinc-900/60 p-4">
            <button
              type="button"
              onClick={onToggleQuickActions}
              className="xrdb-panel-head flex w-full items-center justify-between gap-4 text-left"
            >
              <div>
                <p className="xrdb-panel-eyebrow font-mono">Support</p>
                <h3 className="text-lg font-semibold text-white">Quick Actions</h3>
              </div>
              <ChevronRight className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${isQuickActionsOpen ? 'rotate-90 text-violet-300' : ''}`} />
            </button>
            <div className="xrdb-accordion-body" data-open={isQuickActionsOpen}>
              <div className="xrdb-accordion-inner">
                <div className="mt-3 grid gap-2">
                  <button
                    type="button"
                    onClick={onJumpToCenter}
                    className="rounded-2xl border border-white/10 bg-zinc-950/70 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-200 transition-colors hover:text-white"
                  >
                    Jump to center
                  </button>
                  <button
                    type="button"
                    onClick={onJumpToExport}
                    className="rounded-2xl border border-white/10 bg-zinc-950/70 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-200 transition-colors hover:text-white"
                  >
                    Jump to export
                  </button>
                  <button
                    type="button"
                    onClick={onFocusPreview}
                    className="rounded-2xl border border-white/10 bg-zinc-950/70 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-200 transition-colors hover:text-white"
                  >
                    Focus preview
                  </button>
                </div>
              </div>
            </div>
          </div>
    </div>
  );
}
