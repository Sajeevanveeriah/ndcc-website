'use client';

import Image from 'next/image';
import { Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

// 720p web copies of club videos, each with a still as its poster. The page
// shows only the poster until someone presses play, so neither video is
// fetched by visits that skip it. The browser downloads just the first copy it
// can play: H.264 MP4, or VP9 WebM for browsers without H.264 (open-source
// Chromium, some Linux Firefox builds).
export type SeasonVideo = {
  mp4: string;
  webm: string;
  poster: string;
  posterAlt: string;
  title: string;
  caption: string;
  kind: string;
  duration: string;
  durationSpoken: string;
};

// 2025/26 season slideshow (Share Rev04), with the title card as its poster.
export const SEASON_SLIDESHOW: SeasonVideo = {
  mp4: '/media/20260928-NDCC-Season-Slideshow-Web-Rev00.mp4',
  webm: '/media/20260928-NDCC-Season-Slideshow-Web-Rev00.webm',
  poster: '/media/20260928-NDCC-Season-Slideshow-Poster-Rev00.webp',
  posterAlt: 'Title card: the Newcomb and District Cricket Club dinosaur badge above the words The 2025/26 Season, Grinter Reserve, Moolap',
  title: 'The 2025/26 season',
  caption: 'The 2025/26 season in photos',
  kind: 'Slideshow',
  duration: '5:12',
  durationSpoken: '5 minutes 12 seconds',
};

// 2026/27 season launch presentation (Season-Launch Rev04), with its opening
// slide as the poster.
export const SEASON_LAUNCH: SeasonVideo = {
  mp4: '/media/20260928-NDCC-Season-Launch-Web-Rev00.mp4',
  webm: '/media/20260928-NDCC-Season-Launch-Web-Rev00.webm',
  poster: '/media/20260928-NDCC-Season-Launch-Poster-Rev00.webp',
  posterAlt: 'Opening slide: the Newcomb and District Cricket Club badge above the words 2026/27 Season Launch, More Than the Flag, beside a photo of players celebrating with the premiership cup',
  title: 'The 2026/27 season launch',
  caption: 'More Than the Flag: the 2026/27 season launch',
  kind: 'Presentation',
  duration: '1:45',
  durationSpoken: '1 minute 45 seconds',
};

export default function SeasonHighlightsVideo({ video: clip = SEASON_SLIDESHOW }: { video?: SeasonVideo }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [failed, setFailed] = useState(false);

  // The source is set only once play is pressed. Each MP4 is H.264 High,
  // level 3.1 (avc1.64001F) with AAC: probe exactly that.
  useEffect(() => {
    const video = videoRef.current;
    if (!started || failed || !video || video.getAttribute('src')) return;
    video.src = video.canPlayType('video/mp4; codecs="avc1.64001F, mp4a.40.2"') ? clip.mp4 : clip.webm;
    void video.play().catch(() => undefined);
  }, [started, failed, clip]);

  return (
    <figure className="m-0 overflow-hidden rounded-2xl border border-edge-subtle bg-gray-900 shadow-[0_1px_2px_rgba(29,29,31,0.05),0_30px_60px_-30px_rgba(45,0,0,0.35)]">
      <div className="relative aspect-video w-full" onContextMenu={(event) => event.preventDefault()}>
        {started && !failed ? (
          <video
            ref={videoRef}
            poster={clip.poster}
            width={1280}
            height={720}
            controls
            autoPlay
            playsInline
            preload="none"
            // No download button, playback-speed menu or picture-in-picture pop-out.
            controlsList="nodownload noplaybackrate"
            disablePictureInPicture
            disableRemotePlayback
            aria-label={`${clip.title}: ${clip.kind.toLowerCase()} video`}
            className="absolute inset-0 h-full w-full bg-gray-900 object-contain"
            onError={() => {
              const video = videoRef.current;
              // Any load or decode failure lands here (not on a <source>). A
              // browser can claim H.264 and still fail: try the WebM once,
              // then show the message; the poster button offers a retry.
              if (video && video.getAttribute('src') === clip.mp4) {
                video.src = clip.webm;
                void video.play().catch(() => undefined);
                return;
              }
              setFailed(true);
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => { setFailed(false); setStarted(true); }}
            className="group absolute inset-0 block h-full w-full focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-maroon-500"
            aria-label={`Play ${clip.title} ${clip.kind.toLowerCase()} video (${clip.durationSpoken}, with sound)`}
          >
            <Image
              src={clip.poster}
              alt={clip.posterAlt}
              fill
              sizes="(min-width: 1152px) 1152px, 100vw"
              className="object-cover"
            />
            <span className="absolute inset-0 flex items-center justify-center bg-black/10 transition-colors group-hover:bg-black/25" aria-hidden="true">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-maroon-800/90 text-white shadow-lg ring-2 ring-white/80 sm:h-20 sm:w-20">
                <Play className="ml-1 h-7 w-7 sm:h-8 sm:w-8" fill="currentColor" />
              </span>
            </span>
          </button>
        )}
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-maroon-800 px-4 py-3 text-white">
        <span className="font-display text-base font-bold">{clip.caption}</span>
        <span className="text-sm text-white/80">{clip.kind} · {clip.duration} · sound on</span>
        {failed && <span role="status" className="w-full text-sm text-white">The video could not be played right now. Please try again later.</span>}
      </figcaption>
    </figure>
  );
}
