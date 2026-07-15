'use client';

import { useEffect, useState } from 'react';
import { formatDate } from '@/lib/utils';
import { parseApiResponse } from '@/lib/admin-client';
import Button from '@/components/ui/Button';
import DeleteRecordButton from '@/components/admin/DeleteRecordButton';
import Badge from '@/components/ui/Badge';
import Input, { Select, Textarea } from '@/components/ui/Input';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';
import { Users, CheckCircle, ClipboardList } from 'lucide-react';

type VolunteerExpression = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  availability: string;
  status: string;
  created_at: string;
};

type VolunteerPosition = {
  id: string;
  title: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
};

const emptyPositionForm = { id: '', title: '', description: '', sort_order: '1', is_active: true };

export default function AdminVolunteersPage() {
  const [volunteers, setVolunteers] = useState<VolunteerExpression[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [message, setMessage] = useState('');
  const [positions, setPositions] = useState<VolunteerPosition[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(true);
  const [positionForm, setPositionForm] = useState(emptyPositionForm);
  const [positionSaving, setPositionSaving] = useState(false);

  const fetchPositions = async () => {
    try {
      const response = await fetch('/api/admin/resources/volunteerPositions', { cache: 'no-store' });
      const result = await parseApiResponse<{ data?: VolunteerPosition[] }>(response);
      setPositions(result.data || []);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to fetch volunteer positions.');
    } finally {
      setPositionsLoading(false);
    }
  };

  useEffect(() => {
    const fetchVolunteers = async () => {
      try {
        const response = await fetch('/api/admin/resources/volunteerExpressions', { cache: 'no-store' });
        const result = await parseApiResponse<{ data?: VolunteerExpression[] }>(response);
        setVolunteers(result.data || []);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Failed to fetch volunteers.');
      } finally {
        setLoading(false);
      }
    };

    fetchVolunteers();
    fetchPositions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const savePosition = async (e: React.FormEvent) => {
    e.preventDefault();
    setPositionSaving(true);
    try {
      const payload = {
        title: positionForm.title.trim(),
        description: positionForm.description.trim() || null,
        sort_order: Number(positionForm.sort_order || 0),
        is_active: positionForm.is_active,
      };
      const response = await fetch('/api/admin/resources/volunteerPositions', {
        method: positionForm.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(positionForm.id ? { id: positionForm.id, ...payload } : payload),
      });
      await parseApiResponse(response);
      setMessage(positionForm.id ? 'Volunteer position updated.' : 'Volunteer position created.');
      setPositionForm(emptyPositionForm);
      await fetchPositions();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save volunteer position.');
    } finally {
      setPositionSaving(false);
    }
  };

  const togglePositionActive = async (position: VolunteerPosition) => {
    try {
      const response = await fetch('/api/admin/resources/volunteerPositions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: position.id, is_active: !position.is_active }),
      });
      await parseApiResponse(response);
      setMessage(position.is_active ? 'Volunteer position deactivated.' : 'Volunteer position activated.');
      await fetchPositions();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to update volunteer position.');
    }
  };

  const handleMarkContacted = async (id: string) => {
    try {
      const response = await fetch('/api/admin/resources/volunteerExpressions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'contacted', contacted_at: new Date().toISOString() }),
      });
      await parseApiResponse(response);

      setVolunteers((prev) => prev.map((v) => (v.id === id ? { ...v, status: 'contacted' } : v)));
      setMessage('Volunteer marked as contacted.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to update volunteer.');
    }
  };

  const handleDeleted = (id: string) => {
    setVolunteers((prev) => prev.filter((v) => v.id !== id));
  };

  const filteredVolunteers = volunteers.filter((v) => {
    if (filterStatus === 'contacted' && v.status !== 'contacted') return false;
    if (filterStatus === 'pending' && v.status === 'contacted') return false;
    return true;
  });

  const statusOptions = [
    { value: 'pending', label: 'Pending' },
    { value: 'contacted', label: 'Contacted' },
  ];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-content-primary flex items-center gap-2">
            <Users className="h-6 w-6 text-maroon-700 dark:text-maroon-200" />
            Volunteer EOIs
          </h1>
          <p className="text-content-muted font-body mt-1">
            {filteredVolunteers.length} expression{filteredVolunteers.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
      {message && <p className="mb-4 text-sm text-content-muted">{message}</p>}

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="w-full sm:w-48">
          <Select id="filter-status" options={statusOptions} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} label="Filter by Status" />
        </div>
        {filterStatus && (
          <div className="flex items-end">
            <Button variant="ghost" size="sm" onClick={() => setFilterStatus('')}>Clear Filters</Button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="bg-surface-card rounded-xl border border-edge-subtle p-8 animate-pulse"><div className="h-4 bg-gray-200 rounded w-full mb-4" /></div>
      ) : filteredVolunteers.length === 0 ? (
        <div className="bg-surface-card rounded-xl border border-edge-subtle p-8 text-center"><p className="text-content-muted font-body">No volunteer EOIs found.</p></div>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Name</TableHeader>
              <TableHeader>Email</TableHeader>
              <TableHeader>Phone</TableHeader>
              <TableHeader>Availability</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Date</TableHeader>
              <TableHeader>Actions</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredVolunteers.map((v) => (
              <TableRow key={v.id}>
                <TableCell>{v.full_name}</TableCell>
                <TableCell><a href={`mailto:${v.email}`} className="text-maroon-700 dark:text-maroon-200 hover:underline">{v.email}</a></TableCell>
                <TableCell>{v.phone}</TableCell>
                <TableCell>{v.availability}</TableCell>
                <TableCell>{v.status === 'contacted' ? <Badge variant="success">Contacted</Badge> : <Badge variant="warning">Pending</Badge>}</TableCell>
                <TableCell>{formatDate(v.created_at)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {v.status !== 'contacted' && (
                      <Button variant="ghost" size="sm" onClick={() => handleMarkContacted(v.id)}>
                        <CheckCircle className="h-4 w-4 mr-1" />Mark Contacted
                      </Button>
                    )}
                    <DeleteRecordButton
                      resource="volunteerExpressions"
                      recordId={v.id}
                      recordLabel={`volunteer EOI from ${v.full_name}`}
                      recordDetails={[
                        { label: 'Name', value: v.full_name },
                        { label: 'Email', value: v.email },
                        { label: 'Date', value: formatDate(v.created_at) },
                      ]}
                      onDeleted={handleDeleted}
                      onSuccessMessage={setMessage}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div className="mt-10 space-y-4">
        <h2 className="text-xl font-display font-bold text-content-primary flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-maroon-700 dark:text-maroon-200" />
          Volunteer Positions
        </h2>
        <form onSubmit={savePosition} className="bg-surface-card rounded-xl border border-edge-subtle p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input id="position_title" label="Title" required value={positionForm.title} onChange={(e) => setPositionForm((v) => ({ ...v, title: e.target.value }))} />
            <Input id="position_sort" label="Sort order" type="number" value={positionForm.sort_order} onChange={(e) => setPositionForm((v) => ({ ...v, sort_order: e.target.value }))} />
            <label className="inline-flex items-center gap-2 text-sm self-end pb-3">
              <input type="checkbox" checked={positionForm.is_active} onChange={(e) => setPositionForm((v) => ({ ...v, is_active: e.target.checked }))} />
              Active
            </label>
          </div>
          <Textarea id="position_description" label="Description" rows={3} value={positionForm.description} onChange={(e) => setPositionForm((v) => ({ ...v, description: e.target.value }))} />
          <div className="flex gap-2">
            <Button type="submit" isLoading={positionSaving}>{positionForm.id ? 'Update Position' : 'Add Position'}</Button>
            {positionForm.id && <Button type="button" variant="secondary" onClick={() => setPositionForm(emptyPositionForm)}>Cancel</Button>}
          </div>
        </form>

        {positionsLoading ? (
          <div className="bg-surface-card rounded-xl border border-edge-subtle p-6 text-sm text-content-muted">Loading volunteer positions...</div>
        ) : positions.length === 0 ? (
          <div className="bg-surface-card rounded-xl border border-edge-subtle p-6 text-sm text-content-muted">No volunteer positions yet. Add one above.</div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Title</TableHeader>
                <TableHeader>Description</TableHeader>
                <TableHeader>Sort</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Actions</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {positions.map((position) => (
                <TableRow key={position.id}>
                  <TableCell className="font-medium">{position.title}</TableCell>
                  <TableCell><p className="max-w-xs truncate">{position.description || '-'}</p></TableCell>
                  <TableCell>{position.sort_order}</TableCell>
                  <TableCell>{position.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="danger">Inactive</Badge>}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setPositionForm({ id: position.id, title: position.title, description: position.description || '', sort_order: String(position.sort_order), is_active: position.is_active })}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => togglePositionActive(position)}>{position.is_active ? 'Deactivate' : 'Activate'}</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
