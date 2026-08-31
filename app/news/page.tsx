import Link from 'next/link';
import SafeImage from '@/components/common/SafeImage';
import ScrollReveal from '@/components/common/ScrollReveal';
import Card, { CardContent } from '@/components/ui/Card';
import { stripNewsGalleryContent } from '@/lib/news-gallery';
import { getPublishedNews } from '@/lib/public-news';
import { fallbackNews } from '@/lib/fallback-content';
import { isServerSupabaseConfigured } from '@/lib/supabase-server';
import { NewsPost } from '@/lib/types';
import { formatDate, truncateText } from '@/lib/utils';

// Request-time rendering: news is mutable CMS content, so it must never be
// served from a build-time prerender or the ISR cache.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// Server-rendered live on every request. Fallback is reserved for
// unconfigured / query-failure paths only - a successful empty result renders
// the empty state.
async function loadPosts(): Promise<NewsPost[]> {
  if (!isServerSupabaseConfigured()) return fallbackNews;
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
  const [featuredPost, ...remainingPosts] = posts;

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
        <div className="container-width">
          {!featuredPost ? (
            <Card>
              <CardContent className="p-6 text-center font-body text-content-muted">No published news articles yet.</CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              <ScrollReveal>
                <Card hover className="overflow-hidden">
                  <article className="grid grid-cols-1 md:grid-cols-[1.1fr_1fr]">
                    {(featuredPost.image_url || featuredPost.image) && (
                      <div className="relative min-h-64 bg-surface-page">
                        <SafeImage
                          src={featuredPost.image_url || featuredPost.image || '/images/Womens_Team.jpg'}
                          alt={featuredPost.title}
                          fill
                          className="object-contain p-2"
                          sizes="(max-width: 768px) 100vw, 55vw"
                          fallback={<div className="absolute inset-0 bg-surface-muted" aria-hidden="true" />}
                        />
                      </div>
                    )}
                    <CardContent className="flex flex-col justify-center p-6">
                      <div className="mb-3 flex flex-wrap items-center gap-3">
                        {featuredPost.published_at && (
                          <span className="font-body text-xs font-semibold uppercase tracking-[0.08em] text-maroon-600 dark:text-maroon-300">{formatDate(featuredPost.published_at)}</span>
                        )}
                        <span className="font-body text-sm text-content-muted">by {featuredPost.author}</span>
                      </div>
                      <h2 className="mb-3 font-display text-2xl font-bold text-content-primary">
                        <Link href={`/news/${featuredPost.id}`} className="transition-colors hover:text-maroon-700">{featuredPost.title}</Link>
                      </h2>
                      <p className="font-body leading-relaxed text-content-muted">{truncateText(stripNewsGalleryContent(featuredPost.content), 240)}</p>
                      <Link href={`/news/${featuredPost.id}`} className="mt-4 inline-flex items-center font-body text-sm font-semibold text-maroon-700 transition-colors hover:text-maroon-500 dark:text-maroon-200">
                        Read More
                        <svg className="ml-1 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                        </svg>
                      </Link>
                    </CardContent>
                  </article>
                </Card>
              </ScrollReveal>

              {remainingPosts.length > 0 && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {remainingPosts.map((post) => (
                    <ScrollReveal key={post.id}>
                      <Card hover className="h-full overflow-hidden">
                        <article className="flex h-full flex-col">
                          {(post.image_url || post.image) && (
                            <div className="relative aspect-video w-full bg-surface-page">
                              <SafeImage
                                src={post.image_url || post.image || '/images/Womens_Team.jpg'}
                                alt={post.title}
                                fill
                                className="object-contain p-2"
                                sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                                fallback={<div className="absolute inset-0 bg-surface-muted" aria-hidden="true" />}
                              />
                            </div>
                          )}
                          <CardContent className="flex flex-1 flex-col p-5">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              {post.published_at && <span className="font-body text-xs font-semibold uppercase tracking-[0.08em] text-maroon-600 dark:text-maroon-300">{formatDate(post.published_at)}</span>}
                              <span className="font-body text-xs text-content-muted">by {post.author}</span>
                            </div>
                            <h2 className="mb-2 font-display text-lg font-bold text-content-primary">
                              <Link href={`/news/${post.id}`} className="transition-colors hover:text-maroon-700">{post.title}</Link>
                            </h2>
                            <p className="font-body text-sm leading-relaxed text-content-muted">{truncateText(stripNewsGalleryContent(post.content), 120)}</p>
                            <Link href={`/news/${post.id}`} className="mt-auto pt-3 font-body text-sm font-semibold text-maroon-700 hover:underline dark:text-maroon-200">Read More</Link>
                          </CardContent>
                        </article>
                      </Card>
                    </ScrollReveal>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
