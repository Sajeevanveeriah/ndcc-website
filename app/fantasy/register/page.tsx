import type { Metadata } from 'next';
import { FantasyAuthForm } from '../_components/FantasyAuthForms';
export const metadata: Metadata = { title: 'Fantasy Register' };
export default function FantasyRegisterPage() {
  return <section className="section-padding"><div className="container-width max-w-2xl"><h1 className="section-title">Register for NDCC Fantasy Cricket</h1><p className="font-body text-gray-700 mb-6">Use Supabase Auth for your public fantasy manager sign in. This is separate from committee admin access.</p><FantasyAuthForm mode="register" /></div></section>;
}
