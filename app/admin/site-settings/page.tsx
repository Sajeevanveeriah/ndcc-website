import SimpleResourceManager from '@/components/admin/SimpleResourceManager';

export default function AdminSiteSettingsPage() {
  return <SimpleResourceManager title="Site Settings" intro="Manage club profile details, contact details, social links, and footer text used across the public website." resource="siteSettings" primaryLabel="label" newRow={{ key: '', label: '', value: '', field_type: 'text', group_label: 'Site Settings', sort_order: 0, is_public: true }} fields={[{ key: 'key', label: 'Internal setting key' }, { key: 'label', label: 'Friendly label' }, { key: 'value', label: 'Value', type: 'textarea' }, { key: 'field_type', label: 'Field type' }, { key: 'group_label', label: 'Admin group' }, { key: 'sort_order', label: 'Display order', type: 'number' }, { key: 'is_public', label: 'Show on website', type: 'checkbox' }]} />;
}
