'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Card, { CardContent, CardFooter } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { supabase } from '@/lib/supabase';
import { Event } from '@/lib/types';
import { formatDate, formatCurrency } from '@/lib/utils';

const PLACEHOLDER_EVENTS: Event[] = [
  {
    id: 'placeholder-1',
    title: 'Presentation Night',
    description:
      'Join us for our annual Presentation Night to celebrate the achievements of our players and volunteers. Awards for all teams, dinner included, and plenty of Dinos spirit. A great way to wrap up the season with your cricket family.',
    date: '2026-03-28T18:00:00',
    location: 'Grinter Reserve Clubrooms, Moolap',
    capacity: 120,
    ticket_price: 30,
    stripe_link: '',
    published: true,
    created_at: '',
  },
  {
    id: 'placeholder-2',
    title: 'Season Launch 2026/27',
    description:
      'Kick off the new cricket season with the Dinos! Meet the coaches, hear about plans for the season ahead, and register for your team. Free entry — all welcome, including new players and families looking to get involved.',
    date: '2026-09-12T14:00:00',
    location: 'Grinter Reserve, Moolap',
    capacity: null,
    ticket_price: 0,
    stripe_link: '',
    published: true,
    created_at: '',
  },
  {
    id: 'placeholder-3',
    title: 'Trivia Night',
    description:
      'Test your knowledge at our annual fundraising Trivia Night! Tables of 8, BYO nibbles, drinks available at the bar. All proceeds go towards junior cricket equipment and ground improvements.',
    date: '2026-11-14T19:00:00',
    location: 'Grinter Reserve Clubrooms, Moolap',
    capacity: 80,
    ticket_price: 20,
    stripe_link: '',
    published: true,
    created_at: '',
  },
];

function SkeletonCard() {
  return (
    <Card>
      <div className="h-3 bg-gray-200 rounded w-3/4 mx-6 mt-6 animate-pulse" />
      <div className="px-6 py-4 space-y-3">
        <div className="h-2.5 bg-gray-200 rounded w-1/2 animate-pulse" />
        <div className="h-2.5 bg-gray-200 rounded w-full animate-pulse" />
        <div className="h-2.5 bg-gray-200 rounded w-5/6 animate-pulse" />
      </div>
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
        <div className="h-8 bg-gray-200 rounded w-28 animate-pulse" />
      </div>
    </Card>
  );
}

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingPlaceholders, setUsingPlaceholders] = useState(false);

  useEffect(() => {
    document.title = 'Events | NDCC Dinos';

    async function fetchEvents() {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        if (!supabaseUrl) {
          setEvents(PLACEHOLDER_EVENTS);
          setUsingPlaceholders(true);
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('events')
          .select('*')
          .eq('published', true)
          .order('date', { ascending: true });

        if (error || !data || data.length === 0) {
          setEvents(PLACEHOLDER_EVENTS);
          setUsingPlaceholders(true);
        } else {
          setEvents(data as Event[]);
        }
      } catch {
        setEvents(PLACEHOLDER_EVENTS);
        setUsingPlaceholders(true);
      } finally {
        setLoading(false);
      }
    }

    fetchEvents();
  }, []);

  return (
    <>
      {/* Hero */}
      <section className="page-hero">
        <div className="container-width">
          <h1 className="page-hero-title">Events</h1>
          <p className="page-hero-subtitle">
            From presentation nights to trivia fundraisers, there&apos;s always something happening
            at the Dinos. Check out our upcoming events and get involved.
          </p>
        </div>
      </section>

      {/* Events Grid */}
      <section className="section-padding">
        <div className="container-width">
          {usingPlaceholders && (
            <div className="mb-8 p-4 bg-maroon-50 border border-maroon-200 rounded-lg">
              <p className="text-maroon-800 font-body text-sm">
                Showing sample events. Live event listings will appear here once available.
              </p>
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {events.map((event) => (
                <Card key={event.id} hover>
                  <div className="bg-gradient-to-br from-maroon-700 to-maroon-900 px-6 py-4">
                    <p className="text-maroon-200 font-body text-sm">{formatDate(event.date)}</p>
                    <h3 className="text-white font-display font-bold text-xl mt-1">{event.title}</h3>
                  </div>
                  <CardContent>
                    <div className="flex items-center gap-2 mb-3">
                      <svg className="w-4 h-4 text-maroon-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                      </svg>
                      <span className="font-body text-sm text-gray-600">{event.location}</span>
                    </div>
                    <p className="font-body text-gray-700 text-sm leading-relaxed mb-4">
                      {event.description.length > 150
                        ? event.description.slice(0, 150).trim() + '...'
                        : event.description}
                    </p>
                    <Badge variant={event.ticket_price === 0 ? 'success' : 'default'}>
                      {event.ticket_price === 0 ? 'Free Entry' : formatCurrency(event.ticket_price)}
                    </Badge>
                  </CardContent>
                  <CardFooter>
                    {usingPlaceholders ? (
                      <span className="font-body text-sm text-gray-500">Details coming soon</span>
                    ) : (
                      <Link
                        href={`/events/${event.id}`}
                        className="btn-primary text-sm px-4 py-2"
                      >
                        View Details
                      </Link>
                    )}
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}

          {!loading && events.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500 font-body text-lg">No upcoming events at the moment.</p>
              <p className="text-gray-400 font-body mt-2">Check back soon for new events!</p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
