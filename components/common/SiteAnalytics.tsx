'use client';

import { Analytics } from '@vercel/analytics/next';
import { sanitiseAnalyticsEvent } from '@/lib/analytics-privacy';

export default function SiteAnalytics() {
  return <Analytics beforeSend={sanitiseAnalyticsEvent} />;
}
