'use client';

import { useEffect, useState } from 'react';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { parseApiResponse, adminFetch } from '@/lib/admin-client';
import { fallbackClubSettings, type ClubSettings } from '@/lib/club-settings-types';
import { Settings } from 'lucide-react';

type ClubSettingsForm = Omit<ClubSettings, 'id' | 'updated_at'>;

const emptyForm: ClubSettingsForm = {
  club_name: '',
  club_short: '',
  club_nickname: '',
  established_year: null,
  email: '',
  phone: '',
  ground_name: '',
  address: '',
  association_name: '',
  association_short: '',
  facebook_url: '',
  instagram_url: '',
  instagram_handle: '',
  playhq_url: '',
  google_maps_embed_url: '',
};

function toForm(settings: ClubSettings): ClubSettingsForm {
  return {
    club_name: settings.club_name,
    club_short: settings.club_short,
    club_nickname: settings.club_nickname,
    established_year: settings.established_year,
    email: settings.email || '',
    phone: settings.phone || '',
    ground_name: settings.ground_name || '',
    address: settings.address || '',
    association_name: settings.association_name || '',
    association_short: settings.association_short || '',
    facebook_url: settings.facebook_url || '',
    instagram_url: settings.instagram_url || '',
    instagram_handle: settings.instagram_handle || '',
    playhq_url: settings.playhq_url || '',
    google_maps_embed_url: settings.google_maps_embed_url || '',
  };
}

export default function AdminClubDetailsPage() {
  const [form, setForm] = useState<ClubSettingsForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch('/api/admin/resources/clubSettings', { cache: 'no-store' });
        const result = await parseApiResponse<{ data?: ClubSettings[] }>(response);
        setForm(toForm(result.data?.[0] || fallbackClubSettings));
      } catch (err) {
        setForm(toForm(fallbackClubSettings));
        setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to fetch club details.' });
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const updateField = (field: keyof ClubSettingsForm, value: string) => {
    setForm((prev) => ({
      ...prev,
      [field]: field === 'established_year' ? (value ? Number(value) : null) : value,
    }));
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!form.club_name.trim()) errors.club_name = 'Club name is required.';
    if (!form.club_short.trim()) errors.club_short = 'Short name is required.';
    if (!form.club_nickname.trim()) errors.club_nickname = 'Nickname is required.';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    setFeedback(null);

    const payload = {
      club_name: form.club_name.trim(),
      club_short: form.club_short.trim(),
      club_nickname: form.club_nickname.trim(),
      established_year: form.established_year || null,
      email: form.email?.trim() || null,
      phone: form.phone?.trim() || null,
      ground_name: form.ground_name?.trim() || null,
      address: form.address?.trim() || null,
      association_name: form.association_name?.trim() || null,
      association_short: form.association_short?.trim() || null,
      facebook_url: form.facebook_url?.trim() || null,
      instagram_url: form.instagram_url?.trim() || null,
      instagram_handle: form.instagram_handle?.trim() || null,
      playhq_url: form.playhq_url?.trim() || null,
      google_maps_embed_url: form.google_maps_embed_url?.trim() || null,
    };

    try {
      const response = await adminFetch('/api/admin/resources/clubSettings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'default', ...payload }),
      });
      const result = await parseApiResponse<{ data: ClubSettings }>(response);
      setForm(toForm(result.data));
      setFeedback({ type: 'success', message: 'Club details saved.' });
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to save club details.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-content-primary flex items-center gap-2">
          <Settings className="h-6 w-6 text-maroon-700 dark:text-maroon-200" />
          Club Details
        </h1>
        <p className="text-content-muted font-body mt-1">
          Manage site-wide club contact details, social links, ground details, and key club links.
        </p>
      </div>

      {feedback && (
        <p className={`mb-4 text-sm ${feedback.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>{feedback.message}</p>
      )}

      {loading ? (
        <div className="bg-surface-card rounded-xl border border-edge-subtle p-8 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-full mb-4" />
          <div className="h-4 bg-gray-200 rounded w-full mb-4" />
          <div className="h-4 bg-gray-200 rounded w-3/4" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-6 space-y-8">
            <div>
              <h2 className="text-lg font-display font-bold text-content-primary mb-4">Club identity</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input id="club-name" label="Club name" value={form.club_name} onChange={(e) => updateField('club_name', e.target.value)} error={formErrors.club_name} required />
                <Input id="club-short" label="Short name" value={form.club_short} onChange={(e) => updateField('club_short', e.target.value)} error={formErrors.club_short} required />
                <Input id="club-nickname" label="Nickname" value={form.club_nickname} onChange={(e) => updateField('club_nickname', e.target.value)} error={formErrors.club_nickname} required />
                <Input id="established-year" label="Established year" type="number" value={form.established_year ?? ''} onChange={(e) => updateField('established_year', e.target.value)} />
              </div>
            </div>

            <div>
              <h2 className="text-lg font-display font-bold text-content-primary mb-4">Contact and ground</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input id="club-email" label="Email" type="email" value={form.email || ''} onChange={(e) => updateField('email', e.target.value)} />
                <Input id="club-phone" label="Phone" value={form.phone || ''} onChange={(e) => updateField('phone', e.target.value)} />
                <Input id="ground-name" label="Ground name" value={form.ground_name || ''} onChange={(e) => updateField('ground_name', e.target.value)} />
                <Input id="address" label="Address" value={form.address || ''} onChange={(e) => updateField('address', e.target.value)} />
                <Input id="association-name" label="Association name" value={form.association_name || ''} onChange={(e) => updateField('association_name', e.target.value)} />
                <Input id="association-short" label="Association short name" value={form.association_short || ''} onChange={(e) => updateField('association_short', e.target.value)} />
              </div>
            </div>

            <div>
              <h2 className="text-lg font-display font-bold text-content-primary mb-4">Links</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input id="facebook-url" label="Facebook URL" type="url" value={form.facebook_url || ''} onChange={(e) => updateField('facebook_url', e.target.value)} />
                <Input id="instagram-url" label="Instagram URL" type="url" value={form.instagram_url || ''} onChange={(e) => updateField('instagram_url', e.target.value)} />
                <Input id="instagram-handle" label="Instagram handle" value={form.instagram_handle || ''} onChange={(e) => updateField('instagram_handle', e.target.value)} />
                <Input id="playhq-url" label="PlayHQ URL" type="url" value={form.playhq_url || ''} onChange={(e) => updateField('playhq_url', e.target.value)} />
                <Input id="google-maps-embed-url" label="Google Maps embed URL" value={form.google_maps_embed_url || ''} onChange={(e) => updateField('google_maps_embed_url', e.target.value)} className="md:col-span-2" />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="button" onClick={handleSave} isLoading={saving}>
                {saving ? 'Saving...' : 'Save Club Details'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
