const STATUS_TONES = new Set(['neutral', 'connected', 'success', 'warning', 'danger', 'inactive']);

export function StatusPill({ tone = 'neutral', children, showDot = false, className = '' }) {
  const safeTone = STATUS_TONES.has(tone) ? tone : 'neutral';
  const classes = ['status-pill', safeTone, className].filter(Boolean).join(' ');

  return (
    <span className={classes}>
      {showDot ? <span className="status-pill-dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
