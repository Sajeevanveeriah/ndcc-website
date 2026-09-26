'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ShoppingBag, HeartHandshake, Newspaper, Utensils, Ticket, UserRound, Settings, Trophy, ClipboardList } from 'lucide-react';
import Button from '@/components/ui/Button';
import UpcomingEventsStrip from '@/components/calendar/UpcomingEventsStrip';
import AddToCalendarButton from '@/components/calendar/AddToCalendarButton';
import type { CalendarFeedEvent } from '@/lib/calendar/types';
import MemberInterests from './MemberInterests';
import MemberPurchases from './MemberPurchases';
import ShareLink from './ShareLink';
import AccountSettings from './AccountSettings';
import MemberBalance from './MemberBalance';
import MemberDinoCoach from './MemberDinoCoach';

type Section = 'overview' | 'purchases' | 'dino' | 'interests' | 'details' | 'volunteer';
type News = { id: string; title: string; published_at: string | null };
const sections = [
  ['overview', 'Overview', CalendarDays], ['purchases', 'My purchases and tickets', ShoppingBag], ['dino', 'Dino Coach', Trophy],
  ['interests', 'My interests', HeartHandshake], ['details', 'My details', UserRound], ['volunteer', 'Volunteer tools', ClipboardList],
] as const;
const services = [
  { href: '/events', title: 'Events and tickets', detail: 'See what is coming up and book your place.', icon: Ticket },
  { href: '/kitchen', title: 'Club meals', detail: 'Check the menu and order for collection.', icon: Utensils },
  { href: '/merchandise', title: 'Apparel and merchandise', detail: 'Browse club clothing and place an order.', icon: ShoppingBag },
  { href: '/publications', title: 'Newsletters and reports', detail: 'Read the latest club publications.', icon: Newspaper },
  { href: '/player-registration', title: 'Playing cricket', detail: 'Find player registration information.', icon: UserRound },
  { href: '/join', title: 'Social membership', detail: 'Explore membership options and apply.', icon: HeartHandshake },
  { href: '/pot-club', title: 'Pot Club', detail: 'Find out about the club glass and drinks offer.', icon: Ticket },
  { href: '/volunteer', title: 'Help around the club', detail: 'Let the committee know how you can help.', icon: HeartHandshake },
];
export default function MemberDashboard({ email, name, status, profileComplete, children }: {
  email: string; name: string; status: string; profileComplete: boolean; children: React.ReactNode;
}) {
  const [section, setSection] = useState<Section>(profileComplete ? 'overview' : 'details');
  const [news, setNews] = useState<News[] | null>(null); const [events, setEvents] = useState<CalendarFeedEvent[] | null>(null);
  const [newsError, setNewsError] = useState(false); const [eventsError, setEventsError] = useState(false); const [retry, setRetry] = useState(0);
  const [dinoEnabled, setDinoEnabled] = useState(false);
  useEffect(() => {
    // The Dino Coach tab only appears once its public launch is enabled.
    let active = true;
    fetch('/api/public/dino-coach-status', { cache: 'no-store' }).then(response => response.json())
      .then(data => { if (active) setDinoEnabled(data?.enabled === true); }).catch(() => { if (active) setDinoEnabled(false); });
    return () => { active = false; };
  }, []);
  const visibleSections = sections.filter(([key]) => (key !== 'dino' || dinoEnabled) && (key !== 'volunteer' || status === 'active'));
  const activeSection: Section = visibleSections.some(([key]) => key === section) ? section : 'overview';
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    setNewsError(false); setEventsError(false);
    async function load(path: string) {
      const response = await fetch(path, { cache: 'no-store', signal: controller.signal });
      const data = await response.json();
      if (!response.ok || data.success === false || data.degraded || !Array.isArray(data.data)) throw new Error('Content unavailable');
      return data.data;
    }
    void Promise.allSettled([
      load('/api/public/news?limit=3').then(data => { if (active) setNews(data); }).catch(() => { if (active) setNewsError(true); }),
      load('/api/public/calendar/upcoming?limit=2').then(data => { if (active) setEvents(data); }).catch(() => { if (active) setEventsError(true); }),
    ]).finally(() => clearTimeout(timeout));
    return () => { active = false; controller.abort(); clearTimeout(timeout); };
  }, [retry]);
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-edge-subtle bg-surface-card p-5 sm:p-7">
      <div className="min-w-0"><p className="text-sm font-semibold text-maroon-700 dark:text-maroon-200">Your club, in one place</p><h2 className="mt-2 font-display text-2xl font-bold">{profileComplete && name ? `Welcome, ${name.split(' ')[0]}` : 'Make yourself at home'}</h2><p className="mt-2 break-words text-sm text-content-secondary">{email}</p></div>
      <div className="rounded-xl bg-surface-muted px-4 py-3 text-sm"><p className="font-semibold">{!profileComplete ? 'Add your details to get started' : status === 'active' ? 'Club record: active' : status === 'inactive' ? 'Club record: inactive' : 'Club record: awaiting review'}</p><p className="mt-1 max-w-xs text-content-secondary">{!profileComplete ? 'Save your name and membership interest below.' : status === 'pending' ? 'You can use your account while the club reviews your details.' : 'Playing registration and membership payments are managed separately.'}</p></div>
    </div>
    <nav aria-label="My account sections" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">{visibleSections.map(([key, label, Icon]) => <button type="button" key={key} aria-pressed={activeSection === key} onClick={() => setSection(key)} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition-colors ${activeSection === key ? 'border-maroon-700 bg-maroon-700 text-white' : 'border-edge-subtle bg-surface-card text-content-primary hover:bg-surface-muted'}`}><Icon className="h-4 w-4 shrink-0" aria-hidden="true" />{label}</button>)}</nav>
    <div className="min-w-0 rounded-2xl border border-edge-subtle bg-surface-card p-4 sm:p-7">
      {activeSection === 'details' && <section aria-labelledby="member-details-heading" className="max-w-2xl space-y-5"><div><h2 id="member-details-heading" className="text-2xl font-bold">My details</h2><p className="mt-2 text-content-secondary">Keep your contact details current so the club can reach you when it needs to.</p></div>{children}<div className="flex flex-wrap gap-4 border-t border-edge-subtle pt-5"><Link className="inline-flex items-center gap-2 underline" href="/club-account/reset-password"><Settings className="h-4 w-4" aria-hidden="true" />Change my password</Link><Link className="underline" href="/privacy">How the club uses your details</Link><Link className="underline" href="/contact">Ask about my account</Link></div><AccountSettings email={email} /></section>}
      {activeSection === 'purchases' && <MemberPurchases email={email} />}
      {activeSection === 'dino' && <MemberDinoCoach />}
      {activeSection === 'interests' && <MemberInterests profileComplete={profileComplete} editProfile={() => setSection('details')} />}
      {activeSection === 'overview' && <div className="space-y-8">
        {!profileComplete && <div className="rounded-xl bg-surface-muted p-4"><p className="font-semibold">Finish setting up your account</p><p className="my-2 text-sm">Save your details, then choose your interests and how you would like to help.</p><Button size="sm" onClick={() => setSection('details')}>Complete my details</Button></div>}
        <MemberBalance showPurchases={() => setSection('purchases')} />
        <section aria-labelledby="member-actions-heading"><h2 id="member-actions-heading" className="text-2xl font-bold">What would you like to do?</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{services.map(({ href, title, detail, icon: Icon }) => <Link href={href} key={href} className="group rounded-xl border border-edge-subtle p-4 transition-colors hover:border-maroon-400 hover:bg-surface-muted"><Icon className="mb-3 h-5 w-5 text-maroon-700 dark:text-maroon-200" aria-hidden="true" /><h3 className="font-semibold group-hover:underline">{title}</h3><p className="mt-2 text-sm leading-relaxed text-content-secondary">{detail}</p></Link>)}</div></section>
        <div className="grid gap-8 lg:grid-cols-2">
          <section aria-labelledby="member-events-heading"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 id="member-events-heading" className="text-xl font-bold">Coming up at the club</h2><Link href="/calendar" className="text-sm underline">Full calendar</Link></div>
            {eventsError ? <p role="alert">The calendar is temporarily unavailable. <button className="underline" onClick={() => setRetry(retry + 1)}>Retry club updates</button></p> : events === null ? <p role="status">Loading events...</p> : <UpcomingEventsStrip events={events} compact showViewAll={false} emptyMessage="No upcoming events have been published yet. Check back soon." />}
            <div className="mt-5"><AddToCalendarButton /></div>
          </section>
          <section aria-labelledby="member-news-heading"><div className="mb-4 flex items-center justify-between gap-3"><h2 id="member-news-heading" className="text-xl font-bold">Latest club updates</h2><Link href="/news" className="text-sm underline">All news</Link></div>
            {newsError ? <p role="alert">Club updates are temporarily unavailable. <button className="underline" onClick={() => setRetry(retry + 1)}>Retry club updates</button></p> : news === null ? <p role="status">Loading club updates...</p> : news.length === 0 ? <p>No club updates have been published yet.</p> : <ul className="divide-y divide-edge-subtle">{news.map(post => <li key={post.id} className="space-y-3 py-4 first:pt-0"><Link href={`/news/${encodeURIComponent(post.id)}`} className="font-semibold hover:underline">{post.title}</Link>{post.published_at && <p className="text-xs text-content-secondary">{new Date(post.published_at).toLocaleDateString('en-AU', { timeZone: 'Australia/Melbourne', day: 'numeric', month: 'long' })}</p>}<ShareLink path={`/news/${encodeURIComponent(post.id)}`} title={post.title} /></li>)}</ul>}
          </section>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-surface-muted p-5"><div><h2 className="font-semibold">Help us send you useful information</h2><p className="mt-1 text-sm text-content-secondary">Choose your interests and tell us if you would like to volunteer.</p></div><Button variant="secondary" onClick={() => setSection('interests')}>Choose my interests</Button></div>
      </div>}
      {activeSection === 'volunteer' && <section aria-labelledby="member-volunteer-heading" className="max-w-2xl space-y-5">
        <div><h2 id="member-volunteer-heading" className="text-2xl font-bold">Volunteer tools</h2><p className="mt-2 text-content-secondary">Tools for active club members helping at club events.</p></div>
        <ul className="space-y-4">
          <li className="rounded-xl border border-edge-subtle p-4"><Link className="font-semibold underline" href="/raffle/cash">Record trailer raffle cash sales</Link><p className="mt-2 text-sm text-content-secondary">Record cash only after collecting it, then hand the money to the club.</p></li>
          <li className="rounded-xl border border-edge-subtle p-4"><Link className="font-semibold underline" href="/volunteer">Help around the club</Link><p className="mt-2 text-sm text-content-secondary">Let the committee know how you can help.</p></li>
        </ul>
      </section>}
    </div>
  </div>;
}
