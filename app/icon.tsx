export const contentType = 'image/svg+xml';
export const size = { width: 32, height: 32 };

export default function Icon(): Response {
  return new Response(
    `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="4" width="16" height="16" rx="0" stroke="#000" strokeWidth="1.5" />
      <rect x="7" y="7" width="10" height="10" rx="0" stroke="#000" strokeWidth="1" opacity="0.6" />
      <line x1="4" y1="8" x2="2" y2="8" stroke="#000" strokeWidth="1" />
      <line x1="4" y1="12" x2="2" y2="12" stroke="#000" strokeWidth="1" />
      <line x1="4" y1="16" x2="2" y2="16" stroke="#000" strokeWidth="1" />
      <line x1="20" y1="8" x2="22" y2="8" stroke="#000" strokeWidth="1" />
      <line x1="20" y1="12" x2="22" y2="12" stroke="#000" strokeWidth="1" />
      <line x1="20" y1="16" x2="22" y2="16" stroke="#000" strokeWidth="1" />
      <line x1="8" y1="4" x2="8" y2="2" stroke="#000" strokeWidth="1" />
      <line x1="12" y1="4" x2="12" y2="2" stroke="#000" strokeWidth="1" />
      <line x1="16" y1="4" x2="16" y2="2" stroke="#000" strokeWidth="1" />
      <line x1="8" y1="20" x2="8" y2="22" stroke="#000" strokeWidth="1" />
      <line x1="12" y1="20" x2="12" y2="22" stroke="#000" strokeWidth="1" />
      <line x1="16" y1="20" x2="16" y2="22" stroke="#000" strokeWidth="1" />
      <circle cx="12" cy="12" r="1.5" fill="#000" opacity="0.3" />
    </svg>`,
    { headers: { 'Content-Type': 'image/svg+xml' } },
  );
}
