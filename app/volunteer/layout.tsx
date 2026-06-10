import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Volunteer',
  description:
    'Volunteer with the Newcomb and District Cricket Club (NDCC Dinos) — current volunteer positions and how to help.',
};

export default function VolunteerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
