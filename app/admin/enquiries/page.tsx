'use client';

import { useEffect, useState } from 'react';
import { ENQUIRY_TYPES } from '@/lib/constants';
import { formatDate, truncateText } from '@/lib/utils';
import type { Contact } from '@/lib/types';
import { parseApiResponse } from '@/lib/admin-client';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { Select } from '@/components/ui/Input';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';
import { Mail, CheckCircle, Eye } from 'lucide-react';

export default function AdminEnquiriesPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const fetchContacts = async () => {
      try {
        const response = await fetch('/api/admin/resources/enquiries', { cache: 'no-store' });
        const result = await parseApiResponse<{ data?: Contact[] }>(response);
        setContacts(result.data || []);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Failed to fetch contacts.');
      } finally {
        setLoading(false);
      }
    };

    fetchContacts();
  }, []);

  const handleMarkResponded = async (id: string) => {
    try {
      const response = await fetch('/api/admin/resources/enquiries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, responded: true }),
      });
      await parseApiResponse(response);

      setContacts((prev) =>
        prev.map((c) => (c.id === id ? { ...c, responded: true } : c))
      );
      setMessage('Enquiry marked as responded.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to update enquiry.');
    }
  };

  const getEnquiryLabel = (value: string) => {
    const found = ENQUIRY_TYPES.find((t) => t.value === value);
    return found ? found.label : value;
  };

  const filteredContacts = contacts.filter((c) => {
    if (filterType && c.enquiry_type !== filterType) return false;
    if (filterStatus === 'responded' && !c.responded) return false;
    if (filterStatus === 'pending' && c.responded) return false;
    return true;
  });

  const typeOptions = ENQUIRY_TYPES.map((t) => ({ value: t.value, label: t.label }));
  const statusOptions = [
    { value: 'pending', label: 'Pending' },
    { value: 'responded', label: 'Responded' },
  ];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-900 flex items-center gap-2">
            <Mail className="h-6 w-6 text-maroon-700" />
            Enquiries
          </h1>
          <p className="text-gray-500 font-body mt-1">
            {filteredContacts.length} enquir{filteredContacts.length !== 1 ? 'ies' : 'y'}
          </p>
        </div>
      </div>
      {message && <p className="mb-4 text-sm text-gray-600">{message}</p>}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="w-full sm:w-48">
          <Select
            id="filter-type"
            options={typeOptions}
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            label="Filter by Type"
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
        {(filterType || filterStatus) && (
          <div className="flex items-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterType('');
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
      ) : filteredContacts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <Mail className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-body">No enquiries found.</p>
        </div>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Name</TableHeader>
              <TableHeader>Email</TableHeader>
              <TableHeader>Type</TableHeader>
              <TableHeader>Message</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Date</TableHeader>
              <TableHeader>Actions</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredContacts.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.name}</TableCell>
                <TableCell>
                  <a href={`mailto:${c.email}`} className="text-maroon-700 hover:underline">
                    {c.email}
                  </a>
                </TableCell>
                <TableCell>
                  <Badge variant="info">{getEnquiryLabel(c.enquiry_type)}</Badge>
                </TableCell>
                <TableCell>
                  <p className="max-w-xs">{truncateText(c.message, 60)}</p>
                </TableCell>
                <TableCell>
                  {c.responded ? (
                    <Badge variant="success">Responded</Badge>
                  ) : (
                    <Badge variant="warning">Pending</Badge>
                  )}
                </TableCell>
                <TableCell>{formatDate(c.created_at)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedContact(c)}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                    {!c.responded && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleMarkResponded(c.id)}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Responded
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Message Detail Modal */}
      <Modal
        isOpen={!!selectedContact}
        onClose={() => setSelectedContact(null)}
        title={selectedContact ? `Enquiry from ${selectedContact.name}` : ''}
        size="lg"
      >
        {selectedContact && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 font-body uppercase tracking-wider">Name</p>
                <p className="text-sm text-gray-900 font-body mt-1">{selectedContact.name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-body uppercase tracking-wider">Email</p>
                <a href={`mailto:${selectedContact.email}`} className="text-sm text-maroon-700 hover:underline font-body mt-1 block">
                  {selectedContact.email}
                </a>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-body uppercase tracking-wider">Type</p>
                <p className="text-sm text-gray-900 font-body mt-1">{getEnquiryLabel(selectedContact.enquiry_type)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-body uppercase tracking-wider">Date</p>
                <p className="text-sm text-gray-900 font-body mt-1">{formatDate(selectedContact.created_at)}</p>
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-500 font-body uppercase tracking-wider mb-2">Message</p>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-700 font-body whitespace-pre-wrap">{selectedContact.message}</p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-gray-100">
              <div>
                {selectedContact.responded ? (
                  <Badge variant="success">Responded</Badge>
                ) : (
                  <Badge variant="warning">Pending</Badge>
                )}
              </div>
              <div className="flex gap-2">
                {!selectedContact.responded && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      handleMarkResponded(selectedContact.id);
                      setSelectedContact({ ...selectedContact, responded: true });
                    }}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Mark as Responded
                  </Button>
                )}
                <Button variant="secondary" size="sm" onClick={() => setSelectedContact(null)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
