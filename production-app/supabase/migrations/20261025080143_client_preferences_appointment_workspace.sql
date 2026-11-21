-- Contact preferences belong to a salon client, not the salon owner's Auth account.
-- No consent is inferred for existing clients. Legacy incomplete records remain readable.
alter table public.clients add column communication_preferences jsonb not null default '{"updatesEmail":false,"updatesText":false,"marketingEmail":false,"marketingText":false,"preferredContact":"none"}';
alter table public.clients add column preferences_recorded_at timestamptz;
alter table public.clients add column preferences_method text;
create index clients_contact_email on public.clients(business_id,lower(email)) where email<>'';
create index clients_contact_phone on public.clients(business_id,(regexp_replace(phone,'[^0-9]','','g'))) where phone<>'';
create table aesthenda_private.client_preference_events(
 id bigint generated always as identity primary key,
 business_id uuid not null references public.businesses(id),
 client_id uuid not null references public.clients(id),
 actor_id uuid not null,
 client_revision integer not null,
 preferences jsonb not null,
 method text not null check(method in ('not_given','verbal','written')),
 source text not null default 'salon_recorded' check(source='salon_recorded'),
 recorded_at timestamptz not null default statement_timestamp()
);
alter table aesthenda_private.client_preference_events enable row level security;
alter table aesthenda_private.client_preference_events force row level security;
revoke all on aesthenda_private.client_preference_events from public,anon,authenticated,aesthenda_runtime;
grant select,insert on aesthenda_private.client_preference_events to aesthenda_clients_owner;
grant usage on sequence aesthenda_private.client_preference_events_id_seq to aesthenda_clients_owner;
grant update(communication_preferences,preferences_recorded_at,preferences_method) on public.clients to aesthenda_clients_owner;
create policy client_preference_scope on aesthenda_private.client_preference_events to aesthenda_clients_owner
 using(business_id=(select nullif(current_setting('app.business_account_id',true),'')::uuid))
 with check(business_id=(select nullif(current_setting('app.business_account_id',true),'')::uuid) and actor_id=(select nullif(current_setting('app.verified_actor_id',true),'')::uuid));
do $$ begin execute format('grant aesthenda_clients_owner to %I with set true',current_user);end $$;
grant create on schema aesthenda_private to aesthenda_clients_owner;
set local role aesthenda_clients_owner;
create or replace function aesthenda_private.read_clients_v1(p_actor uuid,p_id uuid default null,p_search text default '',p_page integer default 0) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare records jsonb;
begin
 perform aesthenda_private.client_context(p_actor);
 if p_search is null or length(p_search)>160 or p_page is null or p_page not between 0 and 20000 then raise exception 'INVALID_INPUT'; end if;
 select coalesce(jsonb_agg(to_jsonb(c) order by c.position),'[]'::jsonb) into records from (
 select id,coalesce(first_name,'') as "firstName",coalesce(last_name,'') as "lastName",coalesce(email,'') as email,coalesce(phone,'') as phone,
 case when p_id is not null then notes else '' end as notes,revision,
 communication_preferences as preferences,preferences_recorded_at as "preferencesRecordedAt",preferences_method as "preferencesMethod",
 row_number() over(order by lower(first_name),lower(last_name),id) as position
 from public.clients where (p_id is null or id=p_id) and
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
  if not found then raise exception 'CLIENT_NOT_FOUND';end if;
  if prior.revision<>p_revision then raise exception 'STALE_CLIENT';end if;
 end if;
 prefs:=coalesce(p_preferences,prior.communication_preferences,'{"updatesEmail":false,"updatesText":false,"marketingEmail":false,"marketingText":false,"preferredContact":"none"}'::jsonb);
 if jsonb_typeof(prefs)<>'object' or (select count(*) from jsonb_object_keys(prefs))<>5
 or not (prefs ?& array['updatesEmail','updatesText','marketingEmail','marketingText','preferredContact'])
 or exists(select 1 from jsonb_each(prefs) where key<>'preferredContact' and jsonb_typeof(value)<>'boolean')
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
create or replace function aesthenda_private.save_client_v1(p_actor uuid,p_key uuid,p_id uuid,p_revision integer,p_first text,p_last text,p_email text,p_phone text,p_notes text) returns uuid
language sql security definer set search_path=pg_catalog as $$
 select aesthenda_private.save_client_v2(p_actor,p_key,p_id,p_revision,p_first,p_last,p_email,p_phone,p_notes,null,'not_given')
$$;
revoke all on function aesthenda_private.save_client_v2(uuid,uuid,uuid,integer,text,text,text,text,text,jsonb,text) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then execute 'revoke all on function aesthenda_private.save_client_v2(uuid,uuid,uuid,integer,text,text,text,text,text,jsonb,text) from service_role';end if;end $$;
grant execute on function aesthenda_private.save_client_v2(uuid,uuid,uuid,integer,text,text,text,text,text,jsonb,text) to aesthenda_runtime;
create function aesthenda_private.client_contact_matches_v1(p_actor uuid,p_email text,p_phone text) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
 perform aesthenda_private.client_context(p_actor);
 if p_email is null or length(p_email)>254 or p_phone is null or length(p_phone)>40 then raise exception 'INVALID_INPUT';end if;
 select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) into result from (
 select id,btrim(concat_ws(' ',first_name,last_name)) as name from public.clients
 where (p_email<>'' and lower(email)=lower(btrim(p_email))) or
 (p_phone<>'' and regexp_replace(phone,'[^0-9]','','g')=regexp_replace(p_phone,'[^0-9]','','g'))
 order by id limit 5) c;
 return result;
end $$;
revoke all on function aesthenda_private.client_contact_matches_v1(uuid,text,text) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then execute 'revoke all on function aesthenda_private.client_contact_matches_v1(uuid,text,text) from service_role';end if;end $$;
grant execute on function aesthenda_private.client_contact_matches_v1(uuid,text,text) to aesthenda_runtime;
reset role;
revoke create on schema aesthenda_private from aesthenda_clients_owner;
do $$ begin execute format('grant aesthenda_clients_owner to %I with set false',current_user);end $$;

create table aesthenda_private.booking_preferences(
 business_id uuid primary key references public.businesses(id),
 auto_confirm boolean not null default false,
 revision integer not null default 1 check(revision>0)
);
alter table aesthenda_private.booking_preferences enable row level security;
alter table aesthenda_private.booking_preferences force row level security;
revoke all on aesthenda_private.booking_preferences from public,anon,authenticated,aesthenda_runtime;
grant select,insert,update on aesthenda_private.booking_preferences to aesthenda_appointments_owner;
create policy booking_preferences_scope on aesthenda_private.booking_preferences to aesthenda_appointments_owner
 using(business_id=(select nullif(current_setting('app.business_account_id',true),'')::uuid))
 with check(business_id=(select nullif(current_setting('app.business_account_id',true),'')::uuid));
create index appointments_client_history on public.appointments(business_id,client_id,start_at,id);
do $$ begin execute format('grant aesthenda_appointments_owner to %I with set true',current_user);end $$;
grant create on schema aesthenda_private to aesthenda_appointments_owner;
set local role aesthenda_appointments_owner;
create function aesthenda_private.read_booking_preferences_v1(p_actor uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; result jsonb;
begin
 bid:=aesthenda_private.appointment_context(p_actor);
 select jsonb_build_object('autoConfirm',auto_confirm,'revision',revision) into result from aesthenda_private.booking_preferences where business_id=bid;
 return coalesce(result,'{"autoConfirm":false,"revision":0}'::jsonb);
end $$;
create function aesthenda_private.save_booking_preferences_v1(p_actor uuid,p_revision integer,p_auto boolean) returns void language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; prior aesthenda_private.booking_preferences%rowtype;
begin
 bid:=aesthenda_private.appointment_context(p_actor);
 if p_revision is null or p_revision<0 or p_auto is null then raise exception 'INVALID_INPUT';end if;
 perform pg_advisory_xact_lock(hashtextextended(bid::text,2));
 select * into prior from aesthenda_private.booking_preferences where business_id=bid;
 if coalesce(prior.revision,0)<>p_revision then
  if prior.auto_confirm=p_auto and prior.revision=p_revision+1 then return;end if;
  raise exception 'STALE_PREFERENCES';
 end if;
 insert into aesthenda_private.booking_preferences values(bid,p_auto,1)
 on conflict(business_id) do update set auto_confirm=excluded.auto_confirm,revision=booking_preferences.revision+1;
 insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata)
 values(bid,p_actor,'Business',bid,'updateBookingPreferences',jsonb_build_object('auto_confirm',p_auto,'prior_revision',p_revision));
end $$;
create function aesthenda_private.set_appointment_status_v1(p_actor uuid,p_key uuid,p_id uuid,p_revision integer,p_status text) returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; prior public.appointments%rowtype; replay aesthenda_private.appointment_requests%rowtype; fingerprint text;
begin
 bid:=aesthenda_private.appointment_context(p_actor);
 if p_key is null or p_revision is null or p_revision<1 or p_status is null or p_status not in ('confirmed','completed','no_show') then raise exception 'INVALID_INPUT';end if;
 perform pg_advisory_xact_lock(hashtextextended(bid::text,2));
 fingerprint:=md5(jsonb_build_array('status',p_id,p_revision,p_status)::text);
 select * into replay from aesthenda_private.appointment_requests where business_id=bid and request_key=p_key;
 if found then if replay.fingerprint<>fingerprint then raise exception 'IDEMPOTENCY_CONFLICT';end if;return replay.appointment_id;end if;
 select * into prior from public.appointments where id=p_id and booking_source='professional_v1' for update;
 if not found then raise exception 'APPOINTMENT_UNAVAILABLE';end if;
 if prior.revision<>p_revision then raise exception 'STALE_APPOINTMENT';end if;
 if prior.status not in ('pending','confirmed') or prior.status=p_status then raise exception 'INVALID_STATUS_TRANSITION';end if;
 if (p_status='confirmed' and prior.start_at<=statement_timestamp())
 or (p_status='no_show' and prior.start_at>statement_timestamp())
 or (p_status='completed' and prior.end_at>statement_timestamp()) then raise exception 'STATUS_TIME_REVIEW';end if;
 update public.appointments set status=p_status,revision=revision+1,updated_at=now() where id=p_id;
 insert into aesthenda_private.appointment_requests values(bid,p_key,fingerprint,p_id);
 insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata)
 values(bid,p_actor,'Appointment',p_id,'changeAppointmentStatus',jsonb_build_object('prior_status',prior.status,'status',p_status,'prior_revision',prior.revision,'new_revision',prior.revision+1,'notification_sent',false));
 return p_id;
end $$;
create function aesthenda_private.read_client_appointments_v1(p_actor uuid,p_id uuid,p_group text,p_page integer default 0) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; result jsonb;
begin
 bid:=aesthenda_private.appointment_context(p_actor);
 if p_group is null or p_group not in ('previous','upcoming') or p_page is null or p_page not between 0 and 20000 then raise exception 'INVALID_INPUT';end if;
 if not exists(select 1 from public.clients where id=p_id) then raise exception 'CLIENT_UNAVAILABLE';end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.position),'[]'::jsonb) into result from (
 select a.id,btrim(concat_ws(' ',c.first_name,c.last_name)) as "clientName",a.service_snapshot->>'name' as "serviceName",
 a.service_snapshot->'priceCents' as "priceCents",a.service_snapshot->>'currency' as currency,a.start_at as "startAt",a.end_at as "endAt",a.status,
 coalesce(a.timezone,'UTC') as timezone,a.revision,a.booking_source as source,
 row_number() over(order by case when p_group='previous' then a.start_at end desc,case when p_group='upcoming' then a.start_at end,a.id) as position
 from public.appointments a join public.clients c on c.id=a.client_id
 where a.client_id=p_id and (case when p_group='previous' then a.start_at<statement_timestamp() or a.status in ('cancelled','completed','no_show') else a.start_at>=statement_timestamp() and a.status in ('pending','confirmed') end)
 order by case when p_group='previous' then a.start_at end desc,case when p_group='upcoming' then a.start_at end,a.id
 limit 21 offset p_page*20
 ) x;
 return jsonb_build_object('appointments',(select coalesce(jsonb_agg(e.value-'position' order by e.ordinality),'[]'::jsonb) from jsonb_array_elements(result) with ordinality e(value,ordinality) where e.ordinality<=20),'hasMore',jsonb_array_length(result)>20);
end $$;
create or replace function aesthenda_private.create_appointment_v1(p_actor uuid,p_key uuid,p_client uuid,p_service uuid,p_start timestamptz,p_token text) returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; pid uuid; cid uuid; service jsonb; hours jsonb; zone text; fingerprint text; prior aesthenda_private.appointment_requests%rowtype; duration integer; initial_status text;
begin
 bid:=aesthenda_private.appointment_context(p_actor);
 if p_key is null or p_client is null or p_service is null or p_start is null or not isfinite(p_start) or p_token is null or length(p_token)<>32 then raise exception 'INVALID_INPUT'; end if;
 fingerprint:=md5(jsonb_build_array('create',p_client,p_service,extract(epoch from p_start),p_token)::text);
 -- Same lock as weekly/date availability writes, so fit is checked atomically.
 perform pg_advisory_xact_lock(hashtextextended(bid::text,2));
 select * into prior from aesthenda_private.appointment_requests where business_id=bid and request_key=p_key;
 if found then if prior.fingerprint<>fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;return prior.appointment_id;end if;
 select id into pid from public.professionals where business_id=bid and user_id=p_actor for share;
 if pid is null then raise exception 'PROFESSIONAL_UNAVAILABLE'; end if;
 perform 1 from public.clients where id=p_client and status in ('active','lead') for share;
 if not found then raise exception 'CLIENT_UNAVAILABLE'; end if;
 perform 1 from public.services where id=p_service for share;
 service:=aesthenda_private.appointment_service(p_service);
 select timezone into zone from aesthenda_private.weekly_schedules where business_id=bid;
 if zone is null then raise exception 'SAVE_WEEKLY_HOURS_FIRST'; end if;
 if md5((service->>'token')||zone)<>p_token then raise exception 'SERVICE_CHANGED'; end if;
 hours:=aesthenda_private.effective_date_hours_v1(p_actor,(p_start at time zone zone)::date);duration:=(service->>'durationMinutes')::integer;
 if not aesthenda_private.appointment_fits(bid,pid,p_start,duration,hours) then raise exception 'SLOT_UNAVAILABLE'; end if;
 select case when auto_confirm then 'confirmed' else 'pending' end into initial_status from aesthenda_private.booking_preferences where business_id=bid;
 initial_status:=coalesce(initial_status,'pending');
 insert into public.appointments(business_id,professional_id,client_id,service_id,start_at,end_at,status,policy_version,service_snapshot,created_by,booking_source,timezone)
 values(bid,pid,p_client,p_service,p_start,p_start+make_interval(mins=>duration),initial_status,service->>'policyVersion',(service-'token')||jsonb_build_object('timezone',zone,'localStart',timezone(zone,p_start),'localEnd',timezone(zone,p_start+make_interval(mins=>duration)),'bufferBefore',0,'bufferAfter',0),p_actor,'professional_v1',zone) returning id into cid;
 insert into public.appointment_segments(appointment_id,service_segment_id,start_at,end_at) values(cid,(service->>'segmentId')::uuid,p_start,p_start+make_interval(mins=>duration));
 insert into aesthenda_private.appointment_requests values(bid,p_key,fingerprint,cid);
 insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata) values(bid,p_actor,'Appointment',cid,'createAppointment',jsonb_build_object('action_version',1,'request_key',p_key,'source','professional','status',initial_status,'start_at',p_start,'duration_minutes',duration,'timezone',zone,'service_id',p_service));
 return cid;
end $$;
create or replace function aesthenda_private.read_appointments_v1(p_actor uuid,p_date date default null,p_id uuid default null) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; zone text; day date; result jsonb;
begin
 bid:=aesthenda_private.appointment_context(p_actor);
 select timezone into zone from aesthenda_private.weekly_schedules where business_id=bid;
 day:=coalesce(p_date,(now() at time zone coalesce(zone,'UTC'))::date);
 if day<'2000-01-01'::date or day>'2100-12-31'::date then raise exception 'INVALID_INPUT';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'clientId',a.client_id,'clientName',btrim(concat_ws(' ',c.first_name,c.last_name)),'serviceName',a.service_snapshot->>'name','priceCents',a.service_snapshot->'priceCents','currency',a.service_snapshot->>'currency','startAt',a.start_at,'endAt',a.end_at,'status',a.status,'timezone',coalesce(a.timezone,zone,'UTC'),'revision',a.revision,'source',a.booking_source) order by a.start_at,a.id),'[]'::jsonb) into result
 from public.appointments a join public.clients c on c.id=a.client_id where (p_id is not null and a.id=p_id) or (p_id is null and timezone(coalesce(a.timezone,zone,'UTC'),a.start_at)::date=day);
 return jsonb_build_object('date',day,'timezone',zone,'asOf',statement_timestamp(),'appointments',result);
end $$;
create or replace function aesthenda_private.cancel_appointment_v1(p_actor uuid,p_id uuid,p_revision integer) returns void language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; prior public.appointments%rowtype;
begin
 bid:=aesthenda_private.appointment_context(p_actor);perform pg_advisory_xact_lock(hashtextextended(bid::text,2));
 select * into prior from public.appointments where id=p_id and booking_source='professional_v1' for update;
 if not found then raise exception 'APPOINTMENT_UNAVAILABLE';end if;
 if prior.status='cancelled' then return;end if;
 if p_revision is null or prior.revision<>p_revision then raise exception 'STALE_APPOINTMENT';end if;
 if prior.status not in ('pending','confirmed') then raise exception 'APPOINTMENT_REQUIRES_REVIEW';end if;
 update public.appointments set status='cancelled',revision=revision+1,updated_at=now() where id=p_id;
 insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata) values(bid,p_actor,'Appointment',p_id,'cancelAppointment',jsonb_build_object('action_version',1,'prior_revision',prior.revision,'new_revision',prior.revision+1,'source','professional'));
end $$;
create or replace function aesthenda_private.appointment_move_state(p_actor uuid,p_id uuid) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare bid uuid; a public.appointments%rowtype; zone text; duration integer;
begin
 bid:=aesthenda_private.appointment_context(p_actor);
 select * into a from public.appointments where id=p_id;
 if not found then raise exception 'APPOINTMENT_UNAVAILABLE';end if;
 if a.booking_source<>'professional_v1' or a.status not in ('pending','confirmed') then raise exception 'APPOINTMENT_REQUIRES_REVIEW';end if;
 select timezone into zone from aesthenda_private.weekly_schedules where business_id=bid;
 if zone is null or zone is distinct from a.timezone then raise exception 'TIMEZONE_REVIEW_REQUIRED';end if;
 duration:=extract(epoch from (a.end_at-a.start_at))::integer/60;
 if duration not between 1 and 1440 or a.end_at<>a.start_at+make_interval(mins=>duration)
  or coalesce(a.duration_override_minutes,(a.service_snapshot->>'durationMinutes')::integer) is distinct from duration
  or (select count(*) from public.appointment_segments where appointment_id=a.id)<>1
  or not exists(select 1 from public.appointment_segments where appointment_id=a.id and start_at=a.start_at and end_at=a.end_at) then raise exception 'APPOINTMENT_REQUIRES_REVIEW';end if;
 if not exists(select 1 from public.clients where id=a.client_id and status in ('active','lead')) then raise exception 'CLIENT_UNAVAILABLE';end if;
 return jsonb_build_object('id',a.id,'professionalId',a.professional_id,'clientId',a.client_id,'revision',a.revision,'timezone',zone,'durationMinutes',duration,'service',jsonb_set(a.service_snapshot,'{durationMinutes}',to_jsonb(duration)),'token',md5(jsonb_build_array(a.id,a.revision,a.start_at,a.end_at,a.service_snapshot,zone)::text));
end $$;
create or replace function aesthenda_private.capture_calendar_change() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid:=nullif(current_setting('app.verified_actor_id',true),'')::uuid; before_data jsonb; label text;
begin
 if current_setting('app.calendar_undo',true)='yes' or actor is null or new.business_id is distinct from nullif(current_setting('app.business_account_id',true),'')::uuid then return new;end if;
 if not exists(select 1 from public.businesses where id=new.business_id and owner_user_id=actor) then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended(new.business_id::text,2));
 if tg_op='UPDATE' then before_data:=to_jsonb(old);end if;
 if tg_table_name='appointments' then
  if new.booking_source<>'professional_v1' then return new;end if;
  if tg_op='INSERT' and new.status in ('pending','confirmed') then label:='New appointment';
  elsif tg_op='UPDATE' and old.status in ('pending','confirmed') and new.status='cancelled' then label:='Cancel appointment';
  elsif tg_op='UPDATE' and old.status in ('pending','confirmed') and new.status=old.status and (new.start_at<>old.start_at or new.end_at<>old.end_at) then label:=case when new.start_at=old.start_at then 'Extend appointment' else 'Move appointment' end;
  elsif tg_op='UPDATE' and new.status is distinct from old.status then label:='Appointment status';
  else return new;end if;
 else
  if tg_op='INSERT' then label:='New blocked time';
  elsif new.removed_at is distinct from old.removed_at then label:='Remove blocked time';
  elsif new.reason is distinct from old.reason or new.start_at<>old.start_at or new.end_at<>old.end_at then label:='Edit blocked time';
  else return new;end if;
 end if;
 insert into aesthenda_private.calendar_changes(business_id,actor_id,entity_type,entity_id,before_state,after_state,label) values(new.business_id,actor,case when tg_table_name='appointments' then 'appointment' else 'block' end,new.id,before_data,to_jsonb(new),label);
 return new;
end $$;
create or replace function aesthenda_private.read_calendar_undo_v1(p_actor uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; change aesthenda_private.calendar_changes%rowtype;
begin
 bid:=aesthenda_private.appointment_context(p_actor);
 select * into change from aesthenda_private.calendar_changes where business_id=bid order by id desc limit 1;
 if not found or change.undone_at is not null or change.label='Appointment status' then return null;end if;
 return jsonb_build_object('id',change.id::text,'label',change.label);
end $$;
create or replace function aesthenda_private.undo_calendar_change_v1(p_actor uuid,p_change bigint) returns void language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; change aesthenda_private.calendar_changes%rowtype; apt public.appointments%rowtype; block public.calendar_blocks%rowtype; target jsonb; start_time timestamptz; end_time timestamptz; zone text; duration integer; hours jsonb;
begin
 bid:=aesthenda_private.appointment_context(p_actor);
 if p_change is null or p_change<1 then raise exception 'INVALID_INPUT';end if;
 perform pg_advisory_xact_lock(hashtextextended(bid::text,2));
 select * into change from aesthenda_private.calendar_changes where business_id=bid order by id desc limit 1 for update;
 if not found or change.id<>p_change then raise exception 'STALE_UNDO';end if;
 if change.undone_at is not null then return;end if;
 if change.actor_id<>p_actor then raise exception 'UNDO_UNAVAILABLE';end if;
 target:=change.before_state;
 -- This flag only suppresses inverse capture inside this transaction. Runtime
 -- has no direct DML and no public function accepts or propagates caller flags.
 perform set_config('app.calendar_undo','yes',true);
 if change.entity_type='appointment' then
  select * into apt from public.appointments where id=change.entity_id and business_id=bid for update;
  if not found or to_jsonb(apt)<>change.after_state then raise exception 'STALE_UNDO';end if;
  if apt.start_at<=statement_timestamp() or apt.booking_source<>'professional_v1' or apt.status not in ('pending','confirmed','cancelled') then raise exception 'UNDO_REQUIRES_REVIEW';end if;
  if target is null then
   if apt.status not in ('pending','confirmed') then raise exception 'UNDO_REQUIRES_REVIEW';end if;
   update public.appointments set status='cancelled',revision=revision+1,updated_at=now() where id=apt.id;
  else
   if target->>'status' not in ('pending','confirmed') or target->>'booking_source'<>'professional_v1' then raise exception 'UNDO_REQUIRES_REVIEW';end if;
   start_time:=(target->>'start_at')::timestamptz;end_time:=(target->>'end_at')::timestamptz;zone:=target->>'timezone';duration:=extract(epoch from end_time-start_time)::integer/60;
   select timezone into zone from aesthenda_private.weekly_schedules where business_id=bid;
   if zone is distinct from target->>'timezone' then raise exception 'TIMEZONE_REVIEW_REQUIRED';end if;
   if duration not between 1 and 1440 or end_time<>start_time+make_interval(mins=>duration) or (select count(*) from public.appointment_segments where appointment_id=apt.id)<>1 or not exists(select 1 from public.appointment_segments where appointment_id=apt.id and start_at=apt.start_at and end_at=apt.end_at) then raise exception 'UNDO_REQUIRES_REVIEW';end if;
   hours:=aesthenda_private.effective_date_hours_v1(p_actor,(start_time at time zone zone)::date);
   if not aesthenda_private.appointment_fits(bid,apt.professional_id,start_time,duration,hours,apt.id) then raise exception 'UNDO_CONFLICT';end if;
   if not exists(select 1 from public.clients where id=apt.client_id and status in ('active','lead')) then raise exception 'UNDO_REQUIRES_REVIEW';end if;
   update public.appointments set start_at=start_time,end_at=end_time,status=target->>'status',duration_override_minutes=(target->>'duration_override_minutes')::integer,revision=revision+1,updated_at=now() where id=apt.id;
   update public.appointment_segments set start_at=start_time,end_at=end_time where appointment_id=apt.id;
  end if;
 else
  select * into block from public.calendar_blocks where id=change.entity_id and business_id=bid for update;
  if not found or to_jsonb(block)<>change.after_state then raise exception 'STALE_UNDO';end if;
  if target is null then
   update public.calendar_blocks set removed_at=statement_timestamp(),revision=revision+1 where id=block.id;
  else
   start_time:=(target->>'start_at')::timestamptz;end_time:=(target->>'end_at')::timestamptz;
   if target->>'removed_at' is not null or end_time<=statement_timestamp() then raise exception 'UNDO_REQUIRES_REVIEW';end if;
   select timezone into zone from aesthenda_private.weekly_schedules where business_id=bid;
   if zone is distinct from target->>'timezone' then raise exception 'TIMEZONE_REVIEW_REQUIRED';end if;
   if exists(select 1 from public.appointments where business_id=bid and professional_id=block.professional_id and status in ('pending','confirmed') and start_at<end_time and end_at>start_time) or exists(select 1 from public.booking_holds where business_id=bid and professional_id=block.professional_id and status='active' and expires_at>statement_timestamp() and start_at<end_time and end_at>start_time) or exists(select 1 from public.calendar_blocks where business_id=bid and professional_id=block.professional_id and id<>block.id and removed_at is null and start_at<end_time and end_at>start_time) then raise exception 'UNDO_CONFLICT';end if;
   update public.calendar_blocks set start_at=start_time,end_at=end_time,reason=target->>'reason',timezone=target->>'timezone',removed_at=null,revision=revision+1 where id=block.id;
  end if;
 end if;
 update aesthenda_private.calendar_changes set undone_at=statement_timestamp() where id=change.id;
 perform set_config('app.calendar_undo','',true);
 insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata) values(bid,p_actor,case when change.entity_type='appointment' then 'Appointment' else 'CalendarBlock' end,change.entity_id,'undoCalendarChange',jsonb_build_object('action_version',1,'change_id',change.id,'undone_action',change.label,'financial_outcome','no_payment_processed'));
end $$;
-- Summary lookup is independent of history pagination: even a far-future visit
-- finds the actual next booking, not merely the first directory page.
create function aesthenda_private.read_appointment_neighbors_v1(p_actor uuid,p_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare current_appointment public.appointments%rowtype; previous_id uuid; next_id uuid; result jsonb:='{}'::jsonb;
begin
 perform aesthenda_private.appointment_context(p_actor);
 select * into current_appointment from public.appointments where id=p_id;
 if not found then raise exception 'APPOINTMENT_UNAVAILABLE';end if;
 select id into previous_id from public.appointments where client_id=current_appointment.client_id and id<>p_id
 and (start_at<statement_timestamp() or status in ('cancelled','completed','no_show')) order by start_at desc,id limit 1;
 select id into next_id from public.appointments where client_id=current_appointment.client_id and id<>p_id
 and start_at>current_appointment.start_at and start_at>=statement_timestamp() and status in ('pending','confirmed') order by start_at,id limit 1;
 if previous_id is not null then result:=result||jsonb_build_object('previous',aesthenda_private.read_appointments_v1(p_actor,null,previous_id)->'appointments'->0);end if;
 if next_id is not null then result:=result||jsonb_build_object('upcoming',aesthenda_private.read_appointments_v1(p_actor,null,next_id)->'appointments'->0);end if;
 return result;
end $$;
do $$ declare fn record;begin
 for fn in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='aesthenda_private' and p.proname in ('read_booking_preferences_v1','save_booking_preferences_v1','set_appointment_status_v1','read_client_appointments_v1','read_appointment_neighbors_v1') loop
 execute format('revoke all on function %s from public,anon,authenticated',fn.signature);
 if exists(select 1 from pg_roles where rolname='service_role') then execute format('revoke all on function %s from service_role',fn.signature);end if;
 execute format('grant execute on function %s to aesthenda_runtime',fn.signature);
 end loop;
end $$;
reset role;
revoke create on schema aesthenda_private from aesthenda_appointments_owner;
do $$ begin execute format('grant aesthenda_appointments_owner to %I with set false',current_user);end $$;
