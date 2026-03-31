'use client';

import { ExperienceModeModal } from '@/components/experience-mode-modal';
import {
  ConfiguratorHero,
  ConfiguratorTopNav,
  ConfiguratorWorkspaceIntro,
} from '@/components/configurator-page-chrome';
import { ConfiguratorInputsPanel } from '@/components/configurator-inputs-panel';
import { ConfiguratorWorkspaceColumns } from '@/components/configurator-workspace-columns';
import { SitePageOutro } from '@/components/site-page-outro';
import { useConfiguratorWorkspaceRuntime } from '@/lib/useConfiguratorWorkspaceRuntime';

export default function ConfiguratorPage() {
  const {
    experienceModeDraft,
    handleContinueExperienceMode,
    heroProps,
    inputsPanelProps,
    outroProps,
    pageRef,
    setExperienceModeDraft,
    showExperienceModal,
    topNavProps,
    workspaceColumnsProps,
  } = useConfiguratorWorkspaceRuntime();

  return (
    <div
      ref={pageRef}
      className="xrdb-page min-h-screen bg-transparent text-zinc-300 selection:bg-violet-500/30"
    >
      <ConfiguratorTopNav {...topNavProps} />

      <main className="xrdb-main w-full px-6 py-10 md:py-14 2xl:px-8">
        <ConfiguratorHero {...heroProps} />

        <section id="preview" className="xrdb-section scroll-mt-24">
          <div className="rounded-[32px] border border-violet-500/15 bg-[radial-gradient(ellipse_at_top,_rgba(139,92,246,0.12),_transparent_60%),linear-gradient(180deg,rgba(30,22,42,0.95),rgba(14,10,22,0.98))] p-4 md:p-5 xl:p-6">
            <ConfiguratorWorkspaceIntro />
            <div className="mt-4 xrdb-surface-grid grid items-start gap-4 xl:grid-cols-[minmax(0,1.18fr)_minmax(0,1fr)_minmax(20rem,0.86fr)] xl:gap-4">
              <ConfiguratorInputsPanel {...inputsPanelProps} />
              <ConfiguratorWorkspaceColumns {...workspaceColumnsProps} />
            </div>
          </div>
        </section>
      </main>

      {showExperienceModal ? (
        <ExperienceModeModal
          experienceModeDraft={experienceModeDraft}
          onSelectMode={setExperienceModeDraft}
          onContinue={handleContinueExperienceMode}
        />
      ) : null}

      <SitePageOutro {...outroProps} />
    </div>
  );
}
