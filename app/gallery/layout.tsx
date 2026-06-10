import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Gallery',
  description:
    'Photo gallery of the Newcomb and District Cricket Club (NDCC Dinos) — matches, events and club life.',
};

export default function GalleryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
