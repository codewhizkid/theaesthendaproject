-- Reject JSON null/non-string contact preferences at the trusted boundary.
do $$ begin execute format('grant aesthenda_clients_owner to %I with set true',current_user);end $$;
grant create on schema aesthenda_private to aesthenda_clients_owner;
set local role aesthenda_clients_owner;
create or replace function aesthenda_private.save_client_v2(p_actor uuid,p_key uuid,p_id uuid,p_revision integer,p_first text,p_last text,p_email text,p_phone text,p_notes text,p_preferences jsonb,p_method text) returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; cid uuid; prior public.clients%rowtype; payload jsonb; replay aesthenda_private.client_requests%rowtype; prefs jsonb; consent_changed boolean;
begin
 bid:=aesthenda_private.client_context(p_actor);
 p_first:=btrim(p_first);p_last:=btrim(p_last);p_email:=btrim(p_email);p_phone:=btrim(p_phone);p_notes:=btrim(p_notes);
 if p_key is null or p_first is null or length(p_first) not between 1 and 80 or p_last is null or length(p_last)>80 or p_email is null or length(p_email)>254 or (p_email<>'' and p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') or p_phone is null or length(p_phone)>40 or (p_phone<>'' and (p_phone !~ '^[+0-9 ().-]+$' or length(regexp_replace(p_phone,'[^0-9]','','g')) not between 7 and 20)) or p_notes is null or length(p_notes)>2000 or p_revision is null or p_revision<0 or (p_id is null and p_revision<>0) or (p_id is not null and p_revision<1) then raise exception 'INVALID_INPUT'; end if;
 if p_email='' and p_phone='' then raise exception 'CONTACT_REQUIRED';end if;
 payload:=jsonb_build_object('id',p_id,'revision',p_revision,'first',p_first,'last',p_last,'email',p_email,'phone',p_phone,'notes',p_notes,'preferences',p_preferences,'method',p_method);
 perform pg_advisory_xact_lock(hashtextextended(bid::text,3));
 select * into replay from aesthenda_private.client_requests where business_id=bid and request_key=p_key;
 if found then
  if replay.payload_hash<>md5(payload::text) then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return replay.client_id;
 end if;
 if p_id is not null then
  select * into prior from public.clients where id=p_id for update;
  if not found then raise exception 'CLIENT_NOT_FOUND';end if;
  if prior.revision<>p_revision then raise exception 'STALE_CLIENT';end if;
 end if;
 prefs:=coalesce(p_preferences,prior.communication_preferences,'{"updatesEmail":false,"updatesText":false,"marketingEmail":false,"marketingText":false,"preferredContact":"none"}'::jsonb);
 if jsonb_typeof(prefs)<>'object' or (select count(*) from jsonb_object_keys(prefs))<>5
 or not (prefs ?& array['updatesEmail','updatesText','marketingEmail','marketingText','preferredContact'])
 or exists(select 1 from jsonb_each(prefs) where key<>'preferredContact' and jsonb_typeof(value)<>'boolean')
 or jsonb_typeof(prefs->'preferredContact') is distinct from 'string'
 or prefs->>'preferredContact' not in ('none','email','phone','text') then raise exception 'INVALID_PREFERENCES';end if;
 -- Legacy callers cannot carry consent over to a replacement destination.
 if p_preferences is null then
  if p_email is distinct from prior.email then prefs:=prefs||'{"updatesEmail":false,"marketingEmail":false}'::jsonb;end if;
  if p_phone is distinct from prior.phone then prefs:=prefs||'{"updatesText":false,"marketingText":false}'::jsonb;end if;
  if (p_email='' and prefs->>'preferredContact'='email') or (p_phone='' and prefs->>'preferredContact' in ('phone','text')) then prefs:=prefs||'{"preferredContact":"none"}'::jsonb;end if;
 end if;
 if (p_email='' and ((prefs->>'updatesEmail')::boolean or (prefs->>'marketingEmail')::boolean or prefs->>'preferredContact'='email'))
 or (p_phone='' and ((prefs->>'updatesText')::boolean or (prefs->>'marketingText')::boolean or prefs->>'preferredContact' in ('phone','text'))) then raise exception 'CONTACT_CHANNEL_UNAVAILABLE';end if;
 consent_changed:=p_id is null or prefs is distinct from prior.communication_preferences or p_email is distinct from prior.email or p_phone is distinct from prior.phone;
 if p_method is null or p_method not in ('not_given','verbal','written') then raise exception 'INVALID_PREFERENCES';end if;
 if consent_changed and exists(select 1 from jsonb_each(prefs) where key<>'preferredContact' and value='true'::jsonb
  and (p_id is null or prior.communication_preferences->key is distinct from value
   or (key in ('updatesEmail','marketingEmail') and p_email is distinct from prior.email)
   or (key in ('updatesText','marketingText') and p_phone is distinct from prior.phone))) and p_method='not_given' then raise exception 'CONSENT_REQUIRED';end if;
 if p_id is null then
  insert into public.clients(business_id,first_name,last_name,email,phone,notes,status) values(bid,p_first,p_last,p_email,p_phone,p_notes,'active') returning id into cid;
 else
  select * into prior from public.clients where id=p_id for update;
  if not found then raise exception 'CLIENT_NOT_FOUND'; end if;
  if prior.revision<>p_revision then raise exception 'STALE_CLIENT'; end if;
  update public.clients set first_name=p_first,last_name=p_last,email=p_email,phone=p_phone,notes=p_notes,revision=revision+1,updated_at=now() where id=p_id;
  cid:=p_id;
 end if;
 update public.clients set communication_preferences=prefs,
 preferences_recorded_at=case when consent_changed then statement_timestamp() else preferences_recorded_at end,
 preferences_method=case when consent_changed then p_method else preferences_method end where id=cid;
 if consent_changed then
  insert into aesthenda_private.client_preference_events(business_id,client_id,actor_id,client_revision,preferences,method)
  values(bid,cid,p_actor,p_revision+1,prefs,p_method);
 end if;
 insert into aesthenda_private.client_requests(business_id,request_key,payload_hash,client_id) values(bid,p_key,md5(payload::text),cid);
 -- Contact details and note text are deliberately omitted from audit metadata.
 insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata) values(bid,p_actor,'Client',cid,case when p_id is null then 'createClient' else 'updateClient' end,jsonb_build_object('action_version',1,'request_key',p_key,'prior_revision',p_revision,'new_revision',p_revision+1,'source','professional'));
 return cid;
end $$;
reset role;
revoke create on schema aesthenda_private from aesthenda_clients_owner;
do $$ begin execute format('grant aesthenda_clients_owner to %I with set false',current_user);end $$;
