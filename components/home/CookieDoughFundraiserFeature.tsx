import CookieDoughVisibility from '@/components/common/CookieDoughVisibility';
import { isCookieDoughOpen, COOKIE_DOUGH_DEADLINE_LABEL, COOKIE_DOUGH_ENDS_AT } from '@/lib/cookie-dough';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

// Compact promotion block for the home page "Get involved" section. Shown
// only while the fundraiser is open (isCookieDoughOpen at render time, plus
// CookieDoughVisibility removing it from an open tab at the cutoff).
export default function CookieDoughFundraiserFeature({ campaign }: { campaign?: { endsAt: number | null; deadlineLabel: string } } = {}) {
  const endsAt = campaign ? campaign.endsAt : COOKIE_DOUGH_ENDS_AT;
  const deadlineLabel = campaign ? campaign.deadlineLabel : COOKIE_DOUGH_DEADLINE_LABEL;
  if (!isCookieDoughOpen(Date.now(), endsAt)) return null;
  return (
    <CookieDoughVisibility initialOpen={true} endsAt={endsAt}>
      <div className="border-l-4 border-sky_accent bg-surface-blue-subtle px-5 py-4">
        <h3 id="cookie-dough-home-heading" className="font-display text-xl font-semibold text-content-primary">
          Raise dough for the Dinos
        </h3>
        <p className="mt-1 font-body text-base leading-relaxed text-content-secondary">
          Register as an NDCC fundraiser, share your page, or purchase Billy G&apos;s Cookie Dough to support the club.
        </p>
        {deadlineLabel && <p className="mt-1 font-body text-sm font-semibold text-content-primary">{deadlineLabel}</p>}
        <Link href="/fundraising/cookie-dough" className="club-text-link mt-1 font-semibold">
          View the fundraiser
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </CookieDoughVisibility>
  );
}
