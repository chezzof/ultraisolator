export function ActionPanel({ title, detail = null, actions = null, children = null, className = '' }) {
  const classes = ['action-panel', className].filter(Boolean).join(' ');

  return (
    <section className={classes}>
      <div>
        <div className="action-panel-title">{title}</div>
        {detail ? <div className="action-panel-detail">{detail}</div> : null}
      </div>
      {actions || children ? <div className="action-panel-actions">{actions || children}</div> : null}
    </section>
  );
}
