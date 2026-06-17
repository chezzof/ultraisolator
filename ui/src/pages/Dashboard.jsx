import { useState } from 'react';
import PlayIcon from '@carbon/icons-react/es/PlayFilledAlt.js';
import StopIcon from '@carbon/icons-react/es/StopFilledAlt.js';
import RestoreIcon from '@carbon/icons-react/es/Renew.js';
import { ActionPanel } from '../components/cards/ActionPanel.jsx';
import { KpiCell } from '../components/KpiCell.jsx';
import { SectionGrid } from '../components/layout/SectionGrid.jsx';
import { PageHeading } from '../components/PageHeading.jsx';
import { ProcessTable } from '../components/ProcessTable.jsx';
import { ReadinessChecklist } from '../components/ReadinessChecklist.jsx';
import { StatusTag } from '../components/StatusTag.jsx';
import { SystemAnalysis } from '../components/SystemAnalysis.jsx';
import { StatusPill } from '../components/status/StatusPill.jsx';
import { EmptyState } from '../components/states/EmptyState.jsx';
import { ErrorState } from '../components/states/ErrorState.jsx';
import { formatPartitions, formatTimerResolution } from '../utils/format.js';
import { postLifecycleAction } from '../utils/lifecycle.js';
import { useI18n } from '../i18n.jsx';

function formatProcessMode(mode, t) {
  return mode ? t(`process.mode.${mode}`, mode) : t('dashboard.waitingSnapshot', 'waiting for live snapshot');
}

function formatAntiCheatMode(mode, t) {
  return mode ? t(`antiCheat.${mode}`, mode) : t('common.na', 'N/A');
}

function connectionTone(connectionState) {
  if (connectionState === 'connected') {
    return 'connected';
  }
  if (connectionState === 'error') {
    return 'danger';
  }
  if (connectionState === 'paused') {
    return 'warning';
  }
  return 'inactive';
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
  const hasActiveGame = activeGamePids.length > 0;
  const backendUnavailable = live.connectionState === 'error';
  const heroDetail = gameMode && hasActiveGame
    ? `${t('dashboard.activePids', 'Active PIDs')} ${activeGamePids.join(', ')}`
    : isRunning
      ? t('dashboard.waitingForGame', 'Engine is running and waiting for a supported game.')
      : t('dashboard.startPrompt', 'Start the engine when you are ready to monitor and isolate a game session.');
  const primaryAction = isRunning ? 'stop' : 'start';
  const primaryActionLabel = isRunning ? t('common.stop', 'Stop') : t('common.start', 'Start');
  const primaryActionIcon = isRunning ? <StopIcon size={16} /> : <PlayIcon size={16} />;
  const primaryActionDisabled = Boolean(actionState.pending) || (primaryAction === 'start' && isRunning) || (primaryAction === 'stop' && !isRunning);
  const actionReason = actionState.pending
    ? t('dashboard.actionPending', 'Waiting for the current lifecycle action to finish.')
    : isRunning
      ? t('dashboard.stopReason', 'Stop returns the engine to idle after the current session.')
      : t('dashboard.startReason', 'Start enables monitoring, readiness checks, and game detection.');
  const restoreDisabledReason = isRunning
    ? t('dashboard.restoreDisabledRunning', 'Restore is available after the engine is stopped.')
    : t('dashboard.restoreReason', 'Restore re-applies safety cleanup if a previous run ended unexpectedly.');

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
        <StatusPill tone={connectionTone(live.connectionState)} showDot>
          {t(`connection.${live.connectionState}`, live.connectionState)}
        </StatusPill>
      </PageHeading>

      <div className={`dashboard-command-center dashboard-hero${gameMode ? ' game-mode' : ''}`} aria-label="Dashboard command center">
        <div className="dashboard-hero-main">
          <div className="dashboard-hero-kicker">{t('dashboard.currentState', 'Current state')}</div>
          <h2>{modeValue}</h2>
          <p>{heroDetail}</p>
          <div className="dashboard-hero-pills" aria-label="Dashboard state indicators">
            <StatusPill tone={connectionTone(live.connectionState)} showDot>
              {t(`connection.${live.connectionState}`, live.connectionState)}
            </StatusPill>
            <StatusPill tone={status.admin ? 'success' : 'warning'}>
              {status.admin ? t('dashboard.adminReady', 'Admin ready') : t('dashboard.adminLimited', 'Admin limited')}
            </StatusPill>
            <StatusPill tone={gameMode ? 'success' : isRunning ? 'warning' : 'inactive'}>
              {gameMode ? t('status.gameMode', 'Game mode') : (isRunning ? t('status.engineRunning', 'Engine running') : t('status.engineIdle', 'Engine idle'))}
            </StatusPill>
            <StatusPill tone={status.anti_cheat_mode ? 'warning' : 'inactive'}>
              {antiCheatMode}
            </StatusPill>
          </div>
        </div>

        <ActionPanel
          className="dashboard-action-panel"
          title={isRunning ? t('dashboard.sessionControls', 'Session controls') : t('dashboard.readyToStart', 'Ready to start')}
          detail={actionReason}
          actions={(
            <div className="dashboard-action-stack">
              <div className="dashboard-action-buttons quick-actions" aria-label="Quick actions">
                <button type="button" className="dashboard-primary-action" onClick={() => runAction(primaryAction)} disabled={primaryActionDisabled}>
                  {primaryActionIcon}
                  {primaryActionLabel}
                </button>
                {primaryAction !== 'start' ? (
                  <button type="button" onClick={() => runAction('start')} disabled={Boolean(actionState.pending) || isRunning}>
                    <PlayIcon size={16} />
                    {t('common.start', 'Start')}
                  </button>
                ) : null}
                {primaryAction !== 'stop' ? (
                  <button type="button" onClick={() => runAction('stop')} disabled={Boolean(actionState.pending) || !isRunning}>
                    <StopIcon size={16} />
                    {t('common.stop', 'Stop')}
                  </button>
                ) : null}
                <button type="button" onClick={() => runAction('recover')} disabled={Boolean(actionState.pending) || isRunning}>
                  <RestoreIcon size={16} />
                  {t('common.restore', 'Restore')}
                </button>
              </div>
              <div className="dashboard-action-reason">{restoreDisabledReason}</div>
            </div>
          )}
        />
      </div>

      {backendUnavailable ? (
        <ErrorState
          className="dashboard-backend-error"
          title={t('dashboard.backendUnavailable', 'Backend unavailable')}
          detail={live.error || t('dashboard.backendUnavailableDetail', 'Live telemetry is not connected. The dashboard will update when Electron main reconnects.')}
        />
      ) : null}

      {!hasActiveGame ? (
        <EmptyState
          className="dashboard-empty-state"
          title={t('dashboard.noGame', 'No active game detected')}
          detail={isRunning ? t('dashboard.noGameRunningDetail', 'Keep the engine running and launch a configured game to activate optimization.') : t('dashboard.noGameIdleDetail', 'Start the engine before launching a supported game to monitor readiness and safety state.')}
        />
      ) : null}

      {actionState.error ? <div className="action-error">{actionState.error}</div> : null}

      <div className="dashboard-metric-groups" aria-label="Dashboard grouped metrics">
        <section className="dashboard-metric-group" aria-labelledby="dashboard-session-state">
          <h2 id="dashboard-session-state">{t('dashboard.sessionState', 'Session state')}</h2>
          <SectionGrid className="dashboard-kpi-grid" ariaLabel="Session state metrics">
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
          </SectionGrid>
        </section>

        <section className="dashboard-metric-group" aria-labelledby="dashboard-system-readiness">
          <h2 id="dashboard-system-readiness">{t('dashboard.systemReadiness', 'System readiness')}</h2>
          <SectionGrid className="dashboard-kpi-grid" ariaLabel="System readiness metrics">
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
          </SectionGrid>
        </section>

        <section className="dashboard-metric-group" aria-labelledby="dashboard-optimization-impact">
          <h2 id="dashboard-optimization-impact">{t('dashboard.optimizationImpact', 'Optimization impact')}</h2>
          <SectionGrid className="dashboard-kpi-grid" ariaLabel="Optimization impact metrics">
            <KpiCell
              label={t('dashboard.cpuPartitions', 'CPU Partitions')}
              value={partitions}
              detail={status.topology_available ? t('dashboard.topologyAvailable', 'topology map available') : t('dashboard.topologyStart', 'Start engine to populate topology')}
            />
          </SectionGrid>
        </section>

        <section className="dashboard-metric-group" aria-labelledby="dashboard-recovery-safety">
          <h2 id="dashboard-recovery-safety">{t('dashboard.recoverySafety', 'Recovery/safety')}</h2>
          <SectionGrid className="dashboard-kpi-grid" ariaLabel="Recovery and safety metrics">
            <KpiCell
              label={t('dashboard.capabilityNotes', 'Capability Notes')}
              value={capabilityNotes.length ? capabilityNotes.length : 'OK'}
              detail={capabilityNotes[0] || t('dashboard.fullFeatures', 'Full feature set is available')}
              tone={capabilityNotes.length ? 'warning' : 'positive'}
            />
          </SectionGrid>
        </section>
      </div>

      <div className="dashboard-insights dashboard-secondary-grid">
        <section className="dashboard-optimization-section" aria-labelledby="dashboard-analysis-title">
          <h2 id="dashboard-analysis-title" className="dashboard-section-heading">{t('dashboard.optimizationAnalysis', 'Optimization analysis')}</h2>
          <SystemAnalysis live={live} />
        </section>
        <section className="dashboard-readiness-section" aria-labelledby="dashboard-readiness-title">
          <h2 id="dashboard-readiness-title" className="dashboard-section-heading">{t('dashboard.readinessWarnings', 'Readiness warnings and errors')}</h2>
          <ReadinessChecklist live={live} />
        </section>
      </div>

      <section className="dashboard-diagnostics-section" aria-labelledby="dashboard-processes-title">
        <h2 id="dashboard-processes-title" className="dashboard-section-heading">{t('dashboard.recentActivity', 'Recent activity and diagnostics')}</h2>
        <ProcessTable snapshot={snapshot} />
      </section>
    </section>
  );
}
