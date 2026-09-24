import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { FantasyAuthForm } from '../_components/FantasyAuthForms';
import FantasyBackLink from '@/components/fantasy/FantasyBackLink';
export const metadata: Metadata = pageMetadata('/fantasy/register', 'Dino Coach Registration', 'Create your Dino Coach manager account.');
export default function FantasyRegisterPage() {
  return <section className="section-padding"><div className="container-width max-w-2xl"><FantasyBackLink /><h1 className="section-title">Register for Dino Coach</h1><p className="font-body text-content-secondary mb-6">Create your manager account, confirm your email and pay the AUD 25.00 entry fee to start picking your team. Registration stays open throughout the season. Join the same season-long league at any time and buy your squad at the current published prices. Points start from your first eligible locked round; earlier rounds are not backdated.</p><FantasyAuthForm mode="register" /></div></section>;
}
