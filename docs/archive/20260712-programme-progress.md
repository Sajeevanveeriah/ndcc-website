# NDCC staged implementation progress

Date: 2026-07-12
Branch: work

## Milestone A: Historical-stat reconciliation and operational PlayHQ sync

Implemented locally in additive, review-only form.

### Added

- Additive Supabase migration `20260712090000_fantasy_historical_reconciliation.sql`.
- Review tables for reconciliation runs, rows and audit events.
- RLS enabled with no public access policies.
- Deterministic TypeScript reconciliation rules for:
  - exact PlayHQ player ID match;
  - no name-only automatic approval;
  - ambiguous fixture quarantine;
  - ambiguous player quarantine;
  - conflicting statistics quarantine;
  - missing source-data classification;
  - provenance hash generation;
  - migration preview and rollback SQL generation.
- Admin API endpoints for:
  - creating read-only reconciliation runs;
  - listing runs;
  - exporting CSV reports;
  - loading review rows;
  - approving only deterministic exact matches;
  - rejecting or deferring rows.
- Admin UI at `/admin/fantasy/reconciliation`.
- Fantasy admin landing link.
- Test script `npm run test:fantasy-reconciliation`.

### Safety

- No production data mutation.
- No automatic reassignment of Legacy / Unverified rows.
- No historical manager leaderboard fabrication.
- Bulk approval is restricted to deterministic `exact_match` rows only and still only prepares a proposal.

### Validation run

- `npm run test:fantasy-reconciliation`: pass.
- `npm run test:fantasy-seasons`: pass.
- `npm run lint`: pass.

### Rollback

- Revert the Milestone A commit.
- If the migration was applied in a non-production environment, run the rollback block in the migration header to drop the three reconciliation tables and two enum types.

## Next implementation action

Milestone B: add additive `club_seasons` model, relationships, RLS, indexes and transition plan.

## Milestone B: Club-wide season model

Implemented locally as an additive source-of-truth model separate from Fantasy seasons.

### Added

- Additive migration `20260712100000_club_seasons.sql`.
- `club_seasons` with exactly-one-current partial unique index, status, registration status, PlayHQ season ID, clone source, scheduled activation and audit fields.
- Season-scoped transition structures for teams, PlayHQ grade mappings, PlayHQ team mappings, training schedules, registration settings, notices, Fantasy linkage, sponsor periods and merchandise windows.
- Nullable transitional `club_season_id` columns on existing CMS tables so current runtime behaviour remains compatible.
- Non-destructive backfill into current and completed seasons.
- RLS policies: public read only for safe public season content; mapping/linkage tables remain server-only during transition.
- Typed data-access helpers and an admin API for listing/creating club seasons.
- Static schema test `npm run test:club-seasons`.

### Validation run

- `npm run test:club-seasons`: pass.
- `npm run lint`: pass.

### Rollback

- Revert the Milestone B commit.
- If the migration was applied in a non-production environment, run the rollback block in the migration header. Existing old columns and data remain intact.

## Next implementation action

Milestone C: create the Start New Season wizard using `club_seasons` and a draft wizard state API.

## Milestone C: Start New Season wizard

Implemented locally with persistent wizard state and atomic activation support.

### Added

- Additive migration `20260712110000_club_season_wizard.sql`.
- `club_season_wizard_states` for resumable draft wizard state with idempotency key.
- `club_season_activation_audit` and `activate_club_season` function for atomic activation and rollback evidence.
- Wizard rules and preview helpers in `lib/club-season-wizard.ts`.
- Admin API `/api/admin/club-seasons/wizard` for loading, saving idempotent drafts and activating a prepared season.
- Committee-facing wizard UI at `/admin/season/new` with 11 steps, copy-section controls, inherited-content review warnings and resumable drafts.
- Test script `npm run test:club-season-wizard`.

### Validation run

- `npm run test:club-season-wizard`: pass.
- `npm run lint`: pass.

### Rollback

- Revert the Milestone C commit.
- If the migration was applied in a non-production environment, run the rollback block in the migration header.

## Next implementation action

Milestone D: replace the flat admin navigation with grouped task areas while preserving existing URLs.

## Milestone D: CMS redesign

Implemented locally while preserving existing admin URLs.

### Added

- Grouped admin navigation: Home, Season, Publish, Club, Community, Commercial, Fantasy and Administration.
- CMS search inside admin navigation.
- Role-specific module visibility for `fantasy_manager` and admin-only Users.
- Current-season dashboard card using `club_seasons`.
- Attention items for drafts, Fantasy imports and PlayHQ health.
- Quick action for Start New Season.
- Static test `npm run test:cms-navigation`.

### Validation run

- `npm run test:cms-navigation`: pass.
- `npm run lint`: pass.

### Rollback

- Revert the Milestone D commit. No database rollback is required.

## Next implementation action

Milestone E: add hard-coded seasonal content regression guard and neutralise prohibited source fallbacks without deleting unverified CMS transitions.

## Milestone E: Remove mutable hard-coded seasonal content

Implemented locally for the highest-risk source fallbacks.

### Added

- Neutralised operational arrays in `lib/constants.ts`: committee, teams, products, seed news, seed sponsors, seed events and season appointments are now empty CMS-backed fallbacks.
- Neutralised dated current-season fallback content in `lib/fallback-content.ts`.
- Removed hard-coded fixture team links, current appointment people and dated achievement gallery fallbacks from source fallbacks.
- Added regression guard `npm run test:no-hardcoded-seasonal-content`.

### Safety

- No production CMS records were removed.
- Structural constants, public routes, enquiry enums and sponsor tier enums remain in code.
- The site now degrades to neutral unavailable states instead of showing stale people, prices, grades or dates as current.

### Validation run

- `npm run test:no-hardcoded-seasonal-content`: pass.
- `npm run lint`: pass.

### Rollback

- Revert the Milestone E commit. No database rollback is required.

## Next implementation action

Milestone F: update public navigation grouping and homepage hierarchy with responsive/accessibility improvements.

## Milestone F: Public visual and functional improvements

Implemented locally for navigation grouping and homepage appointment hierarchy.

### Added

- Grouped public navigation: Home, Cricket, Club, Get Involved, Community, Shop and Contact.
- Route-preserving grouping that reuses CMS-provided labels/links where available.
- Grouped mobile navigation with larger touch targets and semantic section labels.
- Featured appointments capped to four on the homepage with a View all action.
- Neutral appointment heading, removing hard-coded season labels.
- Static test `npm run test:public-visuals`.

### Validation run

- `npm run test:public-visuals`: pass.
- `npm run test:no-hardcoded-seasonal-content`: pass.
- `npm run lint`: pass.
- Local route smoke with `npm run dev`: `/` returned HTTP 200 and `/admin/login` returned HTTP 200.

### Screenshot status

- Screenshot capture was attempted but Chromium is not installed in this environment. No screenshots were produced. Manual preview screenshots remain required before production deployment.

### Rollback

- Revert the Milestone F commit. No database rollback is required.

## Next implementation action

Milestone G: dependency remediation, starting with the smallest safe Nodemailer update and non-breaking transitive fixes only.

## Milestone G: Dependency remediation

Implemented local safe dependency remediation.

### Added

- Updated `nodemailer` to 9.0.3, clearing the direct Nodemailer advisory range.
- Added targeted npm override for transitive `ws` to 8.21.0, clearing the Supabase realtime `ws` advisory without forcing a Supabase upgrade.

### Remaining advisories

- Production audit now reports 2 advisories: `next` high and transitive `postcss` moderate via `next`.
- Full audit now reports 9 advisories: 3 moderate and 6 high.
- The remaining available npm fix is `next@16.2.10` and `eslint-config-next@16.2.10`, both semver-major. This requires a separate staged framework upgrade review.

### Validation run

- `npm run test:email`: pass dry-run; no email sent.
- `npm run lint`: pass.
- `npm run test:playhq-config`: pass.
- `npm run test:fantasy-reconciliation`: pass.
- `npm run test:club-seasons`: pass.
- `npm run test:club-season-wizard`: pass.
- `npm run test:cms-navigation`: pass.
- `npm run test:no-hardcoded-seasonal-content`: pass.
- `npm run test:public-visuals`: pass.
- `npm run build`: pass.
- `npm audit --json`: exits 1 with 9 advisories.
- `npm audit --omit=dev --json`: exits 1 with 2 production advisories.

### Rollback

- Revert the Milestone G commit to restore the previous dependency versions and lockfile. No database rollback is required.

## Next implementation action

Final validation and one final GitHub push attempt.
