import { useEffect, useMemo, useState } from 'react';
import { ActionPanel } from '../components/cards/ActionPanel.jsx';
import { MetricCard } from '../components/cards/MetricCard.jsx';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { SectionGrid } from '../components/layout/SectionGrid.jsx';
import { StatusPill } from '../components/status/StatusPill.jsx';
import { EmptyState } from '../components/states/EmptyState.jsx';
import { ErrorState } from '../components/states/ErrorState.jsx';
import { PARTITION_LABELS } from '../constants/topology.js';
import { requestJson } from '../utils/api.js';
import { formatCacheSize, formatCoreLabel, formatCpuSets } from '../utils/format.js';
import { groupCoresByLlc } from '../utils/topology.js';
import { useI18n } from '../i18n.jsx';

const PARTITION_KEYS = ['game', 'background', 'housekeeping', 'unassigned'];

const PARTITION_FALLBACK_LABELS = {
  game: 'Game',
  background: 'Background',
  housekeeping: 'Housekeeping',
  unassigned: 'Unassigned'
};

const CORE_TYPE_FALLBACK_LABELS = {
  performance: 'P-core',
  efficiency: 'E-core',
  standard: 'Core',
  mixed: 'Mixed'
};

const PARTITION_TONES = {
  game: 'success',
  background: 'warning',
  housekeeping: 'neutral',
  unassigned: 'inactive'
};

const PARTITION_CLASSES = {
  game: 'partition-game',
  background: 'partition-background',
  housekeeping: 'partition-housekeeping',
  unassigned: 'partition-unassigned'
};

function countPartitionCores(cores, partition) {
  return cores.filter((core) => (core.partition || 'unassigned') === partition).length;
}

export function TopologyPage({ live }) {
  const { t } = useI18n();
  const status = live.snapshot?.status || {};
  const [topology, setTopology] = useState(null);
  const [selectedCoreId, setSelectedCoreId] = useState(null);
  const [topologyState, setTopologyState] = useState({
    loading: true,
    refreshing: false,
    error: null
  });

  const loadTopology = async (refresh = false) => {
    setTopologyState((current) => ({
      ...current,
      loading: !topology,
      refreshing: Boolean(refresh),
      error: null
    }));
    try {
      const snapshot = await requestJson(`/api/topology${refresh ? '?refresh=1' : ''}`);
      setTopology(snapshot);
      setSelectedCoreId((current) => current || snapshot.cores?.[0]?.id || null);
      setTopologyState({ loading: false, refreshing: false, error: null });
    } catch (error) {
      setTopologyState({
        loading: false,
        refreshing: false,
        error: error instanceof Error ? error.message : t('topology.unavailable', 'Unable to load topology')
      });
    }
  };

  useEffect(() => {
    loadTopology(true);
  }, []);

  const cores = Array.isArray(topology?.cores) ? topology.cores : [];
  const llcGroups = useMemo(
    () => groupCoresByLlc(cores, Array.isArray(topology?.llc_groups) ? topology.llc_groups : []),
    [cores, topology?.llc_groups]
  );
  const selectedCore = useMemo(
    () => cores.find((core) => core.id === selectedCoreId) || cores[0] || null,
    [cores, selectedCoreId]
  );
  const partitions = topology?.partitions || {};
  const summary = topology?.summary || {};
  const isRunning = Boolean(status.running);
  const gameMode = Boolean(status.game_mode);
  const topologyAvailable = Boolean(topology?.available && cores.length);
  const stateTone = topologyState.error ? 'danger' : topologyAvailable ? 'success' : topologyState.loading ? 'warning' : 'inactive';
  const stateLabel = topologyState.error
    ? t('topology.unavailable', 'Topology unavailable')
    : topologyAvailable
      ? t('topology.available', 'Topology available')
      : topologyState.loading
        ? t('topology.loading', 'Loading topology')
        : t('topology.noData', 'No topology data');

  const partitionLabel = (partition) => t(`topology.partition.${partition}`, PARTITION_FALLBACK_LABELS[partition] || PARTITION_LABELS[partition] || partition);
  const partitionCoreCount = (partition) => partitions[partition]?.core_count ?? countPartitionCores(cores, partition);
  const partitionLogicalCount = (partition) => partitions[partition]?.logical_processor_count ?? cores
    .filter((core) => (core.partition || 'unassigned') === partition)
    .reduce((total, core) => total + (core.logical_processor_count || 0), 0);
  const coreTypeLabel = (core) => {
    const typeKey = core?.efficiency_type || 'standard';
    const type = t(`topology.coreType.${typeKey}`, CORE_TYPE_FALLBACK_LABELS[typeKey] || formatCoreLabel(core).replace(' / Parked', ''));
    return core?.parked ? `${type} / ${t('topology.parked', 'Parked')}` : type;
  };

  return (
    <section className="page topology-page" aria-labelledby="topology-title">
      <PageHeader
        className="topology-page-header"
        kicker={t('topology.readOnly', 'Read-only CPU map')}
        title={t('nav.topology', 'CPU Topology')}
        titleId="topology-title"
        subtitle={summary.heterogeneous_efficiency ? t('topology.hybridLayout', 'Hybrid P-core / E-core layout') : t('topology.homogeneousLayout', 'Homogeneous core layout')}
        actions={(
          <>
            <StatusPill tone={live.connectionState === 'connected' ? 'connected' : 'warning'} showDot>
              {live.connectionState || 'unknown'}
            </StatusPill>
            <StatusPill tone={isRunning ? (gameMode ? 'success' : 'warning') : 'inactive'}>
              {gameMode ? t('status.gameMode', 'Game mode') : (isRunning ? t('status.engineRunning', 'Engine running') : t('status.engineIdle', 'Engine idle'))}
            </StatusPill>
            <StatusPill tone={stateTone} showDot>
              {stateLabel}
            </StatusPill>
          </>
        )}
      />

      <ActionPanel
        className="topology-state-panel"
        title={topology?.refresh?.blocked_reason
          ? t('topology.refreshBlocked', 'Refresh blocked: {{reason}}').replace('{{reason}}', topology.refresh.blocked_reason)
          : t('topology.readOnly', 'Read-only CPU map')}
        detail={topologyState.error
          ? t('topology.unavailable', 'Topology unavailable')
          : `${summary.core_count ?? cores.length} ${t('topology.core', 'Core').toLowerCase()} / ${summary.logical_processor_count ?? 0} ${t('topology.logicalProcessorsLabel', 'Logical Processors').toLowerCase()}`}
        actions={(
          <button type="button" onClick={() => loadTopology(true)} disabled={topologyState.refreshing}>
            {topologyState.refreshing ? t('common.refreshing', 'Refreshing') : t('common.refresh', 'Refresh')}
          </button>
        )}
      />

      <SectionGrid className="topology-summary-grid" columns="repeat(4, minmax(0, 1fr))" ariaLabel="Topology summary">
        <MetricCard
          label={t('topology.totalCores', 'Total Cores')}
          value={summary.core_count ?? cores.length}
          detail={t('topology.logicalProcessors', '{{count}} logical processors').replace('{{count}}', summary.logical_processor_count ?? 0)}
          highlight
        />
        <MetricCard
          label={partitionLabel('game')}
          value={partitionCoreCount('game')}
          detail={t('topology.cpuSetsCount', '{{count}} CPU sets').replace('{{count}}', partitionLogicalCount('game'))}
          tone="positive"
        />
        <MetricCard
          label={partitionLabel('background')}
          value={partitionCoreCount('background')}
          detail={t('topology.cpuSetsCount', '{{count}} CPU sets').replace('{{count}}', partitionLogicalCount('background'))}
          tone="warning"
        />
        <MetricCard
          label={partitionLabel('housekeeping')}
          value={partitionCoreCount('housekeeping')}
          detail={t('topology.cpuSetsCount', '{{count}} CPU sets').replace('{{count}}', partitionLogicalCount('housekeeping'))}
        />
      </SectionGrid>

      <SectionGrid className="topology-legend-grid" columns="repeat(4, minmax(0, 1fr))" ariaLabel="Partition legend">
        {PARTITION_KEYS.map((partition) => (
          <div className={`topology-legend-card ${PARTITION_CLASSES[partition]}`} key={partition}>
            <StatusPill tone={PARTITION_TONES[partition]} showDot>{partitionLabel(partition)}</StatusPill>
            <strong>{partitionCoreCount(partition)}</strong>
            <span>{t('topology.logicalProcessors', '{{count}} logical processors').replace('{{count}}', partitionLogicalCount(partition))}</span>
          </div>
        ))}
      </SectionGrid>

      {topologyState.error ? (
        <ErrorState
          className="topology-error-state"
          title={t('topology.unavailable', 'Topology unavailable')}
          detail={topologyState.error}
        />
      ) : null}

      <div className="topology-layout">
        <section className="module-surface topology-map topology-core-map" aria-label={t('topology.map', 'CPU Map')}>
          <div className="topology-map-header">
            <div>
              <div className="module-title">{t('topology.map', 'CPU Map')}</div>
              <div className="topology-subtitle">
                {summary.heterogeneous_efficiency ? t('topology.hybridLayout', 'Hybrid P-core / E-core layout') : t('topology.homogeneousLayout', 'Homogeneous core layout')}
              </div>
            </div>
            <div className="topology-legend" aria-label="Partition legend">
              {PARTITION_KEYS.map((partition) => (
                <span className={`legend-item ${PARTITION_CLASSES[partition]}`} key={partition}>{partitionLabel(partition)}</span>
              ))}
            </div>
          </div>

          {topologyState.loading ? (
            <EmptyState
              className="topology-loading-state"
              title={t('topology.loading', 'Loading topology')}
              detail={t('topology.readOnly', 'Read-only CPU map')}
            />
          ) : cores.length ? (
            <div className="llc-group-list">
              {llcGroups.map((llc) => (
                <section className="llc-group" key={llc.id} aria-label={`LLC ${llc.llc_index}`}>
                  <div className="llc-group-header">
                    <span>LLC {llc.llc_index}</span>
                    <span>{t('topology.group', 'Group')} {llc.group}</span>
                    <span>{formatCacheSize(llc.l3_size_bytes)}</span>
                    <span>{t('topology.coresCount', '{{count}} cores').replace('{{count}}', llc.cores.length)}</span>
                  </div>
                  <div className="core-grid">
                    {llc.cores.map((core) => {
                      const partition = core.partition || 'unassigned';
                      const translatedPartition = partitionLabel(partition);
                      const selected = selectedCore?.id === core.id;
                      return (
                        <button
                          key={core.id}
                          type="button"
                          className={`core-tile ${PARTITION_CLASSES[partition] || PARTITION_CLASSES.unassigned} ${core.efficiency_type || 'standard'}${core.parked ? ' parked' : ''}${selected ? ' selected' : ''}`}
                          title={`${t('topology.core', 'Core')} ${core.core_index} / ${coreTypeLabel(core)} / ${translatedPartition}`}
                          aria-pressed={selected}
                          onClick={() => setSelectedCoreId(core.id)}
                        >
                          <span className="core-tile-head">
                            <span className="core-index">C{core.core_index}</span>
                            <span className={`core-selected-indicator${selected ? ' active' : ''}`} aria-hidden="true" />
                          </span>
                          <span className="core-partition">{translatedPartition}</span>
                          <span className="core-type">{coreTypeLabel(core)}</span>
                          <span className="core-tile-meta">
                            <span>{t('topology.logicalProcessorsShort', '{{count}} LP').replace('{{count}}', core.logical_processor_count)}</span>
                            <span>{t('topology.group', 'Group')} {core.group}</span>
                            <span>LLC {core.llc_index}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <EmptyState
              className="topology-empty-state"
              title={t('topology.noData', 'No topology data')}
              detail={t('dashboard.topologyStart', 'Start engine to populate topology')}
            />
          )}
        </section>

        <section className="module-surface core-detail-panel topology-selected-core" aria-label={t('topology.coreDetails', 'Core Details')}>
          <div className="core-detail-heading">
            <div>
              <div className="module-title">{t('topology.coreDetails', 'Core Details')}</div>
              <div className="topology-subtitle">
                {selectedCore ? `${t('topology.core', 'Core')} C${selectedCore.core_index}` : t('topology.selectCore', 'Select a core')}
              </div>
            </div>
            {selectedCore ? <StatusPill tone={PARTITION_TONES[selectedCore.partition || 'unassigned']}>{partitionLabel(selectedCore.partition || 'unassigned')}</StatusPill> : null}
          </div>
          {selectedCore ? (
            <div className="core-detail-grid">
              <div className="core-detail-section">
                <span>{t('topology.core', 'Core')}</span>
                <strong>C{selectedCore.core_index}</strong>
              </div>
              <div className="core-detail-section">
                <span>{t('topology.type', 'Type')}</span>
                <strong>{coreTypeLabel(selectedCore)}</strong>
              </div>
              <div className="core-detail-section">
                <span>{t('topology.group', 'Group')}</span>
                <strong>{selectedCore.group}</strong>
              </div>
              <div className="core-detail-section">
                <span>LLC</span>
                <strong>{selectedCore.llc_index}</strong>
              </div>
              <div className="core-detail-section">
                <span>L3</span>
                <strong>{formatCacheSize(selectedCore.l3_size_bytes)}</strong>
              </div>
              <div className="core-detail-section">
                <span>{t('topology.efficiency', 'Efficiency')}</span>
                <strong>{selectedCore.efficiency_class}</strong>
              </div>
              <div className="core-detail-section">
                <span>{t('topology.status', 'Status')}</span>
                <strong>{selectedCore.parked ? t('topology.parked', 'Parked') : t('dashboard.active', 'Active')}</strong>
              </div>
              <div className="core-detail-section">
                <span>{t('topology.logicalProcessorsLabel', 'Logical Processors')}</span>
                <strong>{(selectedCore.logical_indices || []).join(', ') || t('common.none', 'None')}</strong>
              </div>
              <div className="core-detail-section wide">
                <span>{t('topology.cpuSets', 'CPU Sets')}</span>
                <strong>{formatCpuSets(selectedCore.cpu_set_ids)}</strong>
              </div>
            </div>
          ) : (
            <EmptyState
              className="core-detail-empty"
              title={t('topology.selectCore', 'Select a core')}
              detail={t('topology.noData', 'No topology data')}
            />
          )}
        </section>
      </div>
    </section>
  );
}
