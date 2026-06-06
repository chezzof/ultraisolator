import { FIELD_HINTS } from '../constants/settings.js';
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
  if (spec.type === 'bool') {
    return (
      <div className="settings-field toggle-field">
        <ToggleRow label={label} detail={hint} checked={value} onChange={onChange} />
      </div>
    );
  }

  return (
    <label className={`settings-field${error ? ' invalid' : ''}`}>
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
