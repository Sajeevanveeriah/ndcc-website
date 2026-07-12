import { CommitteeMember, TeamInfo, Product, NewsPost, Sponsor, Event, SeasonAppointment } from './types';

export const CLUB_NAME = 'Newcomb and District Cricket Club';
export const CLUB_SHORT = 'NDCC';
export const CLUB_NICKNAME = 'Dinos';
export const CLUB_ESTABLISHED = 1972;
export const CLUB_EMAIL_USER = 'ndsc.cricket';
export const CLUB_EMAIL_DOMAIN = 'gmail.com';
export const CLUB_GROUND = 'Grinter Reserve';
export const CLUB_ADDRESS = '141 Coppards Road, Moolap VIC 3224';
export const CLUB_ASSOCIATION = 'Geelong Cricket Association';
export const CLUB_ASSOCIATION_SHORT = 'GCA';

export const ACKNOWLEDGEMENT =
  'Newcomb and District Cricket Club acknowledges the Wadawurrung people as the traditional custodians of the land on which we play and train. We pay our respects to Elders past, present, and emerging.';

export const COMMITTEE: CommitteeMember[] = [];

export const TEAMS: TeamInfo[] = [];

export const PRODUCTS: Product[] = [];

export const VOLUNTEER_ROLES = [
  'Canteen',
  'Scorer',
  'Ground Setup',
  'General Help',
] as const;

export const ENQUIRY_TYPES = [
  { value: 'general', label: 'General Enquiry' },
  { value: 'membership', label: 'Membership' },
  { value: 'sponsorship', label: 'Sponsorship' },
  { value: 'facilities', label: 'Facilities Hire' },
  { value: 'juniors', label: 'Junior Cricket' },
  { value: 'other', label: 'Other' },
] as const;

export const SPONSOR_TIERS = [
  { value: 'major', label: 'Major Partner', order: 1 },
  { value: 'gold', label: 'Gold Sponsor', order: 2 },
  { value: 'silver', label: 'Silver Sponsor', order: 3 },
  { value: 'standard', label: 'Standard Sponsor', order: 4 },
  { value: 'community', label: 'Community Partner', order: 5 },
] as const;

export type NavLink = {
  label: string;
  href: string;
  openInNewTab?: boolean;
};

export const NAV_LINKS: readonly NavLink[] = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about' },
  { label: 'Teams', href: '/teams' },
  { label: 'Facilities', href: '/facilities' },
  { label: 'Fixtures', href: '/fixtures' },
  { label: 'Fantasy Cricket', href: '/fantasy' },
  { label: 'Events', href: '/events' },
  { label: 'Calendar', href: '/calendar' },
  { label: 'Join', href: '/join' },
  { label: 'News', href: '/news' },
  { label: 'Merchandise', href: '/merchandise' },
  { label: 'Kitchen', href: '/kitchen' },
  { label: 'Sponsors', href: '/sponsors' },
  { label: 'Gallery', href: '/gallery' },
  { label: 'Volunteer', href: '/volunteer' },
  { label: 'Contact', href: '/contact' },
] as const;

export const GOOGLE_MAPS_EMBED_URL =
  'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3140.5!2d144.38!3d-38.17!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2sGrinter+Reserve+Moolap!5e0!3m2!1sen!2sau!4v1234567890';

export const CLUB_PHONE = '0419 236 866';
export const FACEBOOK_URL = 'https://www.facebook.com/NewcombDistrictCricketClub/';
export const INSTAGRAM_URL = 'https://www.instagram.com/newcombdistrictcc/';
export const INSTAGRAM_HANDLE = '@newcombdistrictcc';
export const PLAYHQ_ORG_URL = 'https://www.playhq.com/cricket-australia/org/newcomb-and-district-cricket-club/2c2bff9c';
export const PLAYHQ_URL = PLAYHQ_ORG_URL;

export const SEED_NEWS: Omit<NewsPost, 'created_at'>[] = [];

export const SEED_SPONSORS: Omit<Sponsor, 'created_at'>[] = [];

export const SEED_SPONSOR_DESCRIPTIONS: Record<string, string> = {};


export const SEED_EVENTS: Omit<Event, 'stripe_link' | 'published' | 'created_at'>[] = [];

export const SEASON_APPOINTMENTS: SeasonAppointment[] = [];
