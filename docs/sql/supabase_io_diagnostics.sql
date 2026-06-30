-- Lightweight Supabase IO diagnostics for manual use only.
-- Do not run while SELECT now() is timing out or while Disk IO is depleted.
-- Do not run this file from application code, build steps, tests or migrations.

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
  temp_blks_read,
  temp_blks_written,
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
  temp_blks_read,
  temp_blks_written,
  left(regexp_replace(query, '\s+', ' ', 'g'), 800) as query_preview
from pg_stat_statements
where calls > 0
order by shared_blks_written desc
limit 25;

-- Top statements by combined shared read/write blocks.
select
  calls,
  mean_exec_time,
  total_exec_time,
  rows,
  shared_blks_read,
  shared_blks_written,
  (shared_blks_read + shared_blks_written) as shared_io_blocks,
  left(regexp_replace(query, '\s+', ' ', 'g'), 800) as query_preview
from pg_stat_statements
where calls > 0
order by shared_io_blocks desc
limit 25;

-- Top statements by temporary read/write blocks.
select
  calls,
  mean_exec_time,
  total_exec_time,
  rows,
  temp_blks_read,
  temp_blks_written,
  (temp_blks_read + temp_blks_written) as temp_io_blocks,
  left(regexp_replace(query, '\s+', ' ', 'g'), 800) as query_preview
from pg_stat_statements
where calls > 0
order by temp_io_blocks desc
limit 25;

-- Reset instructions, intentionally commented out.
-- Do not run during an incident unless you have intentionally captured a baseline first.
-- select pg_stat_statements_reset();
