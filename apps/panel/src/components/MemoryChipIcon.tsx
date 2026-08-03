interface Props {
  className?: string;
}

export function MemoryChipIcon({ className }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Chip body */}
      <rect x="4" y="4" width="16" height="16" rx="0" stroke="currentColor" strokeWidth="1.5" />
      {/* Inner die */}
      <rect x="7" y="7" width="10" height="10" rx="0" stroke="currentColor" strokeWidth="1" opacity="0.6" />
      {/* Pins left */}
      <line x1="4" y1="8" x2="2" y2="8" stroke="currentColor" strokeWidth="1" />
      <line x1="4" y1="12" x2="2" y2="12" stroke="currentColor" strokeWidth="1" />
      <line x1="4" y1="16" x2="2" y2="16" stroke="currentColor" strokeWidth="1" />
      {/* Pins right */}
      <line x1="20" y1="8" x2="22" y2="8" stroke="currentColor" strokeWidth="1" />
      <line x1="20" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="1" />
      <line x1="20" y1="16" x2="22" y2="16" stroke="currentColor" strokeWidth="1" />
      {/* Pins top */}
      <line x1="8" y1="4" x2="8" y2="2" stroke="currentColor" strokeWidth="1" />
      <line x1="12" y1="4" x2="12" y2="2" stroke="currentColor" strokeWidth="1" />
      <line x1="16" y1="4" x2="16" y2="2" stroke="currentColor" strokeWidth="1" />
      {/* Pins bottom */}
      <line x1="8" y1="20" x2="8" y2="22" stroke="currentColor" strokeWidth="1" />
      <line x1="12" y1="20" x2="12" y2="22" stroke="currentColor" strokeWidth="1" />
      <line x1="16" y1="20" x2="16" y2="22" stroke="currentColor" strokeWidth="1" />
      {/* Notch (orientation marker) */}
      <circle cx="12" cy="12" r="1.5" fill="currentColor" opacity="0.3" />
    </svg>
  );
}
