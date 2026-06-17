import { useI18n } from '../i18n.jsx';
import { PageHeader } from './layout/PageHeader.jsx';

export function PageHeading({ title, titleId, titleKey, children }) {
  const { t } = useI18n();
  return (
    <PageHeader
      kicker={t('app.brand', 'Esports Isolator PRO')}
      title={titleKey ? t(titleKey, title) : title}
      titleId={titleId}
      className="page-heading"
    >
      <div className="status-row">{children}</div>
    </PageHeader>
  );
}
