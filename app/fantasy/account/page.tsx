import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { FantasyAuthForm } from '../_components/FantasyAuthForms';
import FantasyBackLink from '@/components/fantasy/FantasyBackLink';
export const metadata: Metadata = pageMetadata('/fantasy/account', 'Dino Coach Account', 'Manage your Dino Coach account.');
export default function FantasyAccountPage() {
  return <section className="section-padding"><div className="container-width max-w-2xl"><FantasyBackLink /><h1 className="section-title">My Dino Coach account</h1><FantasyAuthForm mode="account" /></div></section>;
}
