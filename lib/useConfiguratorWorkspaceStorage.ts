import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';

import {
  isConfiguratorExperienceMode,
  isConfiguratorPresetId,
  type ConfiguratorExperienceMode,
  type ConfiguratorPresetId,
} from '@/lib/configuratorPresets';
import {
  buildProfileParams,
  normalizeSavedUiConfig,
  omitProviderCredentialsFromSavedUiConfig,
  parseSavedUiConfig,
  serializeSavedUiConfig,
  type SavedUiConfig,
} from '@/lib/uiConfig';
import { isProtectedConfigProfileId } from '@/lib/configProfileClientState';
import {
  getConfiguratorLinkImportTypes,
  mergeConfiguratorLinkImportIntoProfileParams,
  parseConfiguratorLinkImport,
  type ConfiguratorLinkImportResult,
  type ConfiguratorPreviewType,
} from '@/lib/configuratorLinkImport';

const UI_CONFIG_STORAGE_KEY = 'xrdb.uiConfig.v1';
const UI_CONFIG_SETTINGS_STORAGE_KEY = 'xrdb.uiConfig.settings.v1';
const LEGACY_API_KEY_CONFIG_STORAGE_KEY = 'xrdb.apiKeyConfig.v1';
const LEGACY_API_KEY_CONFIG_SETTINGS_STORAGE_KEY = 'xrdb.apiKeyConfig.settings.v1';
const CONFIG_PROFILE_RESTORE_SYNC_EVENT = 'xrdb:config-profile-restore-sync';

type LocalUiSettingsStorage = {
  autoSave?: boolean;
  experienceMode?: ConfiguratorExperienceMode;
  presetId?: ConfiguratorPresetId | null;
  stickyPreview?: boolean;
  mediaId?: string;
  activeTitle?: string;
};


type LegacyApiKeyConfigStorage = {
  tmdbKey?: string;
  mdblistKey?: string;
  proxyTmdbKey?: string;
  proxyMdblistKey?: string;
  proxyManifestUrl?: string;
};

type PendingLinkImportSelection = {
  parsedImport: ConfiguratorLinkImportResult;
  selectedTargetTypes: ConfiguratorPreviewType[];
  includeSharedSettings: boolean;
  allowCrossTypeTargets: boolean;
};

export function useConfiguratorWorkspaceStorage({
  applySavedUiConfig,
  buildCurrentUiConfig,
  previewType,
  setPreviewType,
  setMediaId,
  stickyPreviewEnabled,
  experienceMode,
  activePreviewTitle,
  setActivePreviewTitle,
  selectedPresetId,
  mediaId,
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
  activePreviewTitle: string;
  setActivePreviewTitle: (value: string) => void;
  mediaId: string;
  experienceMode: ConfiguratorExperienceMode;
  selectedPresetId: ConfiguratorPresetId | null;
  setStickyPreviewEnabled: (value: boolean) => void;
  setExperienceMode: (value: ConfiguratorExperienceMode) => void;
  setExperienceModeDraft: (value: ConfiguratorExperienceMode) => void;
  setShowExperienceModal: (value: boolean) => void;
  setSelectedPresetId: (value: ConfiguratorPresetId | null) => void;
}) {
  const [savedConfigStatus, setSavedConfigStatus] = useState<
    '' | 'loaded' | 'saved' | 'cleared' | 'imported' | 'preset' | 'reset' | 'error' | 'invalid' | 'profile-link'
  >('');
  const [configAutoSave, setConfigAutoSave] = useState(false);
  const [uiSettingsLoaded, setUiSettingsLoaded] = useState(false);
  const [pendingConfigProfileId, setPendingConfigProfileId] = useState<string | null>(null);
  const workspaceImportInputRef = useRef<HTMLInputElement | null>(null);
  const pendingRestoreFromUrlRef = useRef<string | null>(null);

  const applyWorkspaceConfig = useCallback(
    (config: SavedUiConfig, status: 'loaded' | 'imported' | 'preset' | 'reset' = 'loaded') => {
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
          if (typeof parsedSettings.mediaId === 'string' && parsedSettings.mediaId.trim()) {
            setMediaId(parsedSettings.mediaId);
          }
          if (typeof parsedSettings.activeTitle === 'string' && parsedSettings.activeTitle.trim()) {
            setActivePreviewTitle(parsedSettings.activeTitle);
          }
          return;
        }
        setShowExperienceModal(true);
      };

      const raw = window.localStorage.getItem(UI_CONFIG_STORAGE_KEY);
      if (raw) {
        const parsed = parseSavedUiConfig(raw, { skipCrossTypeFallbacks: true });
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
    setActivePreviewTitle,
    setMediaId,
    setSelectedPresetId,
    setShowExperienceModal,
    setStickyPreviewEnabled,
  ]);

  const persistUiConfig = useCallback((showSavedStatus = true) => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(
        UI_CONFIG_STORAGE_KEY,
        serializeSavedUiConfig(omitProviderCredentialsFromSavedUiConfig(buildCurrentUiConfig())),
      );
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
        mediaId,
        activeTitle: activePreviewTitle,
      };
      window.localStorage.setItem(UI_CONFIG_SETTINGS_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      queueMicrotask(() => {
        setSavedConfigStatus('error');
      });
    }
  }, [
    configAutoSave,
    stickyPreviewEnabled,
    experienceMode,
    selectedPresetId,
    mediaId,
    activePreviewTitle,
    uiSettingsLoaded,
  ]);

  const handleSaveWorkspaceConfig = useCallback(() => {
    persistUiConfig(true);
  }, [persistUiConfig]);

  const queueConfigProfileRestore = useCallback((profileId: string) => {
    setPendingConfigProfileId(profileId);
    setSavedConfigStatus('profile-link');
  }, []);

  const syncPendingConfigProfileRestoreFromUrl = useCallback(() => {
    if (typeof window === 'undefined' || !uiSettingsLoaded) {
      return;
    }

    const configProfileId = new URL(window.location.href).searchParams.get('config');
    if (!isProtectedConfigProfileId(configProfileId)) {
      return;
    }

    if (pendingRestoreFromUrlRef.current === configProfileId) {
      return;
    }

    const storedProfileId = window.localStorage.getItem('xrdb_config_profile_id');
    if (storedProfileId === configProfileId) {
      return;
    }

    pendingRestoreFromUrlRef.current = configProfileId;
    queueConfigProfileRestore(configProfileId);
  }, [queueConfigProfileRestore, uiSettingsLoaded]);

  const clearPendingConfigProfileRestore = useCallback(() => {
    setPendingConfigProfileId(null);
  }, []);

  const handleClearSavedWorkspace = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const profileId = window.localStorage.getItem('xrdb_config_profile_id');
      window.localStorage.removeItem(UI_CONFIG_STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_API_KEY_CONFIG_STORAGE_KEY);
      window.localStorage.removeItem('xrdb_config_profile_id');
      setPendingConfigProfileId(null);
      window.dispatchEvent(new Event('xrdb-config-profile-cleared'));
      if (profileId) {
        void fetch(`/api/config/${profileId}`, { method: 'DELETE' });
      }
      applySavedUiConfig(normalizeSavedUiConfig({}));
      setSavedConfigStatus('cleared');
    } catch {
      setSavedConfigStatus('error');
    }
  }, [applySavedUiConfig]);

  const handleToggleConfigAutoSave = useCallback(() => {
    const next = !configAutoSave;
    setConfigAutoSave(next);

    if (next) {
      persistUiConfig(false);
    }
  }, [configAutoSave, persistUiConfig]);

  useEffect(() => {
    if (typeof window === 'undefined' || !uiSettingsLoaded) {
      return;
    }

    const handleSyncPendingConfigProfileRestore = () => {
      syncPendingConfigProfileRestoreFromUrl();
    };

    window.addEventListener(CONFIG_PROFILE_RESTORE_SYNC_EVENT, handleSyncPendingConfigProfileRestore);
    window.dispatchEvent(new Event(CONFIG_PROFILE_RESTORE_SYNC_EVENT));

    return () => {
      window.removeEventListener(CONFIG_PROFILE_RESTORE_SYNC_EVENT, handleSyncPendingConfigProfileRestore);
    };
  }, [syncPendingConfigProfileRestoreFromUrl, uiSettingsLoaded]);

  const handleDownloadWorkspace = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const payload = serializeSavedUiConfig(
      omitProviderCredentialsFromSavedUiConfig(buildCurrentUiConfig()),
    );
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
        const parsed = parseSavedUiConfig(await file.text(), { skipCrossTypeFallbacks: true });
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

  const [importLinkModalOpen, setImportLinkModalOpen] = useState(false);
  const [importLinkValue, setImportLinkValue] = useState('');
  const [pendingLinkImportSelection, setPendingLinkImportSelection] =
    useState<PendingLinkImportSelection | null>(null);

  const handleOpenImportLinkModal = useCallback(() => {
    setImportLinkValue('');
    setImportLinkModalOpen(true);
  }, []);

  const handleCloseImportLinkModal = useCallback(() => {
    setImportLinkModalOpen(false);
    setImportLinkValue('');
  }, []);

  const handleCancelImportLinkSelection = useCallback(() => {
    setPendingLinkImportSelection(null);
  }, []);

  const handleToggleImportTargetType = useCallback((targetType: ConfiguratorPreviewType) => {
    setPendingLinkImportSelection((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        selectedTargetTypes: current.selectedTargetTypes.includes(targetType)
          ? current.selectedTargetTypes.filter((entry) => entry !== targetType)
          : [...current.selectedTargetTypes, targetType],
      };
    });
  }, []);

  const handleToggleImportSharedSettings = useCallback(() => {
    setPendingLinkImportSelection((current) => (
      current
        ? {
            ...current,
            includeSharedSettings: !current.includeSharedSettings,
          }
        : current
    ));
  }, []);

  const handleConfirmImportLinkSelection = useCallback(() => {
    if (!pendingLinkImportSelection) {
      return;
    }

    const { parsedImport, selectedTargetTypes, includeSharedSettings } = pendingLinkImportSelection;
    if (selectedTargetTypes.length === 0 && !includeSharedSettings) {
      return;
    }

    const currentConfig = buildCurrentUiConfig();
    const currentParams = buildProfileParams(currentConfig.settings) ?? {};
    const nextParams = mergeConfiguratorLinkImportIntoProfileParams(currentParams, parsedImport, {
      targetTypes: selectedTargetTypes,
      includeShared: includeSharedSettings,
      sourceType: parsedImport.defaultSourceType,
    });
    const nextConfig = normalizeSavedUiConfig(
      {
        version: 1,
        settings: nextParams,
        proxy: currentConfig.proxy,
      },
      { skipCrossTypeFallbacks: true },
    );

    setPendingLinkImportSelection(null);
    applyWorkspaceConfig(nextConfig, 'imported');

    if (selectedTargetTypes.length === 1 && selectedTargetTypes[0] && selectedTargetTypes[0] !== previewType) {
      setPreviewType(selectedTargetTypes[0]);
    }
    if (parsedImport.mediaId) {
      setMediaId(parsedImport.mediaId);
    }
  }, [applyWorkspaceConfig, buildCurrentUiConfig, pendingLinkImportSelection, previewType, setMediaId, setPreviewType]);

  const handleSubmitImportLink = useCallback(() => {
    setImportLinkModalOpen(false);

    const rawValue = importLinkValue.trim();
    setImportLinkValue('');
    if (!rawValue) {
      return;
    }

    const parsedImport = parseConfiguratorLinkImport(rawValue, {
      baseOrigin: typeof window !== 'undefined' ? window.location.origin : '',
      fallbackPreviewType: previewType,
    });
    if (!parsedImport) {
      setSavedConfigStatus('invalid');
      return;
    }

    if (parsedImport.configProfileId) {
      queueConfigProfileRestore(parsedImport.configProfileId);
      return;
    }

    const importTypes = getConfiguratorLinkImportTypes(parsedImport);
    if (importTypes.length === 0 && Object.keys(parsedImport.sharedSettings).length === 0) {
      setSavedConfigStatus('invalid');
      return;
    }

    setPendingLinkImportSelection({
      parsedImport,
      selectedTargetTypes:
        importTypes.length <= 1
          ? parsedImport.defaultSourceType
            ? [parsedImport.defaultSourceType]
            : []
          : importTypes,
      includeSharedSettings: false,
      allowCrossTypeTargets: importTypes.length <= 1,
    });
  }, [importLinkValue, previewType, queueConfigProfileRestore]);

  return {
    applyWorkspaceConfig,
    clearPendingConfigProfileRestore,
    configAutoSave,
    pendingConfigProfileId,
    savedConfigStatus,
    uiSettingsLoaded,
    workspaceImportInputRef,
    handleSaveWorkspaceConfig,
    handleClearSavedWorkspace,
    handleToggleConfigAutoSave,
    handleDownloadWorkspace,
    handlePromptWorkspaceImport,
    handleImportWorkspace,
    importLinkModalOpen,
    importLinkValue,
    pendingLinkImportSelection,
    onOpenImportLinkModal: handleOpenImportLinkModal,
    onCloseImportLinkModal: handleCloseImportLinkModal,
    onImportLinkValueChange: setImportLinkValue,
    onSubmitImportLink: handleSubmitImportLink,
    onCancelImportLinkSelection: handleCancelImportLinkSelection,
    onConfirmImportLinkSelection: handleConfirmImportLinkSelection,
    onToggleImportSharedSettings: handleToggleImportSharedSettings,
    onToggleImportTargetType: handleToggleImportTargetType,
  };
}
