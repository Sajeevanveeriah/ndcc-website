# June 16 CMS Restore Missing Evidence Rev00

## Missing archive evidence

`NDCC_Website_16062026.zip` and an extracted June 16 CMS export were not present in the working tree inspection. The evidence file therefore only includes records traceable to repository SQL migrations or seed data and marks sponsor logos for manual review where no logo path exists in evidence.

## Sections not reconstructed from June 16 export evidence

- `committee_members`
- `teams`
- `facility_features`
- `news`
- `events`
- `gallery_images`
- `volunteer_positions`

## Manual review required

- Sponsor `logo_url` values were not reconstructed because the available repository seed records do not include logo paths.
- Production restore should only be applied after comparing this evidence file against a real June 16 Supabase export/archive, if available outside this repository.
