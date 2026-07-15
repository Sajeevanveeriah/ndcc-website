import Link from 'next/link';
import Card, { CardContent } from '@/components/ui/Card';
import { Upload, SlidersHorizontal, Trophy, Users, CalendarDays, FileSearch, Settings, Calculator, Activity, ShieldCheck } from 'lucide-react';

const fantasySections = [
  {
    href: '/admin/fantasy/seasons',
    title: 'Seasons & PlayHQ Sync',
    description: 'Add fantasy seasons, map PlayHQ grades, run resumable stat imports and choose the current public season.',
    icon: CalendarDays,
  },
  {
    href: '/admin/playhq-diagnostics',
    title: 'PlayHQ Diagnostics',
    description: 'Check server-only PlayHQ credentials, tenant headers, discovery and sync health without exposing secrets.',
    icon: Activity,
  },
  {
    href: '/admin/fantasy/settings',
    title: 'Settings',
    description: 'Control the season name, budget, role limits, registration, transfers, and selection windows.',
    icon: Settings,
  },
  {
    href: '/admin/fantasy/scores',
    title: 'Manager Scores',
    description: 'Preview and save manager round scores from published match stats.',
    icon: Calculator,
  },
  {
    href: '/admin/fantasy/players',
    title: 'Players',
    description: 'Maintain the Fantasy Cricket player registry, roles, team labels, and active status.',
    icon: Users,
  },
  {
    href: '/admin/fantasy/managers',
    title: 'Manager Review',
    description: 'Inspect registered managers and their latest squad status, budget, and captaincy picks.',
    icon: Users,
  },
  {
    href: '/admin/fantasy/scoring',
    title: 'Scoring',
    description: 'Review and update the point values used by future Fantasy Cricket scoring calculations.',
    icon: SlidersHorizontal,
  },
  {
    href: '/admin/fantasy/rounds',
    title: 'Rounds',
    description: 'Create rounds, set deadlines, and move each round through its admin status.',
    icon: CalendarDays,
  },
  {
    href: '/admin/fantasy/import',
    title: 'CSV Import',
    description: 'Validate match-stat CSV files and save draft Fantasy Cricket import batches.',
    icon: Upload,
  },
  {
    href: '/admin/fantasy/imports',
    title: 'Import Review',
    description: 'Review saved import batches, inspect stat rows, and publish or reject Fantasy Cricket scores.',
    icon: FileSearch,
  },
  {
    href: '/admin/fantasy/reconciliation',
    title: 'Historical Reconciliation',
    description: 'Compare Legacy / Unverified stats with PlayHQ evidence, quarantine ambiguous rows and export reviewed proposals.',
    icon: ShieldCheck,
  },
];

export default function AdminFantasyPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-content-primary flex items-center gap-2">
          <Trophy className="h-6 w-6 text-maroon-700 dark:text-maroon-200" />
          Fantasy Cricket
        </h1>
        <p className="text-content-muted font-body mt-1">
          Admin controls for NDCC Fantasy Cricket gameplay, imports, scoring and manager leaderboards.
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-900 font-body">
        Use published import batches before calculating public manager scores. Fantasy manager accounts remain separate from committee admin users.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {fantasySections.map((section) => (
          <Link key={section.href} href={section.href}>
            <Card hover className="h-full">
              <CardContent>
                <div className="flex items-start gap-4">
                  <div className="rounded-lg bg-maroon-50 dark:bg-maroon-950 p-3 text-maroon-700 dark:text-maroon-200">
                    <section.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-display font-bold text-content-primary">{section.title}</h2>
                    <p className="mt-1 text-sm text-content-muted font-body">{section.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
