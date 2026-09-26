import type { ReactNode } from 'react';

type ScrollRevealProps = {
  children: ReactNode;
  className?: string;
  /*
   * Timing and direction options from the earlier animation system. They are
   * still accepted so existing call sites keep compiling; every reveal now
   * uses the one shared subtle settle defined in app/globals.css.
   */
  delay?: number;
  onMount?: boolean;
  /** Settle each direct child in turn instead of the wrapper as a whole. */
  stagger?: boolean;
  duration?: number;
  direction?: 'up' | 'left' | 'right';
  effect?: 'rise' | 'fade' | 'scale' | 'blur';
  distance?: number;
  staggerInterval?: number;
  viewportMargin?: string;
  as?: 'div' | 'section' | 'span' | 'ul' | 'li' | 'header';
  role?: string;
  'aria-label'?: string;
};

/**
 * Marks content for a one-time subtle settle as it scrolls into view. The
 * content is always rendered in the server HTML; RevealObserver only hides
 * blocks that start below the fold, and never with reduced motion or no JS.
 */
export default function ScrollReveal(props: ScrollRevealProps) {
  const { children, className, as: Tag = 'div', role, stagger } = props;
  const marker = stagger ? { 'data-reveal-stagger': '' } : { 'data-reveal': '' };
  return (
    <Tag className={className} role={role} aria-label={props['aria-label']} {...marker}>
      {children}
    </Tag>
  );
}

export function ScrollRevealItem({
  children,
  className,
  as: Tag = 'div',
}: {
  children?: ReactNode;
  className?: string;
  as?: 'div' | 'li' | 'span';
  /* Earlier per-item treatment; accepted for call-site compatibility. */
  effect?: 'rise' | 'zoom' | 'draw';
}) {
  return <Tag className={className}>{children}</Tag>;
}
