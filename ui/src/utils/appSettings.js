import { APP_SETTINGS_STORAGE_KEY, DEFAULT_APP_SETTINGS } from '../constants/settings.js';

export function normalizeAppSettings(settings = {}) {
  const language = settings.language === 'ru' ? 'ru' : 'en';
  return {
    language,
    launchAtWindowsStartup: Boolean(settings.launchAtWindowsStartup),
    minimizeToTrayOnStart: Boolean(settings.minimizeToTrayOnStart),
    startIsolatorAutomatically: Boolean(settings.startIsolatorAutomatically),
    notificationToastsEnabled: settings.notificationToastsEnabled !== false,
    firstRunCompleted: Boolean(settings.firstRunCompleted)
  };
}

export function loadLocalAppSettings() {
  try {
    const raw = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
    return normalizeAppSettings({ ...DEFAULT_APP_SETTINGS, ...JSON.parse(raw || '{}') });
  } catch (_error) {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

export async function loadAppSettings() {
  if (window.isolator?.getAppSettings) {
    return normalizeAppSettings(await window.isolator.getAppSettings());
  }
  return loadLocalAppSettings();
}

export async function saveAppSettings(settings) {
  const normalized = normalizeAppSettings(settings);
  if (window.isolator?.updateAppSettings) {
    const saved = normalizeAppSettings(await window.isolator.updateAppSettings(normalized));
    window.dispatchEvent(new CustomEvent('app-settings-updated', { detail: saved }));
    return saved;
  }
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent('app-settings-updated', { detail: normalized }));
  return normalized;
}
