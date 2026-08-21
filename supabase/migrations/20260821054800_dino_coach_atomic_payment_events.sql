-- Keep Stripe event evidence and the resulting Dino Coach eligibility state in
-- one transaction. Duplicate deliveries are idempotent and also repair any
-- partial state left by the pre-migration webhook implementation.
CREATE OR REPLACE FUNCTION apply_dino_entry_payment_event(
  target_entry_id UUID,
  target_provider_event_id TEXT,
  target_provider_event_type TEXT,
  target_provider_created_at TIMESTAMPTZ,
  target_resulting_status TEXT,
  target_checkout_session_id TEXT,
  target_payment_intent_id TEXT,
  target_evidence JSONB
) RETURNS TABLE(duplicate BOOLEAN, entry_status TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  existing_event public.fantasy_entry_payment_events%ROWTYPE;
  event_inserted BOOLEAN := FALSE;
BEGIN
  IF target_provider_event_id IS NULL OR target_provider_event_id = ''
    OR target_provider_event_type NOT IN (
      'checkout.session.completed', 'checkout.session.async_payment_succeeded',
      'checkout.session.async_payment_failed', 'checkout.session.expired',
      'charge.refunded', 'charge.dispute.created', 'charge.dispute.closed'
    )
    OR target_resulting_status NOT IN ('paid','failed','expired','refunded','disputed') THEN
    RAISE EXCEPTION 'Invalid Dino Coach payment event.' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1 FROM public.fantasy_entries WHERE id = target_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Dino Coach entry not found.' USING ERRCODE = 'no_data_found'; END IF;

  INSERT INTO public.fantasy_entry_payment_events(
    entry_id, provider_event_id, provider_event_type, provider_created_at, resulting_status, evidence
  ) VALUES (
    target_entry_id, target_provider_event_id, target_provider_event_type,
    target_provider_created_at, target_resulting_status, COALESCE(target_evidence, '{}'::JSONB)
  ) ON CONFLICT (provider_event_id) DO NOTHING
  RETURNING TRUE INTO event_inserted;

  IF NOT event_inserted THEN
    SELECT * INTO existing_event FROM public.fantasy_entry_payment_events
      WHERE provider_event_id = target_provider_event_id;
    IF existing_event.entry_id <> target_entry_id
      OR existing_event.provider_event_type <> target_provider_event_type
      OR existing_event.resulting_status <> target_resulting_status THEN
      RAISE EXCEPTION 'Conflicting duplicate Dino Coach payment event.' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  UPDATE public.fantasy_entries SET
    status = target_resulting_status,
    provider_event_id = target_provider_event_id,
    stripe_checkout_session_id = COALESCE(target_checkout_session_id, stripe_checkout_session_id),
    stripe_payment_intent_id = COALESCE(target_payment_intent_id, stripe_payment_intent_id),
    paid_at = CASE WHEN target_resulting_status = 'paid' THEN COALESCE(paid_at, target_provider_created_at) ELSE paid_at END,
    refunded_at = CASE WHEN target_resulting_status = 'refunded' THEN COALESCE(refunded_at, target_provider_created_at) ELSE refunded_at END,
    updated_at = NOW()
  WHERE id = target_entry_id;

  RETURN QUERY SELECT NOT event_inserted, target_resulting_status;
END;
$$;

REVOKE ALL ON FUNCTION apply_dino_entry_payment_event(UUID,TEXT,TEXT,TIMESTAMPTZ,TEXT,TEXT,TEXT,JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION apply_dino_entry_payment_event(UUID,TEXT,TEXT,TIMESTAMPTZ,TEXT,TEXT,TEXT,JSONB) TO service_role;
