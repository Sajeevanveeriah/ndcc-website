'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Card, { CardContent, CardFooter } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { Event } from '@/lib/types';
import { formatDate, formatCurrency } from '@/lib/utils';
import { FACEBOOK_URL } from '@/lib/constants';

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

  useEffect(() => {
    document.title = 'Events | NDCC Dinos';

    async function fetchEvents() {
      try {
        if (!isSupabaseConfigured()) {
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('events')
          .select('*')
          .eq('published', true)
          .order('date', { ascending: true });

        if (!error && data) {
          setEvents(data as Event[]);
        }
      } catch {
        // Supabase query failed, show empty state
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
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : events.length > 0 ? (
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
                    <Link
                      href={`/events/${event.id}`}
                      className="btn-primary text-sm px-4 py-2"
                    >
                      View Details
                    </Link>
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500 font-body text-lg">No upcoming events at the moment.</p>
              <p className="text-gray-400 font-body mt-2">
                Follow us on{' '}
                <Link href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer" className="text-maroon-700 hover:underline">
                  Facebook
                </Link>
                {' '}for updates.
              </p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
