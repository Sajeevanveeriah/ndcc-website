# Complete All Backup Content Recovery Rev00

## Root cause

Production public rendering trusted partial Supabase/CMS responses too eagerly. Several public helpers returned database rows directly when Supabase was configured, so sparse or incomplete CMS rows replaced richer June 16 fallback evidence instead of merging with it.

## Why production content disappeared

The public pages already had fallback data, but client/API paths could overwrite that fallback with an empty API result. The recovery keeps the fallback state on client pages and only replaces it when an API returns a valid non-empty array. Public API routes now return fallback content for news, events, gallery, sponsors, and memberships when Supabase is unavailable, errors, or returns no public rows.

## Why only two signings showed

The homepage season appointments query previously returned the Supabase result directly when Supabase was configured. If production Supabase only contained Craig Hillgrove and Kelsey Allan, the seven other evidenced June 16 signing cards were omitted. The homepage now merges Supabase rows with the nine June 16 fallback appointments by normalised name, so valid CMS records still win and missing appointments are filled from fallback.

## Footer acknowledgement image restoration

The fallback footer acknowledgement keeps the existing acknowledgement text and now uses `/images/Connection_Bri_Hayes_Rev1.jpg` as the fallback image. CMS `footer.acknowledgement.image_url` still wins when it is non-empty; an empty or null CMS image no longer wipes the fallback image.

## Sponsor logo mappings

The fallback sponsor logo recovery preserves these mappings:

| Sponsor | Fallback logo |
| --- | --- |
| APCO | `/images/2026/06/apco-1781148625016.png` |
| Bennett | `/images/2026/06/bennett-1781148645814.webp` |
| Blackman's Brewery | `/images/2026/06/blackmans-1781148663993.webp` |
| Champion Trophies | `/images/2026/06/champion_trophy-1781148687999.jpg` |
| GP | `/images/2026/06/gp-1781148742506.png` |
| Mahoney | `/images/2026/06/mahoney-1781148805224.png` |
| Phoenix Truck Bodies | `/images/2026/06/phoenix-1781148703539.jpg` |

Supabase sponsors remain authoritative for valid fields, but blank logo URLs are filled from the fallback mapping and missing fallback sponsors are appended.

## Content-block merge rules

For requested content block keys, public rendering now merges field by field:

- Valid non-empty CMS `title`, `body`, `image_url`, `cta_label`, and `cta_url` win.
- Empty strings and null CMS values do not erase fallback values.
- If no CMS row exists but a fallback block exists, the fallback block is returned.
- If neither CMS nor fallback has a block for a key, no block is returned.

## Build output

`npm run build` completed successfully. Static generation reached `Generating static pages (66/66)`, including `/_not-found`, without increasing `staticPageGenerationTimeout`, making the whole app force-dynamic, or adding unbounded Supabase calls to root layout/footer/homepage/not-found.

## Smoke test output

`SMOKE_BASE_URL=http://localhost:3000 npm run smoke:content` passed all 10 checks:

- `/` home core content
- `/` season appointments recovery
- `/about`
- `/fixtures`
- `/sponsors`
- `/news`
- `/events`
- `/gallery`
- `/join`
- `/contact`

API smoke checks returned fallback-capable JSON for:

- `/api/public/sponsors`
- `/api/public/news`
- `/api/public/events`
- `/api/gallery`
- `/api/memberships`

## Production verification checklist

After deployment, verify:

1. `/` shows all nine 2026/27 season appointment cards or at least the named June 16 recovery set.
2. `/` sponsor carousel remains logo-only and includes recovered June 16 logo assets.
3. Footer acknowledgement contains `Wadawurrung` and uses `/images/Connection_Bri_Hayes_Rev1.jpg` unless CMS provides another valid image.
4. `/sponsors` includes Champion Trophies, Phoenix Truck Bodies, and Blackman's Brewery with logos where available.
5. `/news`, `/events`, and `/gallery` retain backup content if Supabase is sparse.
6. `/join` displays Social Membership at `$50.00` when Supabase membership rows are unavailable or empty.
7. Admin membership pricing controls still load and can edit social membership plans/add-ons.
8. Vercel build shows all static pages generated and does not hang at `Generating static pages (0/66)`.

## Rollback path

Revert the commit `fix: complete backup content recovery and stable rendering` to restore the previous fallback, merge, API, smoke test, and documentation behaviour. No Supabase data was reset, truncated, deleted, seeded, or deactivated by this change.

## Email and fantasy confirmation

Email/contact files and fantasy/PlayHQ files were not changed in this recovery. Existing email, admin auth, CMS, media upload, payment/order, and future fantasy behaviours were preserved by limiting the patch to public fallback and rendering paths.

## Remaining Supabase-only CMS data

This PR restores evidenced public backup content in code fallbacks. Any Supabase-only CMS edits that were never present in the supplied backup evidence still require database backup/PITR or manual CMS re-entry.
