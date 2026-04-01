# NDCC_Website_Codex_Implementation_Prompts_Rev3

## Night-run objective

Goal:
Complete the NDCC website implementation autonomously in Codex Web as far as the repository, existing environment configuration, and connected services allow.

Target outcome by morning:
- repo audited
- broken auth replaced
- schema updated
- forms protected
- memberships implemented
- payment automation implemented with minimal manual work
- committee/minutes portal implemented
- sponsor, footer, theme, merch, kitchen, CMS, gallery, and export features implemented
- production hardening completed
- all changes committed in small batches
- final summary provided with any residual blockers clearly listed

## Source of truth

This file is the source of truth for Codex execution.

## Core architecture

Keep this architecture unless the existing repo already contains a safer equivalent:

- **GitHub**: repo and version control
- **Vercel**: hosting and preview deployments
- **Supabase Postgres**: database and storage
- **Custom app auth**: temporary replacement for broken Supabase Auth
- **Xero**: accounting and reconciliation target
- **PlayHQ**: player registrations only

## Critical constraints

1. Do not rewrite the whole app
2. Do not use hardcoded shared passwords in source code
3. Do not depend on broken Supabase Auth flows
4. Do not move player registrations into the website cart
5. Do not claim guaranteed real-time bank confirmation unless the repo already supports a real bank/API integration
6. Do not add paid systems unless absolutely necessary
7. Keep GitHub + Vercel + Supabase Postgres
8. Make the smallest safe production-ready changes
9. Reuse existing patterns, components, utilities, structure, and naming where possible
10. Commit each completed batch with a clear commit message

## What must be built

### Public features
- Join the club page with:
  - Player registration via PlayHQ
  - Social membership via website form and checkout
- Social membership add-ons:
  - Club T-Shirt
  - Meal Card with usage limit
  - Drink Card with usage limit
- Volunteer expression of interest form
- Sponsors section on homepage with linked logos
- Updated footer links:
  - Newcomb Power Football & Netball Club
  - Softball club
  - Darts club
- Club history page
- Gallery with larger image view and optional download
- Apparel pages with product images
- Kitchen page with weekly menu publishing
- Theme update:
  - very light blue page background
  - maroon changed to `#800000`
  - white buttons may remain where appropriate

### Admin and committee features
- Proper authenticated admin and committee login
- Role-based permissions:
  - President: minutes create, read, update
  - Secretary: minutes create, read, update
  - Committee members: read minutes, accept minutes, second minutes
  - Admin: manage content, products, sponsors, kitchen, gallery, volunteer entries, membership plans, user accounts, and payment confirmation edge cases
- CMS-like content management for non-technical users
- Merch ordering windows
- Supplier export
- Kitchen order management
- Volunteer tracking
- Payment confirmation workflow

### Payments and accounting
- Player registrations remain external through PlayHQ
- Website-managed orders:
  - social memberships
  - merch
  - event tickets
  - kitchen meals
- Payment flow must minimise manual work

## Payment system, best practical option

### Goal
Minimise manual work while avoiding gateway fees where possible.

### Required model
1. Bank transfer is the default low-cost payment option.
2. Every order gets a unique human-readable payment reference.
3. Orders start as `pending_bank_transfer`.
4. Implement transaction ingestion support using the best available low-cost mechanism found in the repo or environment:
   - existing bank/API integration if already present
   - webhook if already supported
   - periodic polling if supported
   - transaction import table and matching engine as fallback
5. Implement automatic matching logic using:
   - payment reference, highest priority
   - exact amount
   - payer name
   - payment date window
6. If there is one unambiguous exact match:
   - automatically mark order as `paid`
7. If there are multiple possible matches:
   - mark order as `needs_review`
   - provide one-click admin confirmation
8. If there is no match:
   - keep order pending
9. Export Xero-friendly CSV for reconciliation
10. Do not claim guaranteed real-time confirmation unless a real supported integration exists in the repo and can be implemented safely

### Required order/payment statuses
- `draft`
- `submitted`
- `pending_bank_transfer`
- `paid`
- `needs_review`
- `cancelled`
- `expired`
- `queued_next_window`
- `fulfilled`

## Updated auth decision

Supabase Auth is currently not working reliably.

Therefore:
- Do not use Supabase Auth for committee/admin login in this phase
- Do not hardcode passwords
- Build a custom server-side auth system using:
  - `committee_users` table
  - bcrypt password hashes
  - `committee_sessions` table
  - secure HTTP-only cookies
  - server-side login/logout/session lookup
  - route protection
  - role-based access checks

## Auth architecture

### committee_users
Fields:
- `id`
- `email`
- `full_name`
- `password_hash`
- `role`
- `is_active`
- `created_at`
- `updated_at`

### committee_sessions
Fields:
- `id`
- `user_id`
- `session_token_hash`
- `expires_at`
- `created_at`

### Roles
- `admin`
- `president`
- `secretary`
- `committee`

### Behaviour
- login via email + password
- bcrypt compare on server
- secure random session token
- store only token hash in database
- raw token in secure HTTP-only cookie
- protect admin and committee routes
- allow password change
- allow admin create user, reset password, deactivate user

## Delivery plan

## Phase 0, decisions to infer from repo/config or leave configurable
1. Social membership types and prices
2. T-Shirt sizes and pricing rules
3. Meal card limits and price
4. Drink card limits and price
5. Event tickets now or later
6. Kitchen ordering scope
7. Gallery download policy
8. Email recipient rules
9. Bank transfer default or fallback
10. Xero export format

If any are not available in repo/config, make them admin-configurable instead of blocking implementation.

## Phase 1, platform stabilisation
1. Replace broken admin auth with custom server-side auth
2. Add login page if needed
3. Add logout flow
4. Add password change flow
5. Add admin user creation and password reset flow
6. Fix schema mismatches
7. Audit environment variables
8. Audit Vercel configuration files and deployment assumptions
9. Audit Supabase migration folder, SQL, and DB usage
10. Add CAPTCHA or bot protection on public forms if existing stack supports it
11. Add rate limiting for auth and form submissions where feasible
12. Define roles and permissions
13. Add audit fields to editable records:
   - created_by
   - updated_by
   - created_at
   - updated_at

## Phase 2, data model
Add or confirm tables for:
- committee_users
- committee_sessions
- pages
- site_settings
- sponsors
- social_membership_plans
- social_membership_addons
- member_applications
- member_addon_selections
- products
- product_windows
- orders
- order_items
- imported_transactions
- bank_transfer_confirmations
- volunteer_positions
- volunteer_expressions
- kitchen_menus
- kitchen_menu_items
- kitchen_orders
- gallery_images
- history_entries
- meeting_minutes
- meeting_minute_actions

## Phase 3, public website changes
1. Homepage sponsor section
2. Footer contact section updates
3. Club history page
4. Join page split into:
   - Player registration
   - Social membership
5. Volunteer EOI page
6. Kitchen menu page
7. Apparel page
8. Gallery enlargement/download UX
9. Theme update to light blue background and `#800000` maroon
10. Wadawurrung acknowledgement background image support

## Phase 4, admin panel and committee portal
1. Admin dashboard
2. Custom login-protected committee portal
3. Minutes management module
4. Committee portal for accept and second
5. Sponsor manager
6. Site content manager
7. Membership plan manager
8. Product/apparel manager
9. Merch window manager
10. Kitchen menu manager
11. Volunteer EOI tracker
12. Payment reconciliation / matching dashboard
13. Export tools
14. Admin user management

## Phase 5, checkout and accounting workflow
1. Unified cart for website-managed items only
2. Bank transfer checkout flow
3. Matching engine for imported or ingested transactions
4. Order confirmation page
5. Admin payment review screen for ambiguous matches only
6. CSV export for accounting and supplier
7. Xero-friendly reconciliation process

## Phase 6, email workflows
1. Membership acknowledgement
2. Welcome workflow if current repo/service supports it
3. Volunteer EOI acknowledgement
4. Volunteer notification to NDCC
5. Optional bulk member export for Mailchimp/Brevo later

## Phase 7, production hardening
1. Route protection
2. Schema consistency
3. Validation
4. Empty states
5. Error states
6. Accessibility basics
7. Deployment compatibility with Vercel
8. Config compatibility with Supabase
9. Reconciliation edge cases
10. Security pass

## Codex working method

For every batch:
1. Inspect current repo structure first
2. Explain how the current code works
3. Propose minimal safe changes
4. Generate migrations if schema changes are needed
5. Write code
6. Give concise test plan
7. Commit
8. Continue

Do not stop after the audit unless there is a genuine blocker that cannot be resolved from the repo and this brief.

## Prompt 1, repo audit

```text
Audit this repository for the NDCC website.

Identify:
1. Framework and routing structure
2. Current auth implementation
3. Current Supabase usage
4. Existing admin panel structure
5. Existing database-facing modules and tables referenced in the code
6. Existing payment-related code and flows
7. Existing gallery, sponsor, content, and testimonial modules
8. Existing form submission patterns
9. Any schema mismatches or broken assumptions visible in the code
10. Files that should be modified for the upcoming features
11. Where the current auth flow is failing or likely failing
12. Where a custom DB-backed session system should integrate with minimal disruption
13. What Vercel config or environment assumptions exist
14. What Supabase migrations, SQL helpers, RLS, or storage patterns exist

Return:
- architecture summary
- route/module summary
- auth summary
- admin summary
- data model summary
- deployment/config summary
- risks
- recommended implementation order

Do not write code yet.
```

## Prompt 2, custom auth replacement

```text
Supabase Auth is not working reliably in this repo, so build a temporary replacement auth system without using Supabase Auth for committee/admin login.

Requirements:
1. Do not use Supabase Auth for committee/admin login.
2. Do not use hardcoded shared passwords.
3. Create a committee_users table with bcrypt password hashes.
4. Create a committee_sessions table with hashed session tokens and expiry timestamps.
5. Implement login, logout, current-session lookup, route protection, and role checks.
6. Use secure HTTP-only cookies.
7. Roles required:
   - admin
   - president
   - secretary
   - committee
8. President and Secretary can create/read/update meeting minutes.
9. Committee can read minutes and record accept/second actions.
10. Admin can manage content, products, sponsors, kitchen, volunteers, gallery, and payment reconciliation.
11. Add a change-password flow.
12. Add an admin create-user / reset-password flow.
13. Keep all changes production-ready and minimal.
14. Reuse current repo structure and UI patterns.
15. Return:
   - audit of current auth-related files
   - migration SQL
   - files to add/change
   - implementation code
   - test checklist

Start by inspecting the repo and identifying the current login/session/middleware/admin structure before writing code.
```

## Prompt 3, social membership system

```text
Implement a social membership system in the existing NDCC codebase.

Requirements:
- Add a Join the Club page with two paths:
  1. Player registration via external PlayHQ link
  2. Social membership via on-site flow
- Social membership plans must support optional add-ons:
  - Club T-Shirt
  - Meal Card
  - Drink Card
- Meal Card and Drink Card must support usage limits stored in the database
- Build admin-managed membership plans and add-ons
- Store each application and selected add-ons
- Prepare the order structure so payment method can be bank transfer now and card later
- Do not touch PlayHQ beyond linking to it
- Reuse existing admin and form patterns where possible

Return:
- schema changes
- affected routes/components
- admin UI changes
- code
- test plan
```

## Prompt 4, automated payment reconciliation

```text
Implement the best practical low-cost automated payment reconciliation flow for website-managed orders.

Requirements:
- Supports social memberships, merch, kitchen orders, and future event tickets
- On checkout, generate a unique human-readable payment reference for each order
- Show Account Name, BSB, and Account Number from environment variables or admin settings
- Create order with payment_status = pending_bank_transfer
- Save payment reference against the order
- Build transaction ingestion support using the safest available mechanism already compatible with the repo:
  - existing API or webhook integration if present
  - polling-based ingestion if present
  - imported_transactions table and import/matching workflow as fallback
- Build matching logic using:
  - exact payment reference
  - exact amount
  - payer name similarity
  - payment date window
- If exactly one unambiguous match exists, auto-mark order as paid
- If multiple possible matches exist, mark as needs_review
- Add admin screen for ambiguous matches only, with one-click confirmation
- Add fields for:
  - confirmed_by
  - confirmed_at
  - bank_reference_used
  - notes
- Add CSV export for reconciliation with Xero
- Do not claim guaranteed real-time payment confirmation unless a real supported integration already exists and is safe to wire up
- Keep this production-ready and compatible with Vercel + Supabase Postgres

Return:
- schema changes
- code changes
- environment variables or settings needed
- admin workflow
- test plan
```

## Prompt 5, volunteer expression of interest

```text
Implement a volunteer expression of interest workflow.

Requirements:
- Public volunteer signup form
- Applicant can select volunteer area or position
- Form stores submission in database
- Applicant receives acknowledgement message
- If applicant is not already a member, acknowledgement should say the club will reach out
- NDCC admin/committee should be notified through the existing email mechanism if one exists
- If no outbound email mechanism exists, store the record and create an admin review queue
- Build admin view to track volunteer EOIs and statuses
- Include spam protection consistent with current stack

Return:
- schema changes
- pages/components
- admin tracker
- email or fallback workflow
- test steps
```

## Prompt 6, meeting minutes portal

```text
Implement a meeting minutes portal.

Requirements:
- President and Secretary can create, read, and update minutes
- Committee members can log in separately and:
  - view minutes
  - mark accepted
  - mark seconded
- Capture who performed each action and when
- Support list view and single minute detail view
- Support status fields such as draft, published, accepted, seconded
- Keep auditability
- Use the existing auth/session model and UI patterns where possible

Return:
- schema design
- route structure
- admin/committee screens
- code
- test checklist
```

## Prompt 7, sponsor and footer updates

```text
Implement sponsor and footer updates.

Requirements:
- Sponsors section on homepage with linked logo/image cards
- Admin-managed sponsor list
- Update footer to include:
  - Newcomb Power Football & Netball Club
  - Softball club contact/details link
  - Darts club contact/details link
- Rename any existing reference from Newcomb Power Football Club to Newcomb Power Football & Netball Club where appropriate
- Preserve existing styling patterns, then apply the new colour scheme where required

Return:
- affected files
- admin changes
- code
- test plan
```

## Prompt 8, colours and theme

```text
Update the NDCC website colour styling.

Requirements:
- Page background previously white should become a very light blue
- Replace maroon usages with #800000 where appropriate
- Buttons may remain white where that fits the existing design
- Do not perform a blind global replace
- Inspect current theme variables, CSS files, Tailwind config, component tokens, and inline styles first
- Minimise regressions and keep contrast usable
- Return a list of all changed theme/style sources before applying code changes

Return:
- style audit
- files to edit
- code changes
- visual regression checklist
```

## Prompt 9, apparel and merch windows

```text
Implement apparel product management and merch ordering windows.

Requirements:
- Apparel items have images, sizes, descriptions, price, and active status
- Admin can define order windows with open and close dates
- When a window is closed:
  - show message that no orders are currently being processed
  - optionally allow order to be queued for the next window
- Orders should be exportable in a simple supplier-friendly format
- Export should include product, size, quantity, customer details, order date, window label, and status
- Reuse the shared order model where possible
- Keep direct bank transfer payment option compatible

Return:
- schema changes
- admin UI
- public UI
- export logic
- test checklist
```

## Prompt 10, kitchen menu and orders

```text
Implement a kitchen module.

Requirements:
- Kitchen page with editable weekly menu
- Menu is usually published every Wednesday, but admin should be able to publish any time
- Chef/admin can add, update, hide, or sell out items
- Customers can order and pay through the website-managed checkout flow
- Orders should be visible in admin
- Include payment status in kitchen order views
- Design the schema so QR verification can be added later, but do not overbuild it now
- Keep the implementation simple and maintainable

Return:
- schema changes
- pages/components
- admin workflow
- order flow integration
- test plan
```

## Prompt 11, CMS-like content management

```text
Implement simple non-technical content management for NDCC.

Requirements:
- Identify pages/sections currently hardcoded
- Move editable page content into admin-managed storage where practical
- Use a simple template/content-block approach that fits the current codebase
- Support common content types:
  - headings
  - paragraphs
  - CTA buttons
  - images
  - link lists
- Avoid building a full page-builder
- Focus on maintainable admin forms for high-value editable areas first

Priority areas:
- homepage sections
- footer contact/link content
- history page
- sponsor content
- acknowledgement background image/text
- join page content
- volunteer page content

Return:
- proposed content model
- affected pages
- admin UI changes
- schema changes if needed
- implementation code
```

## Prompt 12, gallery improvements

```text
Improve the gallery module.

Requirements:
- Larger image display from the gallery grid
- Modal or dedicated viewer page
- Optional downloadable image support controlled by admin
- Preserve current gallery data where possible
- Keep image loading and performance reasonable
- Use existing storage/image patterns already in the codebase

Return:
- affected files
- admin changes if needed
- UI changes
- code
- test plan
```

## Prompt 13, Xero-friendly exports

```text
Implement Xero-friendly exports for website-managed orders.

Requirements:
- Export CSV for memberships, merch, kitchen orders, and future event tickets
- Include fields useful for reconciliation:
  - order_id
  - created_at
  - customer_name
  - customer_email
  - item_summary
  - gross_amount
  - payment_method
  - payment_status
  - payment_reference
  - category/type
  - notes
- Build this as an admin export tool
- Do not claim direct Xero API sync unless it already exists in the codebase and is safe to implement

Return:
- export format
- code changes
- admin UI
- test steps
```

## Prompt 14, forms protection

```text
Improve spam and abuse protection across all public-facing forms.

Requirements:
- Audit current form endpoints and submission handlers
- Add bot/spam protection compatible with the current stack
- Add basic rate limiting where feasible
- Protect:
  - contact forms
  - volunteer forms
  - membership forms
  - any newsletter or enquiry forms
- Keep UX reasonable

Return:
- threat/risk summary
- files/endpoints to change
- code changes
- test checklist
```

## Prompt 15, final production hardening

```text
Perform a final production hardening pass for the NDCC website after the new features are implemented.

Review:
- auth and permissions
- route protection
- schema consistency
- environment variables
- admin UX
- form validation
- image/storage handling
- export reliability
- payment status flows
- reconciliation edge cases
- error states
- empty states
- accessibility basics
- deployment compatibility with Vercel
- config compatibility with Supabase

Return:
- issues found
- fixes required
- code changes
- deployment checklist
- rollback considerations
```

## Execution order

Run these in this exact order:
1. Prompt 1, repo audit
2. Prompt 2, custom auth replacement
3. Prompt 14, forms protection
4. Prompt 3, social membership system
5. Prompt 4, automated payment reconciliation
6. Prompt 5, volunteer EOI
7. Prompt 6, meeting minutes portal
8. Prompt 7, sponsor and footer updates
9. Prompt 8, colours and theme
10. Prompt 9, apparel and merch windows
11. Prompt 10, kitchen menu and orders
12. Prompt 11, CMS-like content management
13. Prompt 12, gallery improvements
14. Prompt 13, Xero-friendly exports
15. Prompt 15, final production hardening

## If blocked

If blocked, report:
- blocker
- why it is blocking
- exact missing file/config/data
- smallest next step

## Output format per batch

For each batch return:
- what you found
- files changed
- schema changes
- code changes
- assumptions
- test checklist
- commit message

## Final run target

Continue through all batches without stopping after Prompt 1 unless there is a genuine blocker that cannot be resolved from the repo and this brief.
