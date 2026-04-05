'use client';

import type { ComponentProps } from 'react';

import { ConfiguratorAccordionSection } from '@/components/site-chrome';
import {
  AccessKeysSection,
  MediaTargetSection,
  SetupModeSection,
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
  experienceMode,
  openWorkspaceSection,
  onToggleWorkspaceSection,
  setupModeProps,
  presetStudioProps,
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
  experienceMode: ConfiguratorExperienceMode;
  openWorkspaceSection: WorkspaceSectionId | null;
  onToggleWorkspaceSection: (sectionId: WorkspaceSectionId) => void;
  setupModeProps: ComponentProps<typeof SetupModeSection>;
  presetStudioProps: ComponentProps<typeof ConfiguratorPresetStudio>;
  accessKeysProps: ComponentProps<typeof AccessKeysSection>;
  mediaTargetProps: ComponentProps<typeof MediaTargetSection>;
  presentationProps: ComponentProps<typeof PresentationSection>;
  lookProps: ComponentProps<typeof LookSection>;
  qualityProps: ComponentProps<typeof QualitySection>;
  providersProps: ComponentProps<typeof ProvidersSection>;
  simpleQuickTuneProps: ComponentProps<typeof SimpleQuickTuneSection>;
  [key: string]: unknown;
}) {
  return (
    <div id="workspace-settings" className="xrdb-workspace-scroll-region space-y-3 scroll-mt-24">
      <div className="space-y-3">
        <SetupModeSection {...setupModeProps} />
        <AccessKeysSection {...accessKeysProps} />
        <MediaTargetSection {...mediaTargetProps} />
        <ConfiguratorPresetStudio
          {...presetStudioProps}
          isOpen={openWorkspaceSection === 'presets'}
          onToggle={() => onToggleWorkspaceSection('presets')}
        />
      </div>
      {experienceMode === 'simple' ? (
        <div className="space-y-3">
          <SimpleQuickTuneSection {...simpleQuickTuneProps} />
        </div>
      ) : (
        <div className="space-y-3">
          <ConfiguratorAccordionSection
            title="Presentation"
            description="Choose the overall badge treatment, aggregate source, and accent behavior."
            isOpen={openWorkspaceSection === 'presentation'}
            onToggle={() => onToggleWorkspaceSection('presentation')}
            referenceHref="/reference#presentation-modes"
          >
            <PresentationSection {...presentationProps} />
          </ConfiguratorAccordionSection>
          <ConfiguratorAccordionSection
            title="Look & Layout"
            description="Artwork source, genre badges, layouts, logo output, and badge sizing."
            isOpen={openWorkspaceSection === 'look'}
            onToggle={() => onToggleWorkspaceSection('look')}
            referenceHref="/reference#artwork-sources"
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
            referenceHref="/reference#per-type-controls"
          >
            <QualitySection {...qualityProps} />
          </ConfiguratorAccordionSection>
          <ConfiguratorAccordionSection
            title="Providers"
            description="Manual ordering, per provider enablement, and custom styling overrides."
            isOpen={openWorkspaceSection === 'providers'}
            onToggle={() => onToggleWorkspaceSection('providers')}
            referenceHref="/reference#provider-ordering"
          >
            <ProvidersSection {...providersProps} />
          </ConfiguratorAccordionSection>
        </div>
      )}
    </div>
  );
}
