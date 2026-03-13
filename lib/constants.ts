import { CommitteeMember, TeamInfo, Product } from './types';

export const CLUB_NAME = 'Newcomb and District Cricket Club';
export const CLUB_SHORT = 'NDCC';
export const CLUB_NICKNAME = 'Dinos';
export const CLUB_ESTABLISHED = 1972;
export const CLUB_EMAIL_USER = 'ndsc.cricket';
export const CLUB_EMAIL_DOMAIN = 'gmail.com';
export const CLUB_GROUND = 'Grinter Reserve';
export const CLUB_ADDRESS = '141 Coppards Road, Moolap VIC 3221';
export const CLUB_ASSOCIATION = 'Geelong Cricket Association';
export const CLUB_ASSOCIATION_SHORT = 'GCA';

export const ACKNOWLEDGEMENT =
  'Newcomb and District Cricket Club acknowledges the Wadawurrung people as the traditional custodians of the land on which we play and train. We pay our respects to Elders past, present, and emerging.';

export const COMMITTEE: CommitteeMember[] = [
  { name: 'John Elliott', role: 'President' },
  { name: 'Troy Whitworth', role: 'Vice President' },
  { name: 'Laura Hudson', role: 'Treasurer' },
];

export const TEAMS: TeamInfo[] = [
  {
    name: 'Senior Men',
    grade: 'GCA Grade 4',
    description:
      'Our Senior Men\'s side competes in Grade 4 of the Geelong Cricket Association. With a mix of experienced players and emerging talent, the team plays a competitive brand of cricket every Saturday through the season.',
  },
  {
    name: 'Senior Women',
    grade: 'GCA E Grade East',
    description:
      'Our Senior Women\'s team plays in GCA E Grade East. The side has been growing in numbers and strength, providing a welcoming pathway for women and girls to play competitive cricket in Geelong.',
  },
  {
    name: 'Junior Boys',
    grade: 'GCA Junior Competition',
    description:
      'Our Junior Boys programme develops the next generation of Dinos. Players learn the fundamentals of cricket in a supportive and fun environment, with pathways into senior cricket as they progress.',
  },
];

export const PRODUCTS: Product[] = [
  {
    id: 'club-polo',
    name: 'Club Polo',
    price: 45,
    description:
      'Official NDCC polo shirt in maroon with embroidered club crest. Perfect for match days, training, and club events.',
    sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'],
    image: '/images/placeholder-polo.jpg',
  },
  {
    id: 'club-cap',
    name: 'Club Cap',
    price: 25,
    description:
      'Maroon club cap with embroidered Dinos logo. Adjustable strap for a comfortable fit.',
    sizes: ['One Size'],
    image: '/images/placeholder-cap.jpg',
  },
  {
    id: 'training-singlet',
    name: 'Training Singlet',
    price: 35,
    description:
      'Lightweight maroon training singlet with printed club logo. Breathable fabric for summer training sessions.',
    sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL'],
    image: '/images/placeholder-singlet.jpg',
  },
];

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

export const NAV_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about' },
  { label: 'Teams', href: '/teams' },
  { label: 'Facilities', href: '/facilities' },
  { label: 'Fixtures', href: '/fixtures' },
  { label: 'Events', href: '/events' },
  { label: 'News', href: '/news' },
  { label: 'Merchandise', href: '/merchandise' },
  { label: 'Sponsors', href: '/sponsors' },
  { label: 'Gallery', href: '/gallery' },
  { label: 'Volunteer', href: '/volunteer' },
  { label: 'Contact', href: '/contact' },
] as const;

export const GOOGLE_MAPS_EMBED_URL =
  'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3140.5!2d144.38!3d-38.17!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2sGrinter+Reserve+Moolap!5e0!3m2!1sen!2sau!4v1234567890';

export const PLAYHQ_URL = 'https://www.playhq.com/cricket-australia/org/geelong-cricket-association';
