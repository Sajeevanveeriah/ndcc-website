'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatDate, formatCurrency } from '@/lib/utils';
import type { Order } from '@/lib/types';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { Select } from '@/components/ui/Input';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';
import { ShoppingBag, CheckCircle } from 'lucide-react';

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    const fetchOrders = async () => {
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (data) setOrders(data);
      } catch (err) {
        console.error('Failed to fetch orders:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, []);

  const handleMarkProcessed = async (id: string) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ processed: true })
        .eq('id', id);

      if (error) throw error;

      setOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, processed: true } : o))
      );
    } catch (err) {
      console.error('Failed to update order:', err);
    }
  };

  const filteredOrders = orders.filter((o) => {
    if (filterStatus === 'processed' && !o.processed) return false;
    if (filterStatus === 'pending' && o.processed) return false;
    if (filterStatus === 'paid' && o.payment_status !== 'paid') return false;
    if (filterStatus === 'unpaid' && o.payment_status === 'paid') return false;
    return true;
  });

  const statusOptions = [
    { value: 'pending', label: 'Unprocessed' },
    { value: 'processed', label: 'Processed' },
    { value: 'paid', label: 'Paid' },
    { value: 'unpaid', label: 'Unpaid' },
  ];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-900 flex items-center gap-2">
            <ShoppingBag className="h-6 w-6 text-maroon-700" />
            Orders
          </h1>
          <p className="text-gray-500 font-body mt-1">
            {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="w-full sm:w-48">
          <Select
            id="filter-status"
            options={statusOptions}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            label="Filter by Status"
          />
        </div>
        {filterStatus && (
          <div className="flex items-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilterStatus('')}
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
      ) : filteredOrders.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <ShoppingBag className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-body">No orders found.</p>
        </div>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Customer</TableHeader>
              <TableHeader>Email</TableHeader>
              <TableHeader>Items</TableHeader>
              <TableHeader>Total</TableHeader>
              <TableHeader>Payment</TableHeader>
              <TableHeader>Processed</TableHeader>
              <TableHeader>Date</TableHeader>
              <TableHeader>Actions</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredOrders.map((o) => (
              <TableRow key={o.id}>
                <TableCell>
                  <div>
                    <p className="font-medium text-gray-900">{o.customer_name}</p>
                    <p className="text-xs text-gray-400">{o.customer_phone}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <a href={`mailto:${o.customer_email}`} className="text-maroon-700 hover:underline">
                    {o.customer_email}
                  </a>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    {o.items.map((item, i) => (
                      <p key={i} className="text-xs">
                        {item.name} ({item.size}) x{item.quantity}
                      </p>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="font-medium">{formatCurrency(o.total_amount)}</TableCell>
                <TableCell>
                  {o.payment_status === 'paid' ? (
                    <Badge variant="success">Paid</Badge>
                  ) : (
                    <Badge variant="warning">Pending</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {o.processed ? (
                    <Badge variant="success">Yes</Badge>
                  ) : (
                    <Badge variant="danger">No</Badge>
                  )}
                </TableCell>
                <TableCell>{formatDate(o.created_at)}</TableCell>
                <TableCell>
                  {!o.processed && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleMarkProcessed(o.id)}
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Mark Processed
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
