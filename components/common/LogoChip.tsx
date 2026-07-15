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
  /** CMS-selected plate mode: auto | light | dark | neutral | transparent. */
  surfaceMode?: string | null;
  /** Optional CMS override for plate padding (Tailwind class, e.g. 'p-3'). */
  paddingClassName?: string | null;
  /** Optional CMS override for object-position (CSS value). */
  objectPosition?: string | null;
  /** Geometry and extras for the chip surface (height, width, radius, ring). */
  className?: string;
  imageClassName?: string;
  /** Rendered when src is missing or the image fails to load. */
  fallback?: ReactNode;
};

/**
 * Logo plate behind sponsor/partner logos. The plate is chosen per sponsor
 * (dark plate for light-text artwork like Bennett Racing, light plate
 * otherwise, or an explicit CMS mode) and does not follow the page theme, so
 * a transparent logo can never land on a background that matches its own text
 * colour. Artwork is never cropped, stretched, or colour-inverted.
 */
export default function LogoChip({
  name,
  src,
  alt,
  width = 190,
  height = 70,
  sizes,
  surfaceMode,
  paddingClassName,
  objectPosition,
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

  const safePadding = paddingClassName && /^p-(\d|\d\.5)$/.test(paddingClassName) ? paddingClassName : null;

  return (
    <div
      className={cn(
        'flex items-center justify-center overflow-hidden border',
        sponsorLogoSurfaceClass(name, surfaceMode),
        safePadding,
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
          className={cn('max-h-full max-w-full object-contain', imageClassName)}
          style={objectPosition ? { objectPosition } : undefined}
          fallback={brandedFallback}
        />
      ) : (
        brandedFallback
      )}
    </div>
  );
}
