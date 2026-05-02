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

export const COMMITTEE: CommitteeMember[] = [
  { name: 'John Elliott', role: 'President' },
  { name: 'Troy Whitworth', role: 'Vice President' },
  { name: 'Laura Hudson', role: 'Treasurer' },
  { name: 'Craig Hillgrove', role: 'Head Coach' },
];

export const TEAMS: TeamInfo[] = [
  {
    name: 'Senior Men - 1st XI',
    grade: 'GCA Grade 4',
    description:
      'Our flagship senior side competes in Grade 4 of the Geelong Cricket Association. With a mix of experienced players and emerging talent, the 1st XI plays competitive two-day cricket every Saturday through the season at Grinter Reserve and away venues across Geelong.',
    playhq_url:
      'https://www.playhq.com/cricket-australia/org/newcomb-and-district-cricket-club/2c2bff9c/geelong-cricket-association-mens-competition-summer-202526/teams/newcomb-and-district-1sts/0f74d5e7',
  },
  {
    name: 'Senior Men - 2nd XI',
    grade: 'GCA Grade 4',
    description:
      'The 2nd XI provides a competitive pathway for developing players and experienced cricketers. Playing in the GCA Grade 4 competition alongside the 1st XI.',
  },
  {
    name: 'Senior Men - 3rd XI',
    grade: 'GCA Hard Wicket',
    description:
      'Our 3rd XI plays in the GCA hard wicket competition, offering a more social and accessible entry point for new and returning players.',
  },
  {
    name: 'Senior Women',
    grade: 'GCA E Grade East',
    description:
      'Our Senior Women\'s team plays in GCA E Grade East. The side has been growing in numbers and strength each season, providing a welcoming pathway for women and girls to play competitive cricket in Geelong.',
  },
  {
    name: 'Junior Boys - Under 17s',
    grade: 'GCA Junior Competition',
    description:
      'Our U17s side competes in the GCA junior competition, developing the next generation of senior cricketers.',
  },
  {
    name: 'Junior Boys - Under 13s',
    grade: 'GCA Junior Competition',
    description:
      'The U13s had an outstanding 2025/26 season, going through to finals undefeated and reaching the GCA grand final. A fantastic group of young cricketers with a bright future.',
  },
  {
    name: 'Junior Boys - Under 11s',
    grade: 'GCA Junior Competition',
    description:
      'Our youngest Dinos learn the fundamentals of cricket in a supportive and fun environment, with a focus on participation, skills development, and enjoying the game.',
  },
];

export const PRODUCTS: Product[] = [
  {
    id: 'playing-shirt',
    name: 'Playing Shirt (White)',
    price: 65,
    description:
      'Official NDCC playing shirt in white with embroidered club crest. Match-day ready with a professional fit. Available with custom name and number.',
    sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'],
    image: '',
    customisable: true,
  },
  {
    id: 'playing-trousers',
    name: 'Playing Trousers (White)',
    price: 55,
    description:
      'Official NDCC playing trousers in white. Comfortable and durable for all-day cricket.',
    sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'],
    image: '',
  },
  {
    id: 'club-hoodie',
    name: 'Club Hoodie (Maroon)',
    price: 70,
    description:
      'Warm maroon hoodie with embroidered club crest. Perfect for cool training evenings and winter off-season.',
    sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'],
    image: '',
  },
  {
    id: 'training-tee',
    name: 'Training Tee (Maroon)',
    price: 40,
    description:
      'Lightweight maroon training tee with printed club logo. Breathable performance fabric for nets and fitness sessions.',
    sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'],
    image: '',
  },
  {
    id: 'club-polo',
    name: 'Club Polo (Maroon)',
    price: 45,
    description:
      'Official NDCC polo shirt in maroon with embroidered club crest. Perfect for match days, training, and club events.',
    sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'],
    image: '',
  },
  {
    id: 'club-cap',
    name: 'Club Cap (Maroon)',
    price: 25,
    description:
      'Maroon club cap with embroidered Dinos logo. Adjustable strap for a comfortable fit.',
    sizes: ['One Size'],
    image: '',
  },
  {
    id: 'training-singlet',
    name: 'Training Singlet (Maroon)',
    price: 35,
    description:
      'Lightweight maroon training singlet with printed club logo. Breathable fabric for summer training sessions.',
    sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL'],
    image: '',
  },
  {
    id: 'cricket-socks',
    name: 'Cricket Socks (Maroon/White)',
    price: 15,
    description:
      'NDCC cricket socks in maroon and white. Cushioned sole for comfort during long days in the field.',
    sizes: ['S', 'M', 'L'],
    image: '',
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

export const SEED_NEWS: Omit<NewsPost, 'created_at'>[] = [
  {
    id: 'seed-agm-2026',
    title: 'Annual General Meeting - Wednesday 20 May 2026',
    content:
      'Members, players, families, volunteers and supporters are invited to attend the Annual General Meeting as the club prepares for the 2026/27 season. Date: Wednesday 20 May 2026. Time: 6:30 pm. Venue: Club rooms, Newcomb and District Sports Club, 141 Coppards Road, Moolap VIC 3224.',
    author: 'NDCC Committee',
    published: true,
    published_at: '2026-05-01T09:00:00+10:00',
  },
  {
    id: 'seed-dino-lotto-2026',
    title: 'Dino Lotto 2026 is Open',
    content:
      'Dino Lotto has 50 numbers available at AUD 50 per number. One AUD 100 prize is drawn every Friday at 7:00 pm across a 10 week block, starting when all numbers are sold. Each number remains in every weekly draw. To secure a number, contact ndsc.cricket@gmail.com.',
    author: 'NDCC Committee',
    published: true,
    published_at: '2026-04-30T17:00:00+10:00',
    image: '/images/events/2026/dino-lotto-2026.webp',
  },
  {
    id: 'seed-apparel-sponsorship-2026-27',
    title: 'Apparel Sponsorship 2026/27',
    content:
      `Put your brand on Newcomb and District apparel and support community cricket in the 2026/27 season. This opportunity is separate from the standard sponsorship packages. Contact John Elliott, President, on ${CLUB_PHONE} or ${CLUB_EMAIL_USER}@${CLUB_EMAIL_DOMAIN}.`,
    author: 'NDCC Committee',
    published: true,
    published_at: '2026-04-29T10:00:00+10:00',
    image: '/images/sponsors/2026-27/apparel-sponsorship-2026-27.webp',
  },
  {
    id: 'seed-kelsey-allan',
    title: "Kelsey Allan Appointed Women's Coach for 2026/27",
    content:
      'Newcomb and District Cricket Club is pleased to announce the appointment of Kelsey Allan as Women\'s Coach for the 2026/27 season. Kelsey brings enthusiasm and cricket knowledge to the role and will lead the women\'s program as it continues to grow. This is one of several coaching appointments for the upcoming season. Welcome aboard, Kelsey!',
    author: 'NDCC',
    published: true,
    published_at: '2026-03-15T10:00:00+11:00',
    image: '/images/season-appointments/2026-27/kelsey-allan-womens-coach-2026-27.webp',
  },
  {
    id: 'seed-welcome',
    title: 'Welcome to the New NDCC Website',
    content:
      'We are thrilled to launch the brand-new Newcomb and District Cricket Club website. This platform has been built from the ground up to keep our members, supporters, and the wider Geelong cricket community informed about everything happening at the Dinos. You will find fixtures, event information, merchandise, volunteer opportunities, and much more. We will be continually adding new features, so check back often. Thank you to everyone who contributed to making this happen.',
    author: 'NDCC Committee',
    published: true,
    published_at: '2026-03-01T09:00:00',
    image: '/images/Womens_Team.jpg',
  },
  {
    id: 'seed-u13s-grand-final',
    title: 'U13s Reach Grand Final',
    content:
      'Congratulations to our Under 13s side who secured a spot in the GCA grand final after an undefeated 2025/26 season. The grand final was held at Grinter Reserve, capping off a fantastic season for the junior programme. The boys showed incredible dedication and team spirit throughout the year, and the club could not be prouder of their achievement. A huge thank you to the coaches, parents, and volunteers who supported the team all season.',
    author: 'NDCC Committee',
    published: true,
    published_at: '2026-03-10T10:00:00',
  },
  {
    id: 'seed-training-facility',
    title: 'Training Facility Grand Opening',
    content:
      'The Peter "Skinny" Harrison Training Facility was officially opened in August 2024, marking a milestone moment for our club. Named in honour of one of our most beloved and long-serving members, the facility features three public synthetic lanes and four club turf lanes, giving our players access to first-class training surfaces right here at Grinter Reserve in Moolap. The new facility is a game-changer for both senior and junior cricket development at the club.',
    author: 'NDCC Committee',
    published: true,
    published_at: '2024-08-15T10:00:00',
  },
  {
    id: 'seed-2627-preview',
    title: '2026/27 Season Preview',
    content:
      'With the 2025/26 season now wrapped up, attention turns to the 2026/27 campaign starting in October 2026. Pre-season training will return to the Peter "Skinny" Harrison Training Facility at Grinter Reserve, with sessions for all senior and junior squads. We are encouraging new players across men\'s, women\'s, and junior cricket to get involved. Registrations will open on PlayHQ closer to the season. Keep an eye on our Facebook page and this website for announcements about training schedules and registration dates.',
    author: 'NDCC Committee',
    published: true,
    published_at: '2026-03-15T08:30:00',
  },
];

export const SEED_SPONSORS: Omit<Sponsor, 'created_at'>[] = [
  {
    id: 'seed-mbr',
    name: 'MBR Cricket (Mustaang Cricket Bat Repairs)',
    tier: 'major',
    logo_url: '',
    website: 'https://mbrcricket.com',
    placement_type: 'homepage',
    active: true,
  },
  {
    id: 'seed-leopold',
    name: 'Leopold Sportsmans Club',
    tier: 'gold',
    logo_url: '',
    website: 'https://leopoldsporties.com',
    placement_type: 'listing',
    active: true,
  },
  {
    id: 'seed-champion',
    name: 'Champion Trophies',
    tier: 'gold',
    logo_url: '',
    website: 'https://www.swlocksmiths.com.au/trophies-giftware/',
    placement_type: 'listing',
    active: true,
  },
  {
    id: 'seed-phoenix',
    name: 'Phoenix Truck Bodies',
    tier: 'silver',
    logo_url: '',
    website: 'https://phoenixtruckbodies.com.au',
    placement_type: 'listing',
    active: true,
  },
  {
    id: 'seed-blackmans',
    name: "Blackman's Brewery",
    tier: 'silver',
    logo_url: '',
    website: 'https://www.blackmansbrewery.com.au',
    placement_type: 'listing',
    active: true,
  },
];

export const SEED_SPONSOR_DESCRIPTIONS: Record<string, string> = {
  'seed-mbr': 'Geelong-based handcrafted cricket bats, repairs, pads and gloves. Owned by Raj Kumar Gurung.',
  'seed-leopold': 'Local sports and dining club in Leopold. Club event venue partner.',
  'seed-champion': 'Trophy supply and engraving. 172 Malop St, Geelong. Over 50 years in business.',
  'seed-phoenix': 'Geelong-based truck body manufacturing and general engineering since 1995.',
  'seed-blackmans': 'Independent craft brewery with venues in Torquay, Ocean Grove, and Geelong.',
};

export const SEED_EVENTS: Omit<Event, 'stripe_link' | 'published' | 'created_at'>[] = [
  {
    id: 'seed-event-agm-2026',
    title: 'Annual General Meeting',
    description:
      'Members, players, families, volunteers and supporters are invited to attend the AGM as the club prepares for the 2026/27 season. Wednesday 20 May 2026, 6:30 pm at the club rooms, Newcomb and District Sports Club, 141 Coppards Road, Moolap VIC 3224.',
    date: '2026-05-20T18:30:00+10:00',
    location: 'Newcomb and District Sports Club, 141 Coppards Road, Moolap VIC 3224',
    capacity: null,
    ticket_price: 0,
  },
  {
    id: 'seed-event-dino-lotto-2026',
    title: 'Dino Lotto 2026',
    description:
      'Dino Lotto has 50 numbers at AUD 50 each, with an AUD 100 weekly prize across a 10 week block. Draws are Fridays at 7:00 pm and start when all numbers are sold. Each number stays in every weekly draw. Contact ndsc.cricket@gmail.com to secure a number.',
    date: '2026-05-22T19:00:00+10:00',
    location: 'Newcomb and District Sports Club, 141 Coppards Road, Moolap VIC 3224',
    capacity: 50,
    ticket_price: 50,
  },
  {
    id: 'seed-event-presentation',
    title: '2025/26 Presentation Night',
    description:
      'Join us to celebrate the achievements of our players and volunteers for the 2025/26 season. Awards across all teams, dinner, and plenty of Dinos spirit. Held at General Public, Geelong.',
    date: '2026-03-28T18:00:00+11:00',
    location: 'General Public, Geelong',
    capacity: null,
    ticket_price: 35,
  },
  {
    id: 'seed-event-preseason',
    title: 'Pre-Season Training Begins',
    description:
      "Pre-season training for the 2026/27 season kicks off at the Peter 'Skinny' Harrison Training Facility, Grinter Reserve. All new and returning players welcome across men's, women's, and junior squads.",
    date: '2026-08-01T17:30:00+10:00',
    location: 'Grinter Reserve, Moolap',
    capacity: null,
    ticket_price: 0,
  },
  {
    id: 'seed-event-launch',
    title: 'Season Launch 2026/27',
    description:
      'Kick off the new cricket season with the Dinos. Meet the coaches, hear about plans for the season ahead, and register for your team. Free entry. All welcome, including new players and families.',
    date: '2026-09-12T14:00:00+10:00',
    location: 'Grinter Reserve, Moolap',
    capacity: null,
    ticket_price: 0,
  },
];

export const SEASON_APPOINTMENTS: SeasonAppointment[] = [
  {
    name: 'Craig Hillgrove',
    role: 'Head Coach',
    announcement_date: '2026-03-01',
  },
  {
    name: 'Kelsey Allan',
    role: "Women's Coach",
    image: '/images/season-appointments/2026-27/kelsey-allan-womens-coach-2026-27.webp',
    announcement_date: '2026-03-15',
  },
];
