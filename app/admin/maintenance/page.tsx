'use client';

import { Wrench } from 'lucide-react';
import MaintenanceBannerCard from '../club-details/MaintenanceBannerCard';

/** Its own admin page, so the site-wide maintenance notice is easy to find. */
export default function AdminMaintenanceBannerPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-content-primary flex items-center gap-2">
          <Wrench className="h-6 w-6 text-maroon-700 dark:text-maroon-200" aria-hidden="true" />
          Maintenance Banner
        </h1>
        <p className="text-content-muted font-body mt-1">
          Show a notice with the maintenance times at the top of every page of the website.
        </p>
      </div>
      <MaintenanceBannerCard />
    </div>
  );
}
