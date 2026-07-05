import type { Metadata } from 'next';
import Image from 'next/image';
import Card, { CardContent } from '@/components/ui/Card';
import ScrollReveal, { ScrollRevealItem } from '@/components/common/ScrollReveal';
import { getContentBlocks } from '@/lib/content-blocks';
import { getClubSettings } from '@/lib/club-settings';
import { normalisePublicText } from '@/lib/utils';
import { getFacilityFeatures, getPageLinkCards } from '@/lib/structured-content';
import { fallbackFacilityFeatures } from '@/lib/fallback-content';
import { CLUB_ADDRESS, CLUB_ESTABLISHED } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Facilities',
};

const iconByKey: Record<string, string> = {
  feature: 'M12 6v12m6-6H6',
  lanes: 'M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5',
  turf: 'M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z',
  clubrooms: 'm2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25',
  oval: 'M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z',
  parking: 'M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12',
  accessible: 'M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z',
};

export default async function FacilitiesPage() {
  const [blocks, features, articles, settings] = await Promise.all([
    getContentBlocks(['facilities.hero', 'facilities.intro', 'facilities.training', 'facilities.features_intro', 'facilities.cta']),
    getFacilityFeatures(),
    getPageLinkCards('facilities', 'articles'),
    getClubSettings(),
  ]);

  // On a Supabase cold start the query aborts; show the static fallback (real facility
  // features) instead of a blank grid. Live CMS features are used whenever Supabase is warm.
  const featureCards = features.length > 0 ? features : fallbackFacilityFeatures;
  const featureStats = featureCards.slice(0, 3).map((feature) => feature.title);
  const statItems = [...featureStats, `Est. ${CLUB_ESTABLISHED}`];
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(settings.address || CLUB_ADDRESS)}`;

  return (
    <>
      <section className="page-hero">
        <div className="container-width">
          <ScrollReveal onMount delay={0}><h1 className="page-hero-title">{blocks['facilities.hero']?.title || 'Our Facilities'}</h1></ScrollReveal>
          <ScrollReveal onMount delay={0.15}><p className="page-hero-subtitle">{normalisePublicText(blocks['facilities.hero']?.body)}</p></ScrollReveal>
        </div>
      </section>

      <section className="band-maroon" aria-label="Facility highlights">
        <div className="container-width px-4 sm:px-6 lg:px-8 py-6">
          <ul className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-5 text-center">
            {statItems.map((item) => (
              <li key={item} className="px-2 sm:border-r sm:border-white/15 sm:last:border-r-0">
                <span className="font-display text-base sm:text-lg font-bold uppercase tracking-wide leading-tight text-gold-100">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section-padding">
        <div className="container-width">
          <ScrollReveal className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="section-title">{blocks['facilities.intro']?.title || 'Grinter Reserve'}</h2>
              <p className="text-gray-500 font-body text-sm mb-6">{settings.address}</p>
              <div className="prose prose-sm max-w-none text-gray-700 font-body leading-relaxed whitespace-pre-line">
                <p>{normalisePublicText(blocks['facilities.intro']?.body)}</p>
              </div>
              <a
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary mt-6 inline-flex items-center"
              >
                <svg className="mr-2 w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                </svg>
                Get Directions
              </a>
            </div>
            <div className="relative h-72 lg:h-96 rounded-xl overflow-hidden">
              <Image
                src={blocks['facilities.intro']?.image_url || '/images/Turf_Ground.jpg'}
                alt="Panoramic view of Grinter Reserve"
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            </div>
          </ScrollReveal>
        </div>
      </section>

      <section className="section-padding surface-sky">
        <div className="container-width">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="order-2 lg:order-1 relative h-72 lg:h-96 rounded-xl overflow-hidden">
              <Image
                src={blocks['facilities.training']?.image_url || '/images/Turf.jpg'}
                alt="Training facility at Grinter Reserve"
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            </div>
            <div className="order-1 lg:order-2">
              <h2 className="section-title">{blocks['facilities.training']?.title || 'Training Facility'}</h2>
              <div className="prose prose-sm max-w-none text-gray-700 font-body leading-relaxed whitespace-pre-line">
                <p>{normalisePublicText(blocks['facilities.training']?.body)}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-padding">
        <div className="container-width">
          <div className="text-center mb-12">
            <h2 className="section-title">{blocks['facilities.features_intro']?.title || 'Facility Features'}</h2>
            <p className="section-subtitle mx-auto">{normalisePublicText(blocks['facilities.features_intro']?.body)}</p>
          </div>
          <ScrollReveal stagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {featureCards.map((feature) => (
              <ScrollRevealItem key={feature.id}>
              <Card hover className="h-full">
                <CardContent className="p-6">
                  <div className="w-14 h-14 bg-maroon-50 rounded-lg flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-maroon-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d={iconByKey[feature.icon_key] || iconByKey.feature} />
                    </svg>
                  </div>
                  <h3 className="text-lg font-display font-bold text-gray-900 mb-2">{feature.title}</h3>
                  <p className="text-gray-600 font-body text-sm">{feature.description}</p>
                </CardContent>
              </Card>
              </ScrollRevealItem>
            ))}
          </ScrollReveal>
          <div className="text-center mt-10">
            <h3 className="text-xl font-display font-bold text-maroon-800">{blocks['facilities.cta']?.title || 'Visit or Enquire'}</h3>
            <p className="text-gray-600 font-body mt-2 mb-4">{blocks['facilities.cta']?.body || ''}</p>
            <a href={blocks['facilities.cta']?.cta_url || '/contact'} className="btn-accent">
              {blocks['facilities.cta']?.cta_label || 'Contact Us'}
            </a>
          </div>
        </div>
      </section>

      {articles.length > 0 && (
        <section className="section-padding surface-sky">
          <div className="container-width">
            <h2 className="section-title">Facilities Articles</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              {articles.map((article) => (
                <Card key={article.id} hover>
                  <CardContent className="p-6">
                    <h3 className="font-display font-bold text-gray-900 text-xl">{article.title}</h3>
                    <p className="text-gray-600 mt-2 whitespace-pre-line">{normalisePublicText(article.description)}</p>
                    <a href={article.href} className="btn-secondary mt-4 inline-flex">Read More</a>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
