import SimpleResourceManager from '@/components/admin/SimpleResourceManager';

export default function AdminNavigationPage() {
  return <SimpleResourceManager title="Navigation & Footer Links" intro="Manage the public menu and footer affiliation links without editing code." resource="navigationLinks" primaryLabel="label" newRow={{ label: '', href: '', group_label: 'main', sort_order: 0, is_active: true }} fields={[{ key: 'label', label: 'Link text' }, { key: 'href', label: 'Link URL' }, { key: 'group_label', label: 'Link group' }, { key: 'sort_order', label: 'Display order', type: 'number' }, { key: 'is_active', label: 'Show on website', type: 'checkbox' }]} />;
}
