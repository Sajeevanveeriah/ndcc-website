import type { ReactNode } from 'react';

/**
 * Static decorative layer (formerly a scroll-linked drift). Always hidden
 * from assistive technology because it only holds decorative content.
 */
export default function ParallaxLayer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
  /* Retired scroll drift distance; accepted for call-site compatibility. */
  drift?: number;
}) {
  return (
    <div className={className} aria-hidden="true">
      {children}
    </div>
  );
}
