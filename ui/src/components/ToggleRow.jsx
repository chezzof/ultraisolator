import { useI18n } from '../i18n.jsx';

export function ToggleRow({ label, detail, checked, onChange }) {
  const { t } = useI18n();
  const enabled = Boolean(checked);

  return (
    <label className="toggle-row">
      <span>
        <span className="toggle-label">{label}</span>
        {detail ? <span className="toggle-detail">{detail}</span> : null}
      </span>
      <span className="toggle-control">
        <span className="toggle-state" aria-hidden="true">
          {enabled ? t('common.enabled', 'Enabled') : t('common.disabled', 'Disabled')}
        </span>
        <input
          type="checkbox"
          checked={enabled}
          aria-label={label}
          onChange={(event) => onChange(event.target.checked)}
        />
      </span>
    </label>
  );
}
