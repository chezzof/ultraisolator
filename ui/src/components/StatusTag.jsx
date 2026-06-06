import { Tag } from '@carbon/react';
import { useI18n } from '../i18n.jsx';

export function StatusTag({ status }) {
  const { t } = useI18n();
  const type = status?.game_mode ? 'cyan' : status?.running ? 'green' : 'gray';
  const label = status?.game_mode
    ? t('status.gameMode', 'Game mode')
    : status?.running
      ? t('status.engineRunning', 'Engine running')
      : t('status.engineIdle', 'Engine idle');
  return <Tag type={type}>{label}</Tag>;
}
