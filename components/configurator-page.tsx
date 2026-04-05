'use client';

import { ConfigureView } from '@/components/configure-view';
import { ExperienceModeModal } from '@/components/experience-mode-modal';
import { useConfiguratorContext } from '@/lib/configuratorProvider';

export default function ConfiguratorPage() {
  const {
    docsCaptureReady,
    experienceModeDraft,
    handleContinueExperienceMode,
    pageRef,
    setExperienceModeDraft,
    showExperienceModal,
  } = useConfiguratorContext();

  return (
    <div
      ref={pageRef}
      className="xrdb-page min-h-screen bg-transparent text-zinc-300 selection:bg-violet-500/30"
      data-docs-capture-ready={docsCaptureReady ? 'true' : 'false'}
    >
      <ConfigureView />
      {showExperienceModal ? (
        <ExperienceModeModal
          experienceModeDraft={experienceModeDraft}
          onSelectMode={setExperienceModeDraft}
          onContinue={handleContinueExperienceMode}
        />
      ) : null}
    </div>
  );
}
