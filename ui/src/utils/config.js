import { FIELD_LABELS } from '../constants/settings.js';

export const EMPTY_APP_PROFILE = {
  exe: '',
  enabled: true,
  treat_as_game: false,
  never_jail: false,
  always_jail: false,
  priority_class: ''
};

export function fieldLabel(field) {
  return FIELD_LABELS[field] || field;
}

export function parseListValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value || '')
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function toEditableConfig(config = {}, schema = {}) {
  const draft = {};
  for (const field of Object.keys(schema)) {
    const value = config[field];
    if (schema[field].type === 'app_profiles') {
      draft[field] = Array.isArray(value) ? value.map((profile) => ({ ...EMPTY_APP_PROFILE, ...profile })) : [];
    } else {
      draft[field] = Array.isArray(value) ? value.join('\n') : value ?? '';
    }
  }
  return draft;
}

export function validateAppProfilesDraft(value, spec = {}) {
  const profiles = [];
  const errors = {};
  const seen = new Set();
  const priorityChoices = spec.priority_choices || [];
  if (!Array.isArray(value)) {
    errors.app_profiles = 'Per-app profiles must be a list.';
    return { profiles, errors };
  }

  value.forEach((item, index) => {
    const profile = { ...EMPTY_APP_PROFILE, ...(item || {}) };
    const exe = String(profile.exe || '').trim().toLowerCase();
    if (!exe) {
      errors[`app_profiles[${index}].exe`] = 'Profile executable is required.';
    } else if (seen.has(exe)) {
      errors[`app_profiles[${index}].exe`] = `Duplicate profile executable: ${exe}.`;
    }
    seen.add(exe);

    const priority = String(profile.priority_class || '').trim().toLowerCase();
    if (priority && !priorityChoices.includes(priority)) {
      errors[`app_profiles[${index}].priority_class`] = `Priority must be one of: ${priorityChoices.join(', ')}.`;
    }
    if (profile.never_jail && profile.always_jail) {
      errors[`app_profiles[${index}]`] = 'Choose never jail or always jail, not both.';
    }

    profiles.push({
      exe,
      enabled: Boolean(profile.enabled),
      treat_as_game: Boolean(profile.treat_as_game),
      never_jail: Boolean(profile.never_jail),
      always_jail: Boolean(profile.always_jail),
      priority_class: priority
    });
  });

  return { profiles, errors };
}

export function validateConfigDraft(draft, schema) {
  const config = {};
  const errors = {};
  for (const [field, spec] of Object.entries(schema || {})) {
    const value = draft[field];
    if (spec.type === 'bool') {
      config[field] = Boolean(value);
      continue;
    }
    if (spec.type === 'string_list') {
      config[field] = parseListValue(value);
      continue;
    }
    if (spec.type === 'app_profiles') {
      const validation = validateAppProfilesDraft(value, spec);
      config[field] = validation.profiles;
      Object.assign(errors, validation.errors);
      continue;
    }
    if (spec.type === 'string') {
      config[field] = String(value || '');
      continue;
    }
    if (spec.type === 'choice') {
      const selected = String(value || '').trim().toLowerCase();
      if (!spec.choices.includes(selected)) {
        errors[field] = `${fieldLabel(field)} must be one of: ${spec.choices.join(', ')}.`;
      } else {
        config[field] = selected;
      }
      continue;
    }
    if (spec.type === 'int' || spec.type === 'float') {
      const text = String(value).trim();
      if (!text) {
        errors[field] = `${fieldLabel(field)} is required.`;
        continue;
      }
      const numeric = Number(text);
      if (!Number.isFinite(numeric)) {
        errors[field] = `${fieldLabel(field)} must be a number.`;
        continue;
      }
      if (spec.type === 'int' && !Number.isInteger(numeric)) {
        errors[field] = `${fieldLabel(field)} must be an integer.`;
        continue;
      }
      if (typeof spec.min === 'number' && numeric < spec.min) {
        errors[field] = `${fieldLabel(field)} must be >= ${spec.min}.`;
        continue;
      }
      config[field] = numeric;
    }
  }
  return { config, errors };
}
