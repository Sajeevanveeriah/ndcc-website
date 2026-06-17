# June 16 Content Actual Restore Rev00

## Evidence source

- Primary evidence: `docs/reference/NDCC_June16_Codex_Text_Payload_Rev00.md` as supplied in the task prompt.
- The referenced file is not present in this checkout, so the implementation used the prompt payload text and existing repository assets as the evidence source.

## Changes

- Restored the full nine-record June 16 season appointment fallback set.
- Kept CMS/Supabase season appointments authoritative while merging any missing fallback appointments by normalised name when the API returns fewer than the fallback set.
- Added June 16 sponsor logo fallback assets from existing files under `public/images/2026/06/`.
- Kept CMS/Supabase sponsors authoritative while filling missing logo URLs by normalised name and merging missing fallback sponsors.
- Kept the homepage sponsor marquee logo-only.
- Kept `/sponsors` as sponsor cards/text with fallback records if CMS/API content is empty.
- Preserved footer acknowledgement text fallback from `lib/constants.ts`.

## Footer acknowledgement image

The June 16 text evidence does not prove a `footer.acknowledgement.image_url` value. No acknowledgement image was invented. If production previously had an acknowledgement image, it must be restored from Supabase backup or manually reselected in the CMS.

## Rollback path

Revert the commit `fix: restore June 16 signings sponsors and footer fallback` to restore the previous fallback, API merge, smoke script, and documentation state.
