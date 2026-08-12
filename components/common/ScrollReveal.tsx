'use client';

import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { DISTANCE, DURATION, EASE_OUT, STAGGER, VIEWPORT_MARGIN } from '@/lib/motion-tokens';

type RevealEffect = 'rise' | 'fade' | 'scale' | 'blur';

type ScrollRevealProps = {
  children: ReactNode;
  className?: string;
  /** Delay in seconds before the reveal starts. */
  delay?: number;
  /** Animate immediately on mount instead of waiting for viewport entry (hero content). */
  onMount?: boolean;
  /** Stagger direct children (use with <ScrollRevealItem> wrappers). */
  stagger?: boolean;
  /** Reveal duration in seconds. Defaults to 0.45; hero sequences use ~0.7. */
  duration?: number;
  /** Direction the content reveals from. Defaults to 'up'. */
  direction?: 'up' | 'left' | 'right';
  /**
   * Entrance treatment. 'rise' is the historical fade + travel; 'scale' adds a
   * gentle settle from 96%; 'blur' adds a small defocus (small elements only —
   * filter animation is not cheap); 'fade' is opacity alone.
   */
  effect?: RevealEffect;
  /** Travel distance in px for rise/blur entrances. Defaults to the house 16px. */
  distance?: number;
  /** Seconds between staggered children. Defaults to the house 0.08s. */
  staggerInterval?: number;
  /** Viewport margin controlling how early the reveal fires. */
  viewportMargin?: string;
  as?: 'div' | 'section' | 'span' | 'ul' | 'li' | 'header';
  role?: string;
  'aria-label'?: string;
};

const EASE = EASE_OUT;

function buildVariants(effect: RevealEffect, direction: 'up' | 'left' | 'right', distance: number) {
  if (direction === 'left') return { hidden: { opacity: 0, x: -(distance + 8) }, visible: { opacity: 1, x: 0 } };
  if (direction === 'right') return { hidden: { opacity: 0, x: distance + 8 }, visible: { opacity: 1, x: 0 } };
  switch (effect) {
    case 'fade':
      return { hidden: { opacity: 0 }, visible: { opacity: 1 } };
    case 'scale':
      return { hidden: { opacity: 0, y: distance / 2, scale: 0.96 }, visible: { opacity: 1, y: 0, scale: 1 } };
    case 'blur':
      return {
        hidden: { opacity: 0, y: distance, filter: 'blur(6px)' },
        visible: { opacity: 1, y: 0, filter: 'blur(0px)' },
      };
    default:
      return { hidden: { opacity: 0, y: distance }, visible: { opacity: 1, y: 0 } };
  }
}

export default function ScrollReveal({
  children,
  className,
  delay = 0,
  onMount = false,
  stagger = false,
  duration,
  direction = 'up',
  effect = 'rise',
  distance = DISTANCE.base,
  staggerInterval = STAGGER.base,
  viewportMargin = VIEWPORT_MARGIN,
  as = 'div',
  ...rest
}: ScrollRevealProps) {
  const reduceMotion = useReducedMotion();
  const Tag = m[as];

  const base = buildVariants(effect, direction, distance);

  // Reduced motion must stay on the motion component rather than branching to
  // a plain element: the server (which cannot read the media query) renders
  // the hidden initial style inline, React hydration does not patch style
  // attribute mismatches, and a plain element therefore stayed permanently
  // invisible for reduced-motion users. Collapsing the variants to the
  // visible values with a zero-duration transition lets framer correct the
  // DOM imperatively on mount with no animation.
  const variants = {
    hidden: reduceMotion ? { ...base.visible } : base.hidden,
    visible: {
      ...base.visible,
      transition: reduceMotion
        ? { duration: 0, delay: 0 }
        : stagger
          ? { duration: duration ?? 0.5, ease: EASE, delay, staggerChildren: staggerInterval, delayChildren: delay }
          : { duration: duration ?? DURATION.base, ease: EASE, delay },
    },
  };

  return (
    <LazyMotion features={domAnimation} strict>
      <Tag
        className={className}
        {...rest}
        variants={variants}
        initial="hidden"
        {...(onMount
          ? { animate: 'visible' }
          : { whileInView: 'visible', viewport: { once: true, margin: viewportMargin } })}
      >
        {children}
      </Tag>
    </LazyMotion>
  );
}

export function ScrollRevealItem({
  children,
  className,
  as = 'div',
  effect = 'rise',
}: {
  /** Optional: a 'draw' rule is often an empty decorative element. */
  children?: ReactNode;
  className?: string;
  as?: 'div' | 'li' | 'span';
  /**
   * 'zoom' is for imagery inside an overflow-hidden frame: settles from 108%.
   * 'draw' sweeps a divider/rule in from the left (scaleX, origin-left).
   */
  effect?: 'rise' | 'zoom' | 'draw';
}) {
  const reduceMotion = useReducedMotion();
  const Tag = m[as];

  // Same reduced-motion strategy as ScrollReveal above: keep the motion
  // component and collapse hidden to the visible values with zero duration so
  // framer corrects any server-rendered hidden style on mount.
  const fullVariants =
    effect === 'zoom'
      ? {
          hidden: { opacity: 0, scale: 1.08 },
          visible: { opacity: 1, scale: 1, transition: { duration: 0.6, ease: EASE } },
        }
      : effect === 'draw'
        ? {
            hidden: { opacity: 0, scaleX: 0 },
            visible: { opacity: 1, scaleX: 1, transition: { duration: 0.7, ease: EASE } },
          }
        : {
          hidden: { opacity: 0, y: 16 },
          visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
        };
  const variants = reduceMotion
    ? {
        hidden: { ...fullVariants.visible, transition: { duration: 0 } },
        visible: { ...fullVariants.visible, transition: { duration: 0 } },
      }
    : fullVariants;

  if (effect === 'draw') {
    return (
      <Tag className={className} style={{ transformOrigin: 'left center' }} variants={variants}>
        {children}
      </Tag>
    );
  }

  return (
    <Tag className={className} variants={variants}>
      {children}
    </Tag>
  );
}
