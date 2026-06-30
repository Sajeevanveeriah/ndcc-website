-- Remove known duplicate public SELECT policies where newer public_read_active_* policies exist.
-- This reduces multiple permissive policy overhead without weakening private/admin tables.
-- Do not add public policies for committee_users or committee_sessions here.

set lock_timeout = '5s';
set statement_timeout = '30s';

DROP POLICY IF EXISTS committee_members_public_read_active ON public.committee_members;
DROP POLICY IF EXISTS facility_features_public_read_active ON public.facility_features;
DROP POLICY IF EXISTS history_lineage_entries_public_read_active ON public.history_lineage_entries;
DROP POLICY IF EXISTS history_premierships_public_read_active ON public.history_premierships;
DROP POLICY IF EXISTS teams_public_read_active ON public.teams;
