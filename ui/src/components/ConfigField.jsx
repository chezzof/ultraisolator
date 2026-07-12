import { FIELD_HINTS, POSITIVE_BOOLEAN_FIELDS } from '../constants/settings.js';
import { useI18n } from '../i18n.jsx';
import { fieldLabel } from '../utils/config.js';
import { ToggleRow } from './ToggleRow.jsx';

export function ConfigField({ field, spec, value, error, onChange }) {
  const { t } = useI18n();
  const label = t(`field.${field}`, fieldLabel(field));
  const hint = FIELD_HINTS[field] ? t(`hint.${field}`, FIELD_HINTS[field]) : '';
  const choiceLabel = (choice) => (
    field === 'anti_cheat_mode' ? t(`antiCheat.${choice}`, choice) : t(`choice.${field}.${choice}`, choice)
  );
  const fieldClassName = `settings-field field-${field}`;
  if (spec.type === 'bool') {
    const inverted = POSITIVE_BOOLEAN_FIELDS.has(field);
    return (
      <div className={`${fieldClassName} toggle-field`}>
        <ToggleRow
          label={label}
          detail={hint}
          checked={inverted ? !value : value}
          onChange={(checked) => onChange(inverted ? !checked : checked)}
        />
      </div>
    );
  }

  return (
    <label className={`${fieldClassName}${error ? ' invalid' : ''}`}>
      <span className="settings-field-label">{label}</span>
      {spec.type === 'string_list' ? (
        <textarea
          value={value}
          rows={field === 'games' ? 5 : 3}
          spellCheck="false"
          onChange={(event) => onChange(event.target.value)}
        />
      ) : spec.type === 'choice' ? (
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          {spec.choices.map((choice) => (
            <option key={choice} value={choice}>{choiceLabel(choice)}</option>
          ))}
        </select>
      ) : spec.type === 'int' || spec.type === 'float' ? (
        <input
          type="number"
          min={spec.min}
          step={spec.type === 'int' ? 1 : 'any'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          type="text"
          value={value}
          spellCheck="false"
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      <span className={error ? 'settings-field-error' : 'settings-field-hint'}>
        {error || hint || (spec.restart_required ? t('settings.restartAfterSave', 'Restart required after save.') : t('settings.hotReloadable', 'Hot reloadable.'))}
      </span>
    </label>
  );
}
