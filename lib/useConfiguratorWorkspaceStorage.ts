import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';

import {
  isConfiguratorExperienceMode,
  isConfiguratorPresetId,
  type ConfiguratorExperienceMode,
  type ConfiguratorPresetId,
} from '@/lib/configuratorPresets';
import {
  normalizeSavedUiConfig,
  parseSavedUiConfig,
  serializeSavedUiConfig,
  type SavedUiConfig,
} from '@/lib/uiConfig';
import {
  parseConfiguratorLinkImport,
  type ConfiguratorPreviewType,
} from '@/lib/configuratorLinkImport';

const UI_CONFIG_STORAGE_KEY = 'xrdb.uiConfig.v1';
const UI_CONFIG_SETTINGS_STORAGE_KEY = 'xrdb.uiConfig.settings.v1';
const LEGACY_API_KEY_CONFIG_STORAGE_KEY = 'xrdb.apiKeyConfig.v1';
const LEGACY_API_KEY_CONFIG_SETTINGS_STORAGE_KEY = 'xrdb.apiKeyConfig.settings.v1';

type LocalUiSettingsStorage = {
  autoSave?: boolean;
  experienceMode?: ConfiguratorExperienceMode;
  presetId?: ConfiguratorPresetId | null;
  stickyPreview?: boolean;
};

type LegacyApiKeyConfigStorage = {
  tmdbKey?: string;
  mdblistKey?: string;
  proxyTmdbKey?: string;
  proxyMdblistKey?: string;
  proxyManifestUrl?: string;
};

export function useConfiguratorWorkspaceStorage({
  applySavedUiConfig,
  buildCurrentUiConfig,
  previewType,
  setPreviewType,
  setMediaId,
  stickyPreviewEnabled,
  experienceMode,
  selectedPresetId,
  setStickyPreviewEnabled,
  setExperienceMode,
  setExperienceModeDraft,
  setShowExperienceModal,
  setSelectedPresetId,
}: {
  applySavedUiConfig: (config: SavedUiConfig) => void;
  buildCurrentUiConfig: () => SavedUiConfig;
  previewType: ConfiguratorPreviewType;
  setPreviewType: (value: ConfiguratorPreviewType) => void;
  setMediaId: (value: string) => void;
  stickyPreviewEnabled: boolean;
  experienceMode: ConfiguratorExperienceMode;
  selectedPresetId: ConfiguratorPresetId | null;
  setStickyPreviewEnabled: (value: boolean) => void;
  setExperienceMode: (value: ConfiguratorExperienceMode) => void;
  setExperienceModeDraft: (value: ConfiguratorExperienceMode) => void;
  setShowExperienceModal: (value: boolean) => void;
  setSelectedPresetId: (value: ConfiguratorPresetId | null) => void;
}) {
  const [savedConfigStatus, setSavedConfigStatus] = useState<
    '' | 'loaded' | 'saved' | 'cleared' | 'imported' | 'preset' | 'error' | 'invalid'
  >('');
  const [configAutoSave, setConfigAutoSave] = useState(false);
  const [uiSettingsLoaded, setUiSettingsLoaded] = useState(false);
  const workspaceImportInputRef = useRef<HTMLInputElement | null>(null);

  const applyWorkspaceConfig = useCallback(
    (config: SavedUiConfig, status: 'loaded' | 'imported' | 'preset' = 'loaded') => {
      applySavedUiConfig(config);
      setSavedConfigStatus(status);
    },
    [applySavedUiConfig],
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let cancelled = false;

    try {
      const settingsRaw =
        window.localStorage.getItem(UI_CONFIG_SETTINGS_STORAGE_KEY) ||
        window.localStorage.getItem(LEGACY_API_KEY_CONFIG_SETTINGS_STORAGE_KEY);
      const parsedSettings = settingsRaw ? (JSON.parse(settingsRaw) as LocalUiSettingsStorage) : null;
      const applyParsedSettings = () => {
        if (parsedSettings) {
          setConfigAutoSave(Boolean(parsedSettings.autoSave));
          setStickyPreviewEnabled(Boolean(parsedSettings.stickyPreview));
          if (isConfiguratorExperienceMode(parsedSettings.experienceMode)) {
            setExperienceMode(parsedSettings.experienceMode);
            setExperienceModeDraft(parsedSettings.experienceMode);
            setShowExperienceModal(false);
          } else {
            setShowExperienceModal(true);
          }
          if (isConfiguratorPresetId(parsedSettings.presetId)) {
            setSelectedPresetId(parsedSettings.presetId);
          }
          return;
        }
        setShowExperienceModal(true);
      };

      const raw = window.localStorage.getItem(UI_CONFIG_STORAGE_KEY);
      if (raw) {
        const parsed = parseSavedUiConfig(raw);
        if (!parsed) {
          queueMicrotask(() => {
            if (cancelled) {
              return;
            }
            applyParsedSettings();
            setSavedConfigStatus('error');
            setUiSettingsLoaded(true);
          });
          return;
        }
        queueMicrotask(() => {
          if (cancelled) {
            return;
          }
          applyParsedSettings();
          applyWorkspaceConfig(parsed, 'loaded');
          setUiSettingsLoaded(true);
        });
        return;
      }

      const legacyRaw = window.localStorage.getItem(LEGACY_API_KEY_CONFIG_STORAGE_KEY);
      if (!legacyRaw) {
        queueMicrotask(() => {
          if (cancelled) {
            return;
          }
          applyParsedSettings();
          setUiSettingsLoaded(true);
        });
        return;
      }

      const legacy = JSON.parse(legacyRaw) as LegacyApiKeyConfigStorage;
      queueMicrotask(() => {
        if (cancelled) {
          return;
        }
        applyParsedSettings();
        applyWorkspaceConfig(
          normalizeSavedUiConfig({
            version: 1,
            settings: {
              tmdbKey:
                typeof legacy.tmdbKey === 'string' && legacy.tmdbKey.trim()
                  ? legacy.tmdbKey
                  : typeof legacy.proxyTmdbKey === 'string'
                    ? legacy.proxyTmdbKey
                    : '',
              mdblistKey:
                typeof legacy.mdblistKey === 'string' && legacy.mdblistKey.trim()
                  ? legacy.mdblistKey
                  : typeof legacy.proxyMdblistKey === 'string'
                    ? legacy.proxyMdblistKey
                    : '',
            },
            proxy: {
              manifestUrl:
                typeof legacy.proxyManifestUrl === 'string' ? legacy.proxyManifestUrl : '',
            },
          }),
          'loaded',
        );
        setUiSettingsLoaded(true);
      });
    } catch {
      queueMicrotask(() => {
        if (cancelled) {
          return;
        }
        setSavedConfigStatus('error');
        setUiSettingsLoaded(true);
      });
    }

    return () => {
      cancelled = true;
    };
  }, [
    applyWorkspaceConfig,
    setExperienceMode,
    setExperienceModeDraft,
    setSelectedPresetId,
    setShowExperienceModal,
    setStickyPreviewEnabled,
  ]);

  const persistUiConfig = useCallback((showSavedStatus = true) => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(UI_CONFIG_STORAGE_KEY, serializeSavedUiConfig(buildCurrentUiConfig()));
      if (showSavedStatus) {
        setSavedConfigStatus('saved');
      }
    } catch {
      setSavedConfigStatus('error');
    }
  }, [buildCurrentUiConfig]);

  useEffect(() => {
    if (!configAutoSave) {
      return;
    }
    queueMicrotask(() => {
      persistUiConfig(false);
    });
  }, [configAutoSave, persistUiConfig]);

  useEffect(() => {
    if (typeof window === 'undefined' || !uiSettingsLoaded) {
      return;
    }

    try {
      const payload: LocalUiSettingsStorage = {
        autoSave: configAutoSave,
        stickyPreview: stickyPreviewEnabled,
        experienceMode,
        presetId: selectedPresetId,
      };
      window.localStorage.setItem(UI_CONFIG_SETTINGS_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      queueMicrotask(() => {
        setSavedConfigStatus('error');
      });
    }
  }, [configAutoSave, stickyPreviewEnabled, experienceMode, selectedPresetId, uiSettingsLoaded]);

  const handleSaveWorkspaceConfig = useCallback(() => {
    persistUiConfig(true);
  }, [persistUiConfig]);

  const handleClearSavedWorkspace = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.removeItem(UI_CONFIG_STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_API_KEY_CONFIG_STORAGE_KEY);
      setSavedConfigStatus('cleared');
    } catch {
      setSavedConfigStatus('error');
    }
  }, []);

  const handleToggleConfigAutoSave = useCallback(() => {
    const next = !configAutoSave;
    setConfigAutoSave(next);

    if (next) {
      persistUiConfig(false);
    }
  }, [configAutoSave, persistUiConfig]);

  const handleDownloadWorkspace = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const payload = serializeSavedUiConfig(buildCurrentUiConfig());
    const blob = new Blob([payload], { type: 'application/json' });
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `xrdb-workspace-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.URL.revokeObjectURL(downloadUrl);
  }, [buildCurrentUiConfig]);

  const handlePromptWorkspaceImport = useCallback(() => {
    workspaceImportInputRef.current?.click();
  }, []);

  const handleImportWorkspace = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) {
        return;
      }

      try {
        const parsed = parseSavedUiConfig(await file.text());
        if (!parsed) {
          setSavedConfigStatus('invalid');
          return;
        }
        applyWorkspaceConfig(parsed, 'imported');
      } catch {
        setSavedConfigStatus('invalid');
      }
    },
    [applyWorkspaceConfig],
  );

  const handleImportWorkspaceLink = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const rawValue = window.prompt('Paste an XRDB URL to import settings.');
    if (rawValue === null) {
      return;
    }

    const parsedImport = parseConfiguratorLinkImport(rawValue, {
      baseOrigin: window.location.origin,
      fallbackPreviewType: previewType,
    });
    if (!parsedImport) {
      setSavedConfigStatus('invalid');
      return;
    }

    applyWorkspaceConfig(parsedImport.config, 'imported');
    if (parsedImport.previewType && parsedImport.previewType !== previewType) {
      setPreviewType(parsedImport.previewType);
    }
    if (parsedImport.mediaId) {
      setMediaId(parsedImport.mediaId);
    }
  }, [applyWorkspaceConfig, previewType, setMediaId, setPreviewType]);

  return {
    applyWorkspaceConfig,
    configAutoSave,
    savedConfigStatus,
    workspaceImportInputRef,
    handleSaveWorkspaceConfig,
    handleClearSavedWorkspace,
    handleToggleConfigAutoSave,
    handleDownloadWorkspace,
    handlePromptWorkspaceImport,
    handleImportWorkspace,
    handleImportWorkspaceLink,
  };
}
