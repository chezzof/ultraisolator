import { Tag, Tile } from '@carbon/react';
import { PageHeading } from '../components/PageHeading.jsx';
import { StatusTag } from '../components/StatusTag.jsx';
import { useI18n } from '../i18n.jsx';

export function PlaceholderPage({ page, live }) {
  const { t } = useI18n();
  const status = live.snapshot?.status;

  return (
    <section className="page placeholder-page" aria-labelledby={`${page.id}-title`}>
      <PageHeading title={page.title} titleId={`${page.id}-title`}>
        <StatusTag status={status} />
        <Tag type={live.connectionState === 'connected' ? 'green' : 'gray'}>
          {t('connection.liveState', 'Live {{state}}').replace('{{state}}', t(`connection.${live.connectionState}`, live.connectionState))}
        </Tag>
      </PageHeading>

      <Tile className="module-surface">
        <div className="module-title">{page.label}</div>
        <div className="module-empty">{t('common.placeholder', 'Placeholder')}</div>
      </Tile>
    </section>
  );
}
