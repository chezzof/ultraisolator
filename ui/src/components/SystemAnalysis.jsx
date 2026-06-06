import { useEffect, useState } from 'react';
import { Tag, Tile } from '@carbon/react';
import { requestJson } from '../utils/api.js';
import { useI18n } from '../i18n.jsx';

function formatBottleneck(payload, t) {
  if (!payload) {
    return t('analysis.notEstimated', 'Not estimated');
  }
  return payload.detail || payload.label || t('analysis.notEstimated', 'Not estimated');
}

function checkTone(status) {
  if (status === 'ok') {
    return 'green';
  }
  if (status === 'error') {
    return 'red';
  }
  if (status === 'warning') {
    return 'yellow';
  }
  return 'gray';
}

function statusLabel(status, t) {
  return t(`checkStatus.${status}`, status);
}

function categoryLabel(category, t) {
  return t(`analysis.category.${category}`, category);
}

function checkLabel(check, t) {
  return t(`analysis.check.${check.id}.label`, check.label);
}

function checkDetail(check, t) {
  return t(`analysis.check.${check.id}.${check.status}`, check.detail);
}

export function SystemAnalysis({ live }) {
  const { t } = useI18n();
  const status = live.snapshot?.status || {};
  const gameMode = Boolean(status.game_mode);
  const hiddenWindow = !live.visible && !gameMode;
  const [analysis, setAnalysis] = useState(null);
  const [analysisState, setAnalysisState] = useState({
    loading: true,
    refreshing: false,
    error: null
  });

  const loadAnalysis = async (background = false) => {
    if (!live.visible || gameMode) {
      const summary = gameMode
        ? t('analysis.pausedGame', 'Analysis paused during game mode.')
        : t('analysis.pausedHidden', 'Analysis paused while the window is hidden.');
      setAnalysis({
        ok: true,
        available: false,
        mode: 'analysis',
        reason: gameMode ? 'paused_in_game_mode' : 'paused_window_hidden',
        score: null,
        grade: 'paused',
        summary,
        categories: [],
        boost_potential: { label: 'none', points: 0 },
        bottleneck: {
          available: false,
          label: 'Not estimated',
          reason: 'gpu_metrics_not_collected',
          detail: 'GPU and RAM telemetry are not collected in this MVP.'
        },
        checks: [],
        analysis_calls: {
          status_reads: 1,
          topology_refreshes: 0,
          config_reads: 0
        }
      });
      setAnalysisState((current) => ({
        ...current,
        loading: false,
        refreshing: false
      }));
      return;
    }
    setAnalysisState((current) => ({
      ...current,
      loading: !analysis && !background,
      refreshing: Boolean(background || analysis),
      error: null
    }));
    try {
      const payload = await requestJson('/api/analysis');
      setAnalysis(payload);
      setAnalysisState({ loading: false, refreshing: false, error: null });
    } catch (error) {
      setAnalysisState({
        loading: false,
        refreshing: false,
        error: error instanceof Error ? error.message : t('analysis.loadError', 'Unable to load analysis')
      });
    }
  };

  useEffect(() => {
    loadAnalysis(false);
  }, [gameMode, live.visible, status.running, status.admin, status.timer_resolution_applied, status.power_plan_active, status.topology_available]);

  const score = analysis?.score ?? 0;
  const boostLabel = analysis?.boost_potential?.label || 'none';
  const boostPoints = analysis?.boost_potential?.points ?? 0;
  const bottleneck = formatBottleneck(analysis?.bottleneck, t);
  const checks = Array.isArray(analysis?.checks) ? analysis.checks : [];
  const categories = Array.isArray(analysis?.categories) && analysis.categories.length
    ? analysis.categories
    : ['Control plane', 'CPU isolation', 'Latency tuning', 'System health'];
  const goodChecks = checks.filter((check) => check.status === 'ok').length;
  const warningChecks = checks.filter((check) => check.status === 'warning').length + checks.filter((check) => check.status === 'error').length;
  const summaryText = analysis?.available
    ? t(`analysis.summary.${analysis?.grade}`, analysis?.summary || 'System readiness analysis')
    : analysis?.summary || t('analysis.paused', 'Analysis paused');
  const gradeText = t(`analysis.grade.${analysis?.grade}`, analysis?.grade || 'not scored');
  const boostText = t(`analysis.boost.${boostLabel}`, boostLabel).toUpperCase();
  const bottleneckText = analysis?.bottleneck?.reason === 'gpu_metrics_not_collected'
    ? t('analysis.gpuNotCollected', bottleneck)
    : bottleneck;

  return (
    <Tile className="module-surface analysis-panel">
      <div className="analysis-header">
        <div>
          <div className="module-title">{t('analysis.title', 'System Analysis')}</div>
          <div className="analysis-subtitle">
            {summaryText}
          </div>
        </div>
        <div className="analysis-actions">
          <button type="button" onClick={() => loadAnalysis(false)} disabled={gameMode || analysisState.loading || analysisState.refreshing}>
            {analysisState.refreshing ? t('common.refreshing', 'Refreshing') : t('common.refresh', 'Refresh')}
          </button>
        </div>
      </div>

      {gameMode ? <div className="settings-message">{t('analysis.pausedGame', 'System analysis paused during game mode')}</div> : null}
      {hiddenWindow ? <div className="settings-message">{t('analysis.pausedHidden', 'System analysis paused while the window is hidden')}</div> : null}
      {analysisState.error ? <div className="action-error">{analysisState.error}</div> : null}

      <div className="analysis-grid">
        <div
          className={`analysis-score${analysis?.available ? '' : ' paused'}`}
          style={{ '--score-angle': `${Math.max(0, Math.min(100, score)) * 3.6}deg` }}
        >
          <div className="analysis-score-label">{t('analysis.score', 'Optimization Score')}</div>
          <div className="analysis-score-meter" aria-label={`${t('analysis.score', 'Optimization Score')} ${analysis?.available ? score : t('analysis.paused', 'paused')}`}>
            <div>
              <span className="analysis-score-value">{analysis?.available ? score : '--'}</span>
              <span className="analysis-score-unit">{analysis?.available ? '/100' : t('analysis.paused', 'PAUSED')}</span>
            </div>
          </div>
          <div className="analysis-score-detail">
            {analysis?.available ? t('analysis.gradeLine', '{{grade}} grade').replace('{{grade}}', gradeText) : (gameMode ? t('analysis.noGameAnalysis', 'No analysis while game mode is active') : t('analysis.noHiddenAnalysis', 'No analysis while the window is hidden'))}
          </div>
        </div>

        <div className="analysis-summary">
          <div>
            <span>{t('analysis.boostPotential', 'Boost Potential')}</span>
            <strong>{analysis?.available ? t('analysis.points', '{{points}} points').replace('{{points}}', boostPoints) : t('analysis.paused', 'Paused')}</strong>
          </div>
          <div>
            <span>{t('analysis.headroom', 'Headroom')}</span>
            <strong>{analysis?.available ? boostText : t('common.na', 'N/A')}</strong>
          </div>
          <div>
            <span>{t('analysis.gpuBottleneck', 'GPU bottleneck')}</span>
            <strong>{analysis?.available ? bottleneckText : t('analysis.notEstimated', 'Not estimated')}</strong>
          </div>
          <div>
            <span>{t('analysis.checksPassing', 'Checks passing')}</span>
            <strong>{analysis?.available ? `${goodChecks}/${checks.length}` : '0/0'}</strong>
          </div>
          <div className="wide">
            <span>{t('analysis.categories', 'Categories')}</span>
            <strong>{analysis?.available ? categories.map((category) => categoryLabel(category, t)).join(' / ') : t('analysis.paused', 'Paused')}</strong>
          </div>
          <div>
            <span>{t('analysis.warnings', 'Warnings')}</span>
            <strong>{analysis?.available ? warningChecks : 0}</strong>
          </div>
        </div>
      </div>

      {analysis?.available ? (
        <div className="analysis-check-list" aria-label="Analysis checks">
          {checks.map((check) => (
            <div key={check.id} className={`analysis-check ${check.status}`}>
              <div className="analysis-check-top">
                <span>{checkLabel(check, t)}</span>
                <Tag type={checkTone(check.status)}>{statusLabel(check.status, t)}</Tag>
              </div>
              <div className="analysis-check-detail">{checkDetail(check, t)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="module-empty">{t('analysis.paused', 'Analysis paused')}</div>
      )}
    </Tile>
  );
}
