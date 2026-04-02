'use client';

import { useEffect, useState } from 'react';
import { formatDate } from '@/lib/utils';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { Select } from '@/components/ui/Input';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';
import { Users, CheckCircle } from 'lucide-react';

type VolunteerExpression = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  availability: string;
  status: string;
  created_at: string;
};

export default function AdminVolunteersPage() {
  const [volunteers, setVolunteers] = useState<VolunteerExpression[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    const fetchVolunteers = async () => {
      try {
        const response = await fetch('/api/admin/resources/volunteerExpressions', { cache: 'no-store' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to load data');
        setVolunteers(result.data || []);
      } catch (err) {
        console.error('Failed to fetch volunteers:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchVolunteers();
  }, []);

  const handleMarkContacted = async (id: string) => {
    try {
      const response = await fetch('/api/admin/resources/volunteerExpressions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'contacted', contacted_at: new Date().toISOString() }),
      });

      if (!response.ok) throw new Error('Failed to update');

      setVolunteers((prev) => prev.map((v) => (v.id === id ? { ...v, status: 'contacted' } : v)));
    } catch (err) {
      console.error('Failed to update volunteer:', err);
    }
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
          <h1 className="text-2xl font-display font-bold text-gray-900 flex items-center gap-2">
            <Users className="h-6 w-6 text-maroon-700" />
            Volunteer EOIs
          </h1>
          <p className="text-gray-500 font-body mt-1">
            {filteredVolunteers.length} expression{filteredVolunteers.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

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
        <div className="bg-white rounded-xl border border-gray-100 p-8 animate-pulse"><div className="h-4 bg-gray-200 rounded w-full mb-4" /></div>
      ) : filteredVolunteers.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center"><p className="text-gray-500 font-body">No volunteer EOIs found.</p></div>
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
                <TableCell><a href={`mailto:${v.email}`} className="text-maroon-700 hover:underline">{v.email}</a></TableCell>
                <TableCell>{v.phone}</TableCell>
                <TableCell>{v.availability}</TableCell>
                <TableCell>{v.status === 'contacted' ? <Badge variant="success">Contacted</Badge> : <Badge variant="warning">Pending</Badge>}</TableCell>
                <TableCell>{formatDate(v.created_at)}</TableCell>
                <TableCell>
                  {v.status !== 'contacted' && (
                    <Button variant="ghost" size="sm" onClick={() => handleMarkContacted(v.id)}>
                      <CheckCircle className="h-4 w-4 mr-1" />Mark Contacted
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
