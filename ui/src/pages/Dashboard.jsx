import { useState } from 'react';
import { Tag } from '@carbon/react';
import PlayIcon from '@carbon/icons-react/es/PlayFilledAlt.js';
import StopIcon from '@carbon/icons-react/es/StopFilledAlt.js';
import RestoreIcon from '@carbon/icons-react/es/Renew.js';
import { KpiCell } from '../components/KpiCell.jsx';
import { PageHeading } from '../components/PageHeading.jsx';
import { ProcessTable } from '../components/ProcessTable.jsx';
import { ReadinessChecklist } from '../components/ReadinessChecklist.jsx';
import { StatusTag } from '../components/StatusTag.jsx';
import { SystemAnalysis } from '../components/SystemAnalysis.jsx';
import { formatPartitions, formatTimerResolution } from '../utils/format.js';
import { postLifecycleAction } from '../utils/lifecycle.js';
import { useI18n } from '../i18n.jsx';

function formatProcessMode(mode, t) {
  return mode ? t(`process.mode.${mode}`, mode) : t('dashboard.waitingSnapshot', 'waiting for live snapshot');
}

function formatAntiCheatMode(mode, t) {
  return mode ? t(`antiCheat.${mode}`, mode) : t('common.na', 'N/A');
}

export function DashboardPage({ live }) {
  const { t } = useI18n();
  const [actionState, setActionState] = useState({ pending: null, error: null, lastAction: null });
  const snapshot = live.snapshot;
  const status = snapshot?.status || {};
  const processCount = snapshot?.process_count ?? status.tracked_process_count ?? 0;
  const activeGamePids = Array.isArray(status.active_game_pids) ? status.active_game_pids : [];
  const capabilityNotes = Array.isArray(status.capability_notes) ? status.capability_notes : [];
  const isRunning = Boolean(status.running);
  const gameMode = Boolean(status.game_mode);
  const partitions = formatPartitions(status.cpu_partitions);
  const modeValue = gameMode
    ? t('status.gameMode', 'Game mode')
    : isRunning
      ? t('status.engineRunning', 'Engine running')
      : t('status.engineIdle', 'Engine idle');
  const timerValue = status.timer_resolution_applied
    ? formatTimerResolution(status.timer_resolution_applied)
    : t('dashboard.notApplied', 'Not applied');
  const antiCheatMode = status.anti_cheat_mode ? formatAntiCheatMode(status.anti_cheat_mode, t) : (isRunning ? t('common.na', 'N/A') : t('dashboard.engineStopped', 'Engine stopped'));

  const runAction = async (action) => {
    setActionState({ pending: action, error: null, lastAction: null });
    try {
      await postLifecycleAction(action);
      setActionState({ pending: null, error: null, lastAction: action });
    } catch (error) {
      setActionState({
        pending: null,
        error: error instanceof Error ? error.message : t('dashboard.actionFailed', '{{action}} failed').replace('{{action}}', action),
        lastAction: action
      });
    }
  };

  return (
    <section className="page dashboard-page" aria-labelledby="dashboard-title">
      <PageHeading title="Dashboard" titleKey="nav.dashboard" titleId="dashboard-title">
        <StatusTag status={status} />
        <Tag type={live.connectionState === 'connected' ? 'green' : 'gray'}>
          {t(`connection.${live.connectionState}`, live.connectionState)}
        </Tag>
      </PageHeading>

      <div className={`dashboard-status-panel${gameMode ? ' game-mode' : ''}`}>
        <div className="mode-readout">
          <div className="kpi-label">{t('dashboard.gameMode', 'Game Mode')}</div>
          <div className="mode-value">{modeValue}</div>
          <div className="mode-detail">
            {activeGamePids.length ? `${t('dashboard.activePids', 'Active PIDs')} ${activeGamePids.join(', ')}` : t('dashboard.noGame', 'No active game detected')}
          </div>
        </div>

        <div className="capability-grid" aria-label="Capability status">
          <div>
            <span>{t('dashboard.admin', 'Admin')}</span>
            <strong>{status.admin ? t('dashboard.yes', 'Yes') : t('dashboard.no', 'No')}</strong>
          </div>
          <div>
            <span>{t('dashboard.antiCheat', 'Anti-cheat')}</span>
            <strong>{antiCheatMode}</strong>
          </div>
          <div>
            <span>{t('dashboard.powerPlan', 'Power Plan')}</span>
            <strong>{status.power_plan_active ? t('dashboard.active', 'Active') : t('dashboard.idle', 'Idle')}</strong>
          </div>
          <div>
            <span>{t('dashboard.timer', 'Timer')}</span>
            <strong>{timerValue}</strong>
          </div>
        </div>

        <div className="quick-actions" aria-label="Quick actions">
          <button type="button" onClick={() => runAction('start')} disabled={Boolean(actionState.pending) || isRunning}>
            <PlayIcon size={16} />
            {t('common.start', 'Start')}
          </button>
          <button type="button" onClick={() => runAction('stop')} disabled={Boolean(actionState.pending) || !isRunning}>
            <StopIcon size={16} />
            {t('common.stop', 'Stop')}
          </button>
          <button type="button" onClick={() => runAction('recover')} disabled={Boolean(actionState.pending) || isRunning}>
            <RestoreIcon size={16} />
            {t('common.restore', 'Restore')}
          </button>
        </div>
      </div>

      {actionState.error ? <div className="action-error">{actionState.error}</div> : null}

      <div className="kpi-strip dashboard-kpi-grid" aria-label="Dashboard KPI status">
        <KpiCell
          label={t('dashboard.trackedProcesses', 'Tracked Processes')}
          value={processCount}
          detail={formatProcessMode(snapshot?.process_mode, t)}
          highlight
        />
        <KpiCell
          label={t('dashboard.jailedBackground', 'Jailed Background')}
          value={status.jailed_process_count ?? 0}
          detail={status.background_jailing ? t('dashboard.backgroundJailingEnabled', 'background jailing enabled') : t('dashboard.backgroundJailingDisabled', 'background jailing disabled')}
        />
        <KpiCell
          label={t('dashboard.powerPlan', 'Power Plan')}
          value={status.power_plan_active ? t('dashboard.active', 'ACTIVE') : t('dashboard.idle', 'IDLE')}
          detail={status.power_scheme_in_use || t('dashboard.engineStopped', 'Engine stopped')}
          tone={status.power_plan_active ? 'positive' : 'default'}
        />
        <KpiCell
          label={t('dashboard.timer', 'Timer')}
          value={timerValue}
          detail={t('dashboard.timerDetail', 'system timer resolution')}
          tone={status.timer_resolution_applied ? 'positive' : 'default'}
        />
        <KpiCell
          label={t('dashboard.cpuPartitions', 'CPU Partitions')}
          value={partitions}
          detail={status.topology_available ? t('dashboard.topologyAvailable', 'topology map available') : t('dashboard.topologyStart', 'Start engine to populate topology')}
        />
        <KpiCell
          label={t('dashboard.capabilityNotes', 'Capability Notes')}
          value={capabilityNotes.length ? capabilityNotes.length : 'OK'}
          detail={capabilityNotes[0] || t('dashboard.fullFeatures', 'Full feature set is available')}
          tone={capabilityNotes.length ? 'warning' : 'positive'}
        />
      </div>

      <div className="dashboard-insights">
        <SystemAnalysis live={live} />
        <ReadinessChecklist live={live} />
      </div>

      <ProcessTable snapshot={snapshot} />
    </section>
  );
}
