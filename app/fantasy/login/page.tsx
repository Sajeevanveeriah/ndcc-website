import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { FantasyAuthForm } from '../_components/FantasyAuthForms';
import FantasyBackLink from '@/components/fantasy/FantasyBackLink';
// Sign-in / signed-in page: keep it out of search results but let crawlers
// follow its links.
export const metadata: Metadata = { ...pageMetadata('/fantasy/login', 'Dino Coach Login', 'Sign in with your public Dino Coach account.'), robots: { index: false, follow: true } };
export default function FantasyLoginPage() {
  return <section className="section-padding"><div className="container-width max-w-2xl"><FantasyBackLink /><h1 className="section-title">Dino Coach manager sign in</h1><p className="font-body text-content-secondary mb-6">Sign in with your public Dino Coach account.</p><FantasyAuthForm mode="login" /></div></section>;
}
