import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact Us',
  description:
    'Contact the Newcomb and District Cricket Club (NDCC Dinos) at Grinter Reserve, 141 Coppards Road, Moolap VIC 3224.',
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
