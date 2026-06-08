# Final Completion Notes

## CMS completion matrix

| Public area | Public route | Visible content | Current source | Current admin editor | CMS editable now | Gap | Planned fix | Migration required | Fallback source |
|---|---|---|---|---|---|---|---|---|---|
| Header navigation | All | Labels, hrefs, external flag, order | `NAV_LINKS` fallback plus `page_link_cards` | `/admin/site-pages` | Yes | Was hardcoded in client nav | Load `site/header_nav` with fallback | Yes, seed links | `NAV_LINKS` |
| Footer | All | Quick links, get involved links, copyright | `page_link_cards`, `club_settings` | `/admin/site-pages`, `/admin/club-details` | Yes | Footer link groups were hardcoded | Load footer link sections | Yes, seed links | `NAV_LINKS`, club settings fallback |
| Footer affiliations | All | GCA, Newcomb Power, Softball, Darts, Good Sports | `page_link_cards` | `/admin/site-pages` | Yes | Affiliations were hardcoded | Load `site/footer_affiliations` | Yes, seed links | Safe existing URLs/internal contact routes |
| Footer contact details | All | Club name, ground, address, email, phone | `club_settings` | `/admin/club-details` | Yes | None | Preserve | No | `lib/constants.ts` |
| Home | `/` | Hero, cards, news/events/sponsors/appointments | Content blocks and resources | `/admin/content`, dedicated admin pages | Yes | None in this PR | Preserve | No | Existing constants/resource fallbacks |
| About | `/about` | Intro, history, committee, article cards | Content blocks/history/committee/page cards | `/admin/content`, `/admin/history`, `/admin/site-pages` | Yes | None in this PR | Preserve | No | Existing fallback content |
| Contact | `/contact` | Hero, form intro, details, contact links | Content blocks/club settings | `/admin/content`, `/admin/club-details` | Yes | None in this PR | Preserve | No | Existing fallback content |
| Join | `/join` | Membership and join copy | Content blocks/memberships | `/admin/content`, `/admin/memberships` | Yes | None in this PR | Preserve | No | Existing fallback content |
| Facilities | `/facilities` | Hero, address, feature cards, article cards | Content blocks/club settings/facility/page cards | `/admin/content`, `/admin/club-details`, `/admin/site-pages` | Yes | None in this PR | Preserve | No | Existing fallback content |
| Fixtures | `/fixtures` | Season status, PlayHQ cards | Content blocks/page cards/club settings | `/admin/content`, `/admin/site-pages`, `/admin/club-details` | Yes | None in this PR | Preserve | No | Existing fallback content |
| News listing | `/news` | News cards/text/images | `news` | `/admin/news` | Yes | None in this PR | Preserve | No | `SEED_NEWS` |
| News detail | `/news/[id]` | Article text/image | `news` | `/admin/news` | Yes | Premiership item may be fallback/seed until migration applied | Preserve editable news route | Existing seed already present | `SEED_NEWS` |
| Events listing | `/events` | Event cards | `events` | `/admin/events` | Yes | None in this PR | Preserve | No | Existing fallback content |
| Events detail | `/events/[id]` | Event detail/registration | `events` | `/admin/events` | Yes | None in this PR | Preserve | No | Existing fallback content |
| Sponsors | `/sponsors` | Hero, sponsor cards, enquiry copy | Content blocks/sponsors | `/admin/content`, `/admin/sponsors` | Yes | Prior optional-field bug already guarded; revalidated | Preserve robust optional values | No | Existing fallback content |
| Gallery | `/gallery` | Hero, intro, images | Content blocks/gallery images | `/admin/content`, `/admin/gallery` | Yes | None in this PR | Preserve | No | Existing fallback content |
| Teams | `/teams` | Team cards/images/PlayHQ | `teams` | `/admin/teams` | Yes | None in this PR | Preserve | No | `TEAMS` |
| Kitchen | `/kitchen` | Intro, menus/items | Content blocks/kitchen resources | `/admin/content`, `/admin/kitchen` | Yes | None in this PR | Preserve | No | Existing fallback content |
| Merchandise/Apparel | `/merchandise` | Hero, ordering copy, products/windows | Content blocks/apparel/resources | `/admin/content`, `/admin/apparel` | Yes | None in this PR | Preserve | No | Existing product fallback |
| Volunteer | `/volunteer` | Hero, intro, positions | Content blocks/volunteer positions | `/admin/content`, `/admin/volunteers` | Yes | None in this PR | Preserve | No | Existing fallback content |
| Memberships | `/join` | Plans/add-ons | Social membership resources | `/admin/memberships` | Yes | None in this PR | Preserve | No | Existing fallback content |
| History | `/about` | Lineage, competitions, premierships | History resources | `/admin/history` | Yes | No standalone `/history` route linked | Documented as intentionally under About | No | Existing fallback content |
| Committee | `/about` | Committee members | `committee_members` | `/admin/history` | Yes | No standalone `/committee` route linked | Documented as intentionally under About | No | Existing fallback content |
| Minutes | `/committee/minutes` | Meeting minutes listing/detail | `meeting_minutes` | `/admin/minutes` | Yes | None in this PR | Preserve | No | Empty-state fallback |
| Fantasy landing | `/fantasy` | Intro and game links | Fantasy page/resources | `/admin/fantasy`, `/admin/fantasy/settings` | Yes | Auth completion concerns | Fix auth/profile path | No | Existing fallback content |
| Fantasy rules | `/fantasy/rules` | Rules/scoring | Fantasy settings/rules | `/admin/fantasy/scoring` | Yes | None in this PR | Preserve | No | Existing fallback content |
| Fantasy register/login/account helper text | `/fantasy/register`, `/fantasy/login`, `/fantasy/account` | Auth forms and status copy | Component copy + Supabase Auth | Public forms | Partly | Redirect/profile creation needed hardening | Add redirect, callback forwarding, upsert diagnostics | No | Existing form copy |
| Admin dashboard cards and links | `/admin` | Cards/quick actions | Component links | Code/admin routes | Yes | Email diagnostics link absent | Add dashboard links | No | Existing dashboard |

## Fantasy flow explanation

- Registration stores `display_name` and `team_name` in Supabase Auth user metadata.
- Registration and resend confirmation set `emailRedirectTo` to `/fantasy/account`.
- `/api/auth/callback` forwards Supabase Auth query parameters to `/fantasy/account` for compatibility with existing dashboard redirect settings.
- `/fantasy/account` exchanges a confirmation `code` when present, reads the authenticated user, and auto-creates the manager profile from metadata when no profile exists.
- `/api/fantasy/manager` uses the authenticated Supabase user only, validates and normalises names, upserts by `auth_user_id`, and never accepts client-supplied `auth_user_id`.
- Welcome email is attempted only for first profile creation and never blocks profile persistence.

## Email flow explanation

- Supabase Auth confirmation/password-reset email remains configured in Supabase SMTP settings.
- App transactional email uses the Resend API through `lib/email.ts` and returns `sent`, `skipped`, or `failed`.
- `/admin/email-diagnostics` shows whether app email environment variables are present without exposing secrets and can send a test email to an admin-provided recipient.

## Manual final test checklist

- Apply migrations in order, including `20260608090000_site_navigation_footer_cms.sql`.
- In `/admin/site-pages`, edit one inactive clone or safe test row for header/footer links and verify the public header/footer update.
- In `/admin/club-details`, verify club contact/social/PlayHQ/map fields are populated.
- In `/admin/email-diagnostics`, verify env status and send a test email after Resend is configured.
- In `/admin/sponsors`, create/edit a sponsor with blank optional logo/website fields, then add and clear those fields.
- In `/admin/news`, confirm `Dinos celebrate senior and junior premiership success` is editable or add it once if the database seed has not been applied.
- Register a new fantasy account with a fresh email alias, confirm the email, land on `/fantasy/account`, and verify a single active manager profile exists.
- Log out and log back in to verify the fantasy profile is preserved.
- Verify Stripe/payment, GitHub media upload, Supabase confirmation delivery, Resend SMTP logs, and Vercel production deployment in live services before final acceptance.

## Rollback path

After merge, roll back this PR with:

```bash
git revert <merge_commit_sha>
```
