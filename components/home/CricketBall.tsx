import { useId } from 'react';

// Decorative cricket ball drawn in the club maroon with a gold seam and
// stitching. Purely ornamental: hidden from assistive technology. The only
// motion is a very slow turn (see .cricket-ball-turn), which is switched off
// for reduced motion and print.
export default function CricketBall({ className = '' }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  const leather = `ndcc-ball-leather-${id}`;
  const shine = `ndcc-ball-shine-${id}`;
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={leather} cx="34%" cy="28%" r="78%">
          <stop offset="0%" stopColor="#a3281c" />
          <stop offset="55%" stopColor="#880000" />
          <stop offset="100%" stopColor="#3a0000" />
        </radialGradient>
        <radialGradient id={shine} cx="30%" cy="24%" r="34%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.38" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="96" fill={`url(#${leather})`} />
      <g className="cricket-ball-turn" style={{ transformOrigin: '100px 100px' }} fill="none" strokeLinecap="round">
        <path d="M100 4 A 34 96 0 0 0 100 196" stroke="#edc266" strokeOpacity="0.9" strokeWidth="2.2" />
        <path d="M100 4 A 48 96 0 0 0 100 196" stroke="#edc266" strokeOpacity="0.9" strokeWidth="2.2" />
        <path d="M100 4 A 41 96 0 0 0 100 196" stroke="#f6e6c3" strokeOpacity="0.85" strokeWidth="11" strokeDasharray="1.6 7.4" />
      </g>
      <circle cx="100" cy="100" r="96" fill={`url(#${shine})`} />
      <circle cx="100" cy="100" r="95.5" fill="none" stroke="#000000" strokeOpacity="0.18" />
    </svg>
  );
}

/** Three stumps and two bails, drawn in the current text colour. */
export function StumpsIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 14" className={className} aria-hidden="true" focusable="false" fill="currentColor">
      <rect x="1" y="3" width="1.6" height="11" rx="0.8" />
      <rect x="5.2" y="3" width="1.6" height="11" rx="0.8" />
      <rect x="9.4" y="3" width="1.6" height="11" rx="0.8" />
      <rect x="1" y="0.6" width="4.6" height="1.4" rx="0.7" />
      <rect x="6.4" y="0.6" width="4.6" height="1.4" rx="0.7" />
    </svg>
  );
}
