# Architecture Migration Plan Rev01

## 1. Current architecture

- **Application:** Next.js 14 App Router with TypeScript and Tailwind CSS.
- **Hosting/deployment:** Vercel, with existing deployment assumptions preserved.
- **Database/CMS:** Supabase Postgres stores public content, admin-managed resources, fantasy data, orders, payments, registrations, and committee/admin records.
- **Admin:** Existing custom committee admin routes under `/admin` and resource APIs under `/api/admin`.
- **Media:** GitHub-backed CMS media upload commits files under `public/images` and depends on a Vercel deploy hook for live publication.
- **Payments/orders:** Existing Stripe/payment-link and bank-transfer order handling remains in place.
- **Fantasy:** Existing Supabase Auth manager login plus fantasy manager, scoring, import, squad, transfers, and leaderboard features remain in place.
- **Public content:** Public pages and listing/detail APIs read existing Supabase tables and fallback/seed content.
- **Email:** App transactional emails use the Resend API helper where configured. Supabase Auth confirmation and reset emails are Supabase Auth SMTP concerns, not normal app route emails.

## 2. Proposed architecture

The requested target architecture should be delivered as a staged programme, not one large PR.

- Keep Next.js App Router as the web framework unless a later discovery phase proves otherwise.
- Add Sanity as the future editorial CMS after schema mapping, import tooling, preview, and route parity are proven.
- Add Cloudinary as the future media store after upload, delivery, transformations, fallback, and rollback paths are proven.
- Keep Resend API for app transactional emails and configure Supabase Auth production email through Supabase custom SMTP using Resend SMTP credentials.
- Add dark mode and modern UI animation incrementally after content/platform parity is stable.
- Evaluate Netlify and Cloudflare Pages separately from the CMS/media migration.

**Explicit constraint:** Do not migrate everything in one PR.

## 3. What changes if moving from Vercel to Netlify or Cloudflare Pages

### Netlify

- Netlify supports modern Next.js App Router, ISR, Route Handlers, Server Actions, and image optimisation through its Next.js support.
- Environment variables must be recreated in Netlify, including Supabase, Stripe, Resend, GitHub media, deploy-hook, and bank-transfer settings.
- Vercel deploy hooks used by GitHub media uploads would need replacement with Netlify build hooks.
- Any Vercel-specific assumptions, redirects, headers, image optimisation behaviour, and cron/runtime configuration must be audited.
- Preview deployments must be tested against admin auth, CMS writes, media uploads, public revalidation, Stripe webhook handling, and fantasy flows.

### Cloudflare Pages

- Runtime compatibility must be validated carefully for Next.js App Router features, Node APIs, Route Handlers, image optimisation, Stripe webhooks, Supabase SSR, and any file or crypto assumptions.
- Environment variables, secrets, webhook endpoints, and deploy hooks must be recreated.
- If using Cloudflare-specific adapters, confirm compatibility before production cutover.
- Media upload publication must replace Vercel deploy hooks with Cloudflare-compatible deployment triggers.

**Explicit constraint:** Do not change hosting until feature parity is proven.

## 4. What changes if moving from Supabase CMS to Sanity

- Define Sanity schemas for public pages, news, events, sponsors, gallery, teams, kitchen, apparel, history, minutes metadata, and reusable content blocks.
- Build an export/import pipeline from Supabase CMS tables into Sanity documents.
- Preserve stable IDs/slugs or create deterministic mappings so existing public routes keep working.
- Add Sanity read clients to public pages only after parity tests pass.
- Add Sanity write/editor workflows without removing the existing admin until editors can complete the same tasks.
- Use Sanity Presentation Tool for live preview and click-to-edit functionality after schemas and preview routing are proven.
- Keep Supabase for auth, fantasy, payment/order, registrations, and operational data unless a separate project migrates those domains.

**Explicit constraints:**

- Do not remove existing Supabase CMS until Sanity import and preview are verified.
- Do not change payment, fantasy, or PlayHQ code during CMS migration.

## 5. What changes if moving from GitHub media uploads to Cloudinary

- Add Cloudinary credentials as server-only environment variables.
- Build upload endpoints that preserve the existing admin image-field UX before replacing current uploads.
- Define folder naming, public ID strategy, overwrite policy, allowed file types, max size, alt-text requirements, and transformation presets.
- Map existing `/images/...` GitHub-hosted assets to Cloudinary only after inventory and fallback rules are documented.
- Keep existing public image URLs valid during migration.
- Add fallbacks so public pages can render existing GitHub media if Cloudinary delivery fails or if an item has not migrated yet.

**Explicit constraint:** Do not remove GitHub media uploads until Cloudinary upload, delivery, and fallback are verified.

## 6. Email model

### Resend API for app transactional emails

- Use the app `sendEmail` helper for contact/enquiry/order/event/member/kitchen/fantasy manager transactional notifications where applicable.
- `RESEND_API_KEY` must be optional for local/dev and must not block user-facing form submissions when absent.
- Email send failures must be logged and must not roll back successful database writes.
- `RESEND_FROM` must remain configurable.
- Do not claim production email delivery is live until a real send is tested from the target environment.

### Supabase custom SMTP through Resend for Auth confirmation/reset emails

- Fantasy registration confirmation, confirmation resend, login-related Auth messaging, and password reset email are Supabase Auth emails.
- Production Supabase Auth should use custom SMTP.
- Resend supports Supabase SMTP credentials, which should be configured in the Supabase Dashboard Auth SMTP settings.
- These Auth emails do not go through the app's normal Resend API helper.

## 7. Dark mode and animation implementation plan

1. Audit current Tailwind colour usage and identify hard-coded light-mode colours.
2. Introduce design tokens for maroon, gold, neutral backgrounds, text, border, and focus states.
3. Add dark-mode strategy using Tailwind class mode or a small theme provider.
4. Update shared UI primitives first: buttons, cards, inputs, badges, tables, modals, nav, and footer.
5. Update public pages incrementally without changing content.
6. Add animation primitives only where they do not affect accessibility or content stability.
7. Respect reduced-motion preferences.
8. Avoid adding Framer Motion or broad animation dependencies until bundle, accessibility, and page-level rollout are reviewed.

## 8. Data migration plan

### Public pages

- Inventory all content blocks and static copy.
- Map each editable section to Sanity document types.
- Keep current routes and page headings stable.
- Compare rendered HTML before and after migration.

### News

- Export title, content, author, image URL, published status, published date, created date, and sort order.
- Preserve article detail route compatibility.
- Keep image fields editable and allow blank image URLs.
- Test listing and detail revalidation.

### Events

- Export title, description, date, location, capacity, ticket price, Stripe link, image URL, and published status.
- Do not change event registration or payment behaviour in the CMS migration.
- Verify event listing and detail routes.

### Sponsors

- Export sponsor name, tier, logo URL, website, placement type, active status, and ordering.
- Do not invent sponsor benefits or change sponsor copy.
- Validate logos, links, and homepage/listing placements.

### Gallery

- Export title, caption, image URL, alt text, sort order, download permission, and published status.
- Validate image delivery and alt text before switching sources.

### Teams

- Export names, grades, descriptions, captains, PlayHQ URLs, image URLs, ordering, and active status.
- Do not change PlayHQ links during CMS migration.

### Kitchen

- Export menus, items, descriptions, prices, images, availability, hidden state, and order.
- Do not change kitchen order behaviour or payment status handling.

### Apparel

- Export products, descriptions, prices, sizes, images, customisation, categories, ordering guidance, and order windows.
- Do not change apparel order/payment behaviour during CMS migration.

### History

- Export history lineage, competitions, premierships, and related content blocks.
- Preserve public history wording and ordering.

### Minutes

- Keep operational minutes access and admin controls in Supabase unless a separate secure-document migration is planned.
- If Sanity is used for minutes metadata later, preserve access control and file delivery behaviour.

### Fantasy

- Keep fantasy data in Supabase.
- Do not migrate fantasy managers, squads, scoring rules, imports, leaderboards, transfers, or Auth to Sanity.
- Do not change fantasy routes during CMS migration.

### Payments/orders

- Keep orders, payment reconciliation, Stripe webhook handling, bank-transfer references, and admin order processing in Supabase.
- Do not migrate payments/orders to Sanity.
- Do not change payment behaviour during CMS migration.

## 9. Route parity checklist

- `/`
- `/about`
- `/teams`
- `/facilities`
- `/fixtures`
- `/events`
- `/events/[id]`
- `/news`
- `/news/[id]`
- `/merchandise`
- `/sponsors`
- `/gallery`
- `/volunteer`
- `/contact`
- `/committee/minutes`
- `/committee/minutes/[id]`
- `/fantasy`
- `/fantasy/register`
- `/fantasy/login`
- `/fantasy/account`
- `/fantasy/squad`
- `/fantasy/team`
- `/fantasy/transfers`
- `/fantasy/leagues`
- `/fantasy/leaderboard`
- `/fantasy/manager-leaderboard`
- `/fantasy/rules`
- `/admin/login`
- `/admin`
- All existing `/admin/...` screens
- All existing `/api/...` routes

## 10. Admin parity checklist

- Admin login/logout/session/change password.
- Dashboard counts and links.
- News CRUD including image upload, image clearing, published state, and detail-route refresh.
- Events CRUD and public event listing/detail refresh.
- Gallery CRUD and image fields.
- Sponsors CRUD and logo fields.
- Teams CRUD and PlayHQ fields.
- Content blocks and club settings.
- Facilities, page cards, history, committee, season appointments.
- Kitchen menus/items/orders.
- Apparel products/windows/orders.
- Memberships and payment reconciliation.
- Volunteers and enquiries.
- Meeting minutes access/actions.
- Fantasy import, settings, players, rounds, scoring, and saved scores.
- User management and role permissions.

## 11. Risks

- Loss of public route parity during a combined hosting/CMS/media migration.
- Broken admin workflows if Sanity editing replaces current screens too early.
- Broken image delivery if Cloudinary migration removes existing `/images/...` paths too early.
- Payment/order regressions if CMS work touches operational tables.
- Fantasy Auth regressions if Supabase Auth SMTP is confused with app transactional email.
- Revalidation regressions if `revalidatePath` is called outside server environments.
- Editor confusion if both Supabase CMS and Sanity write the same content without source-of-truth rules.
- SEO and social-share regressions if detail URLs or metadata change.

## 12. Rollback plan

- Keep each migration PR small and reversible.
- For normal merged PR rollback, use:

```bash
git revert <merge_commit_sha>
```

- For hosting experiments, keep Vercel production as the active deployment until the new host passes parity checks.
- For Sanity rollout, keep Supabase CMS reads available behind a feature flag until Sanity import, preview, and publishing are verified.
- For Cloudinary rollout, keep existing GitHub media URLs valid and fall back to `/images/...` paths until all public pages have verified Cloudinary delivery.
- For email changes, revert environment-variable changes and leave form submissions non-blocking.

## 13. Recommended PR sequence

1. Current-site audit and safe fixes only.
2. Environment/docs alignment for Resend API and Supabase Auth SMTP.
3. Revalidation hardening for existing admin resource saves.
4. Route/content/admin parity inventory with screenshots and fixtures.
5. Sanity schema prototype in isolation, no production read switch.
6. Supabase-to-Sanity export/import dry run.
7. Sanity preview and Presentation Tool proof of concept.
8. Cloudinary upload proof of concept behind a feature flag.
9. Public image fallback and migration tooling.
10. Dark-mode design tokens and shared UI primitive rollout.
11. Animation primitives with reduced-motion support.
12. Netlify or Cloudflare Pages deployment proof of concept.
13. Full parity test pass on the proposed host.
14. Controlled production cutover only after rollback is tested.

**Final constraints for the programme:**

- Do not migrate everything in one PR.
- Do not change hosting until feature parity is proven.
- Do not remove existing Supabase CMS until Sanity import and preview are verified.
- Do not remove GitHub media uploads until Cloudinary upload, delivery, and fallback are verified.
- Do not change payment, fantasy, or PlayHQ code during CMS migration.
