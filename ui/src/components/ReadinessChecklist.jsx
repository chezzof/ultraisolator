import { useCallback, useEffect, useMemo, useState } from 'react';
import { Tag, Tile } from '@carbon/react';
import { requestJson } from '../utils/api.js';
import { useI18n } from '../i18n.jsx';

const CORE_CHECK_ORDER = ['Power plan', 'Timer resolution', 'Background jailing', 'IFEO priority'];

function checkTone(status) {
  if (status === 'ok') {
    return 'green';
  }
  if (status === 'error') {
    return 'red';
  }
  return 'yellow';
}

function checkOrder(label) {
  const index = CORE_CHECK_ORDER.indexOf(label);
  return index === -1 ? CORE_CHECK_ORDER.length : index;
}

function statusLabel(status, t) {
  return t(`checkStatus.${status}`, status);
}

function checkLabel(check, t) {
  return t(`readiness.check.${check.id}.label`, check.label);
}

function checkDetail(check, t) {
  return t(`readiness.check.${check.id}.${check.status}`, check.detail);
}

export function ReadinessChecklist({ live }) {
  const { t } = useI18n();
  const gameMode = Boolean(live.snapshot?.status?.game_mode);
  const hiddenWindow = !live.visible && !gameMode;
  const [payload, setPayload] = useState(null);
  const [state, setState] = useState({
    loading: true,
    refreshing: false,
    error: null
  });

  const loadReadiness = useCallback(async (refresh = false) => {
    if (!live.visible || gameMode) {
      setPayload(null);
      setState((current) => ({ ...current, loading: false, refreshing: false }));
      return;
    }
    setState((current) => ({
      ...current,
      loading: !payload && !refresh,
      refreshing: Boolean(refresh),
      error: null
    }));
    try {
      const nextPayload = await requestJson(`/api/readiness${refresh ? '?refresh=1' : ''}`);
      setPayload(nextPayload);
      setState({ loading: false, refreshing: false, error: null });
    } catch (error) {
      setState({
        loading: false,
        refreshing: false,
        error: error instanceof Error ? error.message : t('readiness.loadError', 'Unable to load readiness')
      });
    }
  }, [gameMode, live.visible, payload, t]);

  useEffect(() => {
    loadReadiness(false);
  }, [gameMode, live.visible]);

  const checks = Array.isArray(payload?.checks) ? payload.checks : [];
  const summary = payload?.summary || {};
  const topChecks = useMemo(() => [...checks].sort((left, right) => (
    checkOrder(left.label) - checkOrder(right.label)
  )).slice(0, 8), [checks]);

  return (
    <Tile className="module-surface readiness-panel">
      <div className="analysis-header">
        <div>
          <div className="module-title">{t('readiness.title', 'Game Readiness')}</div>
          <div className="analysis-subtitle">
            {payload?.available
              ? t('readiness.readyCount', '{{ok}}/{{total}} checks ready').replace('{{ok}}', summary.ok || 0).replace('{{total}}', summary.total || 0)
              : (hiddenWindow ? t('readiness.pausedHidden', 'Readiness checks paused while the window is hidden') : t('readiness.pausedGame', 'Readiness checks paused during game mode'))}
          </div>
        </div>
        <div className="analysis-actions">
          <button type="button" onClick={() => loadReadiness(true)} disabled={gameMode || state.loading || state.refreshing}>
            {state.refreshing ? t('common.refreshing', 'Refreshing') : t('common.refresh', 'Refresh')}
          </button>
        </div>
      </div>

      {gameMode ? <div className="settings-message">{t('readiness.pausedGame', 'Readiness checks paused during game mode')}</div> : null}
      {hiddenWindow ? <div className="settings-message">{t('readiness.pausedHidden', 'Readiness checks paused while the window is hidden')}</div> : null}
      {state.error ? <div className="action-error">{state.error}</div> : null}

      <div className="readiness-summary">
        <div>
          <span>{t('checkStatus.ok', 'OK')}</span>
          <strong>{summary.ok ?? 0}</strong>
        </div>
        <div>
          <span>{t('analysis.warnings', 'Warnings')}</span>
          <strong>{summary.warning ?? 0}</strong>
        </div>
        <div>
          <span>{t('readiness.errors', 'Errors')}</span>
          <strong>{summary.error ?? 0}</strong>
        </div>
        <div>
          <span>{t('readiness.cache', 'Cache')}</span>
          <strong>{payload?.cache?.hit ? t('readiness.cacheHit', 'HIT') : t('readiness.cacheFresh', 'FRESH')}</strong>
        </div>
      </div>

      <div className="readiness-check-list" aria-label="Game readiness checklist">
        {topChecks.length ? topChecks.map((check) => (
          <article key={check.id} className={`readiness-check ${check.status}`}>
            <div className="readiness-check-top">
              <strong>{checkLabel(check, t)}</strong>
              <Tag type={checkTone(check.status)}>{statusLabel(check.status, t)}</Tag>
            </div>
            <div className="readiness-check-detail">{checkDetail(check, t)}</div>
          </article>
        )) : (
          <div className="module-empty">{state.loading ? t('readiness.loading', 'Loading readiness') : t('readiness.empty', 'No readiness checks available')}</div>
        )}
      </div>
    </Tile>
  );
}
