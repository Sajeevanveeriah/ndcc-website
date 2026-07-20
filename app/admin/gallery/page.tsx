'use client';

import { useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import AlbumsPanel from '@/components/admin/gallery/AlbumsPanel';
import BulkUploadPanel from '@/components/admin/gallery/BulkUploadPanel';
import ImagesPanel from '@/components/admin/gallery/ImagesPanel';

const TABS = [
  { key: 'albums', label: 'Albums' },
  { key: 'upload', label: 'Bulk Upload' },
  { key: 'images', label: 'Images' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function AdminGalleryPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('albums');
  // Bumped whenever albums/uploads change so the Images panel refetches.
  const [refreshToken, setRefreshToken] = useState(0);
  const bumpRefresh = () => setRefreshToken((value) => value + 1);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-display font-bold text-content-primary flex items-center gap-2">
          <ImageIcon className="h-6 w-6 text-maroon-700 dark:text-maroon-200" aria-hidden="true" />
          Gallery Manager
        </h1>
        <p className="text-content-muted font-body mt-1">
          Manage albums, bulk-upload event photos, and control individual gallery tiles and download permissions.
        </p>
      </div>

      <div role="tablist" aria-label="Gallery manager sections" className="flex flex-wrap gap-1 border-b border-edge-subtle">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            id={`gallery-tab-${tab.key}`}
            aria-selected={activeTab === tab.key}
            aria-controls={`gallery-panel-${tab.key}`}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 -mb-px transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-maroon-500 ${
              activeTab === tab.key
                ? 'border-maroon-700 text-maroon-800 dark:border-maroon-300 dark:text-maroon-200'
                : 'border-transparent text-content-muted hover:text-content-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div id="gallery-panel-albums" role="tabpanel" aria-labelledby="gallery-tab-albums" hidden={activeTab !== 'albums'}>
        <AlbumsPanel onAlbumsChanged={bumpRefresh} />
      </div>
      <div id="gallery-panel-upload" role="tabpanel" aria-labelledby="gallery-tab-upload" hidden={activeTab !== 'upload'}>
        <BulkUploadPanel onUploadsChanged={bumpRefresh} />
      </div>
      <div id="gallery-panel-images" role="tabpanel" aria-labelledby="gallery-tab-images" hidden={activeTab !== 'images'}>
        <ImagesPanel refreshToken={refreshToken} onImagesChanged={bumpRefresh} />
      </div>
    </div>
  );
}
