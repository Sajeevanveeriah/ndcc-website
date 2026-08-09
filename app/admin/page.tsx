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
  CalendarDays,
  Newspaper,
  Handshake,
  TrendingUp,
  Trophy,
  Settings,
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

interface ClubSeasonSummary {
  id: string;
  name: string;
  status: string;
  start_date: string;
  end_date: string;
}

interface DashboardHealth {
  draftNews: number | null;
  unpublishedEvents: number | null;
  unpublishedGallery: number | null;
  missingAltText: number | null;
  draftFantasyImports: number | null;
  playhqConfigured: boolean;
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
  const [health, setHealth] = useState<DashboardHealth | null>(null);
  const [activity, setActivity] = useState<RecentActivity[]>([]);
  const [currentSeason, setCurrentSeason] = useState<ClubSeasonSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [response, seasonsResponse] = await Promise.all([
          fetch('/api/admin/dashboard', { cache: 'no-store' }),
          fetch('/api/admin/club-seasons', { cache: 'no-store' }),
        ]);
        const data = await parseApiResponse<{ stats?: DashboardStats; health?: DashboardHealth; activity?: RecentActivity[] }>(response);
        const seasonData = await parseApiResponse<{ seasons?: ClubSeasonSummary[] }>(seasonsResponse).catch(() => ({ seasons: [] }));

        setStats(data.stats || emptyStats);
        setHealth(data.health ?? null);
        if (Array.isArray(data.activity) && data.activity.length > 0) {
          setActivity(data.activity);
        }
        setCurrentSeason((seasonData.seasons || []).find((season) => (season as ClubSeasonSummary & { is_current?: boolean }).is_current) || null);
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
    { label: 'Active Sponsors', value: stats.activeSponsors, icon: Handshake, href: '/admin/sponsors', colour: 'bg-maroon-50 dark:bg-maroon-950 text-maroon-700 dark:text-maroon-200' },
    { label: 'Fantasy Cricket', value: 'Admin', icon: Trophy, href: '/admin/fantasy', colour: 'bg-surface-blue-subtle text-content-blue' },
    { label: 'Site Settings', value: 'CMS', icon: Settings, href: '/admin/site-pages', colour: 'bg-surface-page text-content-secondary' },
    { label: 'Email Diagnostics', value: 'Test', icon: Mail, href: '/admin/email-diagnostics', colour: 'bg-indigo-50 text-indigo-700' },
    { label: 'Media Diagnostics', value: 'Test', icon: Settings, href: '/admin/media-diagnostics', colour: 'bg-teal-50 text-teal-700' },
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
        <h1 className="text-2xl font-display font-bold text-content-primary">Dashboard</h1>
        <p className="text-content-muted font-body mt-1">Overview of club administration</p>
      </div>
      {message && <p className="mb-4 text-sm text-red-600">{message}</p>}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-surface-card rounded-xl border border-edge-subtle p-6 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-4" />
              <div className="h-8 bg-gray-200 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : (
        <>

          <div className="mb-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-xl border border-maroon-100 bg-surface-card p-5 shadow-sm">
              <h2 className="text-sm font-display font-bold uppercase tracking-wide text-maroon-800 dark:text-maroon-200">Current season</h2>
              {currentSeason ? (
                <div className="mt-3">
                  <p className="text-2xl font-display font-bold text-content-primary">{currentSeason.name}</p>
                  <p className="mt-1 text-sm text-content-muted">{currentSeason.start_date} to {currentSeason.end_date} · {currentSeason.status}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link href="/admin/season/new"><Button size="sm">Start new season</Button></Link>
                    <Link href="/admin/season/registration"><Button size="sm" variant="secondary">Manage registration</Button></Link>
                    <Link href="/admin/teams"><Button size="sm" variant="secondary">Review teams</Button></Link>
                    <Link href="/admin/playhq-diagnostics"><Button size="sm" variant="secondary">Check PlayHQ</Button></Link>
                  </div>
                </div>
              ) : <p className="mt-3 text-sm text-content-muted">No current club season has been loaded. Use Season setup to prepare one.</p>}
            </div>
            <div className="panel-blue-subtle p-5">
              <h2 className="text-sm font-display font-bold uppercase tracking-wide text-content-blue">Attention items</h2>
              <ul className="mt-3 space-y-2 text-sm text-content-blue">
                <li>Drafts: {(health?.draftNews ?? 0) + (health?.unpublishedEvents ?? 0)}</li>
                <li>Fantasy imports awaiting publish: {health?.draftFantasyImports ?? '?'}</li>
                <li>PlayHQ: {health?.playhqConfigured ? 'configured' : 'needs configuration'}</li>
              </ul>
            </div>
          </div>

          {/* CMS health strip */}
          {health && (
            <div className="mb-8 rounded-xl border border-edge-subtle bg-surface-card p-4 dark:border-slate-700 dark:bg-slate-800">
              <h2 className="text-sm font-display font-bold uppercase tracking-wide text-content-secondary mb-3">CMS health</h2>
              <div className="flex flex-wrap gap-2 text-sm font-body">
                <Link href="/admin/news" className="inline-flex items-center gap-1.5 rounded-full border border-edge-subtle px-3 py-1 hover:border-maroon-300">
                  Draft news: <strong>{health.draftNews ?? '?'}</strong>
                </Link>
                <Link href="/admin/events" className="inline-flex items-center gap-1.5 rounded-full border border-edge-subtle px-3 py-1 hover:border-maroon-300">
                  Unpublished events: <strong>{health.unpublishedEvents ?? '?'}</strong>
                </Link>
                <Link href="/admin/gallery" className="inline-flex items-center gap-1.5 rounded-full border border-edge-subtle px-3 py-1 hover:border-maroon-300">
                  Unpublished gallery: <strong>{health.unpublishedGallery ?? '?'}</strong>
                </Link>
                <Link href="/admin/gallery" className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 hover:border-maroon-300 ${(health.missingAltText ?? 0) > 0 ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-edge-subtle'}`}>
                  Gallery images missing alt text: <strong>{health.missingAltText ?? '?'}</strong>
                </Link>
                <Link href="/admin/fantasy/imports" className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 hover:border-maroon-300 ${(health.draftFantasyImports ?? 0) > 0 ? 'border-edge-blue bg-surface-blue-subtle text-content-blue' : 'border-edge-subtle'}`}>
                  Fantasy imports awaiting publish: <strong>{health.draftFantasyImports ?? '?'}</strong>
                </Link>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 ${health.playhqConfigured ? 'border-green-300 bg-green-50 text-green-900' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>
                  PlayHQ API: <strong>{health.playhqConfigured ? 'configured' : 'not configured (link cards shown)'}</strong>
                </span>
              </div>
            </div>
          )}

          {/* Stat Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {statCards.map((card) => (
              <Link key={card.label} href={card.href}>
                <Card hover className="h-full">
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-content-muted font-body">{card.label}</p>
                        <p className="text-3xl font-display font-bold text-content-primary mt-1">
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
              <div className="px-6 py-4 border-b border-edge-subtle flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-maroon-700 dark:text-maroon-200" />
                <h2 className="text-lg font-display font-bold text-content-primary">Recent Activity</h2>
              </div>
              <CardContent>
                <div className="space-y-4">
                  {activity.map((item, i) => (
                    <div key={i} className="flex items-start gap-3">
                      {activityBadge(item.type)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-content-secondary font-body">{item.message}</p>
                        <p className="text-xs text-gray-400 font-body mt-0.5">{formatDate(item.date)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <div className="px-6 py-4 border-b border-edge-subtle">
                <h2 className="text-lg font-display font-bold text-content-primary">Quick Actions</h2>
              </div>
              <CardContent>
                <div className="space-y-3">
                  <Link href="/admin/season/new">
                    <Button variant="primary" className="w-full justify-center">
                      <CalendarDays className="h-4 w-4 mr-2" />
                      Start New Season
                    </Button>
                  </Link>
                  <Link href="/admin/events">
                    <Button variant="secondary" className="w-full justify-center">
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
                  <Link href="/admin/site-pages">
                    <Button variant="secondary" className="w-full justify-center">
                      <Settings className="h-4 w-4 mr-2" />
                      Manage Header & Footer Links
                    </Button>
                  </Link>
                  <Link href="/admin/email-diagnostics">
                    <Button variant="secondary" className="w-full justify-center">
                      <Mail className="h-4 w-4 mr-2" />
                      Test App Email
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
