import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import ScrollReveal from '@/components/common/ScrollReveal';

export default function CookieDoughFundraiserFeature() {
  return (
    <section className="border-y border-edge-blue/60 bg-surface-blue-subtle px-4 py-8 sm:px-6 lg:px-8" aria-labelledby="cookie-dough-home-heading">
      <ScrollReveal className="container-width">
        <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.55fr)]">
          <div>
            <h2 id="cookie-dough-home-heading" className="font-display text-3xl font-bold uppercase tracking-wide text-maroon-800 dark:text-maroon-100 sm:text-4xl">
              Raise dough for the Dinos
            </h2>
            <p className="mt-3 max-w-2xl font-body text-base leading-relaxed text-content-secondary sm:text-lg">
              Register as an NDCC fundraiser, share your page, or purchase Billy G&apos;s Cookie Dough to support the club.
            </p>
            <Link href="/fundraising/cookie-dough" className="btn-primary mt-5 gap-2">
              View the fundraiser
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="relative mx-auto h-44 w-full max-w-sm sm:h-52" aria-hidden="true">
            <Image
              src="/images/fundraisers/billy-gs-cookie-selection.png"
              alt=""
              fill
              className="object-contain drop-shadow-[0_14px_18px_rgba(45,0,0,0.14)]"
              sizes="(max-width: 1024px) 90vw, 30vw"
            />
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}
