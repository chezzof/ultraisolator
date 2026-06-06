import { useI18n } from '../i18n.jsx';

export function PageHeading({ title, titleId, titleKey, children }) {
  const { t } = useI18n();
  return (
    <div className="page-heading">
      <div>
        <div className="section-label">{t('app.brand', 'Esports Isolator PRO')}</div>
        <h1 id={titleId}>{titleKey ? t(titleKey, title) : title}</h1>
      </div>
      <div className="status-row">
        {children}
      </div>
    </div>
  );
}
