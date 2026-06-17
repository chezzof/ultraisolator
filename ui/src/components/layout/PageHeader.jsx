export function PageHeader({
  kicker,
  title,
  titleId,
  subtitle = null,
  actions = null,
  children = null,
  className = ''
}) {
  const classes = ['ui-page-header', className].filter(Boolean).join(' ');
  const actionContent = actions || children;

  return (
    <header className={classes}>
      <div>
        {kicker ? <div className="ui-page-header-kicker">{kicker}</div> : null}
        <h1 id={titleId} className="ui-page-header-title">{title}</h1>
        {subtitle ? <p className="ui-page-header-subtitle">{subtitle}</p> : null}
      </div>
      {actionContent ? <div className="ui-page-header-actions">{actionContent}</div> : null}
    </header>
  );
}
