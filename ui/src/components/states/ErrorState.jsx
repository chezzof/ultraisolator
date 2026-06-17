export function ErrorState({ title, detail = null, children = null, className = '' }) {
  const classes = ['ui-state', 'error', className].filter(Boolean).join(' ');

  return (
    <div className={classes} role="alert">
      <div>
        <div className="ui-state-title">{title}</div>
        {detail ? <div className="ui-state-detail">{detail}</div> : null}
        {children}
      </div>
    </div>
  );
}
