import type { ReactNode } from 'react';

/**
 * Plain card wrapper (formerly a pointer-driven tilt and spotlight). Kept as a
 * component so call sites stay unchanged; it adds no motion and no
 * interactive semantics.
 */
export default function TiltCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}
