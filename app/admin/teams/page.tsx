import SimpleResourceManager from '@/components/admin/SimpleResourceManager';

export default function AdminTeamsPage() {
  return <SimpleResourceManager title="Teams Page" intro="Manage the team names, grade labels, descriptions, and PlayHQ links shown on the Teams and Fixtures pages." resource="teams" primaryLabel="name" newRow={{ name: '', grade: '', description: '', captain: '', playhq_url: '', sort_order: 0, is_active: true }} fields={[{ key: 'name', label: 'Team name' }, { key: 'grade', label: 'Grade' }, { key: 'description', label: 'Team description', type: 'textarea' }, { key: 'captain', label: 'Captain' }, { key: 'playhq_url', label: 'PlayHQ link' }, { key: 'sort_order', label: 'Display order', type: 'number' }, { key: 'is_active', label: 'Show on website', type: 'checkbox' }]} />;
}
