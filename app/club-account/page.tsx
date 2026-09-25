import type { Metadata } from 'next';
import ClubAccount from './ClubAccount';
export const metadata: Metadata = { title: 'My club account', robots: { index: false, follow: false } };
export default function Page() { return <section className="section-padding"><div className="container-width max-w-6xl"><h1 className="section-title">My club account</h1><p className="mb-6">Your details, purchases and club updates, all in one place.</p><ClubAccount /></div></section>; }
