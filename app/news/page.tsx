'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Card, { CardContent } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { supabase } from '@/lib/supabase';
import { NewsPost } from '@/lib/types';
import { formatDate, truncateText } from '@/lib/utils';

const PLACEHOLDER_NEWS: NewsPost[] = [
  {
    id: 'placeholder-1',
    title: 'Welcome to the New NDCC Website',
    content:
      'We are thrilled to launch the brand-new Newcomb and District Cricket Club website! This new platform has been built from the ground up to keep our members, supporters, and the wider Geelong cricket community up to date with everything happening at the Dinos. You will find fixtures, event information, merchandise, volunteer opportunities, and much more. We will be continually adding new features over the coming weeks, so check back often. Thank you to everyone who contributed to making this happen — especially our sponsors and the dedicated committee members who have driven this project forward.',
    author: 'NDCC Committee',
    published: true,
    published_at: '2026-03-01T09:00:00',
    created_at: '',
  },
  {
    id: 'placeholder-2',
    title: 'Training Facility Grand Opening',
    content:
      'The Peter "Skinny" Harrison Training Facility was officially opened in August 2024, marking a milestone moment for our club. Named in honour of one of our most beloved and long-serving members, the facility features three public synthetic lanes and four club turf lanes — giving our players access to first-class training surfaces right here at Grinter Reserve in Moolap. The new facility will be a game-changer for both senior and junior cricket development at the club, providing year-round training capability regardless of weather conditions. A huge thank you to everyone who supported the fundraising and construction effort.',
    author: 'NDCC Committee',
    published: true,
    published_at: '2026-02-15T10:00:00',
    created_at: '',
  },
  {
    id: 'placeholder-3',
    title: 'Season 2025/26 Registration Open',
    content:
      'Registration for the 2025/26 cricket season is now open for all teams — Senior Men (GCA Grade 4), Senior Women (GCA E Grade East), and Junior Boys. Whether you are a returning player or looking to join the Dinos for the first time, we would love to have you on board. Registrations are managed through PlayHQ. Head to our Contact page if you have any questions about joining the club, fees, or what to expect at your first training session. Pre-season training kicks off soon at our new facility at Grinter Reserve — details to follow.',
    author: 'NDCC Committee',
    published: true,
    published_at: '2026-01-20T08:30:00',
    created_at: '',
  },
];

function SkeletonCard() {
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="h-5 bg-gray-200 rounded w-3/4 animate-pulse" />
        <div className="h-3 bg-gray-200 rounded w-1/3 animate-pulse" />
        <div className="h-3 bg-gray-200 rounded w-full animate-pulse" />
        <div className="h-3 bg-gray-200 rounded w-5/6 animate-pulse" />
      </CardContent>
    </Card>
  );
}

export default function NewsPage() {
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingPlaceholders, setUsingPlaceholders] = useState(false);

  useEffect(() => {
    document.title = 'News & Announcements | NDCC Dinos';

    async function fetchNews() {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        if (!supabaseUrl) {
          setPosts(PLACEHOLDER_NEWS);
          setUsingPlaceholders(true);
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('news')
          .select('*')
          .eq('published', true)
          .order('published_at', { ascending: false });

        if (error || !data || data.length === 0) {
          setPosts(PLACEHOLDER_NEWS);
          setUsingPlaceholders(true);
        } else {
          setPosts(data as NewsPost[]);
        }
      } catch {
        setPosts(PLACEHOLDER_NEWS);
        setUsingPlaceholders(true);
      } finally {
        setLoading(false);
      }
    }

    fetchNews();
  }, []);

  return (
    <>
      {/* Hero */}
      <section className="page-hero">
        <div className="container-width">
          <h1 className="page-hero-title">News &amp; Announcements</h1>
          <p className="page-hero-subtitle">
            Stay up to date with the latest from the Dinos — match reports, club updates,
            community news, and more.
          </p>
        </div>
      </section>

      {/* News List */}
      <section className="section-padding">
        <div className="container-width max-w-4xl mx-auto">
          {usingPlaceholders && (
            <div className="mb-8 p-4 bg-maroon-50 border border-maroon-200 rounded-lg">
              <p className="text-maroon-800 font-body text-sm">
                Showing sample articles. Live news will appear here once available.
              </p>
            </div>
          )}

          {loading ? (
            <div className="space-y-6">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : (
            <div className="space-y-6">
              {posts.map((post) => (
                <Card key={post.id} hover>
                  <CardContent className="p-6">
                    <div className="flex flex-wrap items-center gap-3 mb-3">
                      {post.published_at && (
                        <Badge variant="default">{formatDate(post.published_at)}</Badge>
                      )}
                      <span className="font-body text-sm text-gray-500">by {post.author}</span>
                    </div>
                    <h2 className="font-display font-bold text-gray-900 text-xl mb-3">
                      {usingPlaceholders ? (
                        post.title
                      ) : (
                        <Link
                          href={`/news/${post.id}`}
                          className="hover:text-maroon-700 transition-colors"
                        >
                          {post.title}
                        </Link>
                      )}
                    </h2>
                    <p className="font-body text-gray-600 leading-relaxed">
                      {truncateText(post.content, 200)}
                    </p>
                    {!usingPlaceholders && (
                      <Link
                        href={`/news/${post.id}`}
                        className="inline-flex items-center text-maroon-700 hover:text-maroon-500 font-body font-semibold text-sm mt-4 transition-colors"
                      >
                        Read More
                        <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                        </svg>
                      </Link>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {!loading && posts.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500 font-body text-lg">No news articles at the moment.</p>
              <p className="text-gray-400 font-body mt-2">Check back soon for updates!</p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
