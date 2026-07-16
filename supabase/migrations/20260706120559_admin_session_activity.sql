-- Admin session inactivity tracking (2026-07-06)
-- Adds a sliding last-activity timestamp to committee sessions so the server can
-- expire idle sessions independently of the client-side inactivity timer.
-- Idempotent: safe to re-run.

alter table committee_sessions
  add column if not exists last_seen_at timestamptz not null default now();

create index if not exists committee_sessions_last_seen_at_idx
  on committee_sessions (last_seen_at);
