'use client';

import type { ComponentProps, MouseEvent } from 'react';
import { ChevronRight } from 'lucide-react';

import { ConfiguratorAccordionSection } from '@/components/site-chrome';
import {
  AccessKeysSection,
  MediaTargetSection,
  SetupModeSection,
  WorkspaceManagementSection,
} from '@/components/configurator-basics';
import { ConfiguratorPresetStudio } from '@/components/configurator-preset-studio';
import {
  ProvidersSection,
  QualitySection,
  SimpleQuickTuneSection,
} from '@/components/configurator-workspace-sections';
import {
  LookSection,
  PresentationSection,
} from '@/components/configurator-appearance-sections';
import type { ConfiguratorExperienceMode } from '@/lib/configuratorPresets';

type WorkspaceSectionId =
  | 'essentials'
  | 'presentation'
  | 'look'
  | 'quality'
  | 'providers'
  | 'quicktune'
  | 'presets';

export function ConfiguratorInputsPanel({
  isOpen,
  onToggle,
  onAnchorClick,
  experienceMode,
  openWorkspaceSection,
  onToggleWorkspaceSection,
  setupModeProps,
  presetStudioProps,
  workspaceManagementProps,
  accessKeysProps,
  mediaTargetProps,
  presentationProps,
  lookProps,
  qualityProps,
  providersProps,
  simpleQuickTuneProps,
}: {
  isOpen: boolean;
  onToggle: () => void;
  onAnchorClick: (event: MouseEvent<HTMLAnchorElement>) => void;
  experienceMode: ConfiguratorExperienceMode;
  openWorkspaceSection: WorkspaceSectionId | null;
  onToggleWorkspaceSection: (sectionId: WorkspaceSectionId) => void;
  setupModeProps: ComponentProps<typeof SetupModeSection>;
  presetStudioProps: ComponentProps<typeof ConfiguratorPresetStudio>;
  workspaceManagementProps: ComponentProps<typeof WorkspaceManagementSection>;
  accessKeysProps: ComponentProps<typeof AccessKeysSection>;
  mediaTargetProps: ComponentProps<typeof MediaTargetSection>;
  presentationProps: ComponentProps<typeof PresentationSection>;
  lookProps: ComponentProps<typeof LookSection>;
  qualityProps: ComponentProps<typeof QualitySection>;
  providersProps: ComponentProps<typeof ProvidersSection>;
  simpleQuickTuneProps: ComponentProps<typeof SimpleQuickTuneSection>;
}) {
  const essentialsContent = (
    <div className="space-y-3">
      <WorkspaceManagementSection {...workspaceManagementProps} />
      <div className="border-t border-white/10" />
      <AccessKeysSection {...accessKeysProps} />
      <div className="border-t border-white/10" />
      <MediaTargetSection {...mediaTargetProps} />
    </div>
  );

  const simpleConfiguratorContent = (
    <div className="space-y-3">
      <ConfiguratorAccordionSection
        title="Essentials"
        description="Workspace actions, access keys, and the active media target."
        isOpen={openWorkspaceSection === 'essentials'}
        onToggle={() => onToggleWorkspaceSection('essentials')}
        tone="accent"
      >
        {essentialsContent}
      </ConfiguratorAccordionSection>
      <ConfiguratorAccordionSection
        title="Quick Tune"
        description="Everyday artwork controls for presentation, style, and providers."
        isOpen={openWorkspaceSection === 'quicktune'}
        onToggle={() => onToggleWorkspaceSection('quicktune')}
      >
        <SimpleQuickTuneSection {...simpleQuickTuneProps} />
      </ConfiguratorAccordionSection>
    </div>
  );

  const advancedConfiguratorContent = (
    <div className="space-y-3">
      <ConfiguratorAccordionSection
        title="Essentials"
        description="Workspace actions, access keys, and the active media target."
        isOpen={openWorkspaceSection === 'essentials'}
        onToggle={() => onToggleWorkspaceSection('essentials')}
        tone="accent"
      >
        {essentialsContent}
      </ConfiguratorAccordionSection>
      <ConfiguratorAccordionSection
        title="Presentation"
        description="Choose the overall badge treatment, aggregate source, and accent behavior."
        isOpen={openWorkspaceSection === 'presentation'}
        onToggle={() => onToggleWorkspaceSection('presentation')}
      >
        <PresentationSection {...presentationProps} />
      </ConfiguratorAccordionSection>
      <ConfiguratorAccordionSection
        title="Look & Layout"
        description="Artwork source, genre badges, layouts, logo output, and badge sizing."
        isOpen={openWorkspaceSection === 'look'}
        onToggle={() => onToggleWorkspaceSection('look')}
      >
        <div className="space-y-3">
          <LookSection {...lookProps} />
        </div>
      </ConfiguratorAccordionSection>
      <ConfiguratorAccordionSection
        title="Quality Badges"
        description="Stream badges, visible media marks, and quality badge positioning."
        isOpen={openWorkspaceSection === 'quality'}
        onToggle={() => onToggleWorkspaceSection('quality')}
      >
        <QualitySection {...qualityProps} />
      </ConfiguratorAccordionSection>
      <ConfiguratorAccordionSection
        title="Providers"
        description="Manual ordering, per provider enablement, and custom styling overrides."
        isOpen={openWorkspaceSection === 'providers'}
        onToggle={() => onToggleWorkspaceSection('providers')}
      >
        <ProvidersSection {...providersProps} />
      </ConfiguratorAccordionSection>
    </div>
  );

  return (
    <div id="workspace-settings" className="xrdb-workspace-scroll-region space-y-3 scroll-mt-24">
      <div className="xrdb-panel xrdb-panel-form rounded-3xl border border-white/10 bg-zinc-900/60 p-3 md:p-4">
        <button type="button" onClick={onToggle} className="xrdb-panel-head flex w-full items-center justify-between gap-4 text-left">
          <div>
            <p className="xrdb-panel-eyebrow font-mono">Inputs</p>
            <h3 className="xrdb-panel-title text-white">Configurator</h3>
            <p className="xrdb-panel-copy text-zinc-400">
              Pick a setup mode, start from a preset, then tune the same state that powers the preview, config string, and addon proxy.
            </p>
          </div>
          <ChevronRight className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${isOpen ? 'rotate-90 text-violet-300' : ''}`} />
        </button>
        <div className="xrdb-accordion-body" data-open={isOpen}>
          <div className="xrdb-accordion-inner">
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap gap-2 min-[861px]:hidden">
                <a
                  href="#workspace-preview"
                  onClick={onAnchorClick}
                  className="xrdb-nav-link text-[11px]"
                >
                  Jump to preview
                </a>
              </div>
              <SetupModeSection {...setupModeProps} />
              <ConfiguratorPresetStudio
                {...presetStudioProps}
                isOpen={openWorkspaceSection === 'presets'}
                onToggle={() => onToggleWorkspaceSection('presets')}
              />
              {experienceMode === 'simple' ? simpleConfiguratorContent : advancedConfiguratorContent}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
