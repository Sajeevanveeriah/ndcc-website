# AGENTS.md

## Purpose
Preflight guardrails for safe staged updates to the Newcomb and District Cricket Club website.

## Validation workflow
- If `package-lock.json` exists, run `npm ci` before validation.
- Run `npm run lint` and `npm run build` before claiming implementation completion.
- Report validation commands and exact results.
- Report a rollback path for every change.

## Safety constraints
- Preserve all public routes, admin routes, API routes, Supabase schema behaviour, Vercel deployment assumptions, CMS behaviour, media upload behaviour, and payment/order behaviour.
- Do not invent names, dates, prices, sponsor benefits, PlayHQ links, committee details, phone numbers, emails, URLs, or payment behaviour.
- Do not publish visible placeholders.
- Use supplied assets only.
- Keep important event details as accessible HTML text, not only inside poster images.
- Use meaningful alt text for every image.
- Optimise large images before public use.
- Prefer small, reviewable PRs.
