'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

const VIDEO = '/media/20260912-NDCC-Logo-Reveal-Rev00.mp4';
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
  const [failed, setFailed] = useState(false);

  const play = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    attempted.current = true;
    setFailed(false);
    setLoading(true);
    if (!video.getAttribute('src')) video.src = VIDEO;
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
    <figure className="m-0 flex flex-col justify-center border-t-4 border-sky_accent bg-[#dedede] lg:border-l-4 lg:border-t-0" aria-label="NDCC dinosaur logo reveal">
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
          onEnded={() => { setPlaying(false); setShown(false); }}
          onError={() => {
            setFailed(true);
            setLoading(false);
            setPlaying(false);
            setShown(false);
          }}
        />
      </div>
      <figcaption className="flex min-h-14 items-center justify-between gap-3 px-5 py-3 text-sm text-gray-800">
        <span>Home of the Dinos.</span>
        <span className="sr-only">A blue dinosaur walks into view and reveals the NDCC badge. This introduction has no sound.</span>
        {ready && !failed && (
          <button type="button" className="rounded-md border border-gray-500 bg-white px-3 py-1.5 font-semibold text-gray-900 focus-ring hover:bg-gray-100 disabled:opacity-60" disabled={loading} onClick={() => playing ? videoRef.current?.pause() : play()} aria-label={playing ? 'Pause club intro' : played ? 'Replay or resume club intro' : 'Play club intro'}>
            {loading ? 'Loading...' : playing ? 'Pause' : played ? 'Replay / resume' : 'Play intro'}
          </button>
        )}
        {failed && <span role="status">Intro unavailable</span>}
      </figcaption>
    </figure>
  );
}
