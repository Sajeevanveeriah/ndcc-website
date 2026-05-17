import type { Metadata } from 'next';
import { FantasyAuthForm } from '../_components/FantasyAuthForms';
export const metadata: Metadata = { title: 'Fantasy Account' };
export default function FantasyAccountPage() {
  return <section className="section-padding"><div className="container-width max-w-2xl"><h1 className="section-title">My fantasy account</h1><FantasyAuthForm mode="account" /></div></section>;
}
