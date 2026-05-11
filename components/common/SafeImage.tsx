'use client';

import { useState, type ImgHTMLAttributes, type ReactNode } from 'react';
import Image, { type ImageProps } from 'next/image';

type SafeImageProps = ImageProps & {
  fallback: ReactNode;
};

const NEXT_IMAGE_ONLY_PROPS = [
  'fill',
  'loader',
  'quality',
  'priority',
  'loading',
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

export default function SafeImage({ fallback, src, alt, ...props }: SafeImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const currentSrc = typeof src === 'string' ? src : null;

  if (!src || (currentSrc && failedSrc === currentSrc)) {
    return <>{fallback}</>;
  }

  if (currentSrc && /^https?:\/\//i.test(currentSrc)) {
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
        src={currentSrc}
        alt={alt}
        className={fill ? `absolute inset-0 h-full w-full ${className}`.trim() : className || undefined}
        width={!fill && typeof width === 'number' ? width : undefined}
        height={!fill && typeof height === 'number' ? height : undefined}
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
      src={src}
      alt={alt}
      onError={(event) => {
        props.onError?.(event);
        if (currentSrc) setFailedSrc(currentSrc);
      }}
    />
  );
}
