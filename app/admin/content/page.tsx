'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
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
  const [selected, setSelected] = useState<Block | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  async function loadBlocks(): Promise<Block[]> {
    try {
      const res = await fetch('/api/admin/resources/contentBlocks', { cache: 'no-store' });
      const data = await parseApiResponse<{ data?: Block[] }>(res);
      const loaded = data.data || [];
      setBlocks(loaded);
      return loaded;
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Failed to load content blocks.' });
      return [];
    }
  }

  useEffect(() => { loadBlocks(); }, []);

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
      setFeedback({ type: 'success', message: 'Content block saved.' });
      const refreshed = await loadBlocks();
      const freshBlock = refreshed.find((b) => b.id === updatedBlock.id);
      if (freshBlock) setSelected(freshBlock);
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Failed to save content block.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-display font-bold">Content Blocks</h1>
      <p className="text-sm text-gray-500">Select a content block from the list on the left, edit the fields on the right, then click Save Block.</p>
      {feedback && (
        <p className={`text-sm px-3 py-2 rounded border ${feedback.type === 'error' ? 'text-red-600 bg-red-50 border-red-200' : 'text-green-700 bg-green-50 border-green-200'}`}>
          {feedback.message}
        </p>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border rounded-xl p-4 lg:col-span-1">
          <h2 className="font-semibold mb-3">Blocks</h2>
          {blocks.length === 0 ? (
            <p className="text-sm text-gray-500">No content blocks found. Content blocks are created via the database.</p>
          ) : (
            <div className="space-y-2">
              {blocks.map((block) => (
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
              </div>
              <Input id="block_title" label="Title" value={selected.title || ''} onChange={(e) => setSelected((v) => v ? ({ ...v, title: e.target.value }) : v)} />
              <Textarea id="block_body" label="Body" rows={5} value={selected.body || ''} onChange={(e) => setSelected((v) => v ? ({ ...v, body: e.target.value }) : v)} />
              <Input id="block_image" label="Image URL" value={selected.image_url || ''} onChange={(e) => setSelected((v) => v ? ({ ...v, image_url: e.target.value }) : v)} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input id="block_cta_label" label="CTA label" value={selected.cta_label || ''} onChange={(e) => setSelected((v) => v ? ({ ...v, cta_label: e.target.value }) : v)} />
                <Input id="block_cta_url" label="CTA URL" value={selected.cta_url || ''} onChange={(e) => setSelected((v) => v ? ({ ...v, cta_url: e.target.value }) : v)} />
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
