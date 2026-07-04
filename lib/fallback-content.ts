import {
  ACKNOWLEDGEMENT,
  CLUB_ADDRESS,
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
} from '@/lib/constants';
import type { Event, NewsPost, Sponsor } from '@/lib/types';
import type { ContentBlock } from '@/lib/content-blocks';
import type { CommitteeMemberContent, FacilityFeature, HistoryCompetition, HistoryLineageEntry, HistoryPremiership, PageLinkCard } from '@/lib/structured-content';
import { normalizeEventImage, normalizeGalleryImage, normalizeNewsImage } from '@/lib/public-content-normalizers';
import { canonicalSponsorKey, canonicalSponsorName } from '@/lib/sponsor-canonical';

export const isProductionStaticBuild = process.env.NEXT_PHASE === 'phase-production-build';

const playHqOrg = PLAYHQ_ORG_URL;

export const fallbackContentBlocks: Record<string, ContentBlock> = {
  'home.hero': { block_key: 'home.hero', title: CLUB_NAME, body: `Home of the ${CLUB_NICKNAME} cricket community.`, image_url: null, cta_label: 'Join the Club', cta_url: '/join' },
  'home.quicklinks': { block_key: 'home.quicklinks', title: 'Explore the Club', body: `Everything you need to know about the ${CLUB_NICKNAME}.`, image_url: null, cta_label: null, cta_url: null },
  'home.season_status': { block_key: 'home.season_status', title: '2025/26 Season Complete', body: 'The 2025/26 season has concluded. The 2026/27 season begins October 2026. Pre-season training details will be announced on our Facebook page.', image_url: null, cta_label: 'View 2025/26 Results on PlayHQ', cta_url: playHqOrg },
  'home.sponsor_intro': { block_key: 'home.sponsor_intro', title: 'Our Sponsors', body: 'Thanks to all local businesses and partners supporting NDCC.', image_url: null, cta_label: null, cta_url: null },
  'home.sponsorship': { block_key: 'home.sponsorship', title: 'Our Sponsors', body: 'Thanks to all local businesses and partners supporting NDCC.', image_url: null, cta_label: null, cta_url: null },
  'home.juniors': { block_key: 'home.juniors', title: `Ready to join the ${CLUB_NICKNAME}?`, body: 'Whether you’re a seasoned cricketer or picking up a bat for the first time, there is a place for you at NDCC.', image_url: null, cta_label: null, cta_url: null },
  'footer.acknowledgement': { block_key: 'footer.acknowledgement', title: null, body: ACKNOWLEDGEMENT, image_url: '/images/Connection_Bri_Hayes_Rev1.jpg', cta_label: null, cta_url: null },
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
  'join.social_membership': { block_key: 'join.social_membership', title: 'Social Membership', body: 'Apply online and pay by bank transfer reference generated at checkout.', image_url: null, cta_label: null, cta_url: null },
  'gallery.hero': { block_key: 'gallery.hero', title: 'Gallery', body: 'Match day photos, team shots, and club memories.', image_url: null, cta_label: null, cta_url: null },
  'gallery.intro': { block_key: 'gallery.intro', title: 'Follow Us for More', body: 'Follow NDCC social channels for more photos and highlights.', image_url: null, cta_label: null, cta_url: null },
  'sponsors.hero': { block_key: 'sponsors.hero', title: 'Our Sponsors', body: 'The generous support of sponsors keeps cricket thriving at NDCC.', image_url: null, cta_label: null, cta_url: null },
  'facilities.hero': { block_key: 'facilities.hero', title: 'Our Facilities', body: `Home of the ${CLUB_NICKNAME}, ${CLUB_GROUND} offers turf and synthetic practice wickets, a match-day oval, and clubrooms for players, families, and the wider Newcomb community.`, image_url: null, cta_label: null, cta_url: null },
  'facilities.intro': { block_key: 'facilities.intro', title: CLUB_GROUND, body: `The ${CLUB_NICKNAME} play and train at ${CLUB_GROUND}, ${CLUB_ADDRESS}. The ground features a well-maintained turf wicket square and outfield, with clubrooms, change rooms, and a canteen shared with the Newcomb Power Football & Netball Club as part of the Newcomb and District Sports Club precinct.`, image_url: '/images/Turf_Ground.jpg', cta_label: null, cta_url: null },
  'facilities.training': { block_key: 'facilities.training', title: 'Training Facility', body: 'Pre-season and in-season training runs at the Peter ‘Skinny’ Harrison Training Facility, with four club turf practice lanes and three public synthetic lanes for players of all ages. The synthetic lanes are open to the community for practice all year round.', image_url: '/images/Turf.jpg', cta_label: null, cta_url: null },
  'facilities.features_intro': { block_key: 'facilities.features_intro', title: 'Facility Features', body: `Everything you need for a season of cricket — practice wickets, a match-day oval, clubrooms, and a canteen, all at ${CLUB_GROUND}.`, image_url: null, cta_label: null, cta_url: null },
  'facilities.cta': { block_key: 'facilities.cta', title: 'Visit or Enquire', body: `Want to visit ${CLUB_GROUND}, enquire about facility hire, or get involved with the ${CLUB_NICKNAME}? Get in touch and we will be happy to help.`, image_url: null, cta_label: 'Contact Us', cta_url: '/contact' },
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
  // Footer columns. The CMS owns these (page_link_cards / site:*); these defaults only
  // render when Supabase is cold or a section is unpopulated, so the footer is never blank
  // and never shows a diagnostic. CMS rows override these whenever Supabase is warm.
  'site:footer_quick_links': [
    card('fallback-footer-about', 'site', 'footer_quick_links', 'About Us', '', '/about', 1),
    card('fallback-footer-teams', 'site', 'footer_quick_links', 'Our Teams', '', '/teams', 2),
    card('fallback-footer-fixtures', 'site', 'footer_quick_links', 'Fixtures', '', '/fixtures', 3),
    card('fallback-footer-events', 'site', 'footer_quick_links', 'Events', '', '/events', 4),
    card('fallback-footer-news', 'site', 'footer_quick_links', 'News', '', '/news', 5),
    card('fallback-footer-contact', 'site', 'footer_quick_links', 'Contact', '', '/contact', 6),
  ],
  'site:footer_get_involved': [
    card('fallback-footer-join', 'site', 'footer_get_involved', 'Join the Club', '', '/join', 1),
    card('fallback-footer-volunteer', 'site', 'footer_get_involved', 'Volunteer', '', '/volunteer', 2),
    card('fallback-footer-sponsor', 'site', 'footer_get_involved', 'Become a Sponsor', '', '/sponsors', 3),
    card('fallback-footer-merch', 'site', 'footer_get_involved', 'Merchandise', '', '/merchandise', 4),
    card('fallback-footer-committee-login', 'site', 'footer_get_involved', 'Committee Login', '', '/admin/login', 99),
  ],
  'site:footer_affiliations': [
    card('fallback-footer-gca', 'site', 'footer_affiliations', 'Geelong Cricket Association', '', playHqOrg, 1, null, null, true),
    card('fallback-footer-cv', 'site', 'footer_affiliations', 'Cricket Victoria', '', 'https://www.cricketvictoria.com.au', 2, null, null, true),
    card('fallback-footer-playhq', 'site', 'footer_affiliations', 'PlayHQ', '', 'https://www.playhq.com', 3, null, null, true),
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

function getFallbackSponsorLogo(name: string) {
  const key = canonicalSponsorKey(name);
  return Object.entries(fallbackSponsorLogos).find(([sponsorName]) => canonicalSponsorKey(sponsorName) === key)?.[1] || '';
}

export const fallbackSponsorLogos: Record<string, string> = {
  'APCO Newcomb': '/images/2026/06/apco-1781148625016.png',
  APCO: '/images/2026/06/apco-1781148625016.png',
  // TODO: place the MBR Cricket logo at public/images/sponsors/mbr-cricket-logo.png.
  // The original was an external gold-on-transparent CDN PNG that rendered near-invisible
  // on the white sponsor card; localising it removes the third-party dependency. Until the
  // file is added, sponsor slots fall back to a branded maroon/gold initials card, so no
  // empty white box is shown (see SponsorsSection marquee and the sponsors page grid).
  'MBR Cricket': '/images/sponsors/mbr-cricket-logo.png',
  // TODO: replace with a dark-text or high-contrast Bennett Racing logo from the club.
  // The current asset is light text on transparency; LogoChip's dark plate keeps it
  // legible, but a proper asset is the real fix.
  'Bennett Racing': '/images/2026/06/bennett-1781148645814.webp',
  Bennett: '/images/2026/06/bennett-1781148645814.webp',
  'Blackmans Brewery': '/images/2026/06/blackmans-1781148663993.webp',
  "Blackman's Brewery": '/images/2026/06/blackmans-1781148663993.webp',
  'Champion Trophies': '/images/2026/06/champion_trophy-1781148687999.jpg',
  'General Public Corio': '/images/2026/06/gp-1781148742506.png',
  GP: '/images/2026/06/gp-1781148742506.png',
  'Mahoney Real Estate': '/images/2026/06/mahoney-1781148805224.png',
  Mahoney: '/images/2026/06/mahoney-1781148805224.png',
  'Phoenix Truck Bodies': '/images/2026/06/phoenix-1781148703539.jpg',
};

const june16SponsorAssets: Sponsor[] = [
  { id: 'fallback-apco', name: 'APCO Newcomb', tier: 'standard', logo_url: fallbackSponsorLogos.APCO, website: 'https://www.apco.com.au/', placement_type: 'listing', active: true, created_at: '2026-06-16T00:00:00+10:00' },
  { id: 'fallback-bennett', name: 'Bennett Racing', tier: 'standard', logo_url: fallbackSponsorLogos.Bennett, website: '', placement_type: 'listing', active: true, created_at: '2026-06-16T00:00:00+10:00' },
  { id: 'fallback-blackmans', name: 'Blackmans Brewery', tier: 'silver', logo_url: fallbackSponsorLogos["Blackman's Brewery"], website: 'https://www.blackmansbrewery.com.au', placement_type: 'listing', active: true, created_at: '2026-06-16T00:00:00+10:00' },
  { id: 'fallback-champion', name: 'Champion Trophies', tier: 'gold', logo_url: fallbackSponsorLogos['Champion Trophies'], website: 'https://www.swlocksmiths.com.au/trophies-giftware/', placement_type: 'listing', active: true, created_at: '2026-06-16T00:00:00+10:00' },
  { id: 'fallback-gp', name: 'General Public Corio', tier: 'standard', logo_url: fallbackSponsorLogos.GP, website: '', placement_type: 'listing', active: true, created_at: '2026-06-16T00:00:00+10:00' },
  { id: 'fallback-mahoney', name: 'Mahoney Real Estate', tier: 'standard', logo_url: fallbackSponsorLogos.Mahoney, website: 'https://www.realestate.com.au/agency/mahoney-real-estate-ISUSUH', placement_type: 'listing', active: true, created_at: '2026-06-16T00:00:00+10:00' },
  { id: 'fallback-phoenix', name: 'Phoenix Truck Bodies', tier: 'silver', logo_url: fallbackSponsorLogos['Phoenix Truck Bodies'], website: 'https://phoenixtruckbodies.com.au', placement_type: 'listing', active: true, created_at: '2026-06-16T00:00:00+10:00' },
];

export const fallbackSponsors: Sponsor[] = [
  ...SEED_SPONSORS.map((sponsor) => ({
    ...sponsor,
    // Prefer the curated local asset over the seed-provided URL so the external
    // mbrcricket.com CDN link is superseded by the local MBR logo path.
    logo_url: getFallbackSponsorLogo(sponsor.name) || sponsor.logo_url,
    created_at: '2026-06-16T00:00:00+10:00',
  })),
  ...june16SponsorAssets,
].reduce<Sponsor[]>((merged, sponsor) => {
  if (!merged.some((item) => canonicalSponsorKey(item.name) === canonicalSponsorKey(sponsor.name))) merged.push({ ...sponsor, name: canonicalSponsorName(sponsor.name) });
  return merged;
}, []);

export function mergeSponsorsWithFallback<T extends Partial<Sponsor> & { name: string }>(sponsors: T[] | null | undefined) {
  const source = (sponsors || []).filter((sponsor) => sponsor.name?.trim()) as Array<T & Sponsor>;
  const byCanonical = new Map<string, T & Sponsor>();
  for (const sponsor of source) {
    const key = canonicalSponsorKey(sponsor.name);
    if (byCanonical.has(key)) continue;
    const fallback = fallbackSponsors.find((item) => canonicalSponsorKey(item.name) === key);
    byCanonical.set(key, {
      ...sponsor,
      name: canonicalSponsorName(sponsor.name),
      logo_url: sponsor.logo_url?.trim() ? sponsor.logo_url : fallback?.logo_url || getFallbackSponsorLogo(sponsor.name) || '',
      website: sponsor.website?.trim() ? sponsor.website : fallback?.website || '',
      description: sponsor.description?.trim() ? sponsor.description : fallback?.description,
    });
  }
  if (byCanonical.size > 0) {
    for (const sponsor of fallbackSponsors) {
      const key = canonicalSponsorKey(sponsor.name);
      if (!byCanonical.has(key)) byCanonical.set(key, { ...sponsor, name: canonicalSponsorName(sponsor.name) } as T & Sponsor);
    }
    return Array.from(byCanonical.values());
  }
  return fallbackSponsors.map((sponsor) => ({ ...sponsor, name: canonicalSponsorName(sponsor.name) })) as Array<T & Sponsor>;
}

export const fallbackSeasonAppointments = [
  { id: 'fallback-craig-hillgrove', name: 'Craig Hillgrove', role: 'Head Coach', image_url: '/images/season-appointments/2026-27/craig-hillgrove-head-coach-2026-27.webp', announcement_date: '2026-03-01', sort_order: 1, is_active: true },
  { id: 'fallback-jason-robertson', name: 'Jason Robertson', role: 'Assistant Coach', image_url: null, announcement_date: '2026-03-02', sort_order: 2, is_active: true },
  { id: 'fallback-daniel-harrison', name: 'Daniel Harrison', role: 'Assistant Coach', image_url: null, announcement_date: '2026-03-03', sort_order: 3, is_active: true },
  { id: 'fallback-kelsey-allan', name: 'Kelsey Allan', role: "Women's Coach", image_url: '/images/season-appointments/2026-27/kelsey-allan-womens-coach-2026-27.webp', announcement_date: '2026-03-15', sort_order: 4, is_active: true },
  { id: 'fallback-aaron-morgan', name: 'Aaron Morgan', role: 'Player', image_url: '/images/season-appointments/2026-27/aaron-morgan-re-signed-2026-27.webp', announcement_date: '2026-05-01', sort_order: 5, is_active: true },
  { id: 'fallback-anthony-quarrell', name: 'Anthony Quarrell', role: 'Player', image_url: '/images/season-appointments/2026-27/anthony-quarrell-re-signed-2026-27.webp', announcement_date: '2026-05-02', sort_order: 6, is_active: true },
  { id: 'fallback-blake-ritchie', name: 'Blake Ritchie', role: 'Player', image_url: '/images/season-appointments/2026-27/blake-ritchie-re-signed-2026-27.webp', announcement_date: '2026-05-03', sort_order: 7, is_active: true },
  { id: 'fallback-nathan-keevil', name: 'Nathan Keevil', role: 'Player', image_url: '/images/season-appointments/2026-27/nathan-keevil-re-signed-2026-27.webp', announcement_date: '2026-05-04', sort_order: 8, is_active: true },
  { id: 'fallback-tyler-oneil', name: "Tyler O'Neil", role: 'Player', image_url: null, announcement_date: '2026-05-05', sort_order: 9, is_active: true },
  { id: 'fallback-rhys-bath', name: 'Rhys Bath', role: 'Player', image_url: null, announcement_date: '2026-05-06', sort_order: 10, is_active: true },
  { id: 'fallback-huey-neild', name: 'Huey Neild', role: 'Player', image_url: '/images/season-appointments/2026-27/huey-neild-re-signed-2026-27.webp', announcement_date: '2026-05-07', sort_order: 11, is_active: true },
  { id: 'fallback-gautham-ranjith', name: 'Gautham Ranjith', role: 'Returning Player', image_url: null, announcement_date: '2026-05-08', sort_order: 12, is_active: true },
  { id: 'fallback-freddie-norridge', name: 'Freddie Norridge', role: 'Player', image_url: '/images/season-appointments/2026-27/freddie-norridge-signed-2026-27.webp', announcement_date: '2026-05-09', sort_order: 13, is_active: true },
  { id: 'fallback-caitlin-rose-neil', name: 'Caitlin-Rose Neil', role: 'Player', image_url: null, announcement_date: '2026-05-10', sort_order: 14, is_active: true },
  { id: 'fallback-skye-green', name: 'Skye Green', role: 'Player', image_url: null, announcement_date: '2026-05-11', sort_order: 15, is_active: true },
  { id: 'fallback-jodie-clark', name: 'Jodie Clark', role: 'Player', image_url: null, announcement_date: '2026-05-12', sort_order: 16, is_active: true },
  { id: 'fallback-elliot-ridway', name: 'Elliot Ridway', role: 'Player', image_url: null, announcement_date: '2026-05-13', sort_order: 17, is_active: true },
  { id: 'fallback-harvey-cliff', name: 'Harvey Cliff', role: 'Player', image_url: null, announcement_date: '2026-05-14', sort_order: 18, is_active: true },
  { id: 'fallback-scott-kirby', name: 'Scott Kirby', role: 'Player', image_url: '/images/season-appointments/2026-27/scott-kirby-re-signed-2026-27.webp', announcement_date: '2026-05-15', sort_order: 19, is_active: true },
];

// Committee & office bearers shown on /about. Mirrors the live committee_members table so a
// Supabase cold start renders the real committee instead of a blank section or a diagnostic.
export const fallbackCommitteeMembers: CommitteeMemberContent[] = [
  { id: 'fallback-committee-president', name: 'John Elliott', role: 'President', sort_order: 1, is_active: true },
  { id: 'fallback-committee-vice-president', name: 'Troy Whitworth', role: 'Vice President', sort_order: 2, is_active: true },
  { id: 'fallback-committee-treasurer', name: 'Laura Hudson', role: 'Treasurer', sort_order: 3, is_active: true },
  { id: 'fallback-committee-head-coach', name: 'Craig Hillgrove', role: 'Head Coach', sort_order: 4, is_active: true },
  { id: 'fallback-committee-junior-coordinator', name: 'Marcus Pearson', role: 'Junior Coordinator', sort_order: 5, is_active: true },
];

export function mergeSeasonAppointmentsWithFallback<T extends { name: string; announcement_date?: string | null; sort_order?: number | null }>(appointments: T[] | null | undefined) {
  const filtered = [...((appointments || []).filter((appointment) => appointment.name?.trim()))];
  const merged = filtered.length > 0 ? filtered : fallbackSeasonAppointments as unknown as T[];
  return merged.sort((a, b) => {
    const sortOrderA = a.sort_order ?? 999;
    const sortOrderB = b.sort_order ?? 999;
    if (sortOrderA !== sortOrderB) return sortOrderA - sortOrderB;

    const announcementDateA = Date.parse(a.announcement_date || '') || 0;
    const announcementDateB = Date.parse(b.announcement_date || '') || 0;
    if (announcementDateA !== announcementDateB) return announcementDateB - announcementDateA;

    return a.name.localeCompare(b.name);
  });
}

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

export function canonicalEventKey(event: Pick<Event, 'id' | 'title'>) {
  const titleKey = String(event.title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return titleKey || String(event.id || '').trim();
}

export function mergeEventsWithFallback<T extends Partial<Event> & { id: string; title: string }>(events: T[] | null | undefined) {
  const byCanonical = new Map<string, T | Event>();

  for (const event of (events || []).filter((item) => item.title?.trim())) {
    byCanonical.set(canonicalEventKey(event as Event), {
      ...event,
      image_url: normalizeEventImage(event.title, event.image_url || null),
    });
  }

  for (const event of fallbackEvents) {
    const key = canonicalEventKey(event);
    if (!byCanonical.has(key)) byCanonical.set(key, event);
  }

  return Array.from(byCanonical.values()).sort((a, b) => {
    const aTime = Date.parse(String(a.date || '')) || Number.MAX_SAFE_INTEGER;
    const bTime = Date.parse(String(b.date || '')) || Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  }) as Array<T & Event>;
}

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
