'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { formatDate } from '@/lib/utils';
import { parseApiResponse } from '@/lib/admin-client';
import {
  Users,
  ShoppingBag,
  Mail,
  Calendar,
  Newspaper,
  Handshake,
  TrendingUp,
} from 'lucide-react';

interface DashboardStats {
  volunteers: number;
  pendingOrders: number;
  unreadEnquiries: number;
  publishedEvents: number;
  totalNews: number;
  activeSponsors: number;
}

interface RecentActivity {
  type: string;
  message: string;
  date: string;
}

const emptyStats: DashboardStats = {
  volunteers: 0,
  pendingOrders: 0,
  unreadEnquiries: 0,
  publishedEvents: 0,
  totalNews: 0,
  activeSponsors: 0,
};

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats>(emptyStats);
  const [activity, setActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/admin/dashboard', { cache: 'no-store' });
        const data = await parseApiResponse<{ stats?: DashboardStats; activity?: RecentActivity[] }>(response);

        setStats(data.stats || emptyStats);
        if (Array.isArray(data.activity) && data.activity.length > 0) {
          setActivity(data.activity);
        }
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Failed to fetch dashboard stats.');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const statCards = [
    { label: 'Total Volunteers', value: stats.volunteers, icon: Users, href: '/admin/volunteers', colour: 'bg-blue-50 text-blue-700' },
    { label: 'Pending Orders', value: stats.pendingOrders, icon: ShoppingBag, href: '/admin/orders', colour: 'bg-yellow-50 text-yellow-700' },
    { label: 'Unread Enquiries', value: stats.unreadEnquiries, icon: Mail, href: '/admin/enquiries', colour: 'bg-red-50 text-red-700' },
    { label: 'Published Events', value: stats.publishedEvents, icon: Calendar, href: '/admin/events', colour: 'bg-green-50 text-green-700' },
    { label: 'News Articles', value: stats.totalNews, icon: Newspaper, href: '/admin/news', colour: 'bg-purple-50 text-purple-700' },
    { label: 'Active Sponsors', value: stats.activeSponsors, icon: Handshake, href: '/admin/sponsors', colour: 'bg-maroon-50 text-maroon-700' },
  ];

  const activityBadge = (type: string) => {
    switch (type) {
      case 'volunteer':
        return <Badge variant="info">Volunteer</Badge>;
      case 'order':
        return <Badge variant="warning">Order</Badge>;
      case 'enquiry':
        return <Badge variant="danger">Enquiry</Badge>;
      case 'event':
        return <Badge variant="success">Event</Badge>;
      default:
        return <Badge>Other</Badge>;
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 font-body mt-1">Overview of club administration</p>
      </div>
      {message && <p className="mb-4 text-sm text-red-600">{message}</p>}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-6 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-4" />
              <div className="h-8 bg-gray-200 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {statCards.map((card) => (
              <Link key={card.label} href={card.href}>
                <Card hover className="h-full">
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-500 font-body">{card.label}</p>
                        <p className="text-3xl font-display font-bold text-gray-900 mt-1">
                          {card.value}
                        </p>
                      </div>
                      <div className={`p-3 rounded-lg ${card.colour}`}>
                        <card.icon className="h-6 w-6" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Activity */}
            <Card>
              <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-maroon-700" />
                <h2 className="text-lg font-display font-bold text-gray-900">Recent Activity</h2>
              </div>
              <CardContent>
                <div className="space-y-4">
                  {activity.map((item, i) => (
                    <div key={i} className="flex items-start gap-3">
                      {activityBadge(item.type)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 font-body">{item.message}</p>
                        <p className="text-xs text-gray-400 font-body mt-0.5">{formatDate(item.date)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-lg font-display font-bold text-gray-900">Quick Actions</h2>
              </div>
              <CardContent>
                <div className="space-y-3">
                  <Link href="/admin/events">
                    <Button variant="primary" className="w-full justify-center">
                      <Calendar className="h-4 w-4 mr-2" />
                      Create New Event
                    </Button>
                  </Link>
                  <Link href="/admin/news">
                    <Button variant="secondary" className="w-full justify-center">
                      <Newspaper className="h-4 w-4 mr-2" />
                      Write News Article
                    </Button>
                  </Link>
                  <Link href="/admin/enquiries">
                    <Button variant="secondary" className="w-full justify-center">
                      <Mail className="h-4 w-4 mr-2" />
                      View Enquiries
                    </Button>
                  </Link>
                  <Link href="/admin/volunteers">
                    <Button variant="secondary" className="w-full justify-center">
                      <Users className="h-4 w-4 mr-2" />
                      Manage Volunteers
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
