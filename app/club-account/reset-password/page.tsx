import type { Metadata } from 'next';
import Link from 'next/link';
import ResetPasswordForm from '@/components/auth/ResetPasswordForm';

export const metadata: Metadata = {
  title: 'Reset your club account password | NDCC',
  robots: { index: false, follow: false },
};

export default function ClubResetPasswordPage() {
  return <section className="section-padding"><div className="container-width max-w-2xl">
    <Link href="/club-account" className="inline-block mb-6 underline">Back to my club account</Link>
    <h1 className="section-title">Reset your club account password</h1>
    <p className="font-body text-content-secondary mb-6">Set a new password to access your club account.</p>
    <ResetPasswordForm context="club" />
  </div></section>;
}
