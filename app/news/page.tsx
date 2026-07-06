import Link from 'next/link';
import SafeImage from '@/components/common/SafeImage';
import ScrollReveal from '@/components/common/ScrollReveal';
import Card, { CardContent } from '@/components/ui/Card';
import { getPublishedNews } from '@/lib/public-news';
import { fallbackNews, isProductionStaticBuild } from '@/lib/fallback-content';
import { isServerSupabaseConfigured } from '@/lib/supabase-server';
import { NewsPost } from '@/lib/types';
import { formatDate, truncateText } from '@/lib/utils';

export const revalidate = 300;

// Server-rendered from the tagged 'news' cache (admin saves call revalidateTag) so the
// page never paints seed content and swaps to live records after hydration. Fallback is
// reserved for build phase / unconfigured / query-failure paths only — a successful
// empty result renders the empty state.
async function loadPosts(): Promise<NewsPost[]> {
  if (isProductionStaticBuild || !isServerSupabaseConfigured()) return fallbackNews;
  try {
    const data = await getPublishedNews({});
    return (Array.isArray(data) ? data : []) as NewsPost[];
  } catch (err) {
    console.error('[news] Failed to load news; showing static fallback:', err);
    return fallbackNews;
  }
}

export default async function NewsPage() {
  const posts = await loadPosts();

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
          <div className="space-y-6">
            {posts.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-gray-500 font-body">
                  No published news articles yet.
                </CardContent>
              </Card>
            ) : (
              posts.map((post) => (
                <ScrollReveal key={post.id}>
                <Card hover className="overflow-hidden">
                  <div className={post.image_url || post.image ? 'md:flex' : ''}>
                    {(post.image_url || post.image) && (
                      <div className="w-full md:w-64 flex-shrink-0 bg-gray-50 p-2">
                        <SafeImage
                          src={post.image_url || post.image || '/images/Womens_Team.jpg'}
                          alt={post.title}
                          width={320}
                          height={200}
                          className="w-full h-48 md:h-full object-contain"
                          sizes="(max-width: 768px) 100vw, 256px"
                          fallback={<div className="w-full h-48 md:h-full rounded bg-gray-100" aria-hidden="true" />}
                        />
                      </div>
                    )}
                    <CardContent className="p-6 flex-1">
                      <div className="flex flex-wrap items-center gap-3 mb-3">
                        {post.published_at && (
                          <span className="font-body text-xs font-semibold uppercase tracking-[0.08em] text-maroon-600">{formatDate(post.published_at)}</span>
                        )}
                        <span className="font-body text-sm text-gray-500">by {post.author}</span>
                      </div>
                      <h2 className="font-display font-bold text-gray-900 text-xl mb-3">
                        <Link
                          href={`/news/${post.id}`}
                          className="hover:text-maroon-700 transition-colors"
                        >
                          {post.title}
                        </Link>
                      </h2>
                      <p className="font-body text-gray-600 leading-relaxed">
                        {truncateText(post.content, 200)}
                      </p>
                      <Link
                        href={`/news/${post.id}`}
                        className="inline-flex items-center text-maroon-700 hover:text-maroon-500 font-body font-semibold text-sm mt-4 transition-colors"
                      >
                        Read More
                        <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                        </svg>
                      </Link>
                    </CardContent>
                  </div>
                </Card>
                </ScrollReveal>
              ))
            )}
          </div>
        </div>
      </section>
    </>
  );
}
