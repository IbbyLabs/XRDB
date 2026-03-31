import { useCallback, useEffect, useState } from 'react';

import {
  CONFIGURATOR_WIZARD_QUESTION_ORDER,
  type ConfiguratorExperienceMode,
  type ConfiguratorWizardAnswers,
  type ConfiguratorWizardQuestionId,
} from '@/lib/configuratorPresets';

export function useConfiguratorWorkspaceUi<TPanel extends string, TSection extends string>({
  aiometadataCopyBlock,
  configString,
  experienceModeDraft,
  initialOpenPanels,
  proxyUrl,
  setShowConfigString,
  setShowProxyUrl,
  setExperienceMode,
  setExperienceModeDraft,
  setShowExperienceModal,
  showConfigString,
  showExperienceModal,
  showProxyUrl,
}: {
  aiometadataCopyBlock: string;
  configString: string;
  experienceModeDraft: ConfiguratorExperienceMode;
  initialOpenPanels: TPanel[];
  proxyUrl: string;
  setShowConfigString: (value: boolean | ((current: boolean) => boolean)) => void;
  setShowProxyUrl: (value: boolean | ((current: boolean) => boolean)) => void;
  setExperienceMode: (value: ConfiguratorExperienceMode) => void;
  setExperienceModeDraft: (value: ConfiguratorExperienceMode) => void;
  setShowExperienceModal: (value: boolean) => void;
  showConfigString: boolean;
  showExperienceModal: boolean;
  showProxyUrl: boolean;
}) {
  const [proxyCopied, setProxyCopied] = useState(false);
  const [configCopied, setConfigCopied] = useState(false);
  const [aiometadataCopied, setAiometadataCopied] = useState(false);
  const [wizardAnswers, setWizardAnswers] = useState<Partial<ConfiguratorWizardAnswers>>({});
  const [wizardQuestionIndex, setWizardQuestionIndex] = useState(0);
  const [isWizardActive, setIsWizardActive] = useState(false);
  const [openWorkspacePanels, setOpenWorkspacePanels] = useState<Set<TPanel>>(
    () => new Set(initialOpenPanels),
  );
  const [openWorkspaceSection, setOpenWorkspaceSection] = useState<TSection | null>(null);

  const handleCopyConfig = useCallback(() => {
    if (!configString) {
      return;
    }
    navigator.clipboard.writeText(configString);
    setConfigCopied(true);
    setTimeout(() => setConfigCopied(false), 2000);
  }, [configString]);

  const handleCopyProxy = useCallback(() => {
    if (!proxyUrl) {
      return;
    }
    navigator.clipboard.writeText(proxyUrl);
    setProxyCopied(true);
    setTimeout(() => setProxyCopied(false), 2000);
  }, [proxyUrl]);

  const handleCopyAiometadata = useCallback(() => {
    if (!aiometadataCopyBlock) {
      return;
    }
    navigator.clipboard.writeText(aiometadataCopyBlock);
    setAiometadataCopied(true);
    setTimeout(() => setAiometadataCopied(false), 2000);
  }, [aiometadataCopyBlock]);

  const handleBeginWizard = useCallback(() => {
    setWizardAnswers({});
    setWizardQuestionIndex(0);
    setIsWizardActive(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.getElementById('preset-studio-guide')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      });
    });
  }, []);

  const handleExitWizard = useCallback(() => {
    setWizardAnswers({});
    setWizardQuestionIndex(0);
    setIsWizardActive(false);
  }, []);

  const handleWizardBack = useCallback(() => {
    setWizardQuestionIndex((currentIndex) => Math.max(0, currentIndex - 1));
  }, []);

  const handleWizardAnswer = useCallback(
    (
      questionId: ConfiguratorWizardQuestionId,
      value: ConfiguratorWizardAnswers[ConfiguratorWizardQuestionId],
    ) => {
      setWizardAnswers((current) => ({
        ...current,
        [questionId]: value,
      }));
      setWizardQuestionIndex((currentIndex) =>
        Math.min(currentIndex + 1, CONFIGURATOR_WIZARD_QUESTION_ORDER.length - 1),
      );
    },
    [],
  );

  const handleToggleWorkspacePanel = useCallback((panelId: TPanel) => {
    setOpenWorkspacePanels((current) => {
      const next = new Set(current);
      if (next.has(panelId)) {
        next.delete(panelId);
      } else {
        next.add(panelId);
      }
      return next;
    });
  }, []);

  const handleToggleWorkspaceSection = useCallback((sectionId: TSection) => {
    setOpenWorkspaceSection((current) => (current === sectionId ? null : sectionId));
  }, []);

  const handleSelectExperienceMode = useCallback(
    (nextMode: ConfiguratorExperienceMode) => {
      setExperienceMode(nextMode);
      setExperienceModeDraft(nextMode);
      setShowExperienceModal(false);
    },
    [setExperienceMode, setExperienceModeDraft, setShowExperienceModal],
  );

  const handleContinueExperienceMode = useCallback(() => {
    setExperienceMode(experienceModeDraft);
    setShowExperienceModal(false);
  }, [experienceModeDraft, setExperienceMode, setShowExperienceModal]);

  useEffect(() => {
    if (typeof document === 'undefined' || !showExperienceModal) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showExperienceModal]);

  return {
    aiometadataCopied,
    configCopied,
    handleBeginWizard,
    handleContinueExperienceMode,
    handleCopyAiometadata,
    handleCopyConfig,
    handleCopyProxy,
    handleExitWizard,
    handleSelectExperienceMode,
    handleToggleWorkspacePanel,
    handleToggleWorkspaceSection,
    handleWizardAnswer,
    handleWizardBack,
    isWizardActive,
    openWorkspacePanels,
    openWorkspaceSection,
    proxyCopied,
    setOpenWorkspacePanels,
    showConfigString,
    showProxyUrl,
    wizardAnswers,
    wizardQuestionIndex,
  };
}
