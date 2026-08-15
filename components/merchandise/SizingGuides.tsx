'use client'

import Image from 'next/image'
import { useState, type KeyboardEvent } from 'react'

type SizeGuide = {
  key: string
  code: string
  label: string
  group: 'Tops' | 'Playing gear' | 'Pants and shorts' | 'Outerwear'
  image: string
  width: number
  height: number
}

const GUIDE_ROOT = '/images/cms/apparel/size-guides/2026-27'

const GUIDES: SizeGuide[] = [
  { key: 'p925', code: 'P925', label: 'Unisex Tee', group: 'Tops', image: `${GUIDE_ROOT}/p925-unisex-tee.png`, width: 1102, height: 765 },
  { key: 'p01', code: 'P01', label: 'Unisex Polo Shirt', group: 'Tops', image: `${GUIDE_ROOT}/p01-unisex-polo-shirt.png`, width: 1503, height: 1057 },
  { key: 'p295', code: 'P295', label: 'Unisex Singlet', group: 'Tops', image: `${GUIDE_ROOT}/p295-unisex-singlet.png`, width: 837, height: 1178 },
  { key: 'p199', code: 'P199', label: 'Cricket Vest', group: 'Playing gear', image: `${GUIDE_ROOT}/p199-cricket-vest.png`, width: 1668, height: 1169 },
  { key: 'p209', code: 'P209', label: 'Reversible Cricket Vest and Jumper', group: 'Playing gear', image: `${GUIDE_ROOT}/p209-unisex-reversible-cricket-vest-jumper.png`, width: 1660, height: 1035 },
  { key: 'p957', code: 'P957', label: 'Unisex Cricket Pants', group: 'Pants and shorts', image: `${GUIDE_ROOT}/p957-unisex-cricket-pants.png`, width: 1110, height: 776 },
  { key: 'p191', code: 'P191', label: 'Unisex Basic Cricket Pants', group: 'Pants and shorts', image: `${GUIDE_ROOT}/p191-unisex-cricket-pants.png`, width: 1667, height: 1175 },
  { key: 'p909', code: 'P909', label: 'Unisex Track Pants', group: 'Pants and shorts', image: `${GUIDE_ROOT}/p909-unisex-track-pants.png`, width: 1106, height: 765 },
  { key: 'p911', code: 'P911', label: 'Unisex Travel Shorts', group: 'Pants and shorts', image: `${GUIDE_ROOT}/p911-unisex-travel-shorts.png`, width: 1101, height: 766 },
  { key: 'p913', code: 'P913', label: 'Unisex Training Shorts', group: 'Pants and shorts', image: `${GUIDE_ROOT}/p913-unisex-training-shorts.png`, width: 1483, height: 1047 },
  { key: 'p127', code: 'P127', label: 'Unisex Set-In Sleeve Hoodie', group: 'Outerwear', image: `${GUIDE_ROOT}/p127-unisex-set-in-sleeve-hoodie.png`, width: 887, height: 618 },
  { key: 'p1143', code: 'P1143', label: 'Summit Hoodie', group: 'Outerwear', image: `${GUIDE_ROOT}/p1143-summit-hoodie.png`, width: 1673, height: 1173 },
  { key: 'p919', code: 'P919', label: 'Unisex Puffer Vest', group: 'Outerwear', image: `${GUIDE_ROOT}/p919-unisex-puffer-vest.png`, width: 886, height: 619 },
  { key: 'p1059', code: 'P1059', label: 'Unisex Boss Top', group: 'Outerwear', image: `${GUIDE_ROOT}/p1059-unisex-boss-top.png`, width: 1502, height: 1050 },
  { key: 'p1280', code: 'P1280', label: 'Unisex Retro Jacket', group: 'Outerwear', image: `${GUIDE_ROOT}/p1280-unisex-retro-jacket.png`, width: 886, height: 623 },
  { key: 'p969a', code: 'P969A', label: 'Unisex Team Jacket', group: 'Outerwear', image: `${GUIDE_ROOT}/p969a-unisex-team-jacket.png`, width: 1001, height: 699 },
]

const GROUPS: SizeGuide['group'][] = ['Tops', 'Playing gear', 'Pants and shorts', 'Outerwear']

export default function SizingGuides() {
  const [activeIndex, setActiveIndex] = useState(0)
  const activeGuide = GUIDES[activeIndex]

  const selectGuide = (key: string) => {
    const nextIndex = GUIDES.findIndex((guide) => guide.key === key)
    if (nextIndex >= 0) setActiveIndex(nextIndex)
  }

  const handleShortcuts = (event: KeyboardEvent<HTMLElement>) => {
    if (!event.altKey) return

    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(0, index - 1))
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault()
      setActiveIndex((index) => Math.min(GUIDES.length - 1, index + 1))
    }

    if (event.key === 'Home') {
      event.preventDefault()
      setActiveIndex(0)
    }
  }

  return (
    <section
      aria-labelledby="sizing-guides-heading"
      className="mb-8 rounded-2xl border border-gold-300 bg-surface-card p-4 shadow-soft sm:p-6"
      onKeyDown={handleShortcuts}
    >
      <div>
        <h3 id="sizing-guides-heading" className="font-display text-xl font-bold text-maroon-800 dark:text-maroon-200">
          Apparel sizing guides
        </h3>

        <div className="mt-5 rounded-xl border border-edge-subtle bg-surface-muted p-4 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="block font-body text-sm font-bold text-content-primary" htmlFor="size-guide-selector">
              Garment chart
              <select
                id="size-guide-selector"
                className="focus-ring mt-2 block w-full rounded-lg border border-edge-strong bg-surface-card px-3 py-3 font-body text-base font-semibold text-content-primary shadow-sm"
                onChange={(event) => selectGuide(event.target.value)}
                value={activeGuide.key}
              >
                {GROUPS.map((group) => (
                  <optgroup key={group} label={group}>
                    {GUIDES.filter((guide) => guide.group === group).map((guide) => (
                      <option key={guide.key} value={guide.key}>
                        {guide.code} - {guide.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-3 gap-2" aria-label="Sizing guide controls">
              <button
                aria-keyshortcuts="Alt+ArrowLeft"
                className="focus-ring rounded-lg border border-edge-strong bg-surface-card px-4 py-3 font-body text-sm font-bold text-content-primary transition-colors hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-40"
                disabled={activeIndex === 0}
                onClick={() => setActiveIndex((index) => Math.max(0, index - 1))}
                type="button"
              >
                Previous
              </button>
              <button
                aria-keyshortcuts="Alt+ArrowRight"
                className="focus-ring rounded-lg border border-edge-strong bg-surface-card px-4 py-3 font-body text-sm font-bold text-content-primary transition-colors hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-40"
                disabled={activeIndex === GUIDES.length - 1}
                onClick={() => setActiveIndex((index) => Math.min(GUIDES.length - 1, index + 1))}
                type="button"
              >
                Next
              </button>
              <button
                aria-keyshortcuts="Alt+Home"
                className="focus-ring rounded-lg bg-maroon-800 px-4 py-3 font-body text-sm font-bold text-white transition-colors hover:bg-maroon-700"
                onClick={() => setActiveIndex(0)}
                type="button"
              >
                Reset
              </button>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-baseline justify-between gap-2" aria-live="polite">
            <h4 className="font-display text-xl font-black text-content-primary sm:text-2xl">
              {activeGuide.code} {activeGuide.label}
            </h4>
            <p className="font-body text-sm font-semibold text-content-secondary">
              Guide {activeIndex + 1} of {GUIDES.length}
            </p>
          </div>

          <figure key={activeGuide.key} className="mt-4 motion-safe:animate-fade-up">
            <a
              aria-label={`Open the full-size ${activeGuide.code} ${activeGuide.label} sizing guide`}
              className="focus-ring block overflow-hidden rounded-xl border border-edge-strong bg-white"
              href={activeGuide.image}
              target="_blank"
              rel="noreferrer"
            >
              <Image
                alt={`${activeGuide.code} ${activeGuide.label} supplier specification and size chart`}
                className="mx-auto h-auto max-h-[75vh] w-auto max-w-full object-contain"
                height={activeGuide.height}
                priority={activeIndex === 0}
                src={activeGuide.image}
                width={activeGuide.width}
              />
            </a>
          </figure>

          <details className="mt-5 rounded-lg border border-edge-strong bg-surface-card px-4 py-3">
            <summary className="cursor-pointer font-body font-bold text-content-primary">View all available guides as text</summary>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {GUIDES.map((guide, index) => (
                <li key={guide.key}>
                  <button
                    aria-current={index === activeIndex ? 'true' : undefined}
                    className="focus-ring w-full rounded-md px-3 py-2 text-left font-body text-sm font-semibold text-content-secondary hover:bg-surface-muted aria-[current=true]:bg-gold-100 aria-[current=true]:text-maroon-900 dark:aria-[current=true]:bg-maroon-900/50 dark:aria-[current=true]:text-maroon-100"
                    onClick={() => setActiveIndex(index)}
                    type="button"
                  >
                    {guide.code} {guide.label}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>
    </section>
  )
}
