// AIR HOCKEY: the small table used as the game's picture in the lobby and the game list (no image file needed).
export function HockeyArt({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
      <defs>
        <linearGradient id="ah-art-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff3c4" />
          <stop offset="0.5" stopColor="#e8c46a" />
          <stop offset="1" stopColor="#8a5f1e" />
        </linearGradient>
        <radialGradient id="ah-art-red" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ff9aa5" />
          <stop offset="0.55" stopColor="#e0223b" />
          <stop offset="1" stopColor="#5e0812" />
        </radialGradient>
        <radialGradient id="ah-art-blue" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#a8cfff" />
          <stop offset="0.55" stopColor="#2170e0" />
          <stop offset="1" stopColor="#0a2560" />
        </radialGradient>
      </defs>
      <g transform="rotate(-18 32 32)">
        <rect x="15" y="3" width="34" height="58" rx="7" fill="#15171e" stroke="url(#ah-art-gold)" strokeWidth="1.6" />
        <rect x="18" y="6" width="28" height="52" rx="4" fill="#05060b" />
        <path d="M18.6 8 V30" stroke="#2f8bff" strokeWidth="1.2" opacity="0.9" />
        <path d="M45.4 8 V30" stroke="#2f8bff" strokeWidth="1.2" opacity="0.9" />
        <path d="M18.6 34 V56" stroke="#ff2e4d" strokeWidth="1.2" opacity="0.9" />
        <path d="M45.4 34 V56" stroke="#ff2e4d" strokeWidth="1.2" opacity="0.9" />
        <line x1="18" y1="32" x2="46" y2="32" stroke="#e8c46a" strokeWidth="0.9" />
        <circle cx="32" cy="32" r="5.5" fill="none" stroke="#e8c46a" strokeWidth="0.8" />
        <rect x="27" y="5.2" width="10" height="1.8" rx="0.9" fill="#2f8bff" />
        <rect x="27" y="57" width="10" height="1.8" rx="0.9" fill="#ff2e4d" />
        <circle cx="36" cy="16" r="4.6" fill="url(#ah-art-blue)" stroke="url(#ah-art-gold)" strokeWidth="0.7" />
        <circle cx="27" cy="47" r="4.6" fill="url(#ah-art-red)" stroke="url(#ah-art-gold)" strokeWidth="0.7" />
        <circle cx="31" cy="38" r="2.7" fill="#07070a" stroke="url(#ah-art-gold)" strokeWidth="1.1" />
      </g>
    </svg>
  );
}

/** The lobby card picture: the lit table seen from above, lying sideways (red side left, blue side right). */
export function HockeyCardArt({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 120 80" width={size * 2.3} height={size * 1.53} aria-hidden>
      <defs>
        <linearGradient id="ahc-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff3c4" />
          <stop offset="0.5" stopColor="#e8c46a" />
          <stop offset="1" stopColor="#8a5f1e" />
        </linearGradient>
        <linearGradient id="ahc-surf" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#1a070b" />
          <stop offset="0.5" stopColor="#05060b" />
          <stop offset="1" stopColor="#07102a" />
        </linearGradient>
        <radialGradient id="ahc-red" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ff9aa5" />
          <stop offset="0.55" stopColor="#e0223b" />
          <stop offset="1" stopColor="#5e0812" />
        </radialGradient>
        <radialGradient id="ahc-blue" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#a8cfff" />
          <stop offset="0.55" stopColor="#2170e0" />
          <stop offset="1" stopColor="#0a2560" />
        </radialGradient>
        <filter id="ahc-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
      </defs>
      <rect x="4" y="10" width="112" height="60" rx="9" fill="#14161d" stroke="url(#ahc-gold)" strokeWidth="1.6" />
      <rect x="9" y="15" width="102" height="50" rx="5" fill="url(#ahc-surf)" />
      <g filter="url(#ahc-glow)">
        <path d="M11 13 H58 M11 67 H58" stroke="#ff2e4d" strokeWidth="2" />
        <path d="M62 13 H109 M62 67 H109" stroke="#2f8bff" strokeWidth="2" />
      </g>
      <path d="M11 13 H58 M11 67 H58" stroke="#ff6b7e" strokeWidth="0.8" />
      <path d="M62 13 H109 M62 67 H109" stroke="#8cc0ff" strokeWidth="0.8" />
      <line x1="60" y1="15" x2="60" y2="65" stroke="#e8c46a" strokeWidth="0.9" />
      <circle cx="60" cy="40" r="9" fill="none" stroke="#e8c46a" strokeWidth="0.8" />
      <path d="M60 34.5 C63 37.5 66 39.5 63.6 42.4 C62.3 43.8 60.9 43 60.3 42 L61.6 45.6 H58.4 L59.7 42 C59.1 43 57.7 43.8 56.4 42.4 C54 39.5 57 37.5 60 34.5 Z" fill="url(#ahc-gold)" />
      <path d="M9 32 A12 12 0 0 1 9 48" fill="none" stroke="#e8c46a" strokeWidth="0.7" />
      <path d="M111 32 A12 12 0 0 0 111 48" fill="none" stroke="#e8c46a" strokeWidth="0.7" />
      <rect x="7" y="33" width="2.4" height="14" rx="1.2" fill="#ff2e4d" />
      <rect x="110.6" y="33" width="2.4" height="14" rx="1.2" fill="#2f8bff" />
      <ellipse cx="27" cy="45" rx="7" ry="6.4" fill="rgba(0,0,0,0.5)" />
      <circle cx="26" cy="43" r="6.4" fill="url(#ahc-red)" stroke="url(#ahc-gold)" strokeWidth="0.8" />
      <circle cx="26" cy="43" r="2.6" fill="#ff8a95" opacity="0.7" />
      <circle cx="93" cy="35" r="6.4" fill="url(#ahc-blue)" stroke="url(#ahc-gold)" strokeWidth="0.8" />
      <circle cx="93" cy="35" r="2.6" fill="#a8cfff" opacity="0.7" />
      <path d="M36 44 L44 41.5" stroke="#ffd98a" strokeWidth="2.6" strokeLinecap="round" opacity="0.35" />
      <circle cx="47" cy="40.5" r="3.6" fill="#07070a" stroke="url(#ahc-gold)" strokeWidth="1.3" />
    </svg>
  );
}
