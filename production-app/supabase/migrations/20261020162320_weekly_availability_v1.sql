-- Weekly wall-clock hours, scoped to the authenticated owner's professional.
-- Refuse ambiguous legacy hours rather than silently replacing them.
do $$ begin if exists(select 1 from public.availability_windows) then raise exception 'LEGACY_AVAILABILITY_REQUIRES_REVIEW'; end if; end $$;
create role aesthenda_availability_owner nologin nosuperuser nobypassrls nocreatedb nocreaterole;
do $$ begin
 execute format('grant aesthenda_availability_owner to %I with inherit false',current_user);
 execute format('grant aesthenda_availability_owner to %I with set true',current_user);
end $$;
grant usage,create on schema aesthenda_private to aesthenda_availability_owner;
grant usage on schema public to aesthenda_availability_owner;
alter table public.professionals add constraint professionals_business_identity unique(business_id,id);
alter table public.availability_windows add constraint availability_professional_business foreign key(business_id,professional_id) references public.professionals(business_id,id);
alter table public.availability_windows add constraint availability_positive_local_range check(start_time<end_time);
create index availability_business_day on public.availability_windows(business_id,day_of_week,start_time);
create table aesthenda_private.weekly_schedules(
 business_id uuid primary key references public.businesses(id) on delete cascade,
 timezone text not null,
 revision integer not null check(revision>0),
 updated_at timestamptz not null default now()
);
create table aesthenda_private.availability_requests(
 business_id uuid not null references public.businesses(id) on delete cascade,
 request_key uuid not null,
 fingerprint text not null,
 primary key(business_id,request_key)
);
alter table aesthenda_private.weekly_schedules enable row level security;
alter table aesthenda_private.weekly_schedules force row level security;
alter table aesthenda_private.availability_requests enable row level security;
alter table aesthenda_private.availability_requests force row level security;
revoke all on aesthenda_private.weekly_schedules,aesthenda_private.availability_requests from public,anon,authenticated,aesthenda_runtime;
grant select on public.businesses,public.professionals,public.appointments to aesthenda_availability_owner;
grant select,insert,update on aesthenda_private.weekly_schedules to aesthenda_availability_owner;
grant select,insert on aesthenda_private.availability_requests to aesthenda_availability_owner;
grant select,insert,delete on public.availability_windows to aesthenda_availability_owner;
grant insert on public.audit_events to aesthenda_availability_owner;
create policy availability_business_scope on public.businesses for select to aesthenda_availability_owner
 using(owner_user_id=(select nullif(current_setting('app.verified_actor_id',true),'')::uuid));
create policy availability_professional_scope on public.professionals for select to aesthenda_availability_owner
 using(user_id=(select nullif(current_setting('app.verified_actor_id',true),'')::uuid) and business_id=(select nullif(current_setting('app.business_account_id',true),'')::uuid));
create policy availability_appointment_scope on public.appointments for select to aesthenda_availability_owner
 using(business_id=(select nullif(current_setting('app.business_account_id',true),'')::uuid));
create policy availability_window_scope on public.availability_windows to aesthenda_availability_owner
 using(business_id=(select nullif(current_setting('app.business_account_id',true),'')::uuid))
 with check(business_id=(select nullif(current_setting('app.business_account_id',true),'')::uuid));
create policy weekly_schedule_scope on aesthenda_private.weekly_schedules to aesthenda_availability_owner
 using(business_id=(select nullif(current_setting('app.business_account_id',true),'')::uuid))
 with check(business_id=(select nullif(current_setting('app.business_account_id',true),'')::uuid));
create policy availability_request_scope on aesthenda_private.availability_requests to aesthenda_availability_owner
 using(business_id=(select nullif(current_setting('app.business_account_id',true),'')::uuid))
 with check(business_id=(select nullif(current_setting('app.business_account_id',true),'')::uuid));
create policy availability_audit_insert on public.audit_events for insert to aesthenda_availability_owner
 with check(actor_id=(select nullif(current_setting('app.verified_actor_id',true),'')::uuid) and business_id=(select nullif(current_setting('app.business_account_id',true),'')::uuid));
create function aesthenda_private.availability_context(p_actor uuid) returns uuid
language plpgsql security invoker set search_path=pg_catalog as $$
declare bid uuid;
begin
 if p_actor is null then raise exception 'UNAUTHENTICATED'; end if;
 perform set_config('app.verified_actor_id',p_actor::text,true);
 perform set_config('app.business_account_id','',true);
 select id into bid from public.businesses where owner_user_id=p_actor and status in ('trial','active');
 if bid is null then raise exception 'BUSINESS_UNAVAILABLE'; end if;
 perform set_config('app.business_account_id',bid::text,true);
 return bid;
end $$;
create function aesthenda_private.read_availability_v1(p_actor uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; settings aesthenda_private.weekly_schedules%rowtype; windows jsonb;
begin
 bid:=aesthenda_private.availability_context(p_actor);
 select * into settings from aesthenda_private.weekly_schedules where business_id=bid;
 select coalesce(jsonb_agg(jsonb_build_object('day',day_of_week,'startMinute',(extract(epoch from start_time)/60)::integer,'endMinute',(extract(epoch from end_time)/60)::integer) order by day_of_week,start_time),'[]'::jsonb) into windows from public.availability_windows where business_id=bid and is_active;
 return jsonb_build_object('revision',coalesce(settings.revision,0),'timezone',settings.timezone,'windows',windows);
end $$;
create function aesthenda_private.save_availability_v1(p_actor uuid,p_key uuid,p_revision integer,p_timezone text,p_windows jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; pid uuid; settings aesthenda_private.weekly_schedules%rowtype; prior text; fingerprint text; canonical jsonb; prior_windows jsonb; w record;
begin
 bid:=aesthenda_private.availability_context(p_actor);
 if p_key is null or p_revision is null or p_revision<0 or p_timezone is null or length(p_timezone)>100 or not (p_timezone='UTC' or (position('/' in p_timezone)>0 and p_timezone not like 'posix/%' and p_timezone not like 'right/%')) or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then raise exception 'INVALID_INPUT'; end if;
 if p_windows is null or jsonb_typeof(p_windows)<>'array' then raise exception 'INVALID_INPUT'; end if;
 if jsonb_array_length(p_windows)>56 then raise exception 'INVALID_INPUT'; end if;
 for w in select value as v from jsonb_array_elements(p_windows) loop
  if jsonb_typeof(w.v)<>'object' or jsonb_typeof(w.v->'day') is distinct from 'number' or jsonb_typeof(w.v->'startMinute') is distinct from 'number' or jsonb_typeof(w.v->'endMinute') is distinct from 'number'
   or (w.v->>'day')!~'^[0-6]$' or (w.v->>'startMinute')!~'^[0-9]{1,4}$' or (w.v->>'endMinute')!~'^[0-9]{1,4}$' then raise exception 'INVALID_INPUT'; end if;
  if (w.v->>'startMinute')::integer not between 0 and 1439 or (w.v->>'endMinute')::integer not between 1 and 1440 or (w.v->>'startMinute')::integer >= (w.v->>'endMinute')::integer then raise exception 'INVALID_INPUT'; end if;
 end loop;
 if exists(select 1 from (select (value->>'day')::integer d,(value->>'startMinute')::integer s,lag((value->>'endMinute')::integer) over(partition by (value->>'day')::integer order by (value->>'startMinute')::integer) previous_end from jsonb_array_elements(p_windows)) x where previous_end>s) then raise exception 'OVERLAPPING_HOURS'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('day',(value->>'day')::integer,'startMinute',(value->>'startMinute')::integer,'endMinute',(value->>'endMinute')::integer) order by (value->>'day')::integer,(value->>'startMinute')::integer),'[]'::jsonb) into canonical from jsonb_array_elements(p_windows);
 fingerprint:=md5(jsonb_build_array(p_revision,p_timezone,canonical)::text);
 perform pg_advisory_xact_lock(hashtextextended(bid::text,2));
 select r.fingerprint into prior from aesthenda_private.availability_requests r where business_id=bid and request_key=p_key;
 if found then
  if prior<>fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return aesthenda_private.read_availability_v1(p_actor);
 end if;
 select * into settings from aesthenda_private.weekly_schedules where business_id=bid;
 if coalesce(settings.revision,0)<>p_revision then raise exception 'STALE_SCHEDULE'; end if;
 -- A future booking-aware review flow must precede timezone changes with appointments.
 if settings.timezone is distinct from p_timezone and exists(select 1 from public.appointments where business_id=bid and end_at>now()) then raise exception 'TIMEZONE_REVIEW_REQUIRED'; end if;
 select id into pid from public.professionals where business_id=bid and user_id=p_actor;
 if pid is null then raise exception 'PROFESSIONAL_UNAVAILABLE'; end if;
 insert into aesthenda_private.weekly_schedules(business_id,timezone,revision) values(bid,p_timezone,1)
 on conflict(business_id) do update set timezone=excluded.timezone,revision=weekly_schedules.revision+1,updated_at=now();
 prior_windows:=(aesthenda_private.read_availability_v1(p_actor)->'windows');
 delete from public.availability_windows where business_id=bid;
 for w in select (value->>'day')::integer d,(value->>'startMinute')::integer s,(value->>'endMinute')::integer e from jsonb_array_elements(canonical) loop
  insert into public.availability_windows(business_id,professional_id,day_of_week,start_time,end_time,timezone,is_active)
  values(bid,pid,w.d,('00:00'::time + make_interval(mins=>w.s)),case when w.e=1440 then '24:00'::time else ('00:00'::time + make_interval(mins=>w.e)) end,p_timezone,true);
 end loop;
 insert into aesthenda_private.availability_requests(business_id,request_key,fingerprint) values(bid,p_key,fingerprint);
 insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata)
 values(bid,p_actor,'ProfessionalAvailability',pid,'saveWeeklyAvailability',jsonb_build_object('action_version',1,'request_key',p_key,'prior_revision',p_revision,'new_revision',p_revision+1,'prior_timezone',settings.timezone,'timezone',p_timezone,'prior_windows', prior_windows,'windows',canonical,'source','professional'));
 return aesthenda_private.read_availability_v1(p_actor);
end $$;
alter function aesthenda_private.availability_context(uuid) owner to aesthenda_availability_owner;
alter function aesthenda_private.read_availability_v1(uuid) owner to aesthenda_availability_owner;
alter function aesthenda_private.save_availability_v1(uuid,uuid,integer,text,jsonb) owner to aesthenda_availability_owner;
set local role aesthenda_availability_owner;
revoke all on function aesthenda_private.availability_context(uuid),aesthenda_private.read_availability_v1(uuid),aesthenda_private.save_availability_v1(uuid,uuid,integer,text,jsonb) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then execute 'revoke all on function aesthenda_private.availability_context(uuid),aesthenda_private.read_availability_v1(uuid),aesthenda_private.save_availability_v1(uuid,uuid,integer,text,jsonb) from service_role'; end if; end $$;
grant execute on function aesthenda_private.read_availability_v1(uuid),aesthenda_private.save_availability_v1(uuid,uuid,integer,text,jsonb) to aesthenda_runtime;
reset role;
revoke create on schema aesthenda_private from aesthenda_availability_owner;
do $$ begin execute format('grant aesthenda_availability_owner to %I with set false',current_user); end $$;
