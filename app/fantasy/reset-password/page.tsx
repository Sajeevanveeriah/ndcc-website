import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import ResetPasswordForm from '../_components/ResetPasswordForm';
import FantasyBackLink from '@/components/fantasy/FantasyBackLink';
export const metadata: Metadata = pageMetadata('/fantasy/reset-password', 'Reset Dino Coach Password', 'Set a new password for your public Dino Coach account.');
export default function FantasyResetPasswordPage() {
  return <section className="section-padding"><div className="container-width max-w-2xl"><FantasyBackLink /><h1 className="section-title">Reset your Dino Coach password</h1><p className="font-body text-content-secondary mb-6">Set a new password for your public Dino Coach account.</p><ResetPasswordForm /></div></section>;
}
