export function EmptyState({ title, detail = null, children = null, className = '' }) {
  const classes = ['ui-state', 'empty', className].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      <div>
        <div className="ui-state-title">{title}</div>
        {detail ? <div className="ui-state-detail">{detail}</div> : null}
        {children}
      </div>
    </div>
  );
}
