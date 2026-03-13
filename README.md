# Newcomb and District Cricket Club (NDCC) Website

Official website for the Newcomb and District Cricket Club — the Dinos. Competing in the Geelong Cricket Association since 1972.

## Tech Stack

- **Framework:** Next.js 14 (App Router) with TypeScript
- **Styling:** Tailwind CSS
- **Database:** Supabase (PostgreSQL with Row Level Security)
- **Payments:** Stripe (Payment Links)
- **Deployment:** Vercel

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
npm install
```

### Environment Variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

### Database Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Run the SQL in `supabase/schema.sql` in the Supabase SQL Editor
3. Copy your project URL, anon key, and service role key to `.env.local`

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Admin Setup

1. Create a user in Supabase Authentication
2. Add a row to the `profiles` table with the user's ID, email, and `role: 'admin'`
3. Log in at `/admin/login`

## Project Structure

```
app/
  ├── page.tsx              # Home
  ├── about/                # Club history & committee
  ├── teams/                # Senior Men, Women, Juniors
  ├── facilities/           # Grinter Reserve & training facility
  ├── fixtures/             # Fixtures & results (PlayHQ link)
  ├── events/               # Events listing & registration
  ├── news/                 # News & announcements
  ├── merchandise/          # Club apparel & orders
  ├── sponsors/             # Sponsor tiers & enquiry form
  ├── gallery/              # Photo gallery
  ├── volunteer/            # Volunteer registration
  ├── contact/              # Contact form & details
  ├── admin/                # Protected admin dashboard
  └── api/                  # API routes for form submissions
components/
  ├── ui/                   # Reusable UI components
  ├── layout/               # Navbar & Footer
  ├── forms/                # Form components
  └── admin/                # Admin components
lib/
  ├── supabase.ts           # Supabase client
  ├── supabase-server.ts    # Server-side Supabase client
  ├── stripe.ts             # Stripe configuration
  ├── types.ts              # TypeScript interfaces
  ├── constants.ts          # Club data & constants
  └── utils.ts              # Helper functions
supabase/
  └── schema.sql            # Database schema & RLS policies
```

## Club Details

- **Ground:** Grinter Reserve, 141 Coppards Road, Moolap VIC 3221
- **Association:** Geelong Cricket Association (GCA)
- **Teams:** Senior Men (Grade 4), Senior Women (E Grade East), Junior Boys
- **Training:** Peter 'Skinny' Harrison Training Facility
- **Accreditation:** Good Sports Level 3
- **Partner:** Newcomb Power Football Club

## Licence

All rights reserved. Newcomb and District Cricket Club.
