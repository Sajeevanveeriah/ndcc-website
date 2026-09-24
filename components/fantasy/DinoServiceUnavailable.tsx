'use client';

import Button from '@/components/ui/Button';

export default function DinoServiceUnavailable() {
  return <section className="section-padding"><div className="container-width space-y-4">
    <h1 className="section-title">Dino Coach is temporarily unavailable</h1>
    <p role="alert">We could not check Dino Coach availability. Please try again shortly.</p>
    <Button onClick={() => window.location.reload()}>Try again</Button>
  </div></section>;
}
