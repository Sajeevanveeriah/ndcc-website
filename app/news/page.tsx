'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import Card, { CardContent } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { NewsPost } from '@/lib/types';
import { formatDate, truncateText } from '@/lib/utils';
import { SEED_NEWS } from '@/lib/constants';

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
  const [usingSeed, setUsingSeed] = useState(false);

  useEffect(() => {
    document.title = 'News & Announcements | NDCC Dinos';

    async function fetchNews() {
      try {
        if (!isSupabaseConfigured()) {
          setPosts(SEED_NEWS as NewsPost[]);
          setUsingSeed(true);
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('news')
          .select('*')
          .eq('published', true)
          .order('published_at', { ascending: false });

        if (!error && data && data.length > 0) {
          setPosts(data as NewsPost[]);
        } else {
          setPosts(SEED_NEWS as NewsPost[]);
          setUsingSeed(true);
        }
      } catch {
        setPosts(SEED_NEWS as NewsPost[]);
        setUsingSeed(true);
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
            Stay up to date with the latest from the Dinos - match reports, club updates,
            community news, and more.
          </p>
        </div>
      </section>

      {/* News List */}
      <section className="section-padding">
        <div className="container-width max-w-4xl mx-auto">
          {loading ? (
            <div className="space-y-6">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : (
            <div className="space-y-6">
              {posts.map((post) => (
                <Card key={post.id} hover className="overflow-hidden">
                  <div className={post.image ? 'md:flex' : ''}>
                    {post.image && (
                      <div className="relative w-full md:w-64 h-48 md:h-auto flex-shrink-0">
                        <Image
                          src={post.image}
                          alt={post.title}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 100vw, 256px"
                        />
                      </div>
                    )}
                    <CardContent className="p-6 flex-1">
                      <div className="flex flex-wrap items-center gap-3 mb-3">
                        {post.published_at && (
                          <Badge variant="default">{formatDate(post.published_at)}</Badge>
                        )}
                        <span className="font-body text-sm text-gray-500">by {post.author}</span>
                      </div>
                      <h2 className="font-display font-bold text-gray-900 text-xl mb-3">
                        {usingSeed ? (
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
                      {!usingSeed && (
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
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
