import type { ReactNode } from 'react';
import SafeImage from '@/components/common/SafeImage';
import { sponsorLogoSurfaceClass } from '@/lib/sponsor-logo-surface';
import { cn } from '@/lib/utils';

type LogoChipProps = {
  name: string;
  src?: string | null;
  alt?: string;
  width?: number;
  height?: number;
  sizes?: string;
  /** Geometry and extras for the chip surface (height, width, radius, ring). */
  className?: string;
  imageClassName?: string;
  /** Rendered when src is missing or the image fails to load. */
  fallback?: ReactNode;
};

/**
 * Neutral plate behind sponsor/partner logos. The surface is chosen per
 * sponsor (dark plate for light-text artwork like Bennett Racing, white
 * plate otherwise) and stays the same in both themes, so a transparent
 * logo can never land on a background that matches its own text colour.
 */
export default function LogoChip({
  name,
  src,
  alt,
  width = 190,
  height = 70,
  sizes,
  className,
  imageClassName,
  fallback,
}: LogoChipProps) {
  const brandedFallback = fallback ?? (
    <div className="flex h-full w-full items-center justify-center rounded-xl bg-maroon-800 px-3 text-center">
      <span className="font-display text-sm font-bold uppercase leading-tight tracking-wide text-gold-200">
        {name}
      </span>
    </div>
  );

  return (
    <div
      className={cn(
        'flex items-center justify-center overflow-hidden border',
        sponsorLogoSurfaceClass(name),
        className
      )}
    >
      {src?.trim() ? (
        <SafeImage
          src={src}
          alt={alt ?? `${name} logo`}
          width={width}
          height={height}
          sizes={sizes}
          className={cn('object-contain', imageClassName)}
          fallback={brandedFallback}
        />
      ) : (
        brandedFallback
      )}
    </div>
  );
}
