import type { Metadata } from 'next';
import TransfersClient from '../_components/TransfersClient';
import FantasyBackLink from '@/components/fantasy/FantasyBackLink';
export const metadata: Metadata = { title: 'Fantasy Transfers' };
export default function FantasyTransfersPage() { return <section className="section-padding"><div className="container-width"><FantasyBackLink /><h1 className="section-title">Transfers and chips</h1><TransfersClient /></div></section>; }
