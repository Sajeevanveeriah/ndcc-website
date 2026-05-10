import SimpleResourceManager from '@/components/admin/SimpleResourceManager';

export default function AdminAchievementsPage() {
  return <SimpleResourceManager title="Achievements" intro="Manage public achievement cards and images used around the website." resource="achievements" primaryLabel="title" newRow={{ title: '', description: '', image_url: '', alt_text: '', season_label: '', sort_order: 0, is_active: true }} fields={[{ key: 'title', label: 'Achievement title' }, { key: 'description', label: 'Description', type: 'textarea' }, { key: 'image_url', label: 'Image', type: 'image' }, { key: 'alt_text', label: 'Image alt text' }, { key: 'season_label', label: 'Season' }, { key: 'sort_order', label: 'Display order', type: 'number' }, { key: 'is_active', label: 'Show on website', type: 'checkbox' }]} />;
}
