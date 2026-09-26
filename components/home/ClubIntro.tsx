'use client';

import Image from 'next/image';
import { LoaderCircle, Pause, Play, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

const VIDEO = '/media/20260912-NDCC-Logo-Reveal-Rev00.mp4';
// Same reveal in VP9 for browsers without H.264 (open-source Chromium, some Linux Firefox builds).
const VIDEO_WEBM = '/media/20260912-NDCC-Logo-Reveal-Rev00.webm';
const POSTER = '/media/20260912-NDCC-Logo-Reveal-Poster-Rev00.webp';
const SEEN_KEY = 'ndcc-logo-reveal-v1';

/** A still-first introduction: no video URL reaches the media loader until needed. */
export default function ClubIntro() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const attempted = useRef(false);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [shown, setShown] = useState(false);
  const [played, setPlayed] = useState(false);
  const [ended, setEnded] = useState(false);
  const [failed, setFailed] = useState(false);

  const play = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    attempted.current = true;
    setFailed(false);
    setLoading(true);
    setEnded(false);
    // The MP4 is H.264 High profile, level 3.1 (avc1.64001F): probe exactly that.
    if (!video.getAttribute('src')) video.src = video.canPlayType('video/mp4; codecs="avc1.64001F"') ? VIDEO : VIDEO_WEBM;
    if (video.ended) video.currentTime = 0;
    video.muted = true;
    void video.play().catch(() => {
      setLoading(false);
      setPlaying(false);
    });
  }, []);

  useEffect(() => {
    setReady(true);
    const video = videoRef.current;
    const frame = frameRef.current;
    if (!video || !frame) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    let visible = false;
    let disposed = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let idle: number | undefined;

    const seen = () => {
      try { return sessionStorage.getItem(SEEN_KEY) === '1'; }
      catch { return false; }
    };
    const eligible = () => !disposed && !attempted.current && visible &&
      document.visibilityState === 'visible' && !reducedMotion.matches &&
      !connection?.saveData && !['slow-2g', '2g', '3g'].includes(connection?.effectiveType || '') && !seen();

    const start = () => { if (eligible()) play(); };
    const schedule = () => {
      if (document.readyState !== 'complete' || !eligible() || timeout || idle) return;
      // Give critical images and page interactions a head start even on fast connections.
      timeout = setTimeout(() => {
        timeout = undefined;
        if ('requestIdleCallback' in window) {
          idle = window.requestIdleCallback(() => { idle = undefined; start(); });
        } else start();
      }, 1500);
    };
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') video.pause();
      else schedule();
    };
    const onMotion = () => {
      if (reducedMotion.matches) {
        video.pause();
        video.removeAttribute('src');
        video.load();
        setShown(false);
        setLoading(false);
      }
    };
    // Without IntersectionObserver, keep the still and let the visitor choose Play.
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && entry.intersectionRatio >= 0.25;
      if (visible) schedule();
      else video.pause();
    }, { threshold: 0.25 });
    observer?.observe(frame);
    window.addEventListener('load', schedule);
    document.addEventListener('visibilitychange', onVisibility);
    reducedMotion.addEventListener('change', onMotion);
    return () => {
      disposed = true;
      observer?.disconnect();
      window.removeEventListener('load', schedule);
      document.removeEventListener('visibilitychange', onVisibility);
      reducedMotion.removeEventListener('change', onMotion);
      if (timeout) clearTimeout(timeout);
      if (idle !== undefined) window.cancelIdleCallback(idle);
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [play]);

  return (
    <figure className="m-0 flex min-w-0 flex-col overflow-hidden rounded-3xl border border-edge-subtle bg-surface-muted shadow-[0_1px_2px_rgba(29,29,31,0.05),0_30px_60px_-30px_rgba(45,0,0,0.35)]" aria-label="NDCC dinosaur logo reveal">
      <div className="flex flex-1 items-center">
      <div ref={frameRef} className="relative aspect-video w-full overflow-hidden">
        <Image src={POSTER} alt="Newcomb and District Cricket Club dinosaur badge" fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-contain" priority />
        <video
          ref={videoRef}
          width={960}
          height={540}
          muted
          playsInline
          preload="none"
          aria-hidden="true"
          className={`absolute inset-0 h-full w-full object-contain ${shown ? 'opacity-100' : 'opacity-0'}`}
          onPlaying={() => {
            setShown(true);
            setPlaying(true);
            setLoading(false);
            setPlayed(true);
            try { sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* Playback also works with storage disabled. */ }
          }}
          onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setShown(false); setEnded(true); }}
          onError={() => {
            const video = videoRef.current;
            // A browser can claim H.264 support and still fail to decode it:
            // try the VP9 copy once before settling on the still badge.
            if (video && video.getAttribute('src') === VIDEO) {
              video.src = VIDEO_WEBM;
              void video.play().catch(() => {
                setLoading(false);
                setPlaying(false);
              });
              return;
            }
            setFailed(true);
            setLoading(false);
            setPlaying(false);
            setShown(false);
          }}
        />
      </div>
      </div>
      <figcaption className="relative isolate flex min-h-16 items-center justify-between gap-5 overflow-hidden bg-maroon-800 px-5 py-3 text-white">
        <svg aria-hidden="true" focusable="false" viewBox="0 0 180 120" className="pointer-events-none absolute -right-5 bottom-0 -z-10 h-full w-28 text-sky_accent sm:w-44">
          <path d="M0 0h28l62 76L152 0h28L90 112Z" fill="currentColor" />
        </svg>
        <span className="relative block pr-2 font-display text-xl font-bold tracking-wide">DINOS<span aria-hidden="true" className="sr-only" /></span>
        <span className="sr-only">A blue dinosaur walks into view and reveals the NDCC badge. This introduction has no sound.</span>
        {ready && !failed && (
          <button type="button" className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/70 bg-maroon-800 text-white transition-colors hover:bg-white hover:text-maroon-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white disabled:opacity-60" disabled={loading} onClick={() => playing ? videoRef.current?.pause() : play()} aria-label={loading ? 'Loading club intro' : playing ? 'Pause club intro' : ended ? 'Replay club intro' : played ? 'Resume club intro' : 'Play club intro'} title={loading ? 'Loading intro' : playing ? 'Pause intro' : ended ? 'Replay intro' : played ? 'Resume intro' : 'Play intro'}>
            {loading ? <LoaderCircle className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> : playing ? <Pause className="h-4 w-4" aria-hidden="true" /> : ended ? <RotateCcw className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
          </button>
        )}
        {/* The badge still stands in for the reveal, so the notice is for assistive technology only. */}
        {failed && <span role="status" className="sr-only">The club intro video could not be played. The badge image is shown instead.</span>}
      </figcaption>
    </figure>
  );
}
