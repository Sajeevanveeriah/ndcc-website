import type { Metadata } from 'next';
import SquadBuilder from '../_components/SquadBuilder';
export const metadata: Metadata = { title: 'My Fantasy Squad' };
export default function FantasySquadPage() { return <section className="section-padding"><div className="container-width"><h1 className="section-title">My Squad</h1><SquadBuilder /></div></section>; }
