import type { Metadata } from 'next';
import SquadBuilder from '../_components/SquadBuilder';
export const metadata: Metadata = { title: 'My Fantasy Team' };
export default function FantasyTeamPage() { return <section className="section-padding"><div className="container-width"><h1 className="section-title">My Team</h1><p className="font-body text-gray-700 mb-6">Review your submitted squad, captain, vice-captain and bench order.</p><SquadBuilder readonlyMode /></div></section>; }
