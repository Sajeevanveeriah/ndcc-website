-- Separate reverse raffle; retain the trailer raffle and all issued tickets.
-- No date or prize is assumed. Existing allocation locks and webhook guards remain.
begin;
drop index if exists public.raffle_campaigns_one_active;
alter table public.raffle_campaigns drop constraint raffle_campaigns_year_code_check;
alter table public.raffle_campaigns add constraint raffle_campaigns_year_code_check
  check (year_code ~ '^[0-9]{2}$' or (code = 'NDCCRRO' and year_code = '2026'));
alter table public.raffle_campaigns drop constraint raffle_campaigns_next_ticket_number_check;
alter table public.raffle_campaigns add constraint raffle_campaigns_next_ticket_number_check
  check (next_ticket_number between 0 and 10000 and (next_ticket_number > 0 or code = 'NDCCRRO'));
alter table public.raffle_campaigns alter column draw_at drop not null;
alter table public.raffle_campaigns alter column draw_label drop not null;
alter table public.raffle_tickets drop constraint raffle_tickets_ticket_number_check;
alter table public.raffle_tickets add constraint raffle_tickets_ticket_number_check
  check (ticket_number between 0 and 9999);
alter table public.raffle_tickets drop constraint raffle_tickets_ticket_reference_check;
alter table public.raffle_tickets add constraint raffle_tickets_ticket_reference_check
  check (ticket_reference ~ '^NDCCRAF-[0-9]{6}$' or ticket_reference ~ '^NDCCRRO-2026[0-9]{4}$');
alter table public.raffle_campaigns add constraint reverse_raffle_price_check
  check (code <> 'NDCCRRO' or price_cents = 6000);
insert into public.raffle_campaigns
  (name,code,year_code,price_cents,draw_at,draw_label,next_ticket_number,active,public_visibility_mode)
values ('Reverse Raffle','NDCCRRO','2026',6000,null,null,0,false,'hidden')
on conflict (code) do nothing;
-- Roll back public availability by setting this campaign visibility to hidden.
-- Never reset the counter or remove issued tickets when rolling back application code.
notify pgrst, 'reload schema';
commit;
