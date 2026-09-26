interface AnimatedCounterProps {
  to: number;
  className?: string;
  suffix?: string;
  prefix?: string;
  /* Retired count-up duration; accepted for call-site compatibility. */
  duration?: number;
}

/**
 * Renders the final number statically (the count-up animation was retired
 * for calm motion). One plain text node, so screen readers and the server
 * HTML both read the real value.
 */
export default function AnimatedCounter({ to, className, suffix = '', prefix = '' }: AnimatedCounterProps) {
  return (
    <span className={className}>
      {prefix}
      {to}
      {suffix}
    </span>
  );
}
