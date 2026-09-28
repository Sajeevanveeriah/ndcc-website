'use client';

import Image from 'next/image';
import { Play } from 'lucide-react';
import { useState } from 'react';

// 720p web copies of the 2025/26 season slideshow (Share Rev04), with the
// title card as its poster. The page shows only the poster until someone
// presses play, so neither video is fetched by visits that skip it. The
// browser downloads just the first copy it can play: H.264 MP4, or VP9 WebM
// for browsers without H.264 (open-source Chromium, some Linux Firefox builds).
export const SEASON_SLIDESHOW_VIDEO = '/media/20260928-NDCC-Season-Slideshow-Web-Rev00.mp4';
const SEASON_SLIDESHOW_WEBM = '/media/20260928-NDCC-Season-Slideshow-Web-Rev00.webm';
const POSTER = '/media/20260928-NDCC-Season-Slideshow-Poster-Rev00.webp';
const TITLE = 'The 2025/26 season';

export default function SeasonHighlightsVideo() {
  const [started, setStarted] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <figure className="m-0 overflow-hidden rounded-2xl border border-edge-subtle bg-gray-900 shadow-[0_1px_2px_rgba(29,29,31,0.05),0_30px_60px_-30px_rgba(45,0,0,0.35)]">
      <div className="relative aspect-video w-full" onContextMenu={(event) => event.preventDefault()}>
        {started && !failed ? (
          <video
            poster={POSTER}
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
            aria-label={`${TITLE}: photo slideshow video`}
            className="absolute inset-0 h-full w-full bg-gray-900 object-contain"
          >
            <source src={SEASON_SLIDESHOW_VIDEO} type='video/mp4; codecs="avc1.64001F, mp4a.40.2"' />
            {/* Fires only when every source has failed (the last one's error). */}
            <source src={SEASON_SLIDESHOW_WEBM} type='video/webm; codecs="vp9, opus"' onError={() => setFailed(true)} />
          </video>
        ) : (
          <button
            type="button"
            onClick={() => { setFailed(false); setStarted(true); }}
            className="group absolute inset-0 block h-full w-full focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-maroon-500"
            aria-label={`Play ${TITLE} slideshow video (5 minutes 12 seconds, with sound)`}
          >
            <Image
              src={POSTER}
              alt=""
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
        <span className="font-display text-base font-bold">{TITLE} in photos</span>
        <span className="text-sm text-white/80">Slideshow · 5:12 · sound on</span>
        {failed && <span role="status" className="w-full text-sm text-white">The video could not be played right now. Please try again later.</span>}
      </figcaption>
    </figure>
  );
}
