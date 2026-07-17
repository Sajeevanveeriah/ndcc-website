# NDCC apparel, visibility and Fantasy PlayHQ release report

## Release identity

| Item | Value |
|---|---|
| Baseline commit | `7362ee0287f0565f7d15eb19399b0edd9c143b5a` |
| Implementation branch | `feat/2026-apparel-cinematic-revamp` |
| Production deployment | Not performed |
| Production database mutation | Not performed |
| Database migration | None |

## Binary-safe apparel delivery

The first revision added PNG, WebP and screenshot binaries directly to the commit. The target pull-request workflow rejected that patch as Binary Not Supported. This revision removes every added or modified binary from the branch diff.

The price-free package is now generated during `predev` and `prebuild` from the 15 approved PNG sources already present in the repository:

```text
approved source PNG
        |
        v
scripts/generate-apparel-assets.mjs
        |
        +--> 800 x 640 Rev01 PNG editing master (ignored build output)
        |
        +--> optimised WebP at the existing public catalogue path
```

The generator clears only the clean supplier caption area below pixel row 510. It does not reconstruct, redraw or modify garment artwork. The test reads the generated WebP pixels and requires every pixel in the removed 800 x 130 footer to be white. This gives a deterministic check that names, AUD prices, currency symbols and option surcharges cannot remain in that area.

The manifest records each generated filename, public path, dimensions, generator and source relationship. Wide Brim Hat, Baggy Cap, Cap and Bucket Hat remain without public assets and must remain hidden.

## CMS visibility

The existing `apparel_products.active` field remains the only visibility state. The CMS now uses these explicit terms:

| Previous | Current |
|---|---|
| Active | Visible on public website |
| Active badge | Visible badge |
| Archived badge | Hidden badge |
| Archive | Hide from website |
| Restore | Show on website |
| Delete | Permanently delete |

Hiding remains non-destructive. The product stays editable in the CMS, existing orders remain intact, and the public API plus server-side order catalogue continue filtering `active = true`.

## Fantasy League 2025/2026 PlayHQ diagnosis and fix

No production credentials were available, so the live PlayHQ response and production row state could not be inspected. Repository analysis found three parser gaps consistent with a historical import returning raw data but queuing no NDCC games:

1. The Fantasy sync collection extractor accepted flat arrays such as `{ data: [...] }`, but not the nested PlayHQ envelope `{ data: { items: [...] } }`.
2. Fixture competitors were read only when the name was directly on the competitor. A PlayHQ competitor shaped as `{ homeAway: "HOME", team: { name: "Newcomb & District 1st XI" } }` became `TBC`, so the NDCC filter rejected the game.
3. Season matching derived 2025/26 only from the season name, not from the PlayHQ competition name. A generic season name with `2025/26` only in `competitionName` could not link.

The normalisers now handle all three shapes. Completed fixture recognition also accepts the Australian and US PlayHQ final-status spellings `FINALISED` and `FINALIZED`. Deterministic tests cover a nested 2025/26-style fixture with nested competitor team names, a nested `data.items` collection and season years supplied by the competition name.

This is a code-path fix, not a claim that production data has already synced. After deployment, an authorised CMS user should run a read-only preview for `2025-26`, verify the proposed link, grades and queued-game count, then start or continue the import. No batch should be published until its counts match PlayHQ and review items are resolved.

## Validation and limitations

- `npm ci`, `npm run lint` and `npm run build` are required release gates.
- `npm run test:apparel-images` generates and validates all 15 price-free assets plus the four unpublished hats.
- `npm run test:playhq-normalise`, `npm run test:fantasy-seasons` and `npm run test:fantasy-orchestrator` cover the repaired historical PlayHQ shapes.
- `npm run test:apparel-catalogue` and `npm run test:payments-ledger` require a local PostgreSQL client and database.
- Live PlayHQ, Supabase, Vercel, email and payment checks require authorised environment credentials and were not performed.

## Rollback

1. Revert the implementation commits.
2. No database rollback is required because no migration or production mutation was made.
3. Removing `predev`, `prebuild`, `scripts/generate-apparel-assets.mjs` and the Sharp development dependency restores the previous asset behaviour.
4. Reverting the PlayHQ normaliser and Fantasy sync parser restores the previous response-shape handling.
