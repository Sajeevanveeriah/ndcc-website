---
name: verify
description: Build, launch, and drive the NDCC website locally to verify changes at the browser surface.
---

# Verifying NDCC website changes

## Build and launch

```bash
npm install
npm run build
# Launch the production build. Point Supabase env at an unreachable host to
# exercise fetch-failure paths (failure cards, fallback banners); omit the
# vars entirely to exercise the "not configured" empty states instead.
NEXT_PUBLIC_SUPABASE_URL=https://unreachable-verify.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJfake.fake.fake \
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJfake.fake.fake \
PORT=3100 npm run start
```

Readiness probe: `curl -s --noproxy 127.0.0.1 http://127.0.0.1:3100/` (the
outbound proxy env breaks localhost curl without `--noproxy`).

## Drive

Playwright with the pre-installed Chromium — install `playwright-core` in a
scratch dir (NOT the repo) and launch with
`executablePath: '/opt/pw-browsers/chromium'`. Never run `playwright install`.

Flows worth driving:
- `/merchandise` — static 8-product fallback always renders; with unreachable
  Supabase the "shortened product list" banner + Try again button appear.
- `/fantasy/players`, `/fantasy/leaderboard`, `/fantasy/manager-leaderboard` —
  failure cards (unreachable env) vs "nothing published yet" empty states
  (no env).
- Route-change progress bar: `page.route()` a destination with a ~1.5s delay,
  click a navbar link, assert `div.fixed.inset-x-0.top-0 > div` mid-flight.
- Hover states: `card.hover()` then read `getComputedStyle(el).transform`
  (hover-lift is `matrix(1, 0, 0, 1, 0, -4)`).

## Gotchas

- Server-side `console.error` evidence lands in the `npm run start` log, not
  the browser console; client loader errors land in the page console.
- The smart quote in headings ("We couldn’t…") matters for text locators.
- Smoke scripts (`npm run smoke:content` etc.) do static source-string checks
  by default; set `SMOKE_BASE_URL=http://127.0.0.1:3100` to run them against
  a real server.
