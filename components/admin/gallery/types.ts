export type AdminAlbum = {
  id: string;
  title: string;
  slug: string;
  description: string;
  event_date: string | null;
  season_label: string;
  cover_image_url: string | null;
  sort_order: number;
  allow_download: boolean;
  published: boolean;
  publish_confirmed_at: string | null;
  publish_confirmed_by: string | null;
  created_at: string;
  updated_at: string;
  image_count: number;
};

export type AdminGalleryImage = {
  id: string;
  title: string;
  caption: string;
  image_url: string;
  alt_text: string;
  sort_order: number;
  allow_download: boolean;
  published: boolean;
  album_id: string | null;
  storage_path: string | null;
  original_url: string | null;
  original_filename: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
};

export const PUBLISH_CONSENT_TEXT =
  'I confirm the club has authority to publish these photographs and that any required consent has been obtained.';
