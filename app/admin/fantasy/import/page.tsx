import Card, { CardContent, CardHeader } from '@/components/ui/Card';
import { Upload } from 'lucide-react';

const csvColumns = [
  'round_number',
  'match_date',
  'opponent',
  'player_name',
  'runs',
  'wickets',
  'maidens',
  'catches',
  'runouts',
  'stumpings',
  'ducks',
  'not_out',
  'player_of_match',
];

export default function AdminFantasyImportPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-gray-900 flex items-center gap-2">
          <Upload className="h-6 w-6 text-maroon-700" />
          Fantasy CSV Import
        </h1>
        <p className="text-gray-500 font-body mt-1">
          Template guidance for the future manual match-stat import workflow.
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-900 font-body">
        Upload processing is not enabled yet. This page only documents the CSV shape expected by a future import tool.
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-display font-bold text-gray-900">Expected CSV columns</h2>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-gray-600 font-body">
            Prepare one row per player match stat line. Keep player names consistent with the Fantasy Players registry.
          </p>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-4">
            <code className="whitespace-nowrap text-sm text-gray-800">{csvColumns.join(',')}</code>
          </div>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-gray-600 font-body">
            <li><strong>match_date</strong> should use an ISO-style date such as YYYY-MM-DD.</li>
            <li><strong>not_out</strong> and <strong>player_of_match</strong> should be true or false values.</li>
            <li><strong>ducks</strong> should be numeric so deductions can be calculated consistently later.</li>
            <li>Do not upload files here yet; no records are created from this shell page.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
