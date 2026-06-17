import {
  ACKNOWLEDGEMENT,
  CLUB_ASSOCIATION,
  CLUB_ASSOCIATION_SHORT,
  CLUB_ESTABLISHED,
  CLUB_GROUND,
  CLUB_NAME,
  CLUB_NICKNAME,
  NAV_LINKS,
  PLAYHQ_ORG_URL,
  SEED_EVENTS,
  SEED_NEWS,
  SEED_SPONSORS,
  SEASON_APPOINTMENTS,
} from '@/lib/constants';
import type { Event, NewsPost, Sponsor } from '@/lib/types';
import type { ContentBlock } from '@/lib/content-blocks';
import type { FacilityFeature, HistoryCompetition, HistoryLineageEntry, HistoryPremiership, PageLinkCard } from '@/lib/structured-content';
import { normalizeEventImage, normalizeGalleryImage, normalizeNewsImage } from '@/lib/public-content-normalizers';

export const isProductionStaticBuild = process.env.NEXT_PHASE === 'phase-production-build';

const playHqOrg = PLAYHQ_ORG_URL;

export const fallbackContentBlocks: Record<string, ContentBlock> = {
  'home.hero': { block_key: 'home.hero', title: CLUB_NAME, body: `Home of the ${CLUB_NICKNAME} cricket community.`, image_url: null, cta_label: 'Join the Club', cta_url: '/join' },
  'home.quicklinks': { block_key: 'home.quicklinks', title: 'Explore the Club', body: `Everything you need to know about the ${CLUB_NICKNAME}.`, image_url: null, cta_label: null, cta_url: null },
  'home.season_status': { block_key: 'home.season_status', title: '2025/26 Season Complete', body: 'The 2025/26 season has concluded. The 2026/27 season begins October 2026. Pre-season training details will be announced on our Facebook page.', image_url: null, cta_label: 'View 2025/26 Results on PlayHQ', cta_url: playHqOrg },
  'home.sponsorship': { block_key: 'home.sponsorship', title: 'Our Sponsors', body: 'Proudly supported by our local community partners.', image_url: null, cta_label: null, cta_url: null },
  'home.juniors': { block_key: 'home.juniors', title: `Ready to join the ${CLUB_NICKNAME}?`, body: 'Whether you’re a seasoned cricketer or picking up a bat for the first time, there is a place for you at NDCC.', image_url: null, cta_label: null, cta_url: null },
  'footer.acknowledgement': { block_key: 'footer.acknowledgement', title: null, body: ACKNOWLEDGEMENT, image_url: null, cta_label: null, cta_url: null },
  'about.hero': { block_key: 'about.hero', title: `About the ${CLUB_NICKNAME}`, body: `A proud community cricket club in Geelong, established in ${CLUB_ESTABLISHED}.`, image_url: null, cta_label: null, cta_url: null },
  'about.history': { block_key: 'about.history', title: 'Our History', body: `${CLUB_NICKNAME} has proudly represented Newcomb since ${CLUB_ESTABLISHED}, built on generations of community involvement and cricket tradition.`, image_url: '/images/Turf_Ground.jpg', cta_label: null, cta_url: null },
  'about.affiliation': { block_key: 'about.affiliation', title: `${CLUB_ASSOCIATION_SHORT} Affiliation`, body: `NDCC is a proud member of ${CLUB_ASSOCIATION}, supporting senior and junior cricket pathways across Geelong.`, image_url: null, cta_label: null, cta_url: null },
  'about.goodsports': { block_key: 'about.goodsports', title: 'Good Sports Level 3', body: 'NDCC is a proud Level 3 accredited Good Sports club, committed to a safer and healthier environment for members, families, and the wider community.', image_url: null, cta_label: 'Good Sports Level 3 Accredited', cta_url: null },
  'about.partnership': { block_key: 'about.partnership', title: 'Newcomb Power Football Club', body: `${CLUB_NICKNAME} shares facilities at ${CLUB_GROUND} and works collaboratively to support sport in the Newcomb and Moolap community.`, image_url: null, cta_label: null, cta_url: null },
  'about.committee': { block_key: 'about.committee', title: 'Committee & Office Bearers', body: `The people who keep the ${CLUB_NICKNAME} running behind the scenes.`, image_url: null, cta_label: null, cta_url: null },
  'fixtures.hero': { block_key: 'fixtures.hero', title: 'Fixtures & Results', body: `Follow the ${CLUB_NICKNAME} throughout the season across all grades.`, image_url: null, cta_label: null, cta_url: null },
  'fixtures.status': { block_key: 'fixtures.status', title: '2025/26 Season Complete', body: 'The 2025/26 GCA season has concluded. You can view full results, ladders, and match details from the completed season on PlayHQ. The 2026/27 season begins in October 2026. Pre-season training details will be announced on our Facebook page.', image_url: null, cta_label: 'View 2025/26 Results on PlayHQ', cta_url: playHqOrg },
  'fixtures.team_links': { block_key: 'fixtures.team_links', title: 'Team Fixtures on PlayHQ', body: 'View fixtures, results, and ladders for each NDCC team on PlayHQ. Updated links for 2026/27 can be published from admin when the new season draw is released.', image_url: null, cta_label: 'View on PlayHQ', cta_url: null },
  'join.hero': { block_key: 'join.hero', title: 'Join the Club', body: 'Choose player registration via PlayHQ or apply for social membership below.', image_url: null, cta_label: null, cta_url: null },
};

function card(id: string, page_slug: string, section_key: string, title: string, description: string, href: string, sort_order: number, icon: string | null = null, badge: string | null = null, is_external = /^https?:\/\//i.test(href)): PageLinkCard {
  return { id, page_slug, section_key, title, description, href, icon, badge, is_external, sort_order, is_active: true };
}

export const fallbackPageLinkCards: Record<string, PageLinkCard[]> = {
  'home:quick_links': [
    card('fallback-home-about', 'home', 'quick_links', 'About Us', 'Learn about our history and the people behind the club.', '/about', 1, '🏏'),
    card('fallback-home-teams', 'home', 'quick_links', 'Our Teams', 'Senior Men, Senior Women, and Junior Boys squads.', '/teams', 2, '👥'),
    card('fallback-home-events', 'home', 'quick_links', 'Events', 'Upcoming social events, fundraisers, and match days.', '/events', 3, '📅'),
    card('fallback-home-merch', 'home', 'quick_links', 'Merchandise', 'Get your official NDCC gear and support the club.', '/merchandise', 4, '🛒'),
    card('fallback-home-volunteer', 'home', 'quick_links', 'Volunteer', 'Help out on match days - canteen, scoring, and more.', '/volunteer', 5, '🤝'),
    card('fallback-home-contact', 'home', 'quick_links', 'Contact', 'Get in touch with the club or make an enquiry.', '/contact', 6, '✉️'),
  ],
  'fixtures:team_links': [
    card('fallback-fixtures-firsts', 'fixtures', 'team_links', '1st XI', 'GCA Grade 4', 'https://www.playhq.com/cricket-australia/org/newcomb-and-district-cricket-club/2c2bff9c/geelong-cricket-association-mens-competition-summer-202526/teams/newcomb-and-district-1sts/0f74d5e7', 1, null, 'GCA Grade 4', true),
    card('fallback-fixtures-seconds', 'fixtures', 'team_links', '2nd XI', 'GCA Grade 4', playHqOrg, 2, null, 'GCA Grade 4', true),
    card('fallback-fixtures-thirds', 'fixtures', 'team_links', '3rd XI', 'GCA Hard Wicket', playHqOrg, 3, null, 'GCA Hard Wicket', true),
    card('fallback-fixtures-women', 'fixtures', 'team_links', 'Senior Women', 'GCA E Grade East', playHqOrg, 4, null, 'GCA E Grade East', true),
    card('fallback-fixtures-juniors', 'fixtures', 'team_links', 'Juniors', 'GCA Junior Competition', playHqOrg, 5, null, 'GCA Junior Competition', true),
  ],
};

export const fallbackHistoryCompetitions: HistoryCompetition[] = [
  { id: 'fallback-bpca', abbreviation: 'BPCA', name: 'Bellarine Peninsula Cricket Association' },
  { id: 'fallback-gdca', abbreviation: 'GDCA', name: 'Geelong District Cricket Association' },
  { id: 'fallback-gca', abbreviation: 'GCA', name: 'Geelong Cricket Association' },
];

export const fallbackHistoryLineage: HistoryLineageEntry[] = [
  { id: 'fallback-lineage-alcoa', club_name: 'Alcoa Cricket Club', start_season: '1972/73', end_season: '1974/75', association_abbr: 'BPCA', sort_order: 1, is_active: true },
  { id: 'fallback-lineage-point-henry', club_name: 'Point Henry Cricket Club', start_season: '1975/76', end_season: '1976/77', association_abbr: 'BPCA', sort_order: 2, is_active: true },
  { id: 'fallback-lineage-ndcc-bpca', club_name: 'Newcomb & District Cricket Club', start_season: '1977/78', end_season: '1989/90', association_abbr: 'BPCA', sort_order: 3, is_active: true },
  { id: 'fallback-lineage-ndcc-gdca', club_name: 'Newcomb & District Cricket Club', start_season: '1990/91', end_season: '1994/95', association_abbr: 'GDCA', sort_order: 4, is_active: true },
  { id: 'fallback-lineage-ndcc-gca', club_name: 'Newcomb & District Cricket Club', start_season: '1995/96', end_season: 'Present', association_abbr: 'GCA', sort_order: 5, is_active: true },
];

export const fallbackHistoryPremierships: HistoryPremiership[] = [
  ['1st XI', '1973/74', 'BPCA', 'B grade', 1], ['1st XI', '1985/86', 'BPCA', 'A grade', 2], ['1st XI', '1992/93', 'GDCA', 'One Day Knockout', 3], ['1st XI', '1994/95', 'GDCA', 'A grade', 4], ['1st XI', '2002/03', 'GCA', 'Div 2 1sts', 5], ['1st XI', '2012/13', 'GCA', 'Div 2 1sts', 6], ['1st XI', '2016/17', 'GCA', 'Div 2 1sts', 7], ['1st XI', '2025/26', 'GCA', 'Div 4 1sts', 8], ['2nd XI', '1981/82', 'BPCA', 'B grade', 20], ['2nd XI', '1995/96', 'GCA', 'Div 2 2nds', 21], ['2nd XI', '1996/97', 'GCA', 'Div 2 2nds', 22], ['2nd XI', '1997/98', 'GCA', 'Div 2 2nds', 23], ['4th XI', '1981/82', 'BPCA', 'D grade', 40], ['4th XI', '1982/83', 'BPCA', 'D grade', 41], ['4th XI', '1983/84', 'BPCA', 'D grade', 42], ['4th XI', '1984/85', 'BPCA', 'D grade', 43], ['4th XI', '2000/01', 'GCA', 'Div 2 4ths', 44], ['4th XI', '2010/11', 'GCA', 'Div 2 4ths', 45], ['5th XI', '1996/97', 'GCA', '6ths', 50],
].map(([team_label, season_label, competition_abbr, grade_label, sort_order]) => ({ id: `fallback-premiership-${team_label}-${season_label}`.replace(/\W+/g, '-').toLowerCase(), team_label: String(team_label), season_label: String(season_label), competition_abbr: String(competition_abbr), grade_label: String(grade_label), sort_order: Number(sort_order), is_active: true }));

export const fallbackFacilityFeatures: FacilityFeature[] = [
  { id: 'fallback-lanes', title: '3 Public Synthetic Lanes', description: 'Open to the community for practice all year round.', icon_key: 'lanes', sort_order: 1, is_active: true },
  { id: 'fallback-turf', title: '4 Club Turf Lanes', description: 'High-quality turf practice wickets for club training sessions.', icon_key: 'turf', sort_order: 2, is_active: true },
  { id: 'fallback-clubrooms', title: 'Clubrooms & Pavilion', description: 'Social facilities, change rooms, and a fully equipped canteen on match days.', icon_key: 'clubrooms', sort_order: 3, is_active: true },
  { id: 'fallback-oval', title: 'Oval & Outfield', description: 'Well-maintained turf wicket square and outfield at Grinter Reserve.', icon_key: 'oval', sort_order: 4, is_active: true },
];

export const fallbackSponsorLogos: Record<string, string> = {
  'Champion Trophies': '/images/2026/06/champion_trophy-1781148687999.jpg',
  'Phoenix Truck Bodies': '/images/2026/06/phoenix-1781148703539.jpg',
  "Blackman's Brewery": '/images/2026/06/blackmans-1781148663993.webp',
};

export const fallbackSponsors: Sponsor[] = SEED_SPONSORS.map((sponsor) => ({
  ...sponsor,
  logo_url: sponsor.logo_url || fallbackSponsorLogos[sponsor.name] || '',
  created_at: '2026-06-16T00:00:00+10:00',
}));

export const fallbackSeasonAppointments = SEASON_APPOINTMENTS.map((appointment, index) => ({
  id: `fallback-season-${index + 1}`,
  name: appointment.name,
  role: appointment.role,
  image_url: appointment.image_url || appointment.image || null,
  announcement_date: appointment.announcement_date,
  sort_order: index + 1,
  is_active: true,
}));

export const fallbackNews = SEED_NEWS.filter((post) => post.published).map((post) => ({
  ...post,
  created_at: post.published_at || '2026-06-16T00:00:00+10:00',
  image_url: normalizeNewsImage(post.title, post.image_url || post.image || null),
})) as NewsPost[];

export const fallbackEvents = SEED_EVENTS.map((event) => ({
  ...event,
  stripe_link: '',
  published: true,
  created_at: event.date,
  image_url: normalizeEventImage(event.title, event.image_url || null),
})) as Event[];

export const fallbackGalleryImages = [
  normalizeGalleryImage({ id: 'fallback-gallery-u13-premiers', title: 'Under 13 Juniors Premiers 2025/26', caption: 'Under 13 Juniors premiership celebration.', image_url: '/images/achievements/2025-26/u13-juniors-premiers-2025-26.webp', alt_text: 'Under 13 Juniors premiers celebration image', allow_download: false, sort_order: 1 }),
  normalizeGalleryImage({ id: 'fallback-gallery-club-championship', title: 'Division 4 Club Championship Winners 2025/26', caption: 'Club championship winners for the 2025/26 season.', image_url: '/images/achievements/2025-26/club-championship-winners-2025-26.webp', alt_text: 'Division 4 club championship winners image', allow_download: false, sort_order: 2 }),
  normalizeGalleryImage({ id: 'fallback-gallery-first-xi-premiers', title: 'Division 4 First XI Premiers 2025/26', caption: 'Division 4 First XI premiership celebration.', image_url: '/images/achievements/2025-26/division-4-first-xi-premiers-2025-26.webp', alt_text: 'Division 4 First XI premiers celebration image', allow_download: false, sort_order: 3 }),
];

export const fallbackMembershipPlans = [
  { id: 'fallback-social-membership', name: 'Social Membership', description: 'Annual social membership', price: 50, is_active: true, sort_order: 1 },
];

export const fallbackMembershipAddons = [
  { id: 'fallback-club-t-shirt', name: 'Club T-Shirt', description: 'Optional club t-shirt add-on', price: 35, usage_limit: null, is_active: true, sort_order: 1 },
  { id: 'fallback-meal-card', name: 'Meal Card', description: 'Meal card for canteen usage', price: 60, usage_limit: 10, is_active: true, sort_order: 2 },
  { id: 'fallback-drink-card', name: 'Drink Card', description: 'Drink card for canteen usage', price: 40, usage_limit: 10, is_active: true, sort_order: 3 },
];

export function fallbackBlocksForKeys(keys: string[]) {
  return Object.fromEntries(keys.flatMap((key) => fallbackContentBlocks[key] ? [[key, fallbackContentBlocks[key]]] : []));
}

export function fallbackLinksFor(pageSlug: string, sectionKey: string) {
  const key = `${pageSlug}:${sectionKey}`;
  if (fallbackPageLinkCards[key]) return fallbackPageLinkCards[key];
  if (pageSlug === 'site' && sectionKey === 'header_nav') {
    return NAV_LINKS.map((link, index) => card(`fallback-header-${index + 1}`, 'site', 'header_nav', link.label, '', link.href, index + 1, null, null, Boolean(link.openInNewTab)));
  }
  return [];
}
