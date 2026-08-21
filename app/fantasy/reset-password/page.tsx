import type { Metadata } from 'next';
import ResetPasswordForm from '../_components/ResetPasswordForm';
import FantasyBackLink from '@/components/fantasy/FantasyBackLink';
export const metadata: Metadata = { title: 'Reset Dino Coach Password' };
export default function FantasyResetPasswordPage() {
  return <section className="section-padding"><div className="container-width max-w-2xl"><FantasyBackLink /><h1 className="section-title">Reset your Dino Coach password</h1><p className="font-body text-content-secondary mb-6">Set a new password for your public Dino Coach account.</p><ResetPasswordForm /></div></section>;
}
