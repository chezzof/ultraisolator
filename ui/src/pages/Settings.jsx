import { useEffect, useState } from 'react';
import { ActionPanel } from '../components/cards/ActionPanel.jsx';
import { ConfigField } from '../components/ConfigField.jsx';
import { SectionGrid } from '../components/layout/SectionGrid.jsx';
import { PageHeading } from '../components/PageHeading.jsx';
import { StatusTag } from '../components/StatusTag.jsx';
import { StatusPill } from '../components/status/StatusPill.jsx';
import { EmptyState } from '../components/states/EmptyState.jsx';
import { ErrorState } from '../components/states/ErrorState.jsx';
import { ToggleRow } from '../components/ToggleRow.jsx';
import { CONFIG_PRESETS, DEFAULT_APP_SETTINGS } from '../constants/settings.js';
import { LANGUAGES, useI18n } from '../i18n.jsx';
import { requestJson } from '../utils/api.js';
import { loadAppSettings, saveAppSettings } from '../utils/appSettings.js';
import { EMPTY_APP_PROFILE, parseListValue, toEditableConfig, validateConfigDraft } from '../utils/config.js';

const SETTINGS_RISK_GROUPS = [
  {
    id: 'game-detection',
    i18nKey: 'gameDetection',
    title: 'Game detection',
    tone: 'neutral',
    badge: 'Safe',
    detail: 'Executables and launcher libraries used to detect the active game session.',
    fields: ['games', 'auto_detect_steam_games', 'auto_detect_epic_games', 'steam_library_paths', 'epic_library_paths']
  },
  {
    id: 'safe-basic',
    i18nKey: 'safeBasic',
    title: 'Safe/basic behavior',
    tone: 'connected',
    badge: 'Basic',
    detail: 'Polling, close debounce, restore delay, and logging controls that do not change privileged policy.',
    fields: ['poll_interval_active_ms', 'poll_interval_idle_ms', 'game_close_debounce_s', 'game_exit_restore_delay_s', 'gc_full_collect_interval_s', 'event_backend', 'log_file']
  },
  {
    id: 'performance-tuning',
    i18nKey: 'performance',
    title: 'Performance tuning',
    tone: 'warning',
    badge: 'Caution',
    detail: 'Power, timer, priority, housekeeping, and hot-thread controls can affect frame pacing.',
    fields: ['housekeeping_cores', 'disable_power_scheme_switch', 'disable_timer_resolution_tweak', 'disable_game_priority_boost', 'hot_thread_limit', 'thread_sample_window_ms', 'enable_hot_thread_tuning', 'hot_thread_refresh_ms']
  },
  {
    id: 'anti-cheat-protection',
    i18nKey: 'protection',
    title: 'Anti-cheat and protection',
    tone: 'warning',
    badge: 'Safety',
    detail: 'Use conservative anti-cheat mode for stricter anti-cheat stacks. Protected names stay guarded by the backend.',
    fields: ['anti_cheat_mode', 'protected_extra', 'allow_mmcss_injection']
  },
  {
    id: 'advanced-background-jailing',
    i18nKey: 'advancedJailing',
    title: 'Advanced background jailing',
    tone: 'danger',
    badge: 'Advanced',
    detail: 'Background jailing is opt-in. These controls decide when non-game processes are moved away from the game.',
    fields: ['enable_background_jailing', 'maintenance_jail_batch_size', 'maintenance_jail_interval_ms', 'maintenance_jail_batch_cooldown_ms', 'maintenance_skip_after_quiet_cycles']
  }
];

const APP_PROFILES_RISK_GROUP = {
  id: 'app-profiles',
  i18nKey: 'appProfiles',
  title: 'App profiles / custom paths',
  tone: 'warning',
  badge: 'Advanced',
  detail: 'Per-app overrides and custom executable paths load after the backend config is available.'
};

const SETTINGS_PLACEHOLDER_GROUPS = [
  ...SETTINGS_RISK_GROUPS,
  APP_PROFILES_RISK_GROUP
];

function displayConfigPath(configPath) {
  if (!configPath) {
    return 'config.json';
  }
  const parts = String(configPath).split(/[\\/]/).filter(Boolean);
  return parts.at(-1) || 'config.json';
}

function hasLibraryPaths(draft) {
  return parseListValue(draft?.steam_library_paths).length > 0 || parseListValue(draft?.epic_library_paths).length > 0;
}

export function SettingsPage({ live }) {
  const { t } = useI18n();
  const status = live.snapshot?.status || {};
  const [schema, setSchema] = useState(null);
  const [defaults, setDefaults] = useState(null);
  const [draft, setDraft] = useState(null);
  const [appSettings, setAppSettings] = useState(DEFAULT_APP_SETTINGS);
  const [fieldErrors, setFieldErrors] = useState({});
  const [settingsState, setSettingsState] = useState({
    loading: true,
    saving: false,
    error: null,
    message: null,
    configPath: null,
    configExists: null,
    restartRequired: false
  });

  const loadConfig = async () => {
    setSettingsState((current) => ({ ...current, loading: true, error: null, message: null }));
    try {
      const [defaultsPayload, configPayload, appSettingsPayload] = await Promise.all([
        requestJson('/api/config/defaults'),
        requestJson('/api/config'),
        loadAppSettings()
      ]);
      setSchema(defaultsPayload.schema);
      setDefaults(defaultsPayload.defaults);
      setDraft(toEditableConfig(configPayload.config, defaultsPayload.schema));
      setAppSettings(appSettingsPayload);
      setFieldErrors({});
      setSettingsState({
        loading: false,
        saving: false,
        error: null,
        message: configPayload.exists ? t('settings.loadedConfig', 'Loaded config.json') : t('settings.loadedDefaults', 'Loaded defaults; config.json does not exist yet'),
        configPath: configPayload.path,
        configExists: Boolean(configPayload.exists),
        restartRequired: false
      });
    } catch (error) {
      setSettingsState((current) => ({
        ...current,
        loading: false,
        saving: false,
        error: error instanceof Error ? error.message : t('settings.loadError', 'Unable to load settings'),
        message: null
      }));
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('app-settings-updated', { detail: appSettings }));
  }, [appSettings]);

  const updateDraftField = (field, value) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) {
        return current;
      }
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const updateAppSettingsDraft = (patch) => {
    setAppSettings((current) => ({ ...current, ...patch }));
  };

  const appProfileErrors = (index, field = null) => {
    const exactKey = field ? `app_profiles[${index}].${field}` : `app_profiles[${index}]`;
    return fieldErrors[exactKey] || '';
  };

  const presetLabel = (preset) => t(`settings.preset.${preset.id}.label`, preset.label);
  const presetDetail = (preset) => t(`settings.preset.${preset.id}.detail`, preset.detail);

  const addProfile = () => {
    setDraft((current) => ({
      ...current,
      app_profiles: [...(current.app_profiles || []), { ...EMPTY_APP_PROFILE }]
    }));
  };

  const removeProfile = (index) => {
    setDraft((current) => ({
      ...current,
      app_profiles: (current.app_profiles || []).filter((_, itemIndex) => itemIndex !== index)
    }));
    setFieldErrors((current) => {
      const next = {};
      for (const [key, value] of Object.entries(current)) {
        if (!key.startsWith('app_profiles[')) {
          next[key] = value;
        }
      }
      return next;
    });
  };

  const updateProfile = (index, patch) => {
    setDraft((current) => ({
      ...current,
      app_profiles: (current.app_profiles || []).map((profile, itemIndex) => (
        itemIndex === index ? { ...profile, ...patch } : profile
      ))
    }));
  };

  const applyPresetToDraft = (preset) => {
    if (!draft) {
      return;
    }
    setDraft((current) => ({ ...current, ...preset.config }));
    setSettingsState((current) => ({
      ...current,
      error: null,
      message: t('settings.presetApplied', '{{preset}} preset applied to draft; save to write config.json.').replace('{{preset}}', presetLabel(preset)),
      restartRequired: false
    }));
  };

  const resetToDefaults = () => {
    if (!defaults || !schema) {
      return;
    }
    if (!window.confirm(t('settings.resetConfirm', 'Reset all config and application settings to defaults?'))) {
      return;
    }
    setDraft(toEditableConfig(defaults, schema));
    setAppSettings(DEFAULT_APP_SETTINGS);
    setFieldErrors({});
    setSettingsState((current) => ({
      ...current,
      error: null,
      message: t('settings.resetDone', 'Reset draft to defaults'),
      restartRequired: false
    }));
  };

  const saveSettings = async () => {
    if (!draft || !schema) {
      return;
    }
    const validation = validateConfigDraft(draft, schema);
    setFieldErrors(validation.errors);
    if (Object.keys(validation.errors).length > 0) {
      setSettingsState((current) => ({
        ...current,
        error: t('settings.fixValidation', 'Fix validation errors before saving.'),
        message: null
      }));
      return;
    }

    setSettingsState((current) => ({ ...current, saving: true, error: null, message: null }));
    try {
      const [configResult, savedAppSettings] = await Promise.all([
        requestJson('/api/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: validation.config })
        }),
        saveAppSettings(appSettings)
      ]);
      setDraft(toEditableConfig(configResult.config, schema));
      setAppSettings(savedAppSettings);
      setSettingsState((current) => ({
        ...current,
        saving: false,
        error: null,
        message: configResult.restart_required ? t('settings.savedRestart', 'Saved; restart isolator to apply changes') : t('settings.saved', 'Saved'),
        configExists: true,
        restartRequired: Boolean(configResult.restart_required)
      }));
    } catch (error) {
      const apiErrors = error?.payload?.errors;
      if (Array.isArray(apiErrors)) {
        const nextErrors = {};
        for (const item of apiErrors) {
          nextErrors[item.field] = item.message;
        }
        setFieldErrors(nextErrors);
      }
      setSettingsState((current) => ({
        ...current,
        saving: false,
        error: error instanceof Error ? error.message : t('settings.saveError', 'Unable to save settings'),
        message: null
      }));
    }
  };

  const riskSections = schema ? SETTINGS_RISK_GROUPS.map((section) => ({
    ...section,
    fields: section.fields.filter((field) => schema[field])
  })).filter((section) => section.fields.length > 0) : [];

  const renderField = (field) => (
    <ConfigField
      key={field}
      field={field}
      spec={schema[field]}
      value={draft[field]}
      error={fieldErrors[field]}
      onChange={(value) => updateDraftField(field, value)}
    />
  );

  const renderRiskHeader = (section) => (
    <div className="settings-risk-header">
      <div>
        <h2 id={`settings-${section.id}`} className="module-title">
          {t(`settings.risk.${section.i18nKey || section.id}.title`, section.title)}
        </h2>
        <div className="settings-risk-detail">{t(`settings.risk.${section.i18nKey || section.id}.detail`, section.detail)}</div>
      </div>
      <StatusPill tone={section.tone}>{t(`settings.risk.${section.i18nKey || section.id}.badge`, section.badge)}</StatusPill>
    </div>
  );

  return (
    <section className="page settings-page" aria-labelledby="settings-title">
      <PageHeading title="Settings" titleKey="nav.settings" titleId="settings-title">
        <div className="settings-header-actions">
          <StatusTag status={status} />
          <StatusPill tone={settingsState.restartRequired ? 'warning' : 'inactive'}>
            {settingsState.restartRequired ? t('settings.restartRequired', 'Restart required') : t('settings.configEditor', 'Config editor')}
          </StatusPill>
          <StatusPill tone={settingsState.configExists === false ? 'warning' : draft ? 'success' : 'inactive'}>
            {settingsState.configExists === false ? t('settings.defaultsLoaded', 'Defaults loaded') : draft ? t('settings.configLoaded', 'Config loaded') : t('settings.loading', 'Loading config')}
          </StatusPill>
          <div className="settings-actions">
            <button type="button" onClick={saveSettings} disabled={settingsState.loading || settingsState.saving || !draft}>
              {t('common.save', 'Save')}
            </button>
            <button type="button" onClick={resetToDefaults} disabled={settingsState.loading || settingsState.saving || !defaults}>
              {t('common.reset', 'Reset')}
            </button>
            <button type="button" onClick={loadConfig} disabled={settingsState.loading || settingsState.saving}>
              {t('common.reload', 'Reload')}
            </button>
          </div>
        </div>
      </PageHeading>

      <div className="settings-toolbar settings-config-strip">
        <div>
          <div className="settings-toolbar-label">{t('settings.configFile', 'Config file')}</div>
          <div className="settings-path" title={settingsState.configPath || 'config.json'}>
            {displayConfigPath(settingsState.configPath)}
          </div>
        </div>
        <div className="settings-toolbar-pills">
          <StatusPill tone={settingsState.configExists === false ? 'warning' : 'success'}>
            {settingsState.configExists === false ? t('settings.defaultsLoaded', 'Defaults loaded') : t('settings.configEditor', 'Config editor')}
          </StatusPill>
          <StatusPill tone={settingsState.restartRequired ? 'warning' : 'inactive'}>
            {t('settings.restartAfterSave', 'Restart required after save.')}
          </StatusPill>
        </div>
      </div>

      {settingsState.error ? (
        <ErrorState className="settings-error-state" title={t('settings.errorTitle', 'Settings need attention')} detail={settingsState.error} />
      ) : null}
      {settingsState.message ? <div className="settings-message">{settingsState.message}</div> : null}

      <ActionPanel
        className="settings-safety-overview"
        title={t('settings.safetyOverview', 'Safety overview')}
        detail={t('settings.safetyOverviewDetail', 'Background jailing is opt-in. Use conservative anti-cheat mode for stricter anti-cheat stacks. Some changes require restart.')}
        actions={(
          <div className="settings-safety-pills" aria-label="Settings safety guidance">
            <StatusPill tone="inactive">{t('settings.backgroundJailingOptIn', 'Background jailing is opt-in')}</StatusPill>
            <StatusPill tone="warning">{t('settings.conservativeAntiCheat', 'Use conservative anti-cheat mode')}</StatusPill>
            <StatusPill tone="warning">{t('settings.someRestart', 'Some changes require restart')}</StatusPill>
          </div>
        )}
      />

      {settingsState.loading || !draft || !schema ? (
        <>
          <EmptyState
            className="settings-loading-state module-surface"
            title={t('nav.settings', 'Settings')}
            detail={settingsState.error ? t('settings.configUnavailableDetail', 'Config controls are unavailable until the backend proxy reconnects.') : t('settings.loading', 'Loading config')}
          />
          <div className="settings-grid settings-risk-grid settings-risk-grid-placeholder" aria-label="Settings risk groups">
            {SETTINGS_PLACEHOLDER_GROUPS.map((section) => (
              <section className={`settings-section settings-risk-section settings-risk-${section.id}${section.tone === 'danger' ? ' settings-risk-danger' : ''}`} key={section.id} aria-labelledby={`settings-${section.id}`}>
                {renderRiskHeader(section)}
                <EmptyState
                  className="settings-inline-empty"
                  title={t('settings.configControlsUnavailable', 'Config controls unavailable')}
                  detail={t('settings.configControlsUnavailableDetail', 'Reconnect the Electron backend to edit this group.')}
                />
              </section>
            ))}
          </div>
        </>
      ) : (
        <>
          {settingsState.configExists === false ? (
            <EmptyState
              className="settings-default-state"
              title={t('settings.defaultsLoaded', 'Defaults loaded')}
              detail={t('settings.defaultsLoadedDetail', 'Save once to create config.json from the validated defaults.')}
            />
          ) : null}

          <div className="settings-grid settings-risk-grid">
            {riskSections.map((section) => {
              const sectionClasses = [
                'settings-section',
                'settings-risk-section',
                `settings-risk-${section.id}`,
                section.tone === 'danger' ? 'settings-risk-danger' : ''
              ].filter(Boolean).join(' ');

              return (
                <section className={sectionClasses} key={section.id} aria-labelledby={`settings-${section.id}`}>
                  {renderRiskHeader(section)}

                  {section.id === 'performance-tuning' || section.id === 'anti-cheat-protection' ? (
                    <div className="settings-restart-note">{t('settings.restartNote', 'Some changes require restart or a new game launch before they take effect.')}</div>
                  ) : null}
                  {section.id === 'advanced-background-jailing' ? (
                    <div className="settings-risk-copy">{t('settings.backgroundJailingSafety', 'Background jailing is opt-in. Keep it disabled unless you want non-game processes moved away from the game during a session.')}</div>
                  ) : null}

                  <SectionGrid className="settings-section-grid" ariaLabel={`${section.title} settings`}>
                    {section.fields.map(renderField)}
                  </SectionGrid>

                  {section.id === 'game-detection' && !hasLibraryPaths(draft) ? (
                    <EmptyState
                      className="settings-inline-empty"
                      title={t('settings.noLibraryPaths', 'No Steam or Epic library paths configured')}
                      detail={t('settings.noLibraryPathsDetail', 'Auto-detection can still use default launcher installs; add paths for custom libraries.')}
                    />
                  ) : null}
                </section>
              );
            })}

            <section className="settings-section settings-risk-section presets-section" aria-labelledby="settings-presets-title">
              <div className="settings-risk-header">
                <div>
                  <h2 id="settings-presets-title" className="module-title">{t('settings.presets', 'Config Presets')}</h2>
                  <div className="settings-risk-detail">{t('settings.presetsDetail', 'Apply a known profile to the draft, then review and save.')}</div>
                </div>
                <StatusPill tone="connected">{t('settings.safeDraft', 'Draft only')}</StatusPill>
              </div>
              <div className="preset-button-grid">
                {CONFIG_PRESETS.map((preset) => (
                  <button type="button" key={preset.id} onClick={() => applyPresetToDraft(preset)}>
                    <span>{presetLabel(preset)}</span>
                    <small>{presetDetail(preset)}</small>
                  </button>
                ))}
              </div>
            </section>

            {schema.app_profiles ? (
              <section className="settings-section settings-risk-section settings-app-profiles profiles-editor" aria-labelledby="settings-app-profiles">
                <div className="profiles-header">
                  {renderRiskHeader(APP_PROFILES_RISK_GROUP)}
                  <button type="button" onClick={addProfile}>{t('settings.addProfile', 'Add profile')}</button>
                </div>
                {(draft.app_profiles || []).length === 0 ? (
                  <EmptyState
                    className="settings-inline-empty"
                    title={t('settings.noProfiles', 'No app profiles configured')}
                    detail={t('settings.noProfilesDetail', 'Add a profile only when a specific executable needs custom game, jail, or priority behavior.')}
                  />
                ) : (
                  <div className="profiles-list">
                    {(draft.app_profiles || []).map((profile, index) => (
                      <div className="profile-row" key={`${profile.exe || 'profile'}-${index}`}>
                        <label className={`settings-field${appProfileErrors(index, 'exe') ? ' invalid' : ''}`}>
                          <span className="settings-field-label">{t('settings.profileExecutable', 'Profile executable')}</span>
                          <input
                            type="text"
                            value={profile.exe}
                            spellCheck="false"
                            placeholder="example.exe"
                            onChange={(event) => updateProfile(index, { exe: event.target.value })}
                          />
                          <span className={appProfileErrors(index, 'exe') ? 'settings-field-error' : 'settings-field-hint'}>
                            {appProfileErrors(index, 'exe') || t('settings.profileExeHint', 'Bare names are normalized to .exe by the API.')}
                          </span>
                        </label>
                        <label className="settings-field">
                          <span className="settings-field-label">{t('settings.priority', 'Priority')}</span>
                          <select
                            value={profile.priority_class}
                            onChange={(event) => updateProfile(index, { priority_class: event.target.value })}
                          >
                            <option value="">{t('settings.default', 'Default')}</option>
                            {schema.app_profiles.priority_choices.map((choice) => (
                              <option key={choice} value={choice}>{choice}</option>
                            ))}
                          </select>
                          <span className={appProfileErrors(index, 'priority_class') ? 'settings-field-error' : 'settings-field-hint'}>
                            {appProfileErrors(index, 'priority_class') || t('settings.priorityHint', 'Optional priority override.')}
                          </span>
                        </label>
                        <div className="profile-flags">
                          {[
                            ['enabled', t('settings.profileEnabled', 'Enabled')],
                            ['treat_as_game', t('settings.profileTreatAsGame', 'Treat as game')],
                            ['never_jail', t('settings.profileNeverJail', 'Never jail')],
                            ['always_jail', t('settings.profileAlwaysJail', 'Always jail')]
                          ].map(([field, label]) => (
                            <label className="profile-flag" key={field}>
                              <input
                                type="checkbox"
                                checked={Boolean(profile[field])}
                                onChange={(event) => updateProfile(index, { [field]: event.target.checked })}
                              />
                              <span>{label}</span>
                            </label>
                          ))}
                        </div>
                        {appProfileErrors(index) ? <div className="settings-field-error profile-row-error">{appProfileErrors(index)}</div> : null}
                        <button type="button" className="profile-remove" onClick={() => removeProfile(index)}>{t('settings.remove', 'Remove')}</button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ) : null}

            <section className="settings-section settings-risk-section app-settings-section" aria-labelledby="settings-application-title">
              <div className="settings-risk-header">
                <div>
                  <h2 id="settings-application-title" className="module-title">{t('settings.application', 'Application')}</h2>
                  <div className="settings-risk-detail">{t('settings.applicationDetail', 'Renderer preferences and startup behavior. Engine config is unchanged until saved.')}</div>
                </div>
                <StatusPill tone="neutral">{t('settings.localOnly', 'Local only')}</StatusPill>
              </div>
              <SectionGrid className="settings-section-grid" ariaLabel="Application settings">
                <label className="settings-field">
                  <span className="settings-field-label">{t('settings.language', 'Language')}</span>
                  <select
                    value={appSettings.language || 'en'}
                    onChange={(event) => updateAppSettingsDraft({ language: event.target.value })}
                  >
                    {LANGUAGES.map((language) => (
                      <option key={language.id} value={language.id}>{language.label}</option>
                    ))}
                  </select>
                  <span className="settings-field-hint">{t('settings.languageDetail', 'Changes interface language only; engine config is unchanged.')}</span>
                </label>
                <div className="settings-field toggle-field">
                  <ToggleRow
                    label={t('settings.launchStartup', 'Launch at Windows startup')}
                    detail={t('settings.launchStartupDetail', "Uses the current user's Windows login item.")}
                    checked={appSettings.launchAtWindowsStartup}
                    onChange={(value) => updateAppSettingsDraft({ launchAtWindowsStartup: value })}
                  />
                </div>
                <div className="settings-field toggle-field">
                  <ToggleRow
                    label={t('settings.minimizeTray', 'Minimize to tray on start')}
                    detail={t('settings.minimizeTrayDetail', 'Starts hidden in tray instead of opening the dashboard.')}
                    checked={appSettings.minimizeToTrayOnStart}
                    onChange={(value) => updateAppSettingsDraft({ minimizeToTrayOnStart: value })}
                  />
                </div>
                <div className="settings-field toggle-field">
                  <ToggleRow
                    label={t('settings.autoStart', 'Start isolator automatically')}
                    detail={t('settings.autoStartDetail', 'Starts the engine after the localhost API is ready.')}
                    checked={appSettings.startIsolatorAutomatically}
                    onChange={(value) => updateAppSettingsDraft({ startIsolatorAutomatically: value })}
                  />
                </div>
              </SectionGrid>
            </section>

            <section className="settings-section settings-risk-section notifications-settings-section" aria-labelledby="settings-notifications-title">
              <div className="settings-risk-header">
                <div>
                  <h2 id="settings-notifications-title" className="module-title">{t('settings.notifications', 'Notifications')}</h2>
                  <div className="settings-risk-detail">{t('settings.notificationsDetail', 'Toast visibility and memory-only renderer notification history.')}</div>
                </div>
                <StatusPill tone="neutral">{t('settings.safe', 'Safe')}</StatusPill>
              </div>
              <SectionGrid className="settings-section-grid" ariaLabel="Notification settings">
                <div className="settings-field toggle-field">
                  <ToggleRow
                    label={t('settings.toast', 'Show notification toasts')}
                    detail={t('settings.toastDetail', 'History stays in memory for the current renderer session.')}
                    checked={appSettings.notificationToastsEnabled}
                    onChange={(value) => updateAppSettingsDraft({ notificationToastsEnabled: value })}
                  />
                </div>
              </SectionGrid>
            </section>
          </div>
        </>
      )}
    </section>
  );
}
