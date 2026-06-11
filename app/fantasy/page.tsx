import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ShieldCheck, Trophy } from 'lucide-react';
import Card, { CardContent } from '@/components/ui/Card';
import ScrollReveal, { ScrollRevealItem } from '@/components/common/ScrollReveal';
import { CLUB_NICKNAME, CLUB_SHORT } from '@/lib/constants';
import { FANTASY_MODULES } from '@/lib/fantasy';

export const metadata: Metadata = {
  title: 'Fantasy Cricket',
  description: 'NDCC Fantasy Cricket for squads, transfers, leagues, player scores, and manager leaderboard.',
};

export default function FantasyPage() {
  return (
    <>
      <section className="page-hero"><div className="container-width"><p className="text-sm font-body font-semibold uppercase tracking-[0.25em] text-maroon-100 mb-3">{CLUB_SHORT} Dinos</p><ScrollReveal onMount delay={0}><h1 className="page-hero-title">Fantasy Cricket</h1></ScrollReveal><ScrollReveal onMount delay={0.15}><p className="page-hero-subtitle">Pick your NDCC fantasy squad, follow published player scores, make transfers, and compete in classic private leagues.</p></ScrollReveal></div></section>
      <section className="section-padding"><div className="container-width"><ScrollReveal className="grid grid-cols-1 lg:grid-cols-3 gap-8"><div className="lg:col-span-2"><h2 className="section-title">Built for the {CLUB_NICKNAME}</h2><div className="space-y-4 text-gray-700 font-body leading-relaxed max-w-3xl"><p>NDCC Fantasy Cricket is a club-branded game for members, players, families, and supporters. Public fantasy manager accounts are separate from committee admin access.</p><p>Squads, transfers, chips, private leagues, player leaderboard and manager leaderboard are powered by approved fantasy data and published match-stat imports.</p></div><div className="mt-8 flex flex-col sm:flex-row gap-3"><Link href="/fantasy/register" className="btn-primary">Register / Login<ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></Link><Link href="/fantasy/manager-leaderboard" className="btn-secondary">Manager Leaderboard<Trophy className="ml-2 h-4 w-4" aria-hidden="true" /></Link></div></div><Card className="border-l-4 border-l-maroon-700"><CardContent className="p-6"><ShieldCheck className="h-10 w-10 text-maroon-700 mb-4" aria-hidden="true" /><h2 className="text-2xl font-display font-bold text-gray-900 mb-3">Safe club scope</h2><ul className="space-y-3 text-sm text-gray-700 font-body leading-relaxed"><li>NDCC colours, language, and club identity only.</li><li>No public manager data is mixed with committee admin accounts.</li><li>Draft, reviewed, and rejected import batches stay out of public scoring views.</li></ul></CardContent></Card></ScrollReveal></div></section>
      <section className="section-padding surface-sky"><div className="container-width"><h2 className="section-title">Fantasy actions</h2><ScrollReveal stagger className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{FANTASY_MODULES.map((module) => (<ScrollRevealItem key={module.href}><Link href={module.href}><Card hover className="h-full"><CardContent className="p-6"><h3 className="text-xl font-display font-bold text-gray-900 mb-2">{module.title}</h3><p className="font-body text-gray-700">{module.description}</p></CardContent></Card></Link></ScrollRevealItem>))}</ScrollReveal></div></section>
    </>
  );
}
