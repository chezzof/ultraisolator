import { useEffect, useState } from 'react';
import { CONFIG_PRESETS, DEFAULT_APP_SETTINGS } from '../constants/settings.js';
import { useI18n } from '../i18n.jsx';
import { loadAppSettings, saveAppSettings } from '../utils/appSettings.js';
import { requestJson } from '../utils/api.js';

export function FirstRunWizard() {
  const { t } = useI18n();
  const [settings, setSettings] = useState(null);
  const [busyPreset, setBusyPreset] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    loadAppSettings().then((loaded) => {
      if (!cancelled) {
        setSettings(loaded);
      }
    }).catch(() => {
      if (!cancelled) {
        setSettings(DEFAULT_APP_SETTINGS);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!settings || settings.firstRunCompleted) {
    return null;
  }

  const completeFirstRun = async (patch = {}) => {
    const saved = await saveAppSettings({ ...settings, ...patch, firstRunCompleted: true });
    setSettings(saved);
  };

  const applyPreset = async (preset) => {
    setBusyPreset(preset.id);
    setError('');
    try {
      const [defaultsPayload, configPayload] = await Promise.all([
        requestJson('/api/config/defaults'),
        requestJson('/api/config')
      ]);
      const config = {
        ...defaultsPayload.defaults,
        ...configPayload.config,
        ...preset.config
      };
      await requestJson('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config })
      });
      await completeFirstRun();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to apply preset');
    } finally {
      setBusyPreset(null);
    }
  };

  const presetLabel = (preset) => t(`settings.preset.${preset.id}.label`, preset.label);
  const presetDetail = (preset) => t(`settings.preset.${preset.id}.detail`, preset.detail);

  return (
    <div className="first-run-overlay" role="dialog" aria-modal="true" aria-labelledby="first-run-title">
      <div className="first-run-panel">
        <div className="first-run-kicker">{t('firstRun.kicker', 'First run')}</div>
        <h2 id="first-run-title">{t('firstRun.title', 'Choose a config preset')}</h2>
        <div className="first-run-grid">
          {CONFIG_PRESETS.map((preset) => (
            <button
              type="button"
              className="first-run-preset"
              key={preset.id}
              disabled={Boolean(busyPreset)}
              onClick={() => applyPreset(preset)}
            >
              <span>{presetLabel(preset)}</span>
              <small>{presetDetail(preset)}</small>
              <code>{preset.id}</code>
            </button>
          ))}
        </div>
        {error ? <div className="action-error">{error}</div> : null}
        <div className="first-run-actions">
          <button type="button" disabled={Boolean(busyPreset)} onClick={() => completeFirstRun()}>
            {t('firstRun.skip', 'Skip for now')}
          </button>
          {busyPreset ? <span>{t('firstRun.applying', 'Applying {{preset}}').replace('{{preset}}', busyPreset)}</span> : null}
        </div>
      </div>
    </div>
  );
}
