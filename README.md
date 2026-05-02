# Newcomb and District Cricket Club (NDCC) Website

Official website for the Newcomb and District Cricket Club — the Dinos. Competing in the Geelong Cricket Association since 1972.

## Tech Stack

- **Framework:** Next.js 14 (App Router) with TypeScript
- **Styling:** Tailwind CSS
- **Database:** Supabase Postgres (managed via `supabase/migrations`)
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
2. Apply SQL migrations from `supabase/migrations` in timestamp order.
3. Treat migrations as the source of truth. `supabase/schema.sql` is a legacy snapshot and not authoritative.
4. Copy your project URL, anon key, and service role key to `.env.local`

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Admin Setup (Custom Committee Auth)

1. Apply `20260401_custom_committee_auth.sql` and later migrations.
2. Bootstrap the first admin using `POST /api/admin/auth/bootstrap`.
3. Log in at `/admin/login`.
4. Manage committee users in `/admin/users` (admin-only). Roles available: `admin`, `president`, `secretary`, `committee`.

### GitHub-backed CMS Image Upload Setup

Set these as **server-only** environment variables (for local `.env.local` and Vercel Project Environment Variables):

- `GITHUB_CONTENTS_TOKEN`
- `GITHUB_REPO_OWNER`
- `GITHUB_REPO_NAME`
- `GITHUB_CONTENTS_BRANCH`
- `GITHUB_MEDIA_BASE_PATH` (for example `public/images/cms`)
- `GITHUB_COMMITTER_NAME`
- `GITHUB_COMMITTER_EMAIL`
- `VERCEL_DEPLOY_HOOK_URL`

Image uploads from admin forms commit files to GitHub via the Contents API into `public/images` (or your configured `GITHUB_MEDIA_BASE_PATH`), then return a browser URL that removes the leading `public` segment (for example `/images/cms/YYYY/MM/file.webp`).
Set `VERCEL_DEPLOY_HOOK_URL` to a Vercel Production Deploy Hook so uploaded images are published on the live site immediately after upload.
Configure these environment variables in **Vercel Production** for the production project.
When environment variables are added or changed in Vercel, trigger a new deployment for them to take effect.

### CMS Content Workflow

1. Sign in to `/admin`.
2. Edit singleton page text in **Content Blocks**.
3. For repeatable content, use dedicated admin screens (News, Gallery, Sponsors, Apparel, Kitchen, etc.).
4. Use the **Upload image** button in image fields to store assets in GitHub under `/public/images/cms`.
5. Save changes and verify the public page route.

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

- **Ground:** Grinter Reserve, 141 Coppards Road, Moolap VIC 3224
- **Association:** Geelong Cricket Association (GCA)
- **Teams:** Senior Men (Grade 4), Senior Women (E Grade East), Junior Boys
- **Training:** Peter 'Skinny' Harrison Training Facility
- **Accreditation:** Good Sports Level 3
- **Partner:** Newcomb Power Football Club

## Licence

All rights reserved. Newcomb and District Cricket Club.
