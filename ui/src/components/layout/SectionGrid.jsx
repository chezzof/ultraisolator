export function SectionGrid({ children, className = '', columns = null, ariaLabel = null }) {
  const classes = ['ui-section-grid', className].filter(Boolean).join(' ');
  const style = columns ? { gridTemplateColumns: columns } : undefined;

  return (
    <div className={classes} style={style} aria-label={ariaLabel}>
      {children}
    </div>
  );
}
