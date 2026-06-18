# Admin User Provisioning Rev00

## Purpose

This runbook provisions and recovers Newcomb and District Cricket Club admin portal users for the existing custom database-backed authentication system. It does not use Supabase Auth and does not commit or print passwords.

## Managed users

| Full name | Email | Role |
| --- | --- | --- |
| Sajeevan Veeriah | `sajeevanveeriah@gmail.com` | `admin` |
| John Elliott | `ndsc.cricket@gmail.com` | `president` |
| Troy Whitworth | `ndcc.vicepres@gmail.com` | `committee` |

## Required environment variables

Provisioning always requires:

```bash
NEXT_PUBLIC_SUPABASE_URL="..."
SUPABASE_SERVICE_ROLE_KEY="..."
```

Writing changes with `--execute` also requires temporary passwords supplied only through environment variables:

```bash
NDCC_SAJ_TEMP_PASSWORD="..."
NDCC_PRESIDENT_TEMP_PASSWORD="..."
NDCC_VP_TEMP_PASSWORD="..."
```

The script never logs these password values and never logs the service role key.

## Dry run and diagnostics

Dry run is the default and performs no writes:

```bash
npm run admin:provision-users
```

Diagnostics-only mode also performs no writes:

```bash
npm run admin:provision-users -- --diagnostics
```

Diagnostics verify that:

- `committee_users` is available.
- `ndcc_verify_committee_user` is available.
- `committee_sessions` is available.
- `ndcc_set_committee_password` is available for password hashing through the database.
- Safe status for the managed users can be read.

Safe status output includes only email, full name, role, and active status. It does not print `password_hash`.

## Execute provisioning or password recovery

Set all required environment variables in the shell, then run:

```bash
npm run admin:provision-users -- --execute
```

For each managed user, the script:

1. Looks up the user by lowercase email.
2. Creates the user if missing, without deleting or truncating any data.
3. Sets `is_active = true`.
4. Sets the configured role and full name.
5. Resets the password through the existing database password function.
6. Clears only that user's existing rows in `committee_sessions` after the password reset.

Other users and other users' sessions are not modified.

## Login verification

After provisioning, verify a login without printing cookies, tokens, or passwords:

```bash
AUTH_TEST_BASE_URL="https://example.com" \
AUTH_TEST_EMAIL="sajeevanveeriah@gmail.com" \
AUTH_TEST_PASSWORD="..." \
npm run test:admin-login
```

The test posts to `/api/admin/auth/login`, reuses the returned cookie only in memory, then checks `/api/admin/auth/session` and requires `authenticated: true`.

## Rollback path

This change is operationally reversible without destructive SQL:

1. Revert the repository commit that added the provisioning and login test scripts if the tooling itself needs to be removed.
2. If a temporary password was applied incorrectly, re-run `npm run admin:provision-users -- --execute` with corrected temporary password environment variables.
3. If a role or active status was applied incorrectly for one of the managed users, correct the role/status through the existing admin process or re-run this script with the intended configuration.
4. Because the script does not delete users, truncate tables, reset production data, or modify other users' sessions, no production data restore should be needed for normal rollback.

## Safety confirmations

- No passwords are stored in the repository.
- Passwords are accepted only through environment variables.
- Service role keys are accepted only through environment variables.
- No password hashes are printed.
- No destructive SQL is used.
- Users are not deleted.
- Tables are not truncated.
- The custom auth system, multi-device session model, contact/email functionality, and Supabase schema are not replaced.
