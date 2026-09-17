-- Records only delivery identifiers and states; no recipients or message bodies.
-- Application rollback is independent. Retain delivery evidence.
CREATE TABLE public.email_delivery_events (
  event_id text PRIMARY KEY,
  provider_message_id text NOT NULL,
  event_type text NOT NULL CHECK(event_type IN ('email.sent','email.delivered','email.delivery_delayed','email.bounced','email.complained','email.failed','email.suppressed')),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.email_delivery_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_delivery_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.email_delivery_events TO service_role;
CREATE INDEX email_delivery_message_time_idx ON public.email_delivery_events(provider_message_id, occurred_at DESC);

-- Uses the existing encrypted Vault when an environment secret is not set.
-- Fixed secret name, service role only; no generic secret-reading endpoint.
CREATE FUNCTION public.ndcc_resend_webhook_secret() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE value text;
BEGIN
  IF to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
    EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1 LIMIT 1'
      INTO value USING 'ndcc_resend_webhook_secret';
  END IF;
  RETURN value;
END;
$$;
REVOKE ALL ON FUNCTION public.ndcc_resend_webhook_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ndcc_resend_webhook_secret() TO service_role;

CREATE FUNCTION public.ndcc_operational_health() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'observedAt', now(),
    'databaseBytes', pg_database_size(current_database()),
    'receiptQueue', (SELECT coalesce(jsonb_object_agg(status, n), '{}'::jsonb) FROM
      (SELECT status, count(*) n FROM public.receipt_delivery_jobs GROUP BY status) counts),
    'emailOutcomes', (SELECT coalesce(jsonb_object_agg(event_type, n), '{}'::jsonb) FROM
      (SELECT event_type, count(*) n FROM
        (SELECT DISTINCT ON (provider_message_id) provider_message_id, event_type
         FROM public.email_delivery_events WHERE occurred_at >= now() - interval '30 days'
         ORDER BY provider_message_id, occurred_at DESC, received_at DESC) latest GROUP BY event_type) counts),
    'lastEmailEvent', (SELECT max(received_at) FROM public.email_delivery_events),
    'expiredSessions', (SELECT count(*) FROM public.committee_sessions WHERE expires_at < now())
  );
$$;
REVOKE ALL ON FUNCTION public.ndcc_operational_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ndcc_operational_health() TO service_role;
NOTIFY pgrst, 'reload schema';
