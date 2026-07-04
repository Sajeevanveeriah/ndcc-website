import type { Metadata } from 'next';
import LeaguesClient from '../_components/LeaguesClient';
import FantasyBackLink from '@/components/fantasy/FantasyBackLink';
export const metadata: Metadata = { title: 'Fantasy Leagues' };
export default function FantasyLeaguesPage(){return <section className="section-padding"><div className="container-width"><FantasyBackLink /><h1 className="section-title">Private classic leagues</h1><LeaguesClient /></div></section>;}
