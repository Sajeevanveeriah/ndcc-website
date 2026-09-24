begin;
-- Cash collection is available to all active club members, never self-approved signups.
-- Preserve the existing atomic allocator and receipt outbox behind a member check.
create or replace function public.record_member_cash_trailer_sale(sale_key uuid,actor_id uuid,buyer_name text,buyer_email text,buyer_phone text,ticket_quantity integer,quoted_price_cents integer)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.club_members where id=actor_id and membership_status='active') then
  raise exception 'Active club membership is required to record cash sales';
 end if;
 return public.record_trailer_cash_sale_for_collector(sale_key,actor_id,'member',buyer_name,buyer_email,buyer_phone,ticket_quantity,quoted_price_cents);
end
$$;
revoke all on function public.record_member_cash_trailer_sale(uuid,uuid,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.record_member_cash_trailer_sale(uuid,uuid,text,text,text,integer,integer) to service_role;
notify pgrst,'reload schema';
commit;
