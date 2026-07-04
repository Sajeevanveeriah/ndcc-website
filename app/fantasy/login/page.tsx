import type { Metadata } from 'next';
import { FantasyAuthForm } from '../_components/FantasyAuthForms';
import FantasyBackLink from '@/components/fantasy/FantasyBackLink';
export const metadata: Metadata = { title: 'Fantasy Login' };
export default function FantasyLoginPage() {
  return <section className="section-padding"><div className="container-width max-w-2xl"><FantasyBackLink /><h1 className="section-title">Fantasy manager sign in</h1><p className="font-body text-gray-700 mb-6">Sign in with your public fantasy manager account.</p><FantasyAuthForm mode="login" /></div></section>;
}
