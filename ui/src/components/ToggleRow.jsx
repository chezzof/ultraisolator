import { useI18n } from '../i18n.jsx';

export function ToggleRow({ label, detail, checked, onChange }) {
  const { t } = useI18n();
  const enabled = Boolean(checked);

  return (
    <label className="toggle-row">
      <span className="toggle-copy">
        <span className="toggle-label">{label}</span>
        {detail ? <span className="toggle-detail">{detail}</span> : null}
      </span>
      <span className="toggle-control">
        <span className="sr-only">
          {enabled ? t('common.enabled', 'Enabled') : t('common.disabled', 'Disabled')}
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={enabled}
          aria-label={t('toggle.ariaLabel', '{{label}}: {{state}}', {
            label,
            state: enabled ? t('common.enabled', 'Enabled') : t('common.disabled', 'Disabled')
          })}
          onChange={(event) => onChange(event.target.checked)}
        />
      </span>
    </label>
  );
}
