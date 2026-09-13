'use client';

export default function MerchandiseError({ reset }: { reset: () => void }) {
  return <section className="section-padding"><div className="container-width">
    <h1 className="section-title">Merchandise temporarily unavailable</h1>
    <p className="mt-4 text-content-secondary">We could not load the current catalogue. Please try again before placing an order.</p>
    <button type="button" onClick={reset} className="btn-primary mt-6">Try again</button>
  </div></section>;
}
