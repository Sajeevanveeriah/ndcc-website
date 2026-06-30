# Admin auth diagnostics Rev00

## Purpose
Use this only when `/admin/login` returns `Admin login service is temporarily unavailable` and the request reference alone is not enough to identify the failing stage.

The login API now returns a safe stage and diagnostic code for 503 responses. It does not return environment values, Supabase keys, password hashes, stack traces or raw tokens.

## Vercel environment setup
Check these server-side Vercel variables:

```text
NEXT_PUBLIC_SUPABASE_URL=<Supabase project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase anon key>
SUPABASE_SERVICE_ROLE_KEY=<Supabase service role key, server only>
ADMIN_AUTH_READINESS_ENABLED=false
ADMIN_DIAGNOSTIC_TOKEN=
DIAGNOSTIC_MUTATION_ENABLED=false
```

After changing Vercel environment variables, redeploy the site. Existing lambdas will not reliably pick up new env values until redeployed.

## Safe 503 stages
The `/api/admin/auth/login` route can return these safe values:

| Stage | Diagnostic code | Meaning |
| --- | --- | --- |
| `supabase_config` | `SUPABASE_SERVER_CONFIG_MISSING` | Vercel is missing `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY`. |
| `credential_rpc` | `CREDENTIAL_RPC_FAILED` | The auth RPC call failed or timed out. Check Supabase health and `ndcc_verify_committee_user`. |
| `session_insert` | `SESSION_INSERT_FAILED` | Credentials verified, but `committee_sessions` insert failed or timed out. |
| `unexpected` | `UNEXPECTED_LOGIN_ERROR` | Unexpected server-side failure. Use Vercel logs with the request ID. |

Invalid credentials should still return 401 and should not be treated as an outage.

## Temporary readiness route
The readiness endpoint is disabled by default and returns 404 unless all of these are true:

```text
ADMIN_AUTH_READINESS_ENABLED=true
ADMIN_DIAGNOSTIC_TOKEN=<long random temporary token>
```

Call it with:

```bash
curl -fsS -H "x-diagnostic-token: $ADMIN_DIAGNOSTIC_TOKEN" \
  https://www.ndcc.com.au/api/admin/auth/readiness
```

The route returns only booleans and safe status fields, including whether the service role key is present and shaped like a JWT. It never returns the key itself.

## Mutation check
Leave this disabled unless absolutely needed:

```text
DIAGNOSTIC_MUTATION_ENABLED=false
```

If set to `true`, the readiness route attempts to insert a synthetic session for an existing active committee user and deletes it immediately. It does not expose the synthetic token or hash.

## Disable after diagnosis
After the issue is identified:

1. Set `ADMIN_AUTH_READINESS_ENABLED=false`.
2. Clear `ADMIN_DIAGNOSTIC_TOKEN`.
3. Set `DIAGNOSTIC_MUTATION_ENABLED=false`.
4. Redeploy Vercel.

## Supabase migration note
Apply auth repair migrations only when Supabase can run:

```sql
select now();
```

If `select now();` times out, wait for Disk I/O recovery or pause/resume/upgrade compute before applying more SQL. Do not replay old migrations or insert directly into `supabase_migrations.schema_migrations`.
