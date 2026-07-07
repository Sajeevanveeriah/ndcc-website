# Recreated sponsor logos — drop-in convention

This folder is the staging area for final, recreated sponsor logo files.
Nothing in the app reads from this folder yet by path convention; sponsor
cards render whatever path each sponsor's `logo_url` points at in Supabase
(`sponsors.logo_url`), with a branded name-text fallback card when the file
is missing or fails to load.

## Replacing a logo WITHOUT a database change

Every active sponsor's `logo_url` points at a repo-local path under
`public/`. Committing a new file at the exact same path (same filename,
same extension) replaces that sponsor's logo everywhere on the site with
no database edit and no code change. Current live paths:

- `public/images/sponsors/mbr-cricket-logo.png` (MBR Cricket — file not yet present; card shows branded name fallback until added)
- `public/images/sponsors/leopold-sportsmans-club-logo.png` (Leopold Sportsmans Club — file not yet present)
- `public/images/2026/06/apco-1781148625016.png` (APCO Newcomb)
- `public/images/2026/06/bennett-1781148645814.webp` (Bennett Racing)
- `public/images/2026/06/blackmans-1781148663993.webp` (Blackman's Brewery)
- `public/images/2026/06/champion_trophy-1781148687999.jpg` (Champion Trophies)
- `public/images/2026/06/gp-1781148742506.png` (General Public Corio)
- `public/images/2026/06/mahoney-1781148805224.png` (Mahoney Real Estate)
- `public/images/2026/06/phoenix-1781148703539.jpg` (Phoenix Truck Bodies)

(Path list is a snapshot; confirm against the `sponsors` table before
replacing. Admin > Sponsors shows each sponsor's current logo URL.)

## Adding a NEW recreated asset

Place the file here as `<kebab-case-sponsor-name>.<png|webp|svg>` (e.g.
`mbr-cricket.webp`), then point the sponsor's Logo URL at
`/images/sponsors/recreated/<filename>` via Admin > Sponsors. Prefer WebP
or PNG with transparency, roughly 2:1 landscape, under 200 KB.

Logos are letterboxed with `object-contain` inside a fixed plate
(`LogoChip`), so any aspect ratio is safe — nothing gets stretched.
