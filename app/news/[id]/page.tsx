'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import Card, { CardContent } from '@/components/ui/Card';
import { NewsPost } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { SEED_NEWS } from '@/lib/constants';

export default function NewsDetailPage() {
  const params = useParams();
  const postId = params.id as string;

  const [post, setPost] = useState<NewsPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    async function fetchPost() {
      try {
        const res = await fetch(`/api/public/news?id=${encodeURIComponent(postId)}`, { cache: 'no-store' });
        const json = await res.json();

        if (res.ok && json.data) {
          setPost(json.data as NewsPost);
          document.title = `${json.data.title} | NDCC Dinos`;
          setLoading(false);
          return;
        }

        // Fall back to seed data
        const seedPost = SEED_NEWS.find((n) => n.id === postId);
        if (seedPost) {
          setPost(seedPost as NewsPost);
          document.title = `${seedPost.title} | NDCC Dinos`;
        } else {
          setNotFound(true);
        }
      } catch {
        const seedPost = SEED_NEWS.find((n) => n.id === postId);
        if (seedPost) {
          setPost(seedPost as NewsPost);
          document.title = `${seedPost.title} | NDCC Dinos`;
        } else {
          setNotFound(true);
        }
      } finally {
        setLoading(false);
      }
    }

    fetchPost();
  }, [postId]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = window.location.href;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  }, []);

  if (loading) {
    return (
      <>
        <section className="page-hero">
          <div className="container-width">
            <div className="h-10 bg-maroon-600 rounded w-2/3 animate-pulse" />
          </div>
        </section>
        <section className="section-padding">
          <div className="container-width max-w-3xl mx-auto space-y-4">
            <div className="h-4 bg-gray-200 rounded w-1/4 animate-pulse" />
            <div className="h-4 bg-gray-200 rounded w-full animate-pulse" />
            <div className="h-4 bg-gray-200 rounded w-full animate-pulse" />
            <div className="h-4 bg-gray-200 rounded w-5/6 animate-pulse" />
            <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse" />
          </div>
        </section>
      </>
    );
  }

  if (notFound || !post) {
    return (
      <>
        <section className="page-hero">
          <div className="container-width">
            <h1 className="page-hero-title">Article Not Found</h1>
            <p className="page-hero-subtitle">
              The article you&apos;re looking for doesn&apos;t exist or has been removed.
            </p>
          </div>
        </section>
        <section className="section-padding">
          <div className="container-width text-center">
            <Link href="/news" className="btn-primary">
              Back to News
            </Link>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      {/* Hero */}
      <section className="page-hero">
        <div className="container-width">
          <Link
            href="/news"
            className="inline-flex items-center text-maroon-200 hover:text-white font-body text-sm mb-4 transition-colors"
          >
            <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            Back to News
          </Link>
          <h1 className="page-hero-title">{post.title}</h1>
          <div className="flex flex-wrap items-center gap-4 mt-2">
            {post.published_at && (
              <span className="font-body text-maroon-200 text-sm">
                {formatDate(post.published_at)}
              </span>
            )}
            <span className="font-body text-maroon-200 text-sm">by {post.author}</span>
          </div>
        </div>
      </section>

      {/* Article Content */}
      <section className="section-padding">
        <div className="container-width max-w-3xl mx-auto">
          <Card>
            <CardContent className="p-8">
              <article className="prose max-w-none">
                <p className="font-body text-gray-700 text-lg leading-relaxed whitespace-pre-line">
                  {post.content}
                </p>
              </article>
            </CardContent>
          </Card>

          {/* Share */}
          <div className="mt-8 flex items-center gap-4">
            <span className="font-body text-gray-500 text-sm">Share this article:</span>
            <button
              onClick={handleCopyLink}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-body text-sm transition-colors"
              aria-label="Copy link to clipboard"
            >
              {linkCopied ? (
                <>
                  <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.86-2.066a4.5 4.5 0 0 0-1.242-7.244l-4.5-4.5a4.5 4.5 0 0 0-6.364 6.364l1.757 1.757" />
                  </svg>
                  Copy Link
                </>
              )}
            </button>
          </div>

          {/* Back Link */}
          <div className="mt-8">
            <Link
              href="/news"
              className="inline-flex items-center text-maroon-700 hover:text-maroon-500 font-body font-semibold transition-colors"
            >
              <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
              All News &amp; Announcements
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
