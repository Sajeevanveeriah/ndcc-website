# Supabase Disk IO incident runbook

## Incident signal
The NDCC Supabase project is unhealthy when the database, PostgREST, Auth, or Storage health checks degrade and the SQL Editor cannot complete even:

```sql
select now();
```

If that command times out, the admin login `503` is a symptom of database unavailability, not an authentication bug.

## Immediate containment
1. Stop running SQL. Do not run diagnostics while `select now();` fails.
2. Close Supabase SQL Editor, Table Editor, Advisors, Logs, and any browser tabs repeatedly refreshing database views.
3. Do not repeatedly run Supabase Advisors during IO exhaustion. Advisor and linter queries can themselves be expensive.
4. Wait 5 to 10 minutes for pressure to drop.
5. Retry only:

```sql
select now();
```

6. If it still times out, temporarily upgrade Supabase compute or IO from the Supabase dashboard. This is an account and billing action, not a code change.

## Safe diagnostics after the database responds
Only after `select now();` returns quickly, run `scripts/diagnostics/supabase_io_top_queries.sql`. The file is read-only, sets `statement_timeout = '3s'`, and must never be imported by the app, tests, build, or migrations.

Do not run:

```sql
vacuum full;
cluster;
reindex database;
select pg_stat_statements_reset();
```

## Recovery validation
Run these in order, stopping if any statement times out:

```sql
select now();
select count(*) from committee_users;
select * from ndcc_verify_committee_user('diagnostic-nonexistent@example.invalid', 'not-a-real-password');
```

The diagnostic login RPC call must use a non-existent diagnostic email only, and only after the database is stable.

## Vercel validation
Check Vercel runtime logs for `Admin login stage` entries. Match the `requestId` returned to the browser with log entries to confirm whether failures are credential RPC timeouts, session insert timeouts, or configuration failures.

## Rollback path
Revert the stabilisation PR. The added indexes are non-destructive and can safely remain. If a strict rollback is required, run the `DROP INDEX IF EXISTS` statements documented in the PR body during a healthy maintenance window.
