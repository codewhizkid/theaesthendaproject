-- Provider-owned service types and recoverable removal. No appointment history deleted.
alter table public.services add column service_type text not null default '' check(length(service_type)<=80);
grant update(service_type) on public.services to aesthenda_services_owner;
grant update(status) on public.clients to aesthenda_clients_owner;
do $$ begin execute format('grant aesthenda_services_owner to %I with set true',current_user);execute format('grant aesthenda_clients_owner to %I with set true',current_user);execute format('grant aesthenda_appointments_owner to %I with set true',current_user);end $$;
grant create on schema aesthenda_private to aesthenda_services_owner,aesthenda_clients_owner,aesthenda_appointments_owner;
set local role aesthenda_appointments_owner;
-- Narrow internal permission: return a boolean, never grant clients owner table access.
create function aesthenda_private.client_has_upcoming_v1(p_actor uuid,p_client uuid) returns boolean language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform aesthenda_private.appointment_context(p_actor);
 if not exists(select 1 from public.clients where id=p_client) then raise exception 'CLIENT_NOT_FOUND';end if;
 return exists(select 1 from public.appointments where client_id=p_client and status in ('pending','confirmed') and end_at>statement_timestamp());
end $$;
revoke all on function aesthenda_private.client_has_upcoming_v1(uuid,uuid) from public,anon,authenticated,aesthenda_runtime;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then execute 'revoke all on function aesthenda_private.client_has_upcoming_v1(uuid,uuid) from service_role';end if;end $$;
grant execute on function aesthenda_private.client_has_upcoming_v1(uuid,uuid) to aesthenda_clients_owner;
reset role;
set local role aesthenda_services_owner;
create function aesthenda_private.save_service_v3(p_actor uuid,p_key uuid,p_id uuid,p_revision integer,p_name text,p_description text,p_cents bigint,p_steps jsonb,p_type text) returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; sid uuid; prior public.services%rowtype; replay aesthenda_private.service_timing_requests%rowtype; plan jsonb; step jsonb; total integer; version integer; fingerprint text;
begin
 bid:=aesthenda_private.service_context(p_actor);p_type:=btrim(p_type);if p_type is null or length(p_type) not between 1 and 80 then raise exception 'INVALID_SERVICE_TYPE';end if;plan:=aesthenda_private.normalize_service_steps(p_steps);
 if p_key is null or p_revision is null or p_revision<0 or (p_id is null and p_revision<>0) or (p_id is not null and p_revision<1) or p_name is null or length(btrim(p_name)) not between 1 and 160 or p_description is null or length(p_description)>2000 or p_cents is null or p_cents not between 0 and 99999999 then raise exception 'INVALID_INPUT';end if;
 fingerprint:=md5(jsonb_build_array(p_type,p_id,p_revision,btrim(p_name),btrim(p_description),p_cents,plan)::text);
 perform pg_advisory_xact_lock(hashtextextended(bid::text,2));
 select * into replay from aesthenda_private.service_timing_requests where business_id=bid and request_key=p_key;
 if found then if replay.fingerprint<>fingerprint then raise exception 'IDEMPOTENCY_CONFLICT';end if;return replay.service_id;end if;
 select sum((value->>'durationMinutes')::integer) into total from jsonb_array_elements(plan);
 if p_id is null then
  insert into public.services(business_id,name,description,duration_minutes,price,price_cents,currency,catalog_status,is_active,is_public,create_request_key,timing_configured,service_type)
  values(bid,btrim(p_name),btrim(p_description),total,p_cents::numeric/100,p_cents,'USD','draft',false,false,p_key,true,p_type) returning id,revision into sid,version;
 else
  select * into prior from public.services where id=p_id for update;
  if not found or prior.catalog_status<>'draft' then raise exception 'SERVICE_UNAVAILABLE';end if;
  if prior.revision<>p_revision then raise exception 'STALE_SERVICE';end if;
  update public.services set service_type=p_type,name=btrim(p_name),description=btrim(p_description),duration_minutes=total,price=p_cents::numeric/100,price_cents=p_cents,revision=revision+1,timing_configured=true,updated_at=now() where id=p_id returning id,revision into sid,version;
 end if;
 for step in select value from jsonb_array_elements(plan) loop
  insert into public.service_segments(service_id,label,start_offset_minutes,duration_minutes,occupied_by_professional,kind,definition_revision)
  values(sid,step->>'label',(step->>'startOffset')::integer,(step->>'durationMinutes')::integer,(step->>'occupied')::boolean,step->>'kind',version);
 end loop;
 insert into aesthenda_private.service_timing_requests values(bid,p_key,fingerprint,sid);
 insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata) values(bid,p_actor,'Service',sid,case when p_id is null then 'createService' else 'editService' end,jsonb_build_object('revision',version,'request_key',p_key,'step_count',jsonb_array_length(plan),'duration_minutes',total,'past_bookings_changed',false));
 return sid;
end $$;
create or replace function aesthenda_private.read_services_v1(p_actor uuid,p_id uuid default null) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform aesthenda_private.service_context(p_actor);
 return (select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'description',s.description,'durationMinutes',s.duration_minutes,'priceCents',s.price_cents,'currency',s.currency,'status',s.catalog_status,'revision',s.revision,'serviceType',s.service_type,'steps',(select coalesce(jsonb_agg(jsonb_build_object('label',g.label,'kind',g.kind,'durationMinutes',g.duration_minutes,'released',g.kind='processing' and not g.occupied_by_professional) order by g.start_offset_minutes,g.id),'[]'::jsonb) from public.service_segments g where g.service_id=s.id and g.definition_revision=s.revision)) order by s.created_at,s.id),'[]'::jsonb) from public.services s where p_id is null or s.id=p_id);
end $$;
create function aesthenda_private.set_service_deleted_v1(p_actor uuid,p_id uuid,p_revision integer,p_deleted boolean) returns void language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; prior public.services%rowtype; target text;
begin
 bid:=aesthenda_private.service_context(p_actor);
 if p_revision is null or p_revision<1 or p_deleted is null then raise exception 'INVALID_INPUT';end if;
 target:=case when p_deleted then 'archived' else 'draft' end;
 perform pg_advisory_xact_lock(hashtextextended(bid::text,2));
 select * into prior from public.services where id=p_id for update;
 if not found then raise exception 'SERVICE_NOT_FOUND';end if;
 if prior.catalog_status=target and prior.revision in (p_revision,p_revision+1) then return;end if;
 if prior.revision<>p_revision then raise exception 'STALE_SERVICE';end if;
 update public.services set catalog_status=target,revision=revision+1,updated_at=now() where id=p_id;
 -- Status revisions must not change timing-definition versions.
 insert into public.service_segments(service_id,label,start_offset_minutes,duration_minutes,occupied_by_professional,kind,definition_revision)
 select service_id,label,start_offset_minutes,duration_minutes,occupied_by_professional,kind,prior.revision+1 from public.service_segments where service_id=p_id and definition_revision=prior.revision;
 insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata) values(bid,p_actor,'Service',p_id,case when p_deleted then 'deleteService' else 'restoreService' end,jsonb_build_object('recoverable',true,'prior_revision',p_revision));
end $$;

revoke all on function aesthenda_private.save_service_v3(uuid,uuid,uuid,integer,text,text,bigint,jsonb,text),aesthenda_private.set_service_deleted_v1(uuid,uuid,integer,boolean) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then execute 'revoke all on function aesthenda_private.save_service_v3(uuid,uuid,uuid,integer,text,text,bigint,jsonb,text),aesthenda_private.set_service_deleted_v1(uuid,uuid,integer,boolean) from service_role';end if;end $$;
grant execute on function aesthenda_private.save_service_v3(uuid,uuid,uuid,integer,text,text,bigint,jsonb,text),aesthenda_private.set_service_deleted_v1(uuid,uuid,integer,boolean) to aesthenda_runtime;
reset role;
set local role aesthenda_clients_owner;
create or replace function aesthenda_private.read_clients_v2(p_actor uuid,p_id uuid default null,p_search text default '',p_page integer default 0,p_deleted boolean default false) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare records jsonb;
begin
 perform aesthenda_private.client_context(p_actor);
 if p_deleted is null or p_search is null or length(p_search)>160 or p_page is null or p_page not between 0 and 20000 then raise exception 'INVALID_INPUT'; end if;
 select coalesce(jsonb_agg(to_jsonb(c) order by c.position),'[]'::jsonb) into records from (
 select id,coalesce(first_name,'') as "firstName",coalesce(last_name,'') as "lastName",coalesce(email,'') as email,coalesce(phone,'') as phone,
 case when p_id is not null then notes else '' end as notes,revision,status,
 communication_preferences as preferences,preferences_recorded_at as "preferencesRecordedAt",preferences_method as "preferencesMethod",
 row_number() over(order by lower(first_name),lower(last_name),id) as position
 from public.clients where (p_id is not null and id=p_id or p_id is null and (case when p_deleted then status='archived' else status<>'archived' end)) and
 (p_id is not null or p_search='' or strpos(lower(concat_ws(' ',first_name,last_name,email,phone)),lower(p_search))>0)
 order by lower(first_name),lower(last_name),id limit 51 offset (case when p_id is null then p_page*50 else 0 end)
 ) c;
 return jsonb_build_object('clients',(select coalesce(jsonb_agg(x.value-'position' order by x.ordinality),'[]'::jsonb) from jsonb_array_elements(records) with ordinality x(value,ordinality) where x.ordinality<=50),'hasMore',jsonb_array_length(records)>50);
end $$;
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
  if not found or prior.status='archived' then raise exception 'CLIENT_NOT_FOUND';end if;
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
  if not found or prior.status='archived' then raise exception 'CLIENT_NOT_FOUND'; end if;
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
create or replace function aesthenda_private.client_contact_matches_v1(p_actor uuid,p_email text,p_phone text) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
 perform aesthenda_private.client_context(p_actor);
 if p_email is null or length(p_email)>254 or p_phone is null or length(p_phone)>40 then raise exception 'INVALID_INPUT';end if;
 select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) into result from (
 select id,btrim(concat_ws(' ',first_name,last_name)) as name from public.clients
 where status<>'archived' and ((p_email<>'' and lower(email)=lower(btrim(p_email))) or
 (p_phone<>'' and regexp_replace(phone,'[^0-9]','','g')=regexp_replace(p_phone,'[^0-9]','','g')))
 order by id limit 5) c;
 return result;
end $$;
create function aesthenda_private.set_client_deleted_v1(p_actor uuid,p_id uuid,p_revision integer,p_deleted boolean) returns void language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; prior public.clients%rowtype; target text;
begin
 bid:=aesthenda_private.client_context(p_actor);
 if p_revision is null or p_revision<1 or p_deleted is null then raise exception 'INVALID_INPUT';end if;
 target:=case when p_deleted then 'archived' else 'active' end;
 perform pg_advisory_xact_lock(hashtextextended(bid::text,2));perform pg_advisory_xact_lock(hashtextextended(bid::text,3));
 select * into prior from public.clients where id=p_id for update;
 if not found then raise exception 'CLIENT_NOT_FOUND';end if;
 if prior.status=target and prior.revision in (p_revision,p_revision+1) then return;end if;
 if prior.revision<>p_revision then raise exception 'STALE_CLIENT';end if;
 if p_deleted and aesthenda_private.client_has_upcoming_v1(p_actor,p_id) then raise exception 'UPCOMING_APPOINTMENTS';end if;
 update public.clients set status=target,revision=revision+1,updated_at=now() where id=p_id;
 insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata) values(bid,p_actor,'Client',p_id,case when p_deleted then 'deleteClient' else 'restoreClient' end,jsonb_build_object('recoverable',true,'prior_revision',p_revision));
end $$;

create or replace function aesthenda_private.read_clients_v1(p_actor uuid,p_id uuid default null,p_search text default '',p_page integer default 0) returns jsonb language sql security definer set search_path=pg_catalog as $$select aesthenda_private.read_clients_v2(p_actor,p_id,p_search,p_page,false)$$;
revoke all on function aesthenda_private.read_clients_v2(uuid,uuid,text,integer,boolean),aesthenda_private.set_client_deleted_v1(uuid,uuid,integer,boolean) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then execute 'revoke all on function aesthenda_private.read_clients_v2(uuid,uuid,text,integer,boolean),aesthenda_private.set_client_deleted_v1(uuid,uuid,integer,boolean) from service_role';end if;end $$;
grant execute on function aesthenda_private.read_clients_v2(uuid,uuid,text,integer,boolean),aesthenda_private.set_client_deleted_v1(uuid,uuid,integer,boolean) to aesthenda_runtime;
reset role;
revoke create on schema aesthenda_private from aesthenda_services_owner,aesthenda_clients_owner,aesthenda_appointments_owner;
do $$ begin execute format('grant aesthenda_services_owner to %I with set false',current_user);execute format('grant aesthenda_clients_owner to %I with set false',current_user);execute format('grant aesthenda_appointments_owner to %I with set false',current_user);end $$;
