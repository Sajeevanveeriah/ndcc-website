import type { Metadata } from 'next';
import ScrollReveal from '@/components/common/ScrollReveal';
import { getPublicGallery, type GalleryPhoto } from '@/lib/public-data';
import { fallbackGalleryImages } from '@/lib/fallback-content';
import GalleryClient from './GalleryClient';

export const metadata: Metadata = {
  title: 'Gallery',
};

export const revalidate = 300;

export default async function GalleryPage() {
  const { data: livePhotos, error } = await getPublicGallery();
  // On a Supabase cold start the query aborts; show the static fallback (real premiership
  // photos) instead of a diagnostic. Live CMS images are used whenever Supabase is warm.
  const photos = error ? (fallbackGalleryImages as GalleryPhoto[]) : livePhotos;

  return (
    <>
      <section className="page-hero">
        <div className="container-width">
          <ScrollReveal onMount delay={0}><h1 className="page-hero-title">Gallery</h1></ScrollReveal>
          <ScrollReveal onMount delay={0.15}><p className="page-hero-subtitle">
            Match day photos, team shots, and club memories, loaded server-side from published CMS records.
          </p></ScrollReveal>
        </div>
      </section>

      <GalleryClient photos={photos} error={null} />
    </>
  );
}
