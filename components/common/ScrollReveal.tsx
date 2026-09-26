import type { ReactNode } from 'react';

type ScrollRevealProps = {
  children: ReactNode;
  className?: string;
  /*
   * Retired entrance-animation options. They are still accepted so existing
   * call sites keep compiling, but content now renders statically: visible in
   * the server HTML, with no hidden initial state and no animation.
   */
  delay?: number;
  onMount?: boolean;
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
 * Static layout wrapper (formerly a scroll-triggered reveal). The public site
 * uses calm motion: content is always visible from the first paint.
 */
export default function ScrollReveal(props: ScrollRevealProps) {
  const { children, className, as: Tag = 'div', role } = props;
  return (
    <Tag className={className} role={role} aria-label={props['aria-label']}>
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
  /* Retired entrance treatment; accepted for call-site compatibility. */
  effect?: 'rise' | 'zoom' | 'draw';
}) {
  return <Tag className={className}>{children}</Tag>;
}
