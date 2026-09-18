begin;
do $$
declare key uuid:=gen_random_uuid(); cid uuid; original_count int; claimed int;
  payload jsonb:='{"name":"Feedback fixture","email":"visitor@example.invalid","kind":"issue","message":"A rollback-only feedback test message."}';
begin
  select count(*) into original_count from public.contacts;
  insert into public.dino_feedback_config(singleton,recipients) values(true,array['one@example.invalid','two@example.invalid'])
    on conflict(singleton) do update set recipients=excluded.recipients,enabled=true;
  perform public.submit_dino_feedback(key,payload);
  perform public.submit_dino_feedback(key,payload);
  if (select count(*) from public.contacts)<>original_count+1 then raise exception 'Duplicate feedback created multiple contacts'; end if;
  select contact_id into cid from public.dino_feedback_jobs where id=key;
  if not exists(select 1 from public.contacts where id=cid and enquiry_type='dino-feedback' and not responded) then raise exception 'Feedback missing from CMS'; end if;
  begin
    perform public.submit_dino_feedback(key,payload||'{"message":"Changed content on the same identifier."}');
    raise exception 'Conflicting duplicate accepted';
  exception when unique_violation then null; end;
  update public.dino_feedback_config set recipients=array['changed@example.invalid'] where singleton;
  if (select recipients from public.dino_feedback_jobs where id=key)<>array['one@example.invalid','two@example.invalid'] then raise exception 'Recipients were not frozen'; end if;
  select count(*) into claimed from public.claim_dino_feedback(key);
  if claimed<>1 then raise exception 'Job was not claimed'; end if;
  select count(*) into claimed from public.claim_dino_feedback(key);
  if claimed<>0 then raise exception 'Leased job was claimed twice'; end if;
  update public.dino_feedback_jobs set lease_until=null,first_attempt_at=now()-interval '24 hours' where id=key;
  perform public.claim_dino_feedback(key);
  if not exists(select 1 from public.dino_feedback_jobs where id=key and needs_review_at is not null) then raise exception 'Unsafe retry after provider deduplication window'; end if;
  if has_table_privilege('anon','public.dino_feedback_config','SELECT') or has_table_privilege('authenticated','public.dino_feedback_jobs','SELECT')
    or has_function_privilege('anon','public.submit_dino_feedback(uuid,jsonb)','EXECUTE')
    or has_function_privilege('authenticated','public.claim_dino_feedback(uuid)','EXECUTE') then raise exception 'Private feedback or recipients exposed'; end if;
  update public.dino_feedback_config set enabled=false where singleton;
  begin
    perform public.submit_dino_feedback(gen_random_uuid(),payload);
    raise exception 'Disabled feedback accepted';
  exception when others then if sqlerrm='Disabled feedback accepted' then raise; end if; end;
  if (select count(*) from public.contacts)<>original_count+1 then raise exception 'Failed submission left a partial contact'; end if;
end $$;
rollback;
