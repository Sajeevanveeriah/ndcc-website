-- Lightweight Supabase IO diagnostics for manual use only.
-- Do not run while SELECT now() is timing out or while Disk IO is depleted.

set statement_timeout = '3s';
select now();

-- Top statements by shared block reads.
select
  calls,
  mean_exec_time,
  total_exec_time,
  rows,
  shared_blks_read,
  shared_blks_written,
  left(regexp_replace(query, '\s+', ' ', 'g'), 800) as query_preview
from pg_stat_statements
where calls > 0
order by shared_blks_read desc
limit 25;

-- Top statements by shared block writes.
select
  calls,
  mean_exec_time,
  total_exec_time,
  rows,
  shared_blks_read,
  shared_blks_written,
  left(regexp_replace(query, '\s+', ' ', 'g'), 800) as query_preview
from pg_stat_statements
where calls > 0
order by shared_blks_written desc
limit 25;
