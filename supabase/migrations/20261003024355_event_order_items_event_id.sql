-- Record the event on every event order item.
--
-- Admin purchase tabs (Admin > Orders, Payments and both CSV exports) group
-- event orders by event. They used the item name stored at purchase time, so
-- renaming an event ("iPod Shuffle" -> "iPod Shuffle Night") split its orders
-- across two tabs and a tab export missed the later orders. New event orders
-- now store items[].event_id (app/api/events/route.ts) and grouping resolves
-- it to the event's current title (lib/orders/purchase-groups.ts).
--
-- This backfills event_id onto existing event order items from the linked
-- event registration. Only items gain a key: names, prices, totals and
-- payment fields are unchanged, and none of the orders triggers fire on an
-- items-only update. Idempotent; orders linked to more than one event (none
-- at the time of writing) are left on the name fallback.
with links as (
  select r.order_id, min(r.event_id::text) as event_id
  from public.event_registrations r
  where r.order_id is not null
  group by r.order_id
  having count(distinct r.event_id) = 1
)
update public.orders o
set items = (
  select jsonb_agg(
    case when jsonb_typeof(e.item) = 'object' then e.item || jsonb_build_object('event_id', l.event_id) else e.item end
    order by e.ord
  )
  from jsonb_array_elements(o.items) with ordinality as e(item, ord)
)
from links l
where l.order_id = o.id
  and o.order_category = 'event'
  and jsonb_typeof(o.items) = 'array'
  and jsonb_array_length(o.items) > 0
  and exists (
    select 1 from jsonb_array_elements(o.items) as i(item)
    where jsonb_typeof(i.item) = 'object' and (i.item ->> 'event_id') is distinct from l.event_id
  );
