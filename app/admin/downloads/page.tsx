import SimpleResourceManager from '@/components/admin/SimpleResourceManager';

export default function AdminDownloadsPage() {
  return <SimpleResourceManager title="Public Downloads" intro="Manage downloadable documents such as sponsorship PDFs shown on public pages." resource="publicDownloads" primaryLabel="title" newRow={{ title: '', href: '', category: 'sponsorship', description: '', sort_order: 0, is_active: true }} fields={[{ key: 'title', label: 'Document title' }, { key: 'href', label: 'File link' }, { key: 'category', label: 'Category' }, { key: 'description', label: 'Description', type: 'textarea' }, { key: 'sort_order', label: 'Display order', type: 'number' }, { key: 'is_active', label: 'Show on website', type: 'checkbox' }]} />;
}
