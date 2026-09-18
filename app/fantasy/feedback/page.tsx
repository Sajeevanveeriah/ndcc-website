import type { Metadata } from 'next';
import FantasyBackLink from '@/components/fantasy/FantasyBackLink';
import DinoFeedbackForm from '../_components/DinoFeedbackForm';

export const metadata: Metadata = { title: 'Dino Coach feedback' };

export default function DinoFeedbackPage() {
  return <section className="section-padding"><div className="container-width max-w-2xl">
    <FantasyBackLink />
    <h1 className="section-title">Help us improve Dino Coach</h1>
    <p className="mb-6 leading-relaxed text-content-secondary">This is our first time building something like Dino Coach. Thanks for being patient with us. If you&apos;ve found a problem or have an idea, tell us below. Your message goes privately to Saj and Rick, who will review it and look into what we can improve.</p>
    <DinoFeedbackForm />
  </div></section>;
}
