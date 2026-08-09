# Player registration visual verification

Browser checks ran on 9 August 2026 with Chromium against the local Next.js
application. The open-state fixture was local-only and matched the isolated
Supabase preview branch seed: three ordered PlayHQ options and six structured
terms sections. No production CMS data was changed.

## Responsive matrix

| Width | Header and layout | Registration content | Navigation and accessibility |
|---|---|---|---|
| 320 px | No horizontal overflow or clipped controls | Three labels, links and six terms present | Complete mobile menu, seasonal CTA visible, 44 px menu trigger, focus trapped and returned |
| 375 px | No horizontal overflow; mobile hierarchy remains readable | Three labels, links and six terms present | Complete mobile menu, seasonal CTA visible, keyboard focus ring visible |
| 768 px | No horizontal overflow; three cards fit the responsive grid | Each exact PlayHQ URL appears once | Complete mobile menu and seasonal CTA; zero axe WCAG A/AA violations |
| 1024 px | Dense desktop header has no overlaps; long CTA wraps cleanly | Three cards remain differentiated | Seasonal desktop CTA visible; logical tab order and focus ring verified |
| 1280 px | No clipping, overlap or overflow | Three cards and terms hierarchy remain aligned | Seasonal desktop CTA visible; zero axe WCAG A/AA violations |
| 1440 px | No clipping, overlap or overflow | Full page and terms remain readable | Seasonal desktop CTA visible; zero axe WCAG A/AA violations |

Light and dark themes were checked at 375 px and 1440 px. The page remained
readable with no automated WCAG A/AA violations in either theme. At 200 percent
zoom the heading remained visible and the document did not gain horizontal
overflow.

The open mobile menu retained every existing navigation group. Escape closed
the menu, focus returned to the trigger, and the seasonal registration CTA
remained a 48 px-high internal link. The PlayHQ buttons were at least 44 px in
both dimensions, opened a new tab and carried `rel="noopener noreferrer"`.

## Closed state

At 375 px and 1440 px, a closed registration record:

- rendered the clear "Player registration is currently closed" state;
- exposed no PlayHQ links;
- removed the seasonal CTA from desktop and mobile navigation;
- restored the existing "Join the Club" CTA;
- retained the complete mobile menu; and
- produced no horizontal overflow or automated WCAG A/AA violation.

## Defects repaired during verification

- The mobile open and close controls measured 40 px. They now have a 44 px
  minimum size.
- The small light-theme club descriptor had a measured 2.53:1 contrast ratio.
  Its colour was darkened and the targeted and full axe reruns passed.

## Destination verification

All three supplied URLs were opened in a real browser without submitting a
registration:

- `f8866f` loaded the Newcomb & District Cricket Club Senior Women's
  Summer 2026/27 registration.
- `e7483f` loaded the Newcomb & District Cricket Club Senior Men's
  Summer 2026/27 registration.
- `7c4466` loaded the Newcomb & District Cricket Club registration surface.

## Screenshots

- [Responsive breakpoint matrix](./responsive-breakpoints.jpg)
- [Themes, navigation states and 200 percent zoom](./themes-states-zoom.jpg)
- [Desktop full page](./open-desktop-full.jpg)
- [Mobile full page](./open-mobile-full.jpg)
