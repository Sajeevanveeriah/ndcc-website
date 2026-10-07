'use client';

import { useState } from 'react';
import { Eye, Pencil } from 'lucide-react';
import Button from '@/components/ui/Button';
import { normaliseMediaUrl } from '@/lib/media-url';

/**
 * Editor/preview switch for CMS editors. Preview renders the unsaved form
 * entirely in the browser: nothing is saved, no public route is involved and
 * no draft is exposed. The form stays mounted (hidden) so upload state and
 * typed values are kept when switching back.
 */
export function usePreviewToggle() {
  const [previewing, setPreviewing] = useState(false);
  return { previewing, setPreviewing, toggle: () => setPreviewing((value) => !value) };
}

export function PreviewToggleButton({ previewing, onToggle, controls }: { previewing: boolean; onToggle: () => void; controls: string }) {
  return (
    <Button type="button" variant="ghost" onClick={onToggle} aria-pressed={previewing} aria-controls={controls} className="mr-auto">
      {previewing ? <Pencil className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
      {previewing ? 'Back to editing' : 'Preview'}
    </Button>
  );
}

function isBrowserImagePath(value: string) {
  return /^https:\/\//i.test(value) || value.startsWith('/images/');
}

type InlinePreviewProps = {
  id: string;
  /** Small label above the title, e.g. the publication type. */
  kicker?: string;
  title: string;
  /** Untitled fallback, e.g. "Untitled article". */
  untitled: string;
  /** Date, author or venue line under the title. */
  meta?: string;
  imageUrl?: string | null;
  imageAlt: string;
  summary?: string | null;
  body: string;
  emptyBody: string;
  children?: React.ReactNode;
};

/** Mirrors the public detail page: maroon hero title, then the body card. */
export default function InlinePreview({ id, kicker, title, untitled, meta, imageUrl, imageAlt, summary, body, emptyBody, children }: InlinePreviewProps) {
  const image = imageUrl ? normaliseMediaUrl(imageUrl) : '';
  return (
    <section id={id} aria-label="Preview of unsaved changes" className="space-y-3">
      <p role="status" className="rounded-sm border border-edge-blue bg-surface-blue-subtle px-3 py-2 text-sm text-content-primary">
        Preview of your unsaved changes. Nothing has been saved or published, and only you can see this.
      </p>
      <div className="overflow-hidden rounded-xl border border-edge-subtle bg-surface-card">
        <div className="bg-maroon-800 px-6 py-6 text-white">
          {kicker && <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-gold-200">{kicker}</p>}
          <h2 className="font-display text-3xl font-bold uppercase leading-tight">{title.trim() || untitled}</h2>
          {meta && <p className="mt-2 font-body text-sm text-maroon-100">{meta}</p>}
        </div>
        <div className="space-y-4 p-6">
          {image && isBrowserImagePath(image) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt={imageAlt} className="h-auto max-h-96 w-full rounded-lg object-contain" />
          )}
          {summary && <p className="font-body font-medium text-content-secondary">{summary}</p>}
          <article className="prose max-w-none">
            <p className="whitespace-pre-line font-body text-lg leading-relaxed text-content-secondary">{body.trim() || emptyBody}</p>
          </article>
          {children}
        </div>
      </div>
    </section>
  );
}
