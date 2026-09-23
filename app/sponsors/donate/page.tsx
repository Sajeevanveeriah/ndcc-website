import { notFound } from 'next/navigation';
import { getClubSettings } from '@/lib/club-settings';
import DonationForm from '@/components/donations/DonationForm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
// The root title template appends '| NDCC Dinos'.
export const metadata = { title: 'Donate', robots: { index: false, follow: true } };

export default async function DonatePage() {
  if (!(await getClubSettings()).donations_enabled) notFound();
  return <DonationForm />;
}
