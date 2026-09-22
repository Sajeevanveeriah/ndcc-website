begin;
create function public.guard_reverse_raffle_pending_reentry() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status='pending_payment' and old.status<>'pending_payment'
 and exists(select 1 from public.raffle_campaigns where id=new.campaign_id and code='NDCCRRO') then
  raise exception 'Reverse raffle orders cannot return to pending payment; create a new checkout.';
 end if;
 return new;
end $$;
revoke all on function public.guard_reverse_raffle_pending_reentry() from public,anon,authenticated;
create trigger guard_reverse_raffle_pending_reentry before update of status on public.raffle_orders
 for each row execute function public.guard_reverse_raffle_pending_reentry();
notify pgrst,'reload schema';
commit;
