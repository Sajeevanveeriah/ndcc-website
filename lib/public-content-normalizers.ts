type SeasonAppointmentImageMap = Record<string, string>;
type EventImageMap = Record<string, string>;
type NewsImageMap = Record<string, string>;

const SEASON_APPOINTMENT_IMAGE_MAP: SeasonAppointmentImageMap = {
  'craig hillgrove': '/images/season-appointments/2026-27/craig-hillgrove-head-coach-2026-27.webp',
  'kelsey allan': '/images/season-appointments/2026-27/kelsey-allan-womens-coach-2026-27.webp',
  'anthony quarrell': '/images/season-appointments/2026-27/anthony-quarrell-re-signed-2026-27.webp',
  'aaron morgan': '/images/season-appointments/2026-27/aaron-morgan-re-signed-2026-27.webp',
  'blake ritchie': '/images/season-appointments/2026-27/blake-ritchie-re-signed-2026-27.webp',
  'freddie norridge': '/images/season-appointments/2026-27/freddie-norridge-signed-2026-27.webp',
  'huey neild': '/images/season-appointments/2026-27/huey-neild-re-signed-2026-27.webp',
  'nathan keevil': '/images/season-appointments/2026-27/nathan-keevil-re-signed-2026-27.webp',
  'scott kirby': '/images/season-appointments/2026-27/scott-kirby-re-signed-2026-27.webp',
};

const SEASON_APPOINTMENT_LEGACY_IMAGE_PATHS = new Set([
  '/images/Craig_Hillgrove.png',
  '/images/Kelsey_Allan.png',
]);

const GALLERY_LEGACY_TITLE = '2025/2026 Div. 4 1st XI Premiership';
const GALLERY_DISPLAY_TITLE = '2025/26 Division 4 1st XI Premiership';
const GALLERY_IMAGE_PATH = '/images/achievements/2025-26/division-4-first-xi-premiers-2025-26.webp';
const INVALID_PUBLIC_IMAGE_PATHS = new Set([
  '/images/events/2026/agm-2026.png',
]);
const EVENT_IMAGE_MAP: EventImageMap = {
  'dino lotto 2026': '/images/events/2026/dino-lotto-2026.webp',
};
const NEWS_IMAGE_MAP: NewsImageMap = {
  'dino lotto 2026': '/images/events/2026/dino-lotto-2026.webp',
  'apparel sponsorship 2026/27': '/images/sponsors/2026-27/apparel-sponsorship-2026-27.webp',
  'club championship winners 2025/26': '/images/achievements/2025-26/club-championship-winners-2025-26.webp',
  'u13 juniors premiers 2025/26': '/images/achievements/2025-26/u13-juniors-premiers-2025-26.webp',
  'division 4 first xi premiers 2025/26': '/images/achievements/2025-26/division-4-first-xi-premiers-2025-26.webp',
  '2025/26 division 4 1st xi premiership': '/images/achievements/2025-26/division-4-first-xi-premiers-2025-26.webp',
  '2025/2026 div. 4 1st xi premiership': '/images/achievements/2025-26/division-4-first-xi-premiers-2025-26.webp',
};

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeSeasonAppointmentImage(name: string, imageUrl?: string | null) {
  const mappedImage = SEASON_APPOINTMENT_IMAGE_MAP[normalizeName(name)];
  if (!mappedImage) return imageUrl ?? null;

  const normalizedImageUrl = imageUrl?.trim() ?? '';
  if (!normalizedImageUrl || SEASON_APPOINTMENT_LEGACY_IMAGE_PATHS.has(normalizedImageUrl)) {
    return mappedImage;
  }

  return normalizedImageUrl;
}

export function isPublicNewsPostAllowed(title: string) {
  return normalizeName(title) !== 'test article';
}

export function normalizeEventImage(title: string, imageUrl?: string | null) {
  const normalizedImageUrl = imageUrl?.trim() ?? '';
  if (normalizedImageUrl) {
    if (!INVALID_PUBLIC_IMAGE_PATHS.has(normalizedImageUrl)) return normalizedImageUrl;
  }
  const mappedImage = EVENT_IMAGE_MAP[normalizeName(title)] ?? null;
  return mappedImage && !INVALID_PUBLIC_IMAGE_PATHS.has(mappedImage) ? mappedImage : null;
}

export function normalizeNewsImage(title: string, imageUrl?: string | null) {
  const normalizedImageUrl = imageUrl?.trim() ?? '';
  if (normalizedImageUrl) {
    if (!INVALID_PUBLIC_IMAGE_PATHS.has(normalizedImageUrl)) return normalizedImageUrl;
  }
  const mappedImage = NEWS_IMAGE_MAP[normalizeName(title)] ?? null;
  return mappedImage && !INVALID_PUBLIC_IMAGE_PATHS.has(mappedImage) ? mappedImage : null;
}

type PublicGalleryItem = {
  title: string;
  caption: string;
  image_url: string;
};

export function normalizeGalleryImage<T extends PublicGalleryItem>(item: T): T {
  const normalizedTitle = normalizeName(item.title);
  if (normalizedTitle !== normalizeName(GALLERY_LEGACY_TITLE)) return item;

  return {
    ...item,
    title: GALLERY_DISPLAY_TITLE,
    caption: normalizeName(item.caption) === normalizeName(GALLERY_LEGACY_TITLE) ? GALLERY_DISPLAY_TITLE : item.caption,
    image_url: GALLERY_IMAGE_PATH,
  };
}
