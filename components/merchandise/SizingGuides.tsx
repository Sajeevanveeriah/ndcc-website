'use client';

import Image from 'next/image';
import { useState } from 'react';

type GuideKey = 'tee' | 'pants';

type SizeRow = {
  size: string;
  measurements: string[];
};

type SizeGuide = {
  label: string;
  image: string;
  imageAlt: string;
  headers: string[];
  adultRows: SizeRow[];
  kidsRows: SizeRow[];
};

const GUIDES: Record<GuideKey, SizeGuide> = {
  tee: {
    label: 'Tee',
    image: '/images/cms/apparel/size-guides/tee-size-guide.webp',
    imageAlt: 'Supplier tee size chart showing adult and kids width and length measurements in centimetres',
    headers: ['Size', 'Width (cm)', 'Length (cm)'],
    adultRows: [
      { size: 'XS', measurements: ['50', '71'] },
      { size: 'S', measurements: ['52.5', '72'] },
      { size: 'M', measurements: ['55', '73'] },
      { size: 'L', measurements: ['57.5', '74'] },
      { size: 'XL', measurements: ['60.5', '75'] },
      { size: '2XL', measurements: ['64', '76'] },
      { size: '3XL', measurements: ['67.5', '80'] },
      { size: '4XL', measurements: ['71', '81.5'] },
      { size: '5XL', measurements: ['74', '83'] },
      { size: '6XL', measurements: ['77.5', '84.5'] },
      { size: '7XL', measurements: ['81', '86'] },
    ],
    kidsRows: [
      { size: 'K4', measurements: ['36', '45'] },
      { size: 'K6', measurements: ['38', '50'] },
      { size: 'K8', measurements: ['40', '57'] },
      { size: 'K10', measurements: ['42', '62'] },
      { size: 'K12', measurements: ['44', '65'] },
      { size: 'K14', measurements: ['46', '68'] },
      { size: 'K16', measurements: ['48', '70'] },
    ],
  },
  pants: {
    label: 'Cricket pants',
    image: '/images/cms/apparel/size-guides/cricket-pants-size-guide.webp',
    imageAlt: 'Supplier cricket pants size chart showing adult and kids waist, inner leg and length measurements in centimetres',
    headers: ['Size', 'Waist (cm)', 'Inner leg (cm)', 'Length (cm)'],
    adultRows: [
      { size: 'XS', measurements: ['TBC', 'TBC', 'TBC'] },
      { size: 'S', measurements: ['36', '69', '99'] },
      { size: 'M', measurements: ['37', '70', '101'] },
      { size: 'L', measurements: ['38', '71.5', '102'] },
      { size: 'XL', measurements: ['39', '73', '106'] },
      { size: '2XL', measurements: ['40', '74', '107'] },
      { size: '3XL', measurements: ['41', '74', '108'] },
      { size: '4XL', measurements: ['45', '75', '109'] },
      { size: '5XL', measurements: ['49', '78', '110'] },
      { size: '6XL', measurements: ['TBC', 'TBC', 'TBC'] },
      { size: '7XL', measurements: ['TBC', 'TBC', 'TBC'] },
    ],
    kidsRows: [
      { size: 'K4', measurements: ['TBC', 'TBC', 'TBC'] },
      { size: 'K6', measurements: ['TBC', 'TBC', 'TBC'] },
      { size: 'K8', measurements: ['28', '56.5', '83'] },
      { size: 'K10', measurements: ['28', '63.5', '90'] },
      { size: 'K12', measurements: ['30', '66', '94'] },
      { size: 'K14', measurements: ['32', '67', '96.5'] },
      { size: 'K16', measurements: ['33', '68.5', '98'] },
    ],
  },
};

function SizeTable({ caption, guide, rows }: { caption: string; guide: SizeGuide; rows: SizeRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] border-collapse text-left font-body text-xs text-content-secondary">
        <caption className="pb-2 text-left font-semibold text-content-primary">{caption}</caption>
        <thead>
          <tr className="border-b border-edge-strong">
            {guide.headers.map((header) => (
              <th key={header} scope="col" className="px-2 py-2 font-semibold">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.size} className="border-b border-edge-subtle last:border-0">
              <th scope="row" className="px-2 py-1.5 font-semibold text-content-primary">{row.size}</th>
              {row.measurements.map((measurement, index) => (
                <td key={`${row.size}-${guide.headers[index + 1]}`} className="px-2 py-1.5">{measurement}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SizingGuides() {
  const [activeGuide, setActiveGuide] = useState<GuideKey>('tee');
  const guide = GUIDES[activeGuide];

  return (
    <section aria-labelledby="sizing-guides-title" className="mb-8 rounded-2xl border border-gold-300 bg-surface-card p-4 shadow-soft sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id="sizing-guides-title" className="font-display text-xl font-bold text-maroon-800 dark:text-maroon-200">Sizing guides</h3>
          <p className="mt-1 max-w-2xl font-body text-sm text-content-secondary">
            Use these temporary supplier charts to compare garment measurements before ordering. All measurements are in centimetres.
          </p>
        </div>
        <div className="inline-flex w-fit rounded-lg border border-edge-strong bg-surface-muted p-1" role="tablist" aria-label="Apparel sizing guide">
          {(Object.keys(GUIDES) as GuideKey[]).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`size-guide-tab-${key}`}
              aria-controls={`size-guide-panel-${key}`}
              aria-selected={activeGuide === key}
              onClick={() => setActiveGuide(key)}
              className={`focus-ring rounded-md px-3 py-2 font-body text-sm font-semibold transition-colors ${
                activeGuide === key
                  ? 'bg-maroon-800 text-white shadow-sm'
                  : 'text-content-secondary hover:bg-surface-card hover:text-maroon-800 dark:hover:text-maroon-200'
              }`}
            >
              {GUIDES[key].label}
            </button>
          ))}
        </div>
      </div>

      <div
        id={`size-guide-panel-${activeGuide}`}
        role="tabpanel"
        aria-labelledby={`size-guide-tab-${activeGuide}`}
        className="mt-5"
      >
        <a
          href={guide.image}
          target="_blank"
          rel="noopener noreferrer"
          className="focus-ring group mx-auto block max-w-3xl overflow-hidden rounded-xl border border-gold-400 bg-[#f7d968]"
          aria-label={`Open the ${guide.label} sizing guide at full size in a new tab`}
        >
          <Image
            src={guide.image}
            alt={guide.imageAlt}
            width={806}
            height={800}
            className="h-auto w-full transition-transform duration-200 group-hover:scale-[1.01]"
            sizes="(max-width: 768px) 100vw, 768px"
            priority={false}
          />
        </a>
        <p className="mt-2 text-center font-body text-xs text-content-muted">Select the chart to open it at full size.</p>

        <details className="mx-auto mt-4 max-w-3xl rounded-lg border border-edge-subtle bg-surface-muted p-3">
          <summary className="cursor-pointer font-body text-sm font-semibold text-maroon-800 dark:text-maroon-200">
            View measurements as accessible text
          </summary>
          <div className="mt-4 grid gap-5 lg:grid-cols-2">
            <SizeTable caption="Adult sizes" guide={guide} rows={guide.adultRows} />
            <SizeTable caption="Kids sizes" guide={guide} rows={guide.kidsRows} />
          </div>
        </details>
      </div>
    </section>
  );
}
