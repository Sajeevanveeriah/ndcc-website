'use client';
import { useMemo } from 'react';
import { wheelSegments } from '@/lib/prize-wheel/wheel-geometry';
import { SPIN_ANIMATION_MS, SPIN_COLOUR_HEX, spinLabelFontSize, type SpinColour } from '@/lib/spin-wheel/rules';

// Presentation only: the result is decided and recorded on the server before
// the wheel turns. Segment n spans clockwise from the top pointer.

type WheelGraphicSegment = { position: number; label: string; colour: SpinColour; available?: boolean };

const SIZE = 1000;
const RADIUS = SIZE / 2 - 24;
const NAVY = '#162845';
const GOLD = '#edc266';
const CREAM = '#FBF7F0';

const toRadians = (degrees: number) => (degrees - 90) * Math.PI / 180;

type Props = {
  segments: readonly WheelGraphicSegment[];
  rotation: number;
  reducedMotion: boolean;
  label: string;
  durationMs?: number;
};

export default function SpinWheelGraphic({ segments, rotation, reducedMotion, label, durationMs = SPIN_ANIMATION_MS }: Props) {
  const ordered = useMemo(() => [...segments].sort((a, b) => a.position - b.position), [segments]);
  const geometry = useMemo(() => wheelSegments(ordered.length, RADIUS, SIZE / 2), [ordered.length]);
  const longest = ordered.reduce((max, segment) => Math.max(max, segment.label.length), 0);
  const fontSize = spinLabelFontSize(ordered.length, longest);
  const labelRadius = RADIUS * 0.6;

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full select-none" role="img" aria-label={label}>
      <circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2 - 4} fill={NAVY} />
      <g style={{
        transform: `rotate(${rotation}deg)`,
        transformOrigin: `${SIZE / 2}px ${SIZE / 2}px`,
        transition: reducedMotion ? 'none' : `transform ${durationMs}ms cubic-bezier(0.12, 0.8, 0.18, 1)`,
      }}>
        {geometry.map((shape, index) => {
          const segment = ordered[index];
          if (!segment) return null;
          const colours = SPIN_COLOUR_HEX[segment.colour] || SPIN_COLOUR_HEX.maroon;
          const angle = shape.centreAngle;
          const x = SIZE / 2 + labelRadius * Math.cos(toRadians(angle));
          const y = SIZE / 2 + labelRadius * Math.sin(toRadians(angle));
          // Radial labels, flipped on the left half so they never read upside down.
          const textRotation = angle > 180 ? angle + 90 : angle - 90;
          return <g key={segment.position} opacity={segment.available === false ? 0.45 : 1}>
            <path d={shape.path} fill={colours.fill} stroke={NAVY} strokeWidth={3} />
            <text x={x} y={y} fill={colours.text} fontSize={fontSize} fontWeight={800} textAnchor="middle" dominantBaseline="middle"
              transform={`rotate(${textRotation} ${x} ${y})`} style={{ fontFamily: 'inherit' }}>{segment.label}</text>
          </g>;
        })}
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke={GOLD} strokeWidth={10} />
      </g>
      <circle cx={SIZE / 2} cy={SIZE / 2} r={78} fill={NAVY} stroke={GOLD} strokeWidth={10} />
      <circle cx={SIZE / 2} cy={SIZE / 2} r={22} fill={GOLD} />
      <path d={`M${SIZE / 2 - 36} 6 L${SIZE / 2 + 36} 6 L${SIZE / 2} 92 Z`} fill={GOLD} stroke={CREAM} strokeWidth={5} strokeLinejoin="round" />
    </svg>
  );
}
