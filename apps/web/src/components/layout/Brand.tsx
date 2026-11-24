export function CyrisWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <svg className={compact ? 'cyris-signature compact' : 'cyris-signature'} viewBox={compact ? '0 0 38 32' : '0 0 110 32'} role="img" aria-label="CYRIS">
      <use href="/brand/cyris.svg#signal" className="cyris-signal" />
      {!compact && <use href="/brand/cyris.svg#letters" fill="currentColor" />}
    </svg>
  );
}

export function CylabLogo() {
  return <img className="cylab-wordmark" src="/brand/cylab.svg" width="94" height="32" alt="CYLAB" />;
}
