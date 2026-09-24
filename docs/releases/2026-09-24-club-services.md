# Club services release - 24 September 2026

## Requested outcomes and acceptance

| Request | Implementation | Acceptance |
| --- | --- | --- |
| Research player prices | Search audit for all 88 selectable players; verified 2026 Freddie Norridge and 2025/26 Jodie Clark baselines | Exact reviewed SQL is exercised in a disposable database; arithmetic checked; previous prices and evidence retained |
| Season-long Dino entry | Registration open; current published prices apply to new squads; same season league | Late-entry fixture rejects old quote, accepts current quote, preserves existing purchase costs |
| Budget warning | Exact overage alert and blocked draft/submission; removal remains available | React interaction regression and existing server-side budget tests |
| Cash trailer tickets | Staff permission, explicit cash confirmation, atomic sale/tickets/outbox, stable sale key across retry/reload | Permission/input/API fixtures; SQL replay, price checks, shared card/cash sequence; isolated receipt sender and ticket renderer |
| Club database | Restricted directory of club records, social applications and Dino registrations; manual player entry; staff status review | Browser database privileges denied; confirmed account ownership enforced |
| Pot Club | Approved AUD 100 product; engraved pot and approved seasonal discount; existing checkout/receipts | Product fixture, existing authoritative membership/payment tests, public form inspection |
| Privacy | Providers, purpose, access, security, retention and contact route explained | No absolute confidentiality, AI-attack immunity or certification claim |
| Member accounts | Confirmed email login, contact profile, membership interest and club service links | Ownership/privilege tests; signed-out browser form inspection |

The directory is a private view of source records, not a claim of deduplicated people. PlayHQ records are not imported without an authorised export. An account does not itself confer paid membership, PlayHQ registration or CMS access.

## Release order

1. Require all six CI jobs, including full migration replay and security scans.
2. Apply the two reviewed additive migrations through Supabase migrations.
3. Merge the reviewed commit and confirm the production deployment uses that commit.
4. Execute `supabase/operations/20260924_player_research.sql` once, after verifying both current prices and no settled season price windows. It rejects identity or price drift. Compare existing squad/purchase-cost fingerprints before and after.
5. Verify public pages, private API denial, member table privileges, open registration, product amount, ticket function definitions and receipt queue health. Inspect the live account, Pot Club and privacy pages.

New ticket references start as soon as the ticket migration is applied. An old deployment may temporarily leave a newly issued ticket email in the durable retry queue; confirm queue health after the compatible deployment is ready. Do not manually re-enter a sale to repair email delivery.

## Staff use

- `/admin/raffle/cash`: bookmark on a phone. Enter buyer details, check the total and email, confirm cash is received, then issue tickets. On an uncertain result, retry the same sale or reload its URL. Start the next sale only after the result is confirmed.
- `/admin/memberships/directory`: search source records, add authorised player/social contact records and review club-account status. Existing social application/payment administration remains separate.
- `/club-account`: members may use an existing Dino Coach login. Accounts and committee logins have separate permissions.
- `/pot-club`: ordering uses the existing membership payment system. Engraving preference is optional; collection arrangements go through the club.

## Rollback and verification limits

Preserve club records, sold tickets, payment evidence and delivery jobs. Disable the Pot Club product or pause cash entry if those flows need repair. After new references or cash sales exist, do **not** blindly redeploy the pre-release app: retain the new/legacy ticket parser and cash receipt compatibility while reverting affected UI/API changes, or roll forward a correction. New database columns can remain in place.

A price rollback must use the retained `previous_import_state` and an audited price operation; do not rewrite existing squad purchase costs. Stop and review if season prices have subsequently settled.

Financial and private-account mutations are verified with isolated fixtures, not fake production cash, real charges or outbound test messages. Public production checks cannot prove inbox delivery or every authenticated member journey. Search coverage does not establish that every web source or every player statistic is available.
