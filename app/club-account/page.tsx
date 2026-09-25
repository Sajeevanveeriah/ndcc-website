import type { Metadata } from 'next';
import ClubAccount from './ClubAccount';
export const metadata: Metadata = { title: 'My club account | NDCC', robots: { index: false, follow: false } };
export default function Page() { return <section className="section-padding"><div className="container-width max-w-2xl"><h1 className="section-title">My club account</h1><p className="mb-6">Keep your contact details up to date and find club news, events and services in one place.</p><ClubAccount /></div></section>; }
