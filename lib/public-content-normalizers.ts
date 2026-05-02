type SeasonAppointmentImageMap = Record<string, string>;

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

type PublicGalleryItem = {
  title: string;
  caption: string;
  image_url: string;
};

export function normalizeGalleryImage<T extends PublicGalleryItem>(item: T): T {
  if (item.title !== GALLERY_LEGACY_TITLE) return item;

  return {
    ...item,
    title: GALLERY_DISPLAY_TITLE,
    caption: item.caption === GALLERY_LEGACY_TITLE ? GALLERY_DISPLAY_TITLE : item.caption,
    image_url: GALLERY_IMAGE_PATH,
  };
}
