import type { Metadata } from 'next';
import { FantasyAuthForm } from '../_components/FantasyAuthForms';
import FantasyBackLink from '@/components/fantasy/FantasyBackLink';
export const metadata: Metadata = { title: 'Dino Coach Login' };
export default function FantasyLoginPage() {
  return <section className="section-padding"><div className="container-width max-w-2xl"><FantasyBackLink /><h1 className="section-title">Dino Coach manager sign in</h1><p className="font-body text-content-secondary mb-6">Sign in with your public Dino Coach account.</p><FantasyAuthForm mode="login" /></div></section>;
}
