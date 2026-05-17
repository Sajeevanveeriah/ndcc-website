import Link from 'next/link';
import Card, { CardContent } from '@/components/ui/Card';
import { Upload, SlidersHorizontal, Trophy, Users, CalendarDays } from 'lucide-react';

const fantasySections = [
  {
    href: '/admin/fantasy/players',
    title: 'Players',
    description: 'Maintain the Fantasy Cricket player registry, roles, team labels, and active status.',
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
];

export default function AdminFantasyPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-gray-900 flex items-center gap-2">
          <Trophy className="h-6 w-6 text-maroon-700" />
          Fantasy Cricket
        </h1>
        <p className="text-gray-500 font-body mt-1">
          Admin-only foundation settings for future NDCC Fantasy Cricket gameplay.
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-900 font-body">
        Public squad selection, transfers, chips, leagues, and leaderboards are not enabled in this foundation area.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {fantasySections.map((section) => (
          <Link key={section.href} href={section.href}>
            <Card hover className="h-full">
              <CardContent>
                <div className="flex items-start gap-4">
                  <div className="rounded-lg bg-maroon-50 p-3 text-maroon-700">
                    <section.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-display font-bold text-gray-900">{section.title}</h2>
                    <p className="mt-1 text-sm text-gray-600 font-body">{section.description}</p>
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
