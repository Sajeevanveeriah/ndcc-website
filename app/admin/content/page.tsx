'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import ImageUploadField from '@/components/admin/ImageUploadField';
import Input, { Textarea } from '@/components/ui/Input';
import { parseApiResponse, adminFetch } from '@/lib/admin-client';

type Block = {
  id: string;
  block_key: string;
  page_slug: string;
  section_label: string;
  title: string | null;
  body: string | null;
  image_url: string | null;
  cta_label: string | null;
  cta_url: string | null;
  is_active: boolean;
};

type PageGroup = {
  slug: string;
  label: string;
  helper: string;
};

const PAGE_GROUPS: PageGroup[] = [
  { slug: 'home', label: 'Home Page', helper: 'Text and buttons shown on the website home page.' },
  { slug: 'about', label: 'About Page', helper: 'Text sections shown on the About page.' },
  { slug: 'teams', label: 'Teams Page', helper: 'Text sections shown on the Teams page.' },
  { slug: 'facilities', label: 'Facilities Page', helper: 'Text and images shown on the Facilities page.' },
  { slug: 'fixtures', label: 'Fixtures Page', helper: 'Text and buttons shown on the Fixtures page.' },
  { slug: 'join', label: 'Join Page', helper: 'Text and buttons shown on the Join page.' },
  { slug: 'merchandise', label: 'Merchandise Page', helper: 'Text shown on the Merchandise page.' },
  { slug: 'sponsors', label: 'Sponsors Page', helper: 'Text shown on the Sponsors page.' },
  { slug: 'gallery', label: 'Gallery Page', helper: 'Text shown on the Gallery page.' },
  { slug: 'volunteer', label: 'Volunteer Page', helper: 'Text shown on the Volunteer page.' },
  { slug: 'contact', label: 'Contact Page', helper: 'Text shown on the Contact page.' },
  { slug: 'footer', label: 'Footer', helper: 'Text shown in the website footer.' },
];

const PAGE_LABELS = Object.fromEntries(PAGE_GROUPS.map((group) => [group.slug, group.label]));

const BLOCK_HELPERS: Record<string, string> = {
  'home.hero': 'Appears in the top banner of the Home page.',
  'home.quicklinks': 'Appears above the quick links on the Home page.',
  'home.season_status': 'Appears in the season update card on the Home page.',
  'home.sponsor_intro': 'Appears above sponsor information on the Home page.',
  'about.hero': 'Appears in the top banner of the About page.',
  'about.history': 'Appears in the history section on the About page.',
  'about.affiliation': 'Appears in the affiliation section on the About page.',
  'about.goodsports': 'Appears in the Good Sports section on the About page.',
  'about.partnership': 'Appears in the partnership section on the About page.',
  'about.committee': 'Appears above committee information on the About page.',
  'teams.hero': 'Appears in the top banner of the Teams page.',
  'teams.coach': 'Appears in the coach card on the Teams page.',
  'teams.intro': 'Appears in the team introduction section on the Teams page.',
  'teams.join_cta': 'Appears in the join prompt on the Teams page.',
  'facilities.hero': 'Appears in the top banner of the Facilities page.',
  'facilities.intro': 'Appears in the ground introduction section on the Facilities page.',
  'facilities.training': 'Appears in the training section on the Facilities page.',
  'facilities.features_intro': 'Appears above the facility features on the Facilities page.',
  'facilities.cta': 'Appears in the contact prompt on the Facilities page.',
  'fixtures.hero': 'Appears in the top banner of the Fixtures page.',
  'fixtures.status': 'Appears in the season status section on the Fixtures page.',
  'fixtures.team_links': 'Appears above team links on the Fixtures page.',
  'join.hero': 'Appears in the top banner of the Join page.',
  'join.playhq': 'Appears in the player registration card on the Join page.',
  'join.social_membership': 'Appears in the social membership card on the Join page.',
  'merch.hero': 'Appears in the top banner of the Merchandise page.',
  'merch.ordering': 'Appears in the ordering information panel on the Merchandise page.',
  'gallery.hero': 'Appears in the top banner of the Gallery page.',
  'gallery.intro': 'Appears in the introduction section on the Gallery page.',
  'sponsors.hero': 'Appears in the top banner of the Sponsors page.',
  'sponsors.intro': 'Appears in the introduction section on the Sponsors page.',
  'sponsors.package_guidance': 'Appears near sponsorship package information on the Sponsors page.',
  'sponsors.enquiry_intro': 'Appears above the sponsorship enquiry form on the Sponsors page.',
  'volunteer.hero': 'Appears in the top banner of the Volunteer page.',
  'volunteer.intro': 'Appears in the volunteer introduction section on the Volunteer page.',
  'contact.hero': 'Appears in the top banner of the Contact page.',
  'contact.form_intro': 'Appears above the contact form on the Contact page.',
  'contact.details': 'Appears near club contact details on the Contact page.',
  'footer.acknowledgement': 'Appears in the website footer acknowledgement.',
  'footer.contact': 'Appears in the website footer contact area.',
  'footer.partner_links': 'Appears in the website footer partner links area.',
};

function getFriendlyBlockLabel(block: Block): string {
  const keyPart = block.block_key.split('.').pop() || '';
  const label = block.section_label.trim();
  if (keyPart === 'hero' || label.toLowerCase().includes('hero')) return 'Top banner';
  if (label.toLowerCase().includes('cta')) return label.replace(/cta/gi, 'button').replace(/\s+/g, ' ').trim();
  return label || 'Page section';
}

function getPageLabel(slug: string): string {
  return PAGE_LABELS[slug] || `${slug.replace(/[-_]/g, ' ')} Page`;
}

function getBlockHelper(block: Block): string {
  return BLOCK_HELPERS[block.block_key] || `Appears on the ${getPageLabel(block.page_slug)}.`;
}

export default function AdminContentPage() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Block | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadBlocks = useCallback(async (): Promise<Block[]> => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/resources/contentBlocks', { cache: 'no-store' });
      const data = await parseApiResponse<{ data?: Block[] }>(res);
      const loaded = data.data || [];
      setBlocks(loaded);
      setSelected((current) => {
        if (!current) return loaded[0] || null;
        return loaded.find((block) => block.id === current.id) || loaded[0] || null;
      });
      return loaded;
    } catch (error) {
      setBlocks([]);
      setSelected(null);
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Failed to load editable website content.' });
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadBlocks(); }, [loadBlocks]);

  const groupedBlocks = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const matchesSearch = (block: Block) => {
      if (!needle) return true;
      return [getPageLabel(block.page_slug), getFriendlyBlockLabel(block), block.title || '', getBlockHelper(block), block.block_key]
        .some((value) => value.toLowerCase().includes(needle));
    };

    const groups = PAGE_GROUPS.map((group) => ({
      ...group,
      blocks: blocks.filter((block) => block.page_slug === group.slug && matchesSearch(block)),
    }));
    const knownSlugs = new Set(PAGE_GROUPS.map((group) => group.slug));
    const otherBlocks = blocks.filter((block) => !knownSlugs.has(block.page_slug) && matchesSearch(block));

    if (otherBlocks.length > 0) {
      groups.push({
        slug: 'other',
        label: 'Other Website Content',
        helper: 'Additional editable website sections that are not part of the main page list.',
        blocks: otherBlocks,
      });
    }

    return groups;
  }, [blocks, search]);

  const visibleBlockCount = groupedBlocks.reduce((count, group) => count + group.blocks.length, 0);

  async function saveBlock() {
    if (!selected) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await adminFetch('/api/admin/resources/contentBlocks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selected.id,
          block_key: selected.block_key,
          page_slug: selected.page_slug,
          section_label: selected.section_label,
          title: selected.title,
          body: selected.body,
          image_url: selected.image_url,
          cta_label: selected.cta_label,
          cta_url: selected.cta_url,
          is_active: selected.is_active,
        }),
      });
      const result = await parseApiResponse<{ data?: Block }>(res);
      const updatedBlock = result.data ?? selected;
      setSelected(updatedBlock);
      setFeedback({ type: 'success', message: 'Website content saved.' });
      const refreshed = await loadBlocks();
      const freshBlock = refreshed.find((block) => block.id === updatedBlock.id);
      if (freshBlock) setSelected(freshBlock);
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Failed to save website content.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-display font-bold">Website Content</h1>
      <p className="text-sm text-gray-500">
        Update page headings, text, images, and buttons shown on the public website. Choose a page below, then edit the matching section.
      </p>
      <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
        <p className="font-semibold">Tips for safe updates</p>
        <ul className="list-disc ml-5 mt-1 space-y-1">
          <li>Use Main heading and Intro text for wording visitors will see on the website.</li>
          <li>Use Button text and Button link only when that section shows a website button.</li>
          <li>Turn off Show on website if a section should be hidden temporarily.</li>
        </ul>
      </div>
      {feedback && (
        <p className={`text-sm px-3 py-2 rounded border ${feedback.type === 'error' ? 'text-red-600 bg-red-50 border-red-200' : 'text-green-700 bg-green-50 border-green-200'}`}>
          {feedback.message}
        </p>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border rounded-xl p-4 lg:col-span-1">
          <div className="mb-3">
            <h2 className="font-semibold">Pages</h2>
            <p className="text-xs text-gray-500">Pick the page and section you want to update.</p>
          </div>
          <Input id="search_blocks" label="Search pages and sections" value={search} onChange={(e) => setSearch(e.target.value)} />
          {loading ? (
            <p className="text-sm text-gray-500">Loading editable website content…</p>
          ) : blocks.length === 0 ? (
            <p className="text-sm text-gray-500">No editable website content was found.</p>
          ) : visibleBlockCount === 0 ? (
            <p className="text-sm text-gray-500">No page sections match your search.</p>
          ) : (
            <div className="space-y-4">
              {groupedBlocks.map((group) => (
                group.blocks.length > 0 && (
                  <section key={group.slug} className="space-y-2">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">{group.label}</h3>
                      <p className="text-xs text-gray-500">{group.helper}</p>
                    </div>
                    <div className="space-y-2">
                      {group.blocks.map((block) => (
                        <button
                          key={block.id}
                          type="button"
                          onClick={() => { setSelected(block); setFeedback(null); }}
                          className={`w-full text-left px-3 py-2 rounded-lg border ${selected?.id === block.id ? 'border-maroon-600 bg-maroon-50' : 'border-gray-200 hover:border-gray-300'}`}
                        >
                          <p className="font-medium text-sm">{getFriendlyBlockLabel(block)}</p>
                          <p className="text-xs text-gray-500">{getBlockHelper(block)}</p>
                        </button>
                      ))}
                    </div>
                  </section>
                )
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border rounded-xl p-4 lg:col-span-2 space-y-3">
          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-400 text-sm">Loading editor…</p>
            </div>
          ) : !selected ? (
            <div className="text-center py-12">
              <p className="text-gray-400 text-sm">Select a page section to edit.</p>
            </div>
          ) : (
            <>
              <div className="border-b border-gray-100 pb-3 mb-3">
                <p className="text-sm font-semibold text-gray-900">{getPageLabel(selected.page_slug)} — {getFriendlyBlockLabel(selected)}</p>
                <p className="text-xs text-gray-500 mt-1">{getBlockHelper(selected)}</p>
              </div>
              <Input id="block_title" label="Main heading" value={selected.title || ''} onChange={(e) => setSelected((value) => value ? ({ ...value, title: e.target.value }) : value)} />
              <Textarea id="block_body" label="Intro text" rows={5} value={selected.body || ''} onChange={(e) => setSelected((value) => value ? ({ ...value, body: e.target.value }) : value)} />
              <ImageUploadField id="block_image" label="Image" value={selected.image_url || ''} onChange={(value) => setSelected((current) => current ? ({ ...current, image_url: value }) : current)} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input id="block_cta_label" label="Button text" value={selected.cta_label || ''} onChange={(e) => setSelected((value) => value ? ({ ...value, cta_label: e.target.value }) : value)} />
                <Input id="block_cta_url" label="Button link" value={selected.cta_url || ''} onChange={(e) => setSelected((value) => value ? ({ ...value, cta_url: e.target.value }) : value)} />
              </div>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={selected.is_active} onChange={(e) => setSelected((value) => value ? ({ ...value, is_active: e.target.checked }) : value)} />
                Show on website
              </label>
              <div className="pt-3 border-t border-gray-100">
                <Button onClick={saveBlock} isLoading={saving}>Save website content</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
