-- Close legacy public RPC surfaces and make least privilege the default for
-- future application objects created by the migration role.
--
-- Existing public reads are intentionally untouched. New browser-readable
-- tables and functions must receive an explicit grant and an appropriate RLS
-- policy in the same migration that creates them.

BEGIN;

-- These three dependency-free SQL wrappers are obsolete. Canonical committee
-- authentication calls extensions.crypt/extensions.gen_salt directly. Revoke
-- first so a failed restrictive DROP cannot leave browser execution enabled.
DO $$
BEGIN
  IF to_regprocedure('public.crypt(text,text)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.crypt(text, text) FROM PUBLIC, anon, authenticated';
  END IF;
  IF to_regprocedure('public.gen_salt(text)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.gen_salt(text) FROM PUBLIC, anon, authenticated';
  END IF;
  IF to_regprocedure('public.gen_salt(text,integer)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.gen_salt(text, integer) FROM PUBLIC, anon, authenticated';
  END IF;
END
$$;

DROP FUNCTION IF EXISTS public.crypt(text, text);
DROP FUNCTION IF EXISTS public.gen_salt(text);
DROP FUNCTION IF EXISTS public.gen_salt(text, integer);

-- Production bootstrap completed long ago. A later canonicalisation migration
-- accidentally recreated this service-role RPC after it had been retired.
DO $$
BEGIN
  IF to_regprocedure('public.ndcc_bootstrap_first_admin(text,text,text)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.ndcc_bootstrap_first_admin(text, text, text) FROM PUBLIC, anon, authenticated, service_role';
  END IF;
END
$$;

DROP FUNCTION IF EXISTS public.ndcc_bootstrap_first_admin(text, text, text);

-- Supabase's current postgres defaults grant every new public table, sequence
-- and function to browser roles. Replace that application-owner baseline with
-- an explicit-grant model. postgres and service_role retain full server access.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL PRIVILEGES ON SEQUENCES TO service_role;

-- PostgreSQL's built-in PUBLIC EXECUTE default for functions is global. A
-- schema-specific REVOKE cannot override that global grant, so remove PUBLIC
-- globally and separately clear any explicit browser-role grants in public.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Rollback is intentionally manual. Recreating the retired bootstrap or crypto
-- wrappers would reopen unnecessary RPC surfaces. Restore a specific grant only
-- after documenting its browser caller, RLS boundary and abuse controls.
