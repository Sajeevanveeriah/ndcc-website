import { redirect } from 'next/navigation';

// Friendly entry point: /newsletters lands on the publications archive
// pre-filtered to newsletters.
export const dynamic = 'force-dynamic';

export default function NewslettersPage() {
  redirect('/publications?type=monthly_newsletter');
}
