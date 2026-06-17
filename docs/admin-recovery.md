# Admin recovery

Use the script without printing secrets:

```bash
NDCC_ADMIN_RESET_PASSWORD='new-password' node scripts/admin-reset-user.mjs sajeevanveeriah@gmail.com "Sajeevan Veeriah" admin
```

Equivalent Supabase SQL:

```sql
with upserted as (
  insert into committee_users (email, full_name, role, is_active, password_hash)
  values (lower('sajeevanveeriah@gmail.com'), 'Sajeevan Veeriah', 'admin', true, crypt(:new_password, gen_salt('bf', 10)))
  on conflict (email) do update
  set full_name = coalesce(nullif(committee_users.full_name, ''), excluded.full_name),
      role = excluded.role,
      is_active = true,
      password_hash = crypt(:new_password, gen_salt('bf', 10)),
      updated_at = now()
  returning id, email, role, is_active
), revoked as (
  delete from committee_sessions
  where user_id in (select id from upserted)
  returning id
)
select upserted.id, upserted.email, upserted.role, upserted.is_active, count(revoked.id) as sessions_revoked
from upserted
left join revoked on true
group by upserted.id, upserted.email, upserted.role, upserted.is_active;
```

Password reset intentionally revokes existing sessions for that user. Normal login creates one `committee_sessions` row per device, and logout deletes only the current `session_token_hash`.
