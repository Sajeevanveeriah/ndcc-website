'use client';

import { useCallback, useEffect, useState } from 'react';
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

export default function AdminContentPage() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Block | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadBlocks = useCallback(async (): Promise<Block[]> => {
    try {
      const res = await fetch('/api/admin/resources/contentBlocks', { cache: 'no-store' });
      const data = await parseApiResponse<{ data?: Block[] }>(res);
      const loaded = data.data || [];
      setBlocks(loaded);
      setSelected((current) => current || loaded[0] || null);
      return loaded;
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Failed to load content blocks.' });
      return [];
    }
  }, []);

  useEffect(() => { loadBlocks(); }, [loadBlocks]);

  const usageHints: Record<string, string> = {
    'home.hero': 'Homepage hero heading + subheading.',
    'home.quicklinks': 'Homepage quick-links section heading + intro text.',
    'home.season_status': 'Homepage season update card (title/body/button).',
    'about.hero': 'About page hero title + subtitle.',
    'about.affiliation': 'About page GCA affiliation section.',
    'about.goodsports': 'About page Good Sports section (Button text used as badge).',
    'about.partnership': 'About page partnership section text.',
    'about.committee': 'About page committee heading + intro.',
    'facilities.hero': 'Facilities page hero heading + subtitle.',
    'facilities.intro': 'Facilities ground intro and image URL.',
    'facilities.training': 'Facilities training section content and image URL.',
    'facilities.features_intro': 'Facilities feature grid heading + subtitle.',
    'facilities.cta': 'Facilities page CTA copy + button link.',
    'fixtures.hero': 'Fixtures page hero heading + subtitle.',
    'fixtures.status': 'Fixtures season status heading/body/button.',
    'fixtures.team_links': 'Fixtures team links heading + intro + Button text.',
    'merch.hero': 'Merchandise page hero heading + subtitle.',
    'merch.ordering': 'Merchandise ordering guidance panel.',
    'about.history': 'About page history heading + body copy.',
    'join.hero': 'Join page hero heading + intro copy.',
    'volunteer.hero': 'Volunteer page hero heading + intro copy.',
    'sponsors.intro': 'Sponsors page intro heading + body copy.',
    'footer.acknowledgement': 'Footer acknowledgement copy.',
  };

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
      setFeedback({ type: 'success', message: 'Page content saved.' });
      const refreshed = await loadBlocks();
      const freshBlock = refreshed.find((b) => b.id === updatedBlock.id);
      if (freshBlock) setSelected(freshBlock);
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Failed to save content block.' });
    } finally {
      setSaving(false);
    }
  }

  async function createBlock() {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await adminFetch('/api/admin/resources/contentBlocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          block_key: `new.block.${Date.now()}`,
          page_slug: 'general',
          section_label: 'New Content Block',
          title: '',
          body: '',
          is_active: true,
        }),
      });
      const result = await parseApiResponse<{ data?: Block }>(res);
      await loadBlocks();
      if (result.data) setSelected(result.data);
      setFeedback({ type: 'success', message: 'Page content section created.' });
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Failed to create content block.' });
    } finally {
      setSaving(false);
    }
  }

  const visibleBlocks = blocks.filter((block) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return [block.page_slug, block.section_label, block.block_key, block.title || '']
      .some((value) => value.toLowerCase().includes(needle));
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-display font-bold">Page Content</h1>
      <p className="text-sm text-gray-500">
        Edit page text using friendly sections grouped by page. Technical keys are hidden from the main editing list.
      </p>
      <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
        <p className="font-semibold">How to use content blocks</p>
        <ul className="list-disc ml-5 mt-1 space-y-1">
          <li>Internal keys map to a specific page section, for example <code>about.affiliation</code> on the About page.</li>
          <li>Repeatable content like news posts, facilities features, and history records belong in structured admin screens.</li>
          <li>Do not place internal admin comments in block body text. Block body text is shown on the public website.</li>
        </ul>
      </div>
      {feedback && (
        <p className={`text-sm px-3 py-2 rounded border ${feedback.type === 'error' ? 'text-red-600 bg-red-50 border-red-200' : 'text-green-700 bg-green-50 border-green-200'}`}>
          {feedback.message}
        </p>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border rounded-xl p-4 lg:col-span-1">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h2 className="font-semibold">Blocks</h2>
            <Button size="sm" onClick={createBlock} isLoading={saving}>New</Button>
          </div>
          <Input id="search_blocks" label="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
          {blocks.length === 0 ? (
            <p className="text-sm text-gray-500">No content blocks found. Create one with the New button.</p>
          ) : (
            <div className="space-y-2">
              {visibleBlocks.map((block) => (
                <button
                  key={block.id}
                  type="button"
                  onClick={() => { setSelected(block); setFeedback(null); }}
                  className={`w-full text-left px-3 py-2 rounded-lg border ${selected?.id === block.id ? 'border-maroon-600 bg-maroon-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <p className="font-medium text-sm">{block.section_label}</p>
                  <p className="text-xs text-gray-500">{block.page_slug} &middot; {block.block_key}</p>
                </button>
              ))}
              {visibleBlocks.length === 0 && (
                <p className="text-sm text-gray-500">No blocks match your search.</p>
              )}
            </div>
          )}
        </div>

        <div className="bg-white border rounded-xl p-4 lg:col-span-2 space-y-3">
          {!selected ? (
            <div className="text-center py-12">
              <p className="text-gray-400 text-sm">Select a content block to edit.</p>
            </div>
          ) : (
            <>
              <div className="border-b border-gray-100 pb-3 mb-3">
                <p className="text-xs text-gray-500">Editing: <span className="font-semibold text-gray-700">{selected.section_label}</span> ({selected.block_key})</p>
                <p className="text-xs text-gray-500 mt-1">
                  Controls: {usageHints[selected.block_key] || 'Mapped by block key in page code.'}
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Input id="block_key" label="Internal key" value={selected.block_key} onChange={(e) => setSelected((v) => v ? ({ ...v, block_key: e.target.value }) : v)} />
                <Input id="page_slug" label="Page slug" value={selected.page_slug} onChange={(e) => setSelected((v) => v ? ({ ...v, page_slug: e.target.value }) : v)} />
                <Input id="section_label" label="Section label" value={selected.section_label} onChange={(e) => setSelected((v) => v ? ({ ...v, section_label: e.target.value }) : v)} />
              </div>
              <Input id="block_title" label="Title" value={selected.title || ''} onChange={(e) => setSelected((v) => v ? ({ ...v, title: e.target.value }) : v)} />
              <Textarea id="block_body" label="Body" rows={5} value={selected.body || ''} onChange={(e) => setSelected((v) => v ? ({ ...v, body: e.target.value }) : v)} />
              <ImageUploadField id="block_image" label="Image" value={selected.image_url || ''} onChange={(value) => setSelected((v) => v ? ({ ...v, image_url: value }) : v)} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input id="block_cta_label" label="Button text" value={selected.cta_label || ''} onChange={(e) => setSelected((v) => v ? ({ ...v, cta_label: e.target.value }) : v)} />
                <Input id="block_cta_url" label="Button link" value={selected.cta_url || ''} onChange={(e) => setSelected((v) => v ? ({ ...v, cta_url: e.target.value }) : v)} />
              </div>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={selected.is_active} onChange={(e) => setSelected((v) => v ? ({ ...v, is_active: e.target.checked }) : v)} />
                Active
              </label>
              <div className="pt-3 border-t border-gray-100">
                <Button onClick={saveBlock} isLoading={saving}>Save Block</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
