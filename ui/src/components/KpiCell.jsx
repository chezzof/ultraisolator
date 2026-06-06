export function KpiCell({ label, value, detail, highlight = false, tone = 'default' }) {
  return (
    <div className={`kpi-cell ${tone}${highlight ? ' highlight' : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-baseline">{detail}</div>
    </div>
  );
}
