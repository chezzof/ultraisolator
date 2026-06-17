export function MetricCard({
  label,
  value,
  detail = null,
  tone = 'neutral',
  highlight = false,
  className = ''
}) {
  const classes = ['metric-card', tone, highlight ? 'highlight' : '', className].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      <div className="metric-card-label">{label}</div>
      <div className="metric-card-value">{value}</div>
      {detail ? <div className="metric-card-detail">{detail}</div> : null}
    </div>
  );
}
