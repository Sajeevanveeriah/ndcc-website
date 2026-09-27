-- Staff notification for song-request event entries (iPod Shuffle): the
-- secretary receives each entry with its song list. Editable in the CMS.
-- Rollback: delete event_song_requests rows, then restore the previous
-- event_type check from 20260927060000_notification_recipients.sql.
begin;
set local lock_timeout = '3s';

alter table public.notification_recipients drop constraint if exists notification_recipients_event_type_check;
alter table public.notification_recipients add constraint notification_recipients_event_type_check
  check (event_type in (
    'dino_registration_copy',
    'dino_receipt_copy',
    'apparel_order_staff',
    'kitchen_order_staff',
    'raffle_staff',
    'receipt_copy',
    'contact',
    'event_song_requests'
  ));

insert into public.notification_recipients (event_type, email, sort_order)
select 'event_song_requests', 'ndcc.secretary1@gmail.com', 10
where not exists (
  select 1 from public.notification_recipients
  where event_type = 'event_song_requests' and lower(email) = 'ndcc.secretary1@gmail.com'
);

commit;
