// Team sheets and club winners: date parsing, spreadsheet/CSV import, Dino
// Coach player linking, public name privacy, "this week" selection and the
// wiring that keeps drafts and full names off public pages.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  clubToday, currentTeamSheets, matchFantasyPlayer, normaliseTeamSheet, normaliseWinner, parseClubDate,
  parseDelimited, parsePlayerEntry, parseTeamSheetImport, parseWinnerCategory, parseWinnerImport,
  publicWinnerName, selectionsByFantasyPlayer, validateTeamSheet, validateWinner,
} from '../lib/match-day.ts';

// Dates: ISO and Australian day-first; impossible dates rejected.
assert.equal(parseClubDate('2026-10-10'), '2026-10-10');
assert.equal(parseClubDate('10/10/2026'), '2026-10-10');
assert.equal(parseClubDate('3/1/27'), '2027-01-03');
assert.equal(parseClubDate('31/02/2027'), '');
assert.equal(parseClubDate('next saturday'), '');

// Player markers.
assert.deepEqual(parsePlayerEntry('Jane Smith (c) (wk)'), { name: 'Jane Smith', captain: true, wicketkeeper: true, twelfth: false });
assert.deepEqual(parsePlayerEntry('  Sam Lee [12th] '), { name: 'Sam Lee', captain: false, wicketkeeper: false, twelfth: true });

// CSV with quotes and commas, and tab-separated paste from a spreadsheet.
assert.deepEqual(parseDelimited('a,b\n"x, y","say ""hi"""\n'), [['a', 'b'], ['x, y', 'say "hi"']]);
assert.deepEqual(parseDelimited('team\tdate\tplayer\r\n1st XI\t10/10/2026\tJane\r\n'), [['team', 'date', 'player'], ['1st XI', '10/10/2026', 'Jane']]);

// Dino Coach linking: exact (case/spacing-insensitive) and unique only.
const directory = [
  { id: '11111111-1111-4111-8111-111111111111', display_name: 'Jane Smith' },
  { id: '22222222-2222-4222-8222-222222222222', display_name: 'Sam Lee' },
  { id: '33333333-3333-4333-8333-333333333333', display_name: 'Chris Day' },
  { id: '44444444-4444-4444-8444-444444444444', display_name: 'chris day' },
];
assert.equal(matchFantasyPlayer('JANE  smith', directory), directory[0].id);
assert.equal(matchFantasyPlayer('Chris Day', directory), null, 'ambiguous names are never auto-linked');
assert.equal(matchFantasyPlayer('Unknown Person', directory), null);

// Team sheet import: rows grouped by team and date, markers and links applied.
const sheetCsv = [
  'Team,Date,Round,Opponent,Venue,Player',
  '1st XI,10/10/2026,Round 1,Torquay,Newcomb Oval,Jane Smith (c)',
  '1st XI,10/10/2026,,,,Sam Lee (wk)',
  '1st XI,10/10/2026,,,,Pat Jones (12th)',
  '2nd XI,2026-10-10,Round 1,Ocean Grove,,"Alex Kim; Robin Fox"',
].join('\n');
const imported = parseTeamSheetImport(sheetCsv, directory);
assert.deepEqual(imported.issues, []);
assert.equal(imported.sheets.length, 2);
const first = imported.sheets.find((sheet) => sheet.team_name === '1st XI');
assert.equal(first.match_date, '2026-10-10');
assert.equal(first.opponent, 'Torquay');
assert.equal(first.players.length, 3);
assert.equal(first.players[0].captain, true);
assert.equal(first.players[0].fantasy_player_id, directory[0].id);
assert.equal(first.players[1].wicketkeeper, true);
assert.equal(first.players[2].twelfth, true);
assert.equal(imported.sheets.find((sheet) => sheet.team_name === '2nd XI').players.length, 2, 'semicolon lists split');
assert.match(parseTeamSheetImport('name,when\nx,y').issues[0].error, /team, date and player/);
assert.match(parseTeamSheetImport('team,date,player\n1st XI,32/13/2026,Jane').issues[0].error, /not a valid date/);
assert.match(parseTeamSheetImport('team,date,player\n1st XI,10/10/2026,Jane (c)\n1st XI,10/10/2026,Sam (c)').issues[0].error, /one captain/);

// Validation of a single sheet.
assert.equal(validateTeamSheet(normaliseTeamSheet({ team_name: '1st XI', match_date: '2026-10-10', published: true, players: [] })), 'Add a team sheet image (or players) before publishing.');
const imageSheet = normaliseTeamSheet({ team_name: "Men's", round_label: 'Round 1', match_date: '2026-10-10', published: true, images: [{ url: 'https://example.test/a.jpg' }, { url: '/media/b.png', alt: 'Custom alt' }, { url: '' }] });
assert.equal(validateTeamSheet(imageSheet), null, 'an image-only sheet can be published');
assert.deepEqual(imageSheet.images, [{ url: 'https://example.test/a.jpg', alt: "Men's, Round 1 team sheet, page 1 of 2" }, { url: '/media/b.png', alt: 'Custom alt' }]);
assert.match(validateTeamSheet(normaliseTeamSheet({ team_name: 'Juniors', match_date: '2026-10-10', images: [{ url: 'javascript:alert(1)' }] })), /images must be uploaded/);
assert.equal(normaliseTeamSheet({ team_name: 'A', match_date: '2026-10-10', images: Array.from({ length: 20 }, (_, i) => ({ url: `/m/${i}.jpg` })) }).images.length, 12);
assert.equal(validateTeamSheet(normaliseTeamSheet({ team_name: '1st XI', match_date: '2026-10-10', published: false, players: [] })), null, 'drafts may be empty');
assert.match(validateTeamSheet(normaliseTeamSheet({ team_name: 'A', match_date: '2026-10-10', players: [{ name: 'X' }, { name: 'x' }] })), /listed twice/);
assert.match(validateTeamSheet(normaliseTeamSheet({ team_name: 'A', match_date: '2026-10-10', players: [{ name: 'X' }], document_url: 'javascript:alert(1)' })), /uploaded file/);

// Winners: category aliases, import, validation and privacy.
assert.equal(parseWinnerCategory('Dino Lotto'), 'dino_lotto');
assert.equal(parseWinnerCategory('Player sponsor award'), 'player_sponsor_award');
assert.equal(parseWinnerCategory('POTM'), 'player_sponsor_award');
assert.equal(parseWinnerCategory('Raffle'), 'raffle');
assert.equal(parseWinnerCategory('banana'), null);
const winnerImport = parseWinnerImport([
  'category,title,winner,date,prize,details,show_full_name',
  'Dino Lotto,Week 1 draw,Jordan Example,9/10/2026,Supplied prize,Number 23,',
  'Player sponsor award,Round 1 Player of the Match,Casey Sample,2026-10-10,,,yes',
  'Mystery,Thing,Someone,2026-10-10,,,',
].join('\n'));
assert.equal(winnerImport.winners.length, 2);
assert.equal(winnerImport.issues.length, 1);
assert.equal(winnerImport.issues[0].row, 4);
assert.equal(winnerImport.winners[0].category, 'dino_lotto');
assert.equal(winnerImport.winners[0].show_full_name, false);
assert.equal(winnerImport.winners[1].show_full_name, true);
assert.equal(publicWinnerName({ winner_name: 'Jordan Example', show_full_name: false }), 'Jordan E.');
assert.equal(publicWinnerName({ winner_name: 'Mary Anne van Dyke', show_full_name: false }), 'Mary D.');
assert.equal(publicWinnerName({ winner_name: 'Cher', show_full_name: false }), 'Cher');
assert.equal(publicWinnerName({ winner_name: 'Casey Sample', show_full_name: true }), 'Casey Sample');
assert.match(validateWinner(normaliseWinner({ category: 'raffle', title: 'Prize', winner_name: 'A B', draw_date: '2026-10-10', image_url: 'https://example.invalid/a.webp' })), /alt text/);
assert.equal(validateWinner(normaliseWinner({ category: 'raffle', title: 'Prize', winner_name: 'A B', draw_date: '2026-10-10' })), null);

// "This week": next match per team, else the most recent within 6 days.
const sheets = [
  { team_name: '1st XI', match_date: '2026-10-03', round_label: 'R0', players: [] },
  { team_name: '1st XI', match_date: '2026-10-10', round_label: 'R1', players: [{ name: 'Jane Smith', fantasy_player_id: directory[0].id, captain: true, wicketkeeper: false, twelfth: false }] },
  { team_name: '1st XI', match_date: '2026-10-17', round_label: 'R2', players: [] },
  { team_name: '2nd XI', match_date: '2026-10-04', round_label: 'R0', players: [{ name: 'Sam Lee', fantasy_player_id: directory[1].id, captain: false, wicketkeeper: false, twelfth: true }] },
  { team_name: '3rd XI', match_date: '2026-09-20', round_label: 'old', players: [] },
];
const current = currentTeamSheets(sheets, '2026-10-07');
assert.deepEqual(current.map((sheet) => `${sheet.team_name}:${sheet.match_date}`), ['2nd XI:2026-10-04', '1st XI:2026-10-10']);
const badges = selectionsByFantasyPlayer(current);
assert.deepEqual(Object.keys(badges), [directory[0].id], '12th players are not shown as named');
assert.equal(badges[directory[0].id].team_name, '1st XI');
assert.match(clubToday(new Date('2026-10-09T22:30:00Z')), /^2026-10-10$/, 'club date follows Melbourne time');

const imageMigration = readFileSync('supabase/migrations/20261008010000_team_sheet_images.sql', 'utf8');
assert.match(imageMigration, /add column if not exists images jsonb not null default '\[\]'/);
assert.match(readFileSync('lib/server/match-day-admin.ts', 'utf8'), /keeps the sheet's uploaded images/);

// Wiring: privacy, permissions, navigation and revalidation.
const migration = readFileSync('supabase/migrations/20261007001559_team_sheets_and_club_winners.sql', 'utf8');
assert.match(migration, /revoke all on public\.club_winners from anon, authenticated/);
assert.doesNotMatch(migration, /create policy/i, 'no browser read policy: drafts and full names stay server-side');
assert.doesNotMatch(migration, /insert into/i, 'no sample rows are seeded');
const server = readFileSync('lib/server/match-day.ts', 'utf8');
assert.match(server, /display_name: publicWinnerName\(row\)/);
assert.doesNotMatch(server.slice(server.indexOf('function toPublicWinner'), server.indexOf('const now')), /winner_name:/, 'public winners never carry the raw name');
assert.match(server, /\.eq\('published', true\)/);
const admin = readFileSync('lib/server/match-day-admin.ts', 'utf8');
assert.match(admin, /requirePermissionResult\('publications'\)/);
assert.match(readFileSync('lib/auth/permissions.ts', 'utf8'), /aliases: \['\/admin\/match-day'\]/);
assert.match(readFileSync('app/admin/layout.tsx', 'utf8'), /href: '\/admin\/match-day'/);
const navbar = readFileSync('components/layout/Navbar.tsx', 'utf8');
assert.match(navbar, /href: '\/this-week'/);
assert.match(navbar, /href: '\/winners'/);
const revalidate = readFileSync('lib/server/revalidate-public.ts', 'utf8');
assert.match(revalidate, /teamSheets: \['\/', '\/this-week'/);
assert.match(revalidate, /clubWinners: \['\/', '\/winners'/);
assert.match(revalidate, /teamSheets: '\/teams\/\[slug\]'/);
for (const file of ['app/fantasy/_components/SquadBuilder.tsx', 'app/fantasy/_components/TransfersClient.tsx', 'app/fantasy/_components/PlayerListExplorer.tsx']) {
  assert.match(readFileSync(file, 'utf8'), /useTeamSheetSelections\(\)/, `${file} shows team sheet selections`);
}

console.log('PASS: team sheets and winners - dates, CSV/TSV import, Dino Coach linking, privacy, this-week selection and wiring.');
