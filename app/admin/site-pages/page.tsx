'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Input, { Textarea, Select } from '@/components/ui/Input';
import { parseApiResponse } from '@/lib/admin-client';

type PageLinkCard = {
  id: string;
  page_slug: string;
  section_key: string;
  title: string;
  description: string;
  href: string;
  icon: string | null;
  badge: string | null;
  is_external: boolean;
  sort_order: number;
  is_active: boolean;
};

type FacilityFeature = {
  id: string;
  title: string;
  description: string;
  icon_key: string;
  sort_order: number;
  is_active: boolean;
};

const sectionOptions = [
  { value: 'home:quick_links', label: 'Home · Quick Links' },
  { value: 'fixtures:team_links', label: 'Fixtures · Team Links' },
  { value: 'about:articles', label: 'About · Articles' },
  { value: 'facilities:articles', label: 'Facilities · Articles' },
];

export default function AdminSitePagesPage() {
  const [cards, setCards] = useState<PageLinkCard[]>([]);
  const [features, setFeatures] = useState<FacilityFeature[]>([]);
  const [status, setStatus] = useState('');

  const [cardForm, setCardForm] = useState({
    id: '',
    page_section: sectionOptions[0].value,
    title: '',
    description: '',
    href: '',
    icon: '',
    badge: '',
    is_external: false,
    sort_order: '1',
    is_active: true,
  });

  const [featureForm, setFeatureForm] = useState({
    id: '',
    title: '',
    description: '',
    icon_key: 'feature',
    sort_order: '1',
    is_active: true,
  });

  async function loadAll() {
    try {
      const [cardsRes, featuresRes] = await Promise.all([
        fetch('/api/admin/resources/pageLinkCards', { cache: 'no-store' }),
        fetch('/api/admin/resources/facilityFeatures', { cache: 'no-store' }),
      ]);
      const [cardsData, featuresData] = await Promise.all([
        parseApiResponse<{ data?: PageLinkCard[] }>(cardsRes),
        parseApiResponse<{ data?: FacilityFeature[] }>(featuresRes),
      ]);
      setCards(cardsData.data || []);
      setFeatures(featuresData.data || []);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to load page content resources.');
    }
  }

  useEffect(() => { loadAll(); }, []);

  async function saveCard(e: React.FormEvent) {
    e.preventDefault();
    const [page_slug, section_key] = cardForm.page_section.split(':');
    const payload = {
      page_slug,
      section_key,
      title: cardForm.title.trim(),
      description: cardForm.description.trim(),
      href: cardForm.href.trim(),
      icon: cardForm.icon.trim() || null,
      badge: cardForm.badge.trim() || null,
      is_external: cardForm.is_external,
      sort_order: Number(cardForm.sort_order || 0),
      is_active: cardForm.is_active,
    };

    try {
      const res = await fetch('/api/admin/resources/pageLinkCards', {
        method: cardForm.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cardForm.id ? { id: cardForm.id, ...payload } : payload),
      });
      await parseApiResponse(res);
      setStatus(cardForm.id ? 'Page card updated.' : 'Page card created.');
      setCardForm({
        id: '',
        page_section: sectionOptions[0].value,
        title: '',
        description: '',
        href: '',
        icon: '',
        badge: '',
        is_external: false,
        sort_order: '1',
        is_active: true,
      });
      loadAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save page card.');
    }
  }

  async function saveFeature(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      title: featureForm.title.trim(),
      description: featureForm.description.trim(),
      icon_key: featureForm.icon_key.trim() || 'feature',
      sort_order: Number(featureForm.sort_order || 0),
      is_active: featureForm.is_active,
    };

    try {
      const res = await fetch('/api/admin/resources/facilityFeatures', {
        method: featureForm.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(featureForm.id ? { id: featureForm.id, ...payload } : payload),
      });
      await parseApiResponse(res);
      setStatus(featureForm.id ? 'Facility feature updated.' : 'Facility feature created.');
      setFeatureForm({ id: '', title: '', description: '', icon_key: 'feature', sort_order: '1', is_active: true });
      loadAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save facility feature.');
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-display font-bold">Site Pages</h1>
      <p className="text-sm text-gray-500">Manage repeatable cards and links used on Home, Fixtures, About, and Facilities pages.</p>
      {status && <p className="text-sm text-gray-600">{status}</p>}

      <section className="bg-white border rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-semibold">Page Link Cards</h2>
        <form className="grid grid-cols-1 md:grid-cols-2 gap-3" onSubmit={saveCard}>
          <Select id="page_section" label="Page section" options={sectionOptions} value={cardForm.page_section} onChange={(e) => setCardForm((v) => ({ ...v, page_section: e.target.value }))} />
          <Input id="card_title" label="Card title" required value={cardForm.title} onChange={(e) => setCardForm((v) => ({ ...v, title: e.target.value }))} />
          <Textarea id="card_description" label="Description" rows={3} value={cardForm.description} onChange={(e) => setCardForm((v) => ({ ...v, description: e.target.value }))} />
          <Input id="card_href" label="URL" required value={cardForm.href} onChange={(e) => setCardForm((v) => ({ ...v, href: e.target.value }))} />
          <Input id="card_icon" label="Icon (emoji optional)" value={cardForm.icon} onChange={(e) => setCardForm((v) => ({ ...v, icon: e.target.value }))} />
          <Input id="card_badge" label="Badge/grade" value={cardForm.badge} onChange={(e) => setCardForm((v) => ({ ...v, badge: e.target.value }))} />
          <Input id="card_sort" label="Sort order" type="number" value={cardForm.sort_order} onChange={(e) => setCardForm((v) => ({ ...v, sort_order: e.target.value }))} />
          <div className="flex items-end gap-4">
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={cardForm.is_external} onChange={(e) => setCardForm((v) => ({ ...v, is_external: e.target.checked }))} />External link</label>
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={cardForm.is_active} onChange={(e) => setCardForm((v) => ({ ...v, is_active: e.target.checked }))} />Active</label>
          </div>
          <div className="md:col-span-2 flex gap-2">
            <Button type="submit">{cardForm.id ? 'Update Card' : 'Save Card'}</Button>
            {cardForm.id && <Button type="button" variant="secondary" onClick={() => setCardForm({ id: '', page_section: sectionOptions[0].value, title: '', description: '', href: '', icon: '', badge: '', is_external: false, sort_order: '1', is_active: true })}>Cancel</Button>}
          </div>
        </form>

        <ul className="space-y-2 text-sm text-gray-700">
          {cards.map((card) => (
            <li key={card.id} className="border rounded-lg px-3 py-2 flex items-center justify-between gap-3">
              <span>{card.page_slug}/{card.section_key} · {card.title} · {card.href}</span>
              <Button size="sm" variant="ghost" onClick={() => setCardForm({
                id: card.id,
                page_section: `${card.page_slug}:${card.section_key}`,
                title: card.title,
                description: card.description || '',
                href: card.href,
                icon: card.icon || '',
                badge: card.badge || '',
                is_external: card.is_external,
                sort_order: String(card.sort_order),
                is_active: card.is_active,
              })}>Edit</Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-white border rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-semibold">Facility Features</h2>
        <form className="grid grid-cols-1 md:grid-cols-2 gap-3" onSubmit={saveFeature}>
          <Input id="feature_title" label="Feature title" required value={featureForm.title} onChange={(e) => setFeatureForm((v) => ({ ...v, title: e.target.value }))} />
          <Input id="feature_icon_key" label="Icon key" value={featureForm.icon_key} onChange={(e) => setFeatureForm((v) => ({ ...v, icon_key: e.target.value }))} />
          <Textarea id="feature_description" label="Description" rows={3} value={featureForm.description} onChange={(e) => setFeatureForm((v) => ({ ...v, description: e.target.value }))} />
          <Input id="feature_sort" label="Sort order" type="number" value={featureForm.sort_order} onChange={(e) => setFeatureForm((v) => ({ ...v, sort_order: e.target.value }))} />
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={featureForm.is_active} onChange={(e) => setFeatureForm((v) => ({ ...v, is_active: e.target.checked }))} />Active</label>
          <div className="md:col-span-2 flex gap-2">
            <Button type="submit">{featureForm.id ? 'Update Feature' : 'Save Feature'}</Button>
            {featureForm.id && <Button type="button" variant="secondary" onClick={() => setFeatureForm({ id: '', title: '', description: '', icon_key: 'feature', sort_order: '1', is_active: true })}>Cancel</Button>}
          </div>
        </form>

        <ul className="space-y-2 text-sm text-gray-700">
          {features.map((feature) => (
            <li key={feature.id} className="border rounded-lg px-3 py-2 flex items-center justify-between gap-3">
              <span>{feature.title} · {feature.icon_key} · sort {feature.sort_order}</span>
              <Button size="sm" variant="ghost" onClick={() => setFeatureForm({ id: feature.id, title: feature.title, description: feature.description, icon_key: feature.icon_key, sort_order: String(feature.sort_order), is_active: feature.is_active })}>Edit</Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
