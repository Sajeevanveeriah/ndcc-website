# NDCC_Website_Codex_Implementation_Prompts_Rev2

## How to use this with Codex

Yes. You can drop this whole file into Codex as the working brief.

Best method:
1. Attach or paste this file into Codex
2. Point Codex at the actual repo
3. Tell Codex to follow the execution order in this document
4. Make it work in small batches, not one giant rewrite
5. Commit after each batch

Do **not** just say "build everything".
Use the master prompt first, then the batch prompts in order.

## Core decision

Use this architecture:

- **GitHub**: repo and version control
- **Vercel**: hosting and preview deployments
- **Supabase Postgres**: database and storage
- **Custom app auth**: temporary replacement for broken Supabase Auth
- **Xero**: accounting and reconciliation target
- **PlayHQ**: player registrations only
- **Codex**: implementation agent

## Critical constraints

1. **Do not use hardcoded shared passwords in source code**
2. **Do not depend on broken Supabase Auth flows**
3. **Do not rebuild the whole app**
4. **Do not move player registrations into the website cart**
5. **Do not claim automatic bank payment confirmation**
6. **Do not add paid systems unless absolutely necessary**
7. **Keep GitHub + Vercel + Supabase Postgres**
8. **Use direct bank transfer as the low-cost payment workflow**
9. **Use manual confirmation and Xero export for reconciliation**
10. **Make the smallest safe production-ready changes**

## What you are building

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
- Colour update:
  - very light blue page background
  - maroon changed to `#800000`
  - white buttons can remain where appropriate

### Admin and committee features
- Proper authenticated admin and committee login
- Role-based permissions:
  - President: minutes create, read, update
  - Secretary: minutes create, read, update
  - Committee members: read minutes, accept minutes, second minutes
  - Admin: manage content, products, sponsors, kitchen, gallery, volunteer entries, membership plans, user accounts
- CMS-like content management for non-technical users
- Merch ordering windows
- Export for supplier
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
- Bank transfer checkout option:
  - generates unique payment reference
  - shows Account Name, BSB, Account Number
  - marks order as `pending_bank_transfer`
  - admin later confirms when payment appears in bank feed
- Xero-oriented export and reconciliation support:
  - export CSV
  - include order ID, payment reference, payer name, amount, category, date, payment status

## Updated auth decision

Supabase Auth is currently not working reliably.

Therefore:

- **Do not use Supabase Auth for committee/admin login right now**
- **Do not hardcode passwords**
- Build a **custom server-side auth system** using:
  - `committee_users` table
  - bcrypt password hashes
  - `committee_sessions` table
  - secure HTTP-only cookies
  - server-side login/logout/session lookup
  - role-based access checks

This is the temporary practical path.

## Auth architecture to implement

### Tables
You need these core auth tables:

- `committee_users`
- `committee_sessions`

### committee_users fields
- `id`
- `email`
- `full_name`
- `password_hash`
- `role`
- `is_active`
- `created_at`
- `updated_at`

### committee_sessions fields
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

### Auth behaviour
- login via email + password
- bcrypt compare on server
- generate secure random session token
- store only the token hash in database
- set raw token in secure HTTP-only cookie
- protect admin and committee routes
- allow password change
- allow admin create user / reset password / deactivate user

## Delivery plan

## Phase 0, decisions you lock before coding
1. Final list of social membership types and prices
2. Final T-Shirt sizes and pricing rules
3. Meal card limits and price
4. Drink card limits and price
5. Whether event tickets are included in the same cart now or later
6. Kitchen ordering scope:
   - pickup only or dine-in
   - order cutoff rules
   - item availability tracking
7. Whether gallery downloads are public or admin-controlled
8. Who receives which emails
9. Whether bank transfer is fallback only or default option
10. What exact Xero export format the treasurer wants

## Phase 1, platform stabilisation
1. Replace broken admin auth with custom server-side auth
2. Add login page if needed
3. Add logout flow
4. Add password change flow
5. Add admin user creation and password reset flow
6. Fix schema mismatches
7. Audit environment variables
8. Add CAPTCHA or bot protection on public forms
9. Add rate limiting for auth and form submissions
10. Define roles and permissions
11. Add audit fields to editable records:
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
- volunteer_positions
- volunteer_expressions
- products
- product_windows
- orders
- order_items
- bank_transfer_confirmations
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
12. Export tools
13. Admin user management

## Phase 5, checkout and accounting workflow
1. Unified cart for website-managed items only
2. Bank transfer checkout flow
3. Hosted card payment flow later if needed
4. Order confirmation page
5. Admin payment confirmation screen
6. CSV export for accounting and supplier
7. Xero-friendly reconciliation process

## Phase 6, email workflows
1. Membership received acknowledgement
2. Welcome email workflow if available
3. Volunteer EOI acknowledgement
4. Volunteer notification to NDCC
5. Optional bulk member export for Mailchimp/Brevo later

## Important architecture decisions

### 1. Do not include PlayHQ inside the internal cart
Keep it separate.

Reason:
- PlayHQ already owns that workflow
- mixing it into your own cart creates duplication and support issues

### 2. Do not hardcode passwords
Use custom DB-backed auth with bcrypt and server-side sessions.

Reason:
- shared passwords are weak
- no accountability
- harder to rotate
- easy to leak in source code
- no proper user deactivation path

### 3. Bank transfer needs explicit status flow
Use statuses like:
- `draft`
- `submitted`
- `pending_bank_transfer`
- `paid`
- `cancelled`
- `expired`
- `queued_next_window`
- `fulfilled`

### 4. Merch windows need window logic
A product window needs:
- open date
- close date
- processing cycle label
- whether late orders are queued for next cycle

### 5. Kitchen QR should be Phase 2 after basics
First get:
- menu publishing
- ordering
- payment status
- kitchen admin view

Then add QR verification later.

## Codex working method

Use Codex in **small, contained implementation batches**.

For each task:
1. Inspect current repo structure first
2. Explain how the current code works
3. Propose minimal safe changes
4. Generate migrations if schema changes are needed
5. Write code
6. Give test plan
7. Stop

Do not ask Codex to rebuild the whole website in one go.

## Master steering prompt for Codex

```text
You are working on an existing NDCC website codebase using GitHub, Vercel, and Supabase Postgres.

Critical rules:
1. Do not rewrite the whole app.
2. Make the smallest safe production-ready changes.
3. Reuse existing patterns, components, utilities, and naming conventions where possible.
4. Before changing code, inspect the current repo structure and explain the relevant files, routes, schema, session model, and admin patterns.
5. If a schema change is needed, generate the SQL migration and update the affected app code.
6. Do not use Supabase Auth for committee/admin login in this phase because the current auth flow is not working reliably.
7. Do not use hardcoded shared passwords.
8. Implement custom server-side auth backed by Supabase Postgres using bcrypt password hashes and secure HTTP-only session cookies.
9. Keep PlayHQ as an external player registration flow.
10. For website-managed purchases, support direct bank transfer as a payment option with unique payment references and admin confirmation workflow.
11. Keep GitHub + Vercel + Supabase Postgres architecture intact.
12. Preserve deployment compatibility with Vercel and environment variables.
13. Include concise assumptions and a test checklist.
14. Return: analysis of existing implementation, proposed changes, files to edit, migration SQL if needed, then code.

Current business requirements:
- Player registrations go to PlayHQ
- Social memberships are managed on-site
- Social memberships can include add-ons: T-Shirt, Meal Card, Drink Card
- Volunteer registration is expression of interest
- President and Secretary can create/read/update minutes
- Committee can view minutes and mark accept/second
- Sponsors on homepage with linked logos
- Updated footer contacts and renamed football club
- Kitchen menu is editable weekly
- Merch ordering windows and supplier export
- Gallery images should be larger and optionally downloadable
- Most site content should be editable through admin
- The admin and committee portal must work without relying on broken Supabase Auth

Start by auditing the current repo and listing the existing files and systems relevant to these requirements.
```

## Prompt 1, repo audit

```text
Audit this repository for the NDCC website.

I need you to identify:
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

Return:
- architecture summary
- route/module summary
- auth summary
- admin summary
- data model summary
- risks
- recommended implementation order
Do not write code yet.
```

## Prompt 2, custom auth replacement

```text
Supabase Auth is not working reliably in this repo, so I need a temporary replacement auth system without using Supabase Auth.

Build a custom server-side authentication system using the existing Next.js app and Supabase Postgres only.

Requirements:
1. Do not use Supabase Auth for login.
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
10. Admin can manage content, products, sponsors, kitchen, volunteers, and gallery.
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

## Prompt 4, bank transfer checkout

```text
Implement a bank transfer checkout flow for website-managed orders.

Requirements:
- Supports social memberships, merch, kitchen orders, and future event tickets
- On checkout, generate a unique human-readable payment reference for each order
- Show Account Name, BSB, and Account Number from environment variables or admin settings
- Create order with payment_status = pending_bank_transfer
- Save payment reference against the order
- Show clear payment instructions on confirmation page
- Add admin screen to mark bank transfer as confirmed
- Add fields for:
  - confirmed_by
  - confirmed_at
  - bank_reference_used
  - notes
- Add CSV export for reconciliation with Xero
- Do not claim automatic bank confirmation unless such integration already exists in the codebase
- Make this production-ready and compatible with Vercel + Supabase Postgres

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
- error states
- empty states
- accessibility basics
- deployment compatibility with Vercel
- policy coverage for the custom auth and admin data model

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
5. Prompt 4, bank transfer checkout
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

## Manual operating rules for direct bank transfer

1. Every order gets a unique payment reference
2. Customer must enter that reference in the bank transfer
3. Order remains pending until manually confirmed
4. Treasurer/admin matches bank feed against:
   - amount
   - payer name
   - payment reference
   - date
5. Admin marks payment as confirmed
6. Export records for Xero reconciliation

## What direct bank transfer can and cannot do

### Can do
- avoid payment gateway fees
- work for memberships, merch, and kitchen
- support manual reconciliation
- feed accounting via export and Xero reconciliation

### Cannot do cleanly by itself
- instant payment verification
- guaranteed auto-matching
- automatic failed-payment detection
- low-admin workload at scale

## What to give Codex before starting

- repository access
- current env vars list, without exposing secrets in chat
- current schema or migration folder
- current auth-related files
- list of current admin users and roles
- all membership and add-on pricing
- bank transfer details:
  - account name
  - BSB
  - account number
- sponsor list and URLs
- football/netball, softball, darts contact info
- merch product list and supplier export format
- kitchen workflow rules
- assets from Jack

## Quick-run prompt for lazy mode

Paste this to Codex with the repo attached:

```text
Use the attached NDCC implementation brief as the source of truth.

Follow it exactly.

Start with Prompt 1, repo audit only.

Do not write code yet.
Do not rewrite the app.
Inspect the existing repo, auth flow, admin structure, database usage, payment flow, and route structure.
Then return:
- architecture summary
- auth failure analysis
- minimal replacement strategy
- feature implementation order
- files likely to change first
```

## Final recommendation

Build the system around:
- **PlayHQ for players**
- **website-managed modules for everything else**
- **bank transfer pending-payment workflow**
- **custom DB-backed auth with bcrypt and secure cookies**
- **Xero reconciliation export**
- **small Codex implementation batches**
