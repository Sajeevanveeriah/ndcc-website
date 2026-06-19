import { normalisePlayHqPlayer } from './playhq/normalise';
export function parseFantasyCsv(csv: string) {
  const [headerLine = '', ...lines] = csv.trim().split(/\r?\n/);
  const headers = headerLine.split(',').map((h) => h.trim());
  return lines.filter(Boolean).map((line) => {
    const values = line.split(','); const row = Object.fromEntries(headers.map((h, i) => [h, values[i] || '']));
    return normalisePlayHqPlayer({ displayName: row.display_name, firstName: row.first_name, lastName: row.last_name, teamName: row.team_name, gradeName: row.grade_name, role: row.role }, 'csv');
  });
}
