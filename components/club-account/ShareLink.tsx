'use client';
import { useState } from 'react';
export default function ShareLink({ path, title }: { path: string; title: string }) {
  const [message, setMessage] = useState('');
  const [manual, setManual] = useState('');
  async function share() {
    setMessage(''); setManual('');
    const url = new URL(path, window.location.origin).href;
    try {
      if (navigator.share) await navigator.share({ title, url });
      else if (navigator.clipboard) { await navigator.clipboard.writeText(url); setMessage('Link copied.'); }
      else setManual(url);
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) { setManual(url); setMessage('Copy the link below to share it.'); }
    }
  }
  return <div className="text-sm"><button type="button" onClick={share} className="underline underline-offset-4">Share {title}</button>
    {message && <p role="status" className="mt-2">{message}</p>}
    {manual && <input aria-label={`Share link for ${title}`} className="form-input mt-2 w-full" readOnly value={manual} onFocus={event => event.target.select()} />}
  </div>;
}
