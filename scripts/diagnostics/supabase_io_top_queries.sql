-- Supabase Disk IO incident diagnostics for NDCC Website.
-- Do not run this file if `select now();` times out or the SQL Editor cannot hold a connection.
-- These statements are read-only and set a short timeout, but pg_stat views can still add pressure
-- during an IO exhaustion event. Run only after the database is responding again.

set statement_timeout = '3s';

-- 1. Basic health. Stop here if this fails.
select now();

-- 2. Top pg_stat_statements by shared block IO.
select
  pg_catalog.pg_get_userbyid(s.userid) as role,
  s.calls,
  s.mean_exec_time,
  s.total_exec_time,
  s.rows,
  s.shared_blks_hit,
  s.shared_blks_read,
  s.shared_blks_written,
  s.temp_blks_read,
  s.temp_blks_written,
  (s.shared_blks_read + s.shared_blks_written + s.temp_blks_read + s.temp_blks_written) as total_io_blocks,
  left(regexp_replace(s.query, '\s+', ' ', 'g'), 800) as query_preview
from pg_stat_statements s
where s.calls > 0
order by total_io_blocks desc
limit 25;

-- 3. Top reads.
select
  pg_catalog.pg_get_userbyid(s.userid) as role,
  s.calls,
  s.mean_exec_time,
  s.total_exec_time,
  s.rows,
  s.shared_blks_read,
  left(regexp_replace(s.query, '\s+', ' ', 'g'), 800) as query_preview
from pg_stat_statements s
where s.calls > 0
order by shared_blks_read desc
limit 25;

-- 4. Top writes.
select
  pg_catalog.pg_get_userbyid(s.userid) as role,
  s.calls,
  s.mean_exec_time,
  s.total_exec_time,
  s.rows,
  s.shared_blks_written,
  left(regexp_replace(s.query, '\s+', ' ', 'g'), 800) as query_preview
from pg_stat_statements s
where s.calls > 0
order by shared_blks_written desc
limit 25;

-- 5. Current active queries older than 5 seconds.
select
  pid,
  usename,
  application_name,
  state,
  wait_event_type,
  wait_event,
  now() - query_start as age,
  left(regexp_replace(query, '\s+', ' ', 'g'), 800) as query_preview
from pg_stat_activity
where pid <> pg_backend_pid()
  and state <> 'idle'
  and query_start < now() - interval '5 seconds'
order by query_start asc;

-- 6. Largest user tables.
select
  schemaname,
  relname,
  n_live_tup,
  n_dead_tup,
  pg_size_pretty(pg_total_relation_size(relid)) as total_size,
  pg_total_relation_size(relid) as total_bytes
from pg_stat_user_tables
order by pg_total_relation_size(relid) desc
limit 25;

-- 7. Unused indexes. Review only, do not drop during the incident.
select
  schemaname,
  relname,
  indexrelname,
  idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size
from pg_stat_user_indexes
where idx_scan = 0
order by pg_relation_size(indexrelid) desc
limit 25;
