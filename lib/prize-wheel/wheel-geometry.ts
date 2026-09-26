// Presentation-only geometry for the live draw wheel. The winning number is
// decided and stored on the server before the wheel turns.

export type WheelSegment = { number: number; path: string; labelX: number; labelY: number; labelRotation: number; centreAngle: number };

const toRadians = (degrees: number) => (degrees - 90) * Math.PI / 180;
const round = (value: number) => Math.round(value * 100) / 100;

/** Segment n (1-based) spans clockwise from the top pointer. */
export function wheelSegments(divisions: number, radius: number, centre = radius): WheelSegment[] {
  const step = 360 / divisions;
  return Array.from({ length: divisions }, (_, index) => {
    const start = index * step;
    const end = start + step;
    const centreAngle = start + step / 2;
    const x1 = centre + radius * Math.cos(toRadians(start));
    const y1 = centre + radius * Math.sin(toRadians(start));
    const x2 = centre + radius * Math.cos(toRadians(end));
    const y2 = centre + radius * Math.sin(toRadians(end));
    const labelRadius = radius * (divisions > 60 ? 0.88 : 0.8);
    return {
      number: index + 1,
      path: `M${round(centre)} ${round(centre)} L${round(x1)} ${round(y1)} A${radius} ${radius} 0 ${step > 180 ? 1 : 0} 1 ${round(x2)} ${round(y2)} Z`,
      labelX: round(centre + labelRadius * Math.cos(toRadians(centreAngle))),
      labelY: round(centre + labelRadius * Math.sin(toRadians(centreAngle))),
      labelRotation: round(centreAngle),
      centreAngle,
    };
  });
}

/**
 * Clockwise rotation (degrees) that brings `target` under the top pointer,
 * always moving forward from `current` by at least `turns` full turns.
 */
export function rotationForNumber(target: number, divisions: number, current = 0, turns = 6): number {
  const step = 360 / divisions;
  const centreAngle = (target - 0.5) * step;
  const desired = ((360 - centreAngle) % 360 + 360) % 360;
  const currentMod = ((current % 360) + 360) % 360;
  const delta = ((desired - currentMod) % 360 + 360) % 360;
  return current + turns * 360 + delta;
}

/** The number under the top pointer for a given rotation. */
export function numberAtPointer(rotation: number, divisions: number): number {
  const step = 360 / divisions;
  const angle = ((360 - (((rotation % 360) + 360) % 360)) % 360);
  return Math.floor(angle / step) % divisions + 1;
}
