'use client';

/**
 * Renders its children unchanged. The root layout wraps the page slot in this
 * so the slot is reconciled by a component, not directly by the <main>
 * element. When the page slot's client code (e.g. the app/error.tsx chunk)
 * arrives after hydration starts, React pauses and later replays the fiber
 * that was waiting. Replaying a host element such as <main> re-claims the
 * next server DOM node and fails hydration (React error #418, about one in
 * five loads on slower connections, 7 Oct 2026); replaying a component does not.
 */
export default function HydrationSlot({ children }: { children: React.ReactNode }) {
  return children;
}
