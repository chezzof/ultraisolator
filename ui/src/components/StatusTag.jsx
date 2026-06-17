import { useI18n } from '../i18n.jsx';
import { StatusPill } from './status/StatusPill.jsx';

export function StatusTag({ status }) {
  const { t } = useI18n();
  const tone = status?.game_mode ? 'connected' : status?.running ? 'success' : 'inactive';
  const label = status?.game_mode
    ? t('status.gameMode', 'Game mode')
    : status?.running
      ? t('status.engineRunning', 'Engine running')
      : t('status.engineIdle', 'Engine idle');
  return <StatusPill tone={tone}>{label}</StatusPill>;
}
