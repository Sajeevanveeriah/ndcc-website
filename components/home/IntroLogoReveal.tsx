'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Once per browser session; bump the suffix if the intro video is replaced and
// should play again for visitors mid-session.
const SEEN_KEY = 'ndcc.introSeen.v1';

// If the video is not ready to play this long after mount, the intro is
// abandoned and the visitor just sees the homepage. Keeps slow connections
// from ever staring at a blank overlay.
const READY_DEADLINE_MS = 4000;

// Hard cap once playing (the clip runs ~10s). Covers a stalled network or a
// background tab where `ended` never arrives.
const PLAYBACK_CAP_MS = 14000;

const FADE_MS = 600;

function sessionSeen(): boolean {
  try {
    return window.sessionStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markSessionSeen() {
  try {
    window.sessionStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Storage unavailable (private mode etc.) — the intro may replay next
    // navigation; harmless.
  }
}

/**
 * Full-screen club logo reveal shown over the homepage on the first visit of
 * a browser session. Renders nothing on the server and fails closed at every
 * step: the overlay only becomes visible after the video reports it can play
 * and playback actually starts, and any error, timeout, reduced-motion or
 * Save-Data preference skips it entirely.
 */
export default function IntroLogoReveal() {
  // idle: nothing rendered. arming: video mounted but overlay invisible while
  // it buffers. playing: overlay faded in, video running. leaving: fade-out.
  const [phase, setPhase] = useState<'idle' | 'arming' | 'playing' | 'leaving'>('idle');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const dismiss = useCallback(() => {
    if (phaseRef.current === 'playing') {
      setPhase('leaving');
      window.setTimeout(() => setPhase('idle'), FADE_MS);
    } else if (phaseRef.current !== 'idle') {
      setPhase('idle');
    }
  }, []);

  useEffect(() => {
    if (sessionSeen()) return;
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const connection = (navigator as { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData) return;
    setPhase('arming');
  }, []);

  // While arming, give the video a fixed window to become playable.
  useEffect(() => {
    if (phase !== 'arming') return;
    const deadline = window.setTimeout(() => {
      if (phaseRef.current === 'arming') setPhase('idle');
    }, READY_DEADLINE_MS);
    return () => window.clearTimeout(deadline);
  }, [phase]);

  // Once playing: lock scroll, cap total time on screen, allow Escape to skip.
  useEffect(() => {
    if (phase !== 'playing') return;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    const cap = window.setTimeout(dismiss, PLAYBACK_CAP_MS);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.documentElement.style.overflow = previousOverflow;
      window.clearTimeout(cap);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [phase, dismiss]);

  const handleCanPlay = useCallback(() => {
    if (phaseRef.current !== 'arming') return;
    const video = videoRef.current;
    if (!video) return;
    const playAttempt = video.play();
    if (playAttempt && typeof playAttempt.then === 'function') {
      playAttempt
        .then(() => {
          if (phaseRef.current === 'arming') {
            markSessionSeen();
            setPhase('playing');
          }
        })
        .catch(() => {
          // Autoplay refused — skip the intro rather than show a frozen frame.
          if (phaseRef.current === 'arming') setPhase('idle');
        });
    } else {
      markSessionSeen();
      setPhase('playing');
    }
  }, []);

  if (phase === 'idle') return null;

  const visible = phase === 'playing';

  return (
    <div
      aria-label="Newcomb and District Cricket Club intro animation"
      className={`fixed inset-0 z-[80] flex items-center justify-center transition-opacity ease-out ${
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
      style={{
        transitionDuration: `${FADE_MS}ms`,
        // Matches the clip's studio backdrop so the portrait letterbox blends.
        background: 'linear-gradient(to bottom, #d4d4d4, #c3c3c3)',
      }}
    >
      {/* Landscape screens crop-fill; portrait screens fit the whole 16:9
          frame so the crest in the closing shot is never cropped away. */}
      <video
        ref={videoRef}
        className="h-full w-full object-cover portrait:object-contain"
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
        onCanPlay={handleCanPlay}
        onEnded={dismiss}
        onError={dismiss}
      >
        {/* WebM first: smaller file and the only one some Linux Chromium
            builds can decode. Safari falls through to the MP4. A browser that
            plays neither never reaches canplay, so the arming deadline skips
            the intro. */}
        <source src="/videos/ndcc-logo-reveal.webm" type="video/webm" />
        <source src="/videos/ndcc-logo-reveal.mp4" type="video/mp4" />
      </video>
      <button
        type="button"
        onClick={dismiss}
        className="absolute bottom-6 right-6 rounded-full border border-black/15 bg-white/70 px-5 py-2 font-body text-sm font-semibold text-gray-700 shadow-sm backdrop-blur transition-colors hover:bg-white hover:text-maroon-800 focus-ring"
      >
        Skip intro
      </button>
    </div>
  );
}
