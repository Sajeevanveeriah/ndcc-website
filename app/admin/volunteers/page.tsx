'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { VOLUNTEER_ROLES } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import type { Volunteer } from '@/lib/types';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { Select } from '@/components/ui/Input';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';
import { Users, CheckCircle } from 'lucide-react';

export default function AdminVolunteersPage() {
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    const fetchVolunteers = async () => {
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('volunteers')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (data) setVolunteers(data);
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
      const { error } = await supabase
        .from('volunteers')
        .update({ processed: true })
        .eq('id', id);

      if (error) throw error;

      setVolunteers((prev) =>
        prev.map((v) => (v.id === id ? { ...v, processed: true } : v))
      );
    } catch (err) {
      console.error('Failed to update volunteer:', err);
    }
  };

  const filteredVolunteers = volunteers.filter((v) => {
    if (filterRole && v.role !== filterRole) return false;
    if (filterStatus === 'contacted' && !v.processed) return false;
    if (filterStatus === 'pending' && v.processed) return false;
    return true;
  });

  const roleOptions = VOLUNTEER_ROLES.map((r) => ({ value: r, label: r }));
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
            Volunteers
          </h1>
          <p className="text-gray-500 font-body mt-1">
            {filteredVolunteers.length} volunteer{filteredVolunteers.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="w-full sm:w-48">
          <Select
            id="filter-role"
            options={roleOptions}
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            label="Filter by Role"
          />
        </div>
        <div className="w-full sm:w-48">
          <Select
            id="filter-status"
            options={statusOptions}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            label="Filter by Status"
          />
        </div>
        {(filterRole || filterStatus) && (
          <div className="flex items-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterRole('');
                setFilterStatus('');
              }}
            >
              Clear Filters
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-full mb-4" />
          <div className="h-4 bg-gray-200 rounded w-full mb-4" />
          <div className="h-4 bg-gray-200 rounded w-3/4" />
        </div>
      ) : filteredVolunteers.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-body">No volunteers found.</p>
        </div>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Name</TableHeader>
              <TableHeader>Email</TableHeader>
              <TableHeader>Phone</TableHeader>
              <TableHeader>Role</TableHeader>
              <TableHeader>Availability</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Date</TableHeader>
              <TableHeader>Actions</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredVolunteers.map((v) => (
              <TableRow key={v.id}>
                <TableCell>{v.name}</TableCell>
                <TableCell>
                  <a href={`mailto:${v.email}`} className="text-maroon-700 hover:underline">
                    {v.email}
                  </a>
                </TableCell>
                <TableCell>{v.phone}</TableCell>
                <TableCell>
                  <Badge>{v.role}</Badge>
                </TableCell>
                <TableCell>{v.availability}</TableCell>
                <TableCell>
                  {v.processed ? (
                    <Badge variant="success">Contacted</Badge>
                  ) : (
                    <Badge variant="warning">Pending</Badge>
                  )}
                </TableCell>
                <TableCell>{formatDate(v.created_at)}</TableCell>
                <TableCell>
                  {!v.processed && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleMarkContacted(v.id)}
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Mark Contacted
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
