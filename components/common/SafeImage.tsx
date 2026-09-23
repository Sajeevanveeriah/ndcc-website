'use client';

import { useState, type ImgHTMLAttributes, type ReactNode } from 'react';
import Image, { type ImageProps } from 'next/image';
import { normaliseMediaUrl } from '@/lib/media-url';

type SafeImageProps = ImageProps & {
  fallback: ReactNode;
};

const NEXT_IMAGE_ONLY_PROPS = [
  'fill',
  'loader',
  'quality',
  'priority',
  'placeholder',
  'blurDataURL',
  'unoptimized',
  'overrideSrc',
  'onLoadingComplete',
  'layout',
  'objectFit',
  'objectPosition',
  'lazyBoundary',
  'lazyRoot',
] as const;

// Hosts the Next.js image optimiser is allowed to fetch. MUST mirror
// next.config.mjs `images.remotePatterns` (all https, any path). Absolute URLs
// on these hosts go through next/image (resized, WebP); any other host keeps
// the raw <img> path, because next/image throws for unconfigured hosts. If a
// host is removed from next.config.mjs, remove it here too.
const OPTIMISED_REMOTE_HOSTS = new Set([
  'alduwuipmmnzorcgkcli.supabase.co',
  'mbrcricket.com',
  'leopoldsporties.com',
  'www.blackmansbrewery.com.au',
  'phoenixtruckbodies.com.au',
  'www.swlocksmiths.com.au',
]);

// A fill image without `sizes` makes the browser assume 100vw and download the
// widest candidate; callers should pass real sizes, this is the safe default.
const DEFAULT_FILL_SIZES = '100vw';

function isOptimisableRemote(src: string) {
  try {
    const url = new URL(src);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && OPTIMISED_REMOTE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function hasNumericDimension(value: unknown) {
  return (typeof value === 'number' && Number.isFinite(value) && value > 0)
    || (typeof value === 'string' && /^\d+$/.test(value) && Number(value) > 0);
}

export default function SafeImage({ fallback, src, alt, ...props }: SafeImageProps) {
  src = typeof src === 'string' ? normaliseMediaUrl(src) : src;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const currentSrc = typeof src === 'string' ? src : null;

  if (!src || (currentSrc && failedSrc === currentSrc)) {
    return <>{fallback}</>;
  }

  const isAbsolute = Boolean(currentSrc && /^https?:\/\//i.test(currentSrc));
  // next/image needs either `fill` or both dimensions; anything else keeps the
  // raw <img> path so an unexpected call site can never throw at render.
  const canUseNextImage = Boolean(props.fill) || (hasNumericDimension(props.width) && hasNumericDimension(props.height));

  if (currentSrc && isAbsolute && !(isOptimisableRemote(currentSrc) && canUseNextImage)) {
    const imgProps = { ...props } as ImgHTMLAttributes<HTMLImageElement> & Record<string, unknown>;
    const fill = Boolean(imgProps.fill);
    const width = imgProps.width;
    const height = imgProps.height;
    const className = typeof imgProps.className === 'string' ? imgProps.className : '';
    for (const prop of NEXT_IMAGE_ONLY_PROPS) delete imgProps[prop];

    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        {...imgProps}
        loading={props.priority ? 'eager' : props.loading || 'lazy'}
        decoding={props.decoding || 'async'}
        fetchPriority={props.fetchPriority || (props.priority ? 'high' : undefined)}
        src={currentSrc}
        alt={alt}
        className={fill ? `absolute inset-0 h-full w-full ${className}`.trim() : className || undefined}
        width={!fill ? width : undefined}
        height={!fill ? height : undefined}
        onError={(event) => {
          props.onError?.(event);
          setFailedSrc(currentSrc);
        }}
      />
    );
  }

  return (
    <Image
      {...props}
      sizes={props.sizes || (props.fill ? DEFAULT_FILL_SIZES : undefined)}
      src={src}
      alt={alt}
      onError={(event) => {
        props.onError?.(event);
        if (currentSrc) setFailedSrc(currentSrc);
      }}
    />
  );
}
