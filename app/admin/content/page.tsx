'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Input, { Textarea } from '@/components/ui/Input';
import { parseApiResponse } from '@/lib/admin-client';

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
  const [message, setMessage] = useState('');

  async function loadBlocks() {
    try {
      const res = await fetch('/api/admin/resources/contentBlocks', { cache: 'no-store' });
      const data = await parseApiResponse<{ data?: Block[] }>(res);
      setBlocks(data.data || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load content blocks.');
    }
  }

  useEffect(() => { loadBlocks(); }, []);

  async function saveBlock() {
    if (!selected) return;
    const res = await fetch('/api/admin/resources/contentBlocks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: selected.id, title: selected.title, body: selected.body, image_url: selected.image_url, cta_label: selected.cta_label, cta_url: selected.cta_url, is_active: selected.is_active }),
    });
    try {
      await parseApiResponse(res);
      setMessage('Content block saved.');
      loadBlocks();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save content block.');
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-display font-bold">Content Blocks</h1>
      {message && <p className="text-sm text-gray-600">{message}</p>}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border rounded-xl p-4 lg:col-span-1">
          <h2 className="font-semibold mb-3">Blocks</h2>
          <div className="space-y-2">
            {blocks.map((block) => (
              <button
                key={block.id}
                type="button"
                onClick={() => setSelected(block)}
                className={`w-full text-left px-3 py-2 rounded-lg border ${selected?.id === block.id ? 'border-maroon-600 bg-maroon-50' : 'border-gray-200'}`}
              >
                <p className="font-medium">{block.section_label}</p>
                <p className="text-xs text-gray-500">{block.block_key}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white border rounded-xl p-4 lg:col-span-2 space-y-3">
          {!selected ? (
            <p className="text-sm text-gray-500">Select a content block to edit.</p>
          ) : (
            <>
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
              <div>
                <Button onClick={saveBlock}>Save Block</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
