-- Additive release. Roll back application code independently; retain the tighter
-- publishing policies. Counters contain digests, never raw client identifiers.
CREATE TABLE public.request_rate_limits (
  key_hash text PRIMARY KEY CHECK (key_hash ~ '^[a-f0-9]{64}$'),
  requests integer NOT NULL CHECK (requests > 0),
  expires_at timestamptz NOT NULL
);
ALTER TABLE public.request_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.request_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.request_rate_limits TO service_role;
CREATE INDEX request_rate_limits_expiry_idx ON public.request_rate_limits(expires_at);

CREATE FUNCTION public.ndcc_take_rate_limit(p_key text, p_limit integer, p_window_ms integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_count integer; v_now timestamptz := clock_timestamp();
BEGIN
  IF p_key !~ '^[a-f0-9]{64}$' OR p_limit NOT BETWEEN 1 AND 1000
    OR p_window_ms NOT BETWEEN 1000 AND 86400000 THEN
    RAISE EXCEPTION 'Invalid rate limit parameters';
  END IF;
  DELETE FROM public.request_rate_limits WHERE key_hash IN (
    SELECT key_hash FROM public.request_rate_limits
    WHERE expires_at < v_now - interval '1 hour' LIMIT 100
  );
  INSERT INTO public.request_rate_limits AS bucket(key_hash, requests, expires_at)
  VALUES (p_key, 1, v_now + p_window_ms * interval '1 millisecond')
  ON CONFLICT (key_hash) DO UPDATE SET
    requests = CASE WHEN bucket.expires_at <= v_now THEN 1 ELSE LEAST(bucket.requests + 1, p_limit + 1) END,
    expires_at = CASE WHEN bucket.expires_at <= v_now THEN EXCLUDED.expires_at ELSE bucket.expires_at END
  RETURNING requests INTO v_count;
  RETURN v_count <= p_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.ndcc_take_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ndcc_take_rate_limit(text, integer, integer) TO service_role;

ALTER POLICY news_select ON public.news
  USING (published = true AND (published_at IS NULL OR published_at <= now()));
ALTER POLICY "Public can read published publications" ON public.publications
  USING (published = true AND (published_at IS NULL OR published_at <= now()));

ALTER POLICY profiles_select ON public.profiles USING (id = (SELECT auth.uid()));
ALTER POLICY fantasy_squads_owner_read ON public.fantasy_squads
  USING (manager_id IN (SELECT id FROM public.fantasy_managers WHERE auth_user_id = (SELECT auth.uid())));
ALTER POLICY fantasy_chips_owner_read ON public.fantasy_chips
  USING (manager_id IN (SELECT id FROM public.fantasy_managers WHERE auth_user_id = (SELECT auth.uid())));
ALTER POLICY fantasy_squad_players_owner_read ON public.fantasy_squad_players
  USING (squad_id IN (SELECT s.id FROM public.fantasy_squads s
    JOIN public.fantasy_managers m ON m.id = s.manager_id WHERE m.auth_user_id = (SELECT auth.uid())));
NOTIFY pgrst, 'reload schema';
