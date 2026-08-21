import type { Metadata } from 'next';
import { FantasyAuthForm } from '../_components/FantasyAuthForms';
import FantasyBackLink from '@/components/fantasy/FantasyBackLink';
export const metadata: Metadata = { title: 'Dino Coach Registration' };
export default function FantasyRegisterPage() {
  return <section className="section-padding"><div className="container-width max-w-2xl"><FantasyBackLink /><h1 className="section-title">Register for Dino Coach</h1><p className="font-body text-content-secondary mb-6">Use Supabase Auth for your Dino Coach manager sign in. This is separate from committee admin access.</p><FantasyAuthForm mode="register" /></div></section>;
}
