import { useEffect, useState } from 'react';
import { Tag, Tile } from '@carbon/react';
import { ConfigField } from '../components/ConfigField.jsx';
import { PageHeading } from '../components/PageHeading.jsx';
import { StatusTag } from '../components/StatusTag.jsx';
import { ToggleRow } from '../components/ToggleRow.jsx';
import { CONFIG_PRESETS, CONFIG_SECTIONS, DEFAULT_APP_SETTINGS } from '../constants/settings.js';
import { LANGUAGES, useI18n } from '../i18n.jsx';
import { requestJson } from '../utils/api.js';
import { loadAppSettings, saveAppSettings } from '../utils/appSettings.js';
import { EMPTY_APP_PROFILE, toEditableConfig, validateConfigDraft } from '../utils/config.js';

function displayConfigPath(configPath) {
  if (!configPath) {
    return 'config.json';
  }
  const parts = String(configPath).split(/[\\/]/).filter(Boolean);
  return parts.at(-1) || 'config.json';
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

  const allSections = schema ? CONFIG_SECTIONS.map((section) => ({
    ...section,
    fields: section.fields.filter((field) => schema[field])
  })) : [];

  return (
    <section className="page settings-page" aria-labelledby="settings-title">
      <PageHeading title="Settings" titleKey="nav.settings" titleId="settings-title">
        <StatusTag status={status} />
        <Tag type={settingsState.restartRequired ? 'yellow' : 'gray'}>
          {settingsState.restartRequired ? t('settings.restartRequired', 'Restart required') : t('settings.configEditor', 'Config editor')}
        </Tag>
      </PageHeading>

      <div className="settings-toolbar">
        <div className="settings-path" title={settingsState.configPath || 'config.json'}>
          {displayConfigPath(settingsState.configPath)}
        </div>
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

      {settingsState.error ? <div className="action-error">{settingsState.error}</div> : null}
      {settingsState.message ? <div className="settings-message">{settingsState.message}</div> : null}

      {settingsState.loading || !draft || !schema ? (
        <Tile className="module-surface">
          <div className="module-title">{t('nav.settings', 'Settings')}</div>
          <div className="module-empty">{t('settings.loading', 'Loading config')}</div>
        </Tile>
      ) : (
        <div className="settings-grid">
          {allSections.map((section) => (
            <Tile className="settings-section" key={section.title}>
              <div className="module-title">{t(`settings.section.${section.title}`, section.title)}</div>
              <div className="settings-section-grid">
                {section.fields.map((field) => (
                  <ConfigField
                    key={field}
                    field={field}
                    spec={schema[field]}
                    value={draft[field]}
                    error={fieldErrors[field]}
                    onChange={(value) => updateDraftField(field, value)}
                  />
                ))}
              </div>
            </Tile>
          ))}

          <Tile className="settings-section presets-section">
            <div className="module-title">{t('settings.presets', 'Config Presets')}</div>
            <div className="preset-button-grid">
              {CONFIG_PRESETS.map((preset) => (
                <button type="button" key={preset.id} onClick={() => applyPresetToDraft(preset)}>
                  <span>{presetLabel(preset)}</span>
                  <small>{presetDetail(preset)}</small>
                </button>
              ))}
            </div>
          </Tile>

          {schema.app_profiles ? (
            <Tile className="settings-section profiles-editor">
              <div className="profiles-header">
                <div>
                  <div className="module-title">{t('settings.profiles', 'Per-App Profiles')}</div>
                  <div className="profiles-subtitle">{t('settings.profilesDetail', 'Manual overrides by executable name. Protected system and anti-cheat processes stay guarded.')}</div>
                </div>
                <button type="button" onClick={addProfile}>{t('settings.addProfile', 'Add profile')}</button>
              </div>
              {(draft.app_profiles || []).length === 0 ? (
                <div className="module-empty">{t('settings.noProfiles', 'No profiles configured')}</div>
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
            </Tile>
          ) : null}

          <Tile className="settings-section app-settings-section">
            <div className="module-title">{t('settings.application', 'Application')}</div>
            <div className="settings-section-grid">
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
            </div>
          </Tile>

          <Tile className="settings-section notifications-settings-section">
            <div className="module-title">{t('settings.notifications', 'Notifications')}</div>
            <div className="settings-section-grid">
              <div className="settings-field toggle-field">
                <ToggleRow
                  label={t('settings.toast', 'Show notification toasts')}
                  detail={t('settings.toastDetail', 'History stays in memory for the current renderer session.')}
                  checked={appSettings.notificationToastsEnabled}
                  onChange={(value) => updateAppSettingsDraft({ notificationToastsEnabled: value })}
                />
              </div>
            </div>
          </Tile>
        </div>
      )}
    </section>
  );
}
