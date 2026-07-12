import { createContext, useContext, useEffect, useMemo } from 'react';
import { en } from './locales/en.mjs';
import { ru } from './locales/ru.mjs';
import { assertLocaleParity } from './locales/validate.mjs';
import { useAppSettings } from './state/AppSettingsContext.jsx';

export const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'ru', label: 'Русский' }
];

export const MESSAGES = assertLocaleParity({ en, ru });

const I18nContext = createContext({
  language: 'en',
  setLanguage: () => Promise.resolve(),
  t: (key, fallback = key) => fallback
});

function normalizeLanguage(language) {
  return language === 'ru' ? 'ru' : 'en';
}

function interpolate(message, params = {}) {
  return String(message).replace(/{{\s*([\w.-]+)\s*}}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
  ));
}

export function I18nProvider({ children }) {
  const { settings, updateSettings } = useAppSettings();
  const language = normalizeLanguage(settings.language);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo(() => ({
    language,
    setLanguage: (nextLanguage) => updateSettings({ language: normalizeLanguage(nextLanguage) }),
    t: (key, fallback = key, params = {}) => interpolate(
      MESSAGES[language]?.[key] ?? MESSAGES.en[key] ?? fallback,
      params
    )
  }), [language, updateSettings]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
