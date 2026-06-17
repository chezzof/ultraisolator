import { MetricCard } from './cards/MetricCard.jsx';

export function KpiCell({ label, value, detail, highlight = false, tone = 'default' }) {
  return (
    <MetricCard
      label={label}
      value={value}
      detail={detail}
      highlight={highlight}
      tone={tone}
      className="kpi-cell"
    />
  );
}
