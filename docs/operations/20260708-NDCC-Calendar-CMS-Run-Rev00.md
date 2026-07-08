# NDCC Calendar CMS — Implementation Run (Rev00, 2026-07-08)

## What changed

Added a CMS-managed club calendar: a new `calendar_events` Supabase table, public
calendar page (`/calendar`) with FullCalendar month/week/list views, home and
contact page previews, an admin calendar section (`/admin/calendar`), public
read APIs, an ICS export, and unit/smoke test coverage. The existing ticketed
**Events** CMS (`events` table, `/events`, `/admin/events`, registrations,
emails) is untouched.

## Architecture decision

**New `calendar_events` table (not an extension of `events`).** The existing
`events` table is registration/ticketing-centric (single `date` column,
`capacity`/`ticket_price`/`stripe_link`, cascading `event_registrations`,
registration emails keyed on it). Extending it would have required renaming
`date` → `start_at` across many public and admin call sites — high blast
radius. Relationship model: Events remains the event-detail/registration CMS;
the Calendar is the organising layer; a calendar entry links to
`/events/<id>` via `cta_url` when registration exists (Path A/B hybrid).

## Files changed

**New**
- `supabase/migrations/20260708090000_calendar_events.sql`
- `lib/calendar/types.ts`, `lib/calendar/format.ts`, `lib/calendar/queries.ts`
- `app/api/public/calendar/route.ts`, `.../upcoming/route.ts`, `.../ics/route.ts`
- `app/calendar/page.tsx`
- `components/calendar/NdccCalendar.tsx`, `CalendarFilters.tsx`,
  `CalendarLegend.tsx`, `EventDetailModal.tsx`, `CalendarEventCard.tsx`,
  `UpcomingEventsStrip.tsx`, `ContactUpcomingEvents.tsx`,
  `AddToCalendarButton.tsx`, `calendar-theme.css`
- `app/admin/calendar/page.tsx`
- `components/admin/calendar/CalendarEventFormModal.tsx`
- `scripts/test-calendar-logic.mjs`

**Modified**
- `app/api/admin/resources/[resource]/route.ts` — added `calendarEvents`
  resource entry, optional per-resource `validate` hook (used by the calendar),
  and revalidation tags/paths.
- `app/page.tsx` — added `CalendarPreviewSection` (after the Events section).
- `app/contact/page.tsx` — added `<ContactUpcomingEvents />` above the map.
- `app/admin/layout.tsx` — Calendar sidebar link.
- `lib/constants.ts` — `Calendar` in `NAV_LINKS` fallback.
- `app/sitemap.ts` — `/calendar` entry.
- `scripts/smoke-content.mjs` — `/calendar` check.
- `package.json` — FullCalendar dependencies + `test:calendar` script.
- `README.md` — Club Calendar section.

## Database changes (applied to production project `NDCC Website`)

- `calendar_events` table (33 columns) with CHECK constraints on
  `event_type`, `visibility`, `status`, `end_at >= start_at`,
  non-negative `ticket_price`, positive `capacity`.
- Indexes: `start_at`, `status`, `visibility`, `event_type`, composite
  `(status, visibility, start_at)`, partial indexes on the three show flags.
- `updated_at` trigger (same pattern as `content_blocks`).
- RLS enabled; anon SELECT limited to `published` + `public` +
  `show_on_calendar` rows (app uses service-role server-side as elsewhere).
- Seeded `page_link_cards` header/footer "Calendar" links (idempotent,
  `WHERE NOT EXISTS`).
- Additive only. No existing table, row, or policy was modified.

## Routes

**Public:** `/calendar`; `GET /api/public/calendar`
(`from/to/limit/type/featured/home/contact`), `GET /api/public/calendar/upcoming`
(`limit/home/contact`), `GET /api/public/calendar/ics`.

**Admin:** `/admin/calendar` (UI); CRUD + batch via existing
`/api/admin/resources/calendarEvents` (committee-auth `requireSession`, roles
admin/president/secretary/committee; server-side validation).

## Caching / freshness safeguards

- `/calendar` page and all three public APIs: `dynamic='force-dynamic'`,
  `revalidate=0`, `fetchCache='force-no-store'`, plus explicit
  `Cache-Control: no-store...` headers on API responses.
- No fallback calendar content exists anywhere: on query failure the page
  shows an explicit "temporarily unavailable" panel and previews hide.
- Admin writes revalidate `/`, `/calendar`, `/contact` (belt-and-braces).

## Validation commands and results (2026-07-08)

| Command | Result |
| --- | --- |
| `npm run lint` | ✔ No ESLint warnings or errors |
| `npx tsc --noEmit` | Pass (no output) |
| `npm run build` | Pass — `/calendar` ƒ dynamic, 189 kB first load |
| `npm run test:calendar` | 27/27 PASS |
| `npm run smoke:content` | 10/10 PASS (incl. `/calendar`) |
| Local `npm start` probe | `/calendar` 200 (clean unavailable state without env), `/` 200, `/contact` 200, `/events` 200, `/admin/calendar` 307 → login, ICS route responds |

`npm run smoke` (route reachability) requires a running deployed server; in the
sandbox without Supabase env only the source-mode checks apply.

## Manual smoke checklist (post-deploy)

1. `/calendar` loads; month/week/list toggles, filters, search, Today work.
2. Log in to `/admin/calendar`; create a draft entry — confirm it does NOT
   appear publicly.
3. Publish it — appears on `/calendar`; with *Show on home* it appears in the
   home "What's On at the Club" section; with *Show on contact* on `/contact`.
4. Untick *Show on home* → disappears from home only.
5. Mark cancelled → shows greyed/struck-through on `/calendar`.
6. Archive → disappears from all public surfaces.
7. Download `/api/public/calendar/ics` and import into Google Calendar; check
   Melbourne times are correct.
8. Confirm `/events`, event detail pages, and registrations still work.
9. Mobile: `/calendar` defaults to list view; keyboard-tab through the
   calendar and modal.

## Remaining risks

- FullCalendar adds ~100 kB to the `/calendar` and `/admin/calendar` bundles
  only (code-split); no other page is affected.
- Recurring events: schema columns exist but no UI/expansion logic — entering
  an RRULE manually has no effect (by design this pass).
- The anon RLS policy is defensive only; as with all other tables, real
  enforcement is the app layer + service-role pattern.
- `page_link_cards` nav seeding places Calendar at sort 16 — it will appear in
  the header "More" dropdown (primary nav shows the first 7 links).

## Rollback path

1. `git revert <merge commit>` — removes all UI/API/nav code. The site returns
   to its previous state (verified additive-only).
2. The `calendar_events` table can be left in place unused (safe, invisible).
   Only if a hard rollback is required and the table has no valued data:
   `DROP TABLE calendar_events; DROP FUNCTION set_calendar_events_updated_at();`
   and delete the two seeded `page_link_cards` rows
   (`DELETE FROM page_link_cards WHERE href='/calendar';`).
3. The existing Events CMS is untouched by both directions.
