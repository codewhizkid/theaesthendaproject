-- Additive timing versions. Existing appointments retain continuous occupancy.
alter table public.services add column revision integer not null default 1 check(revision>0);
alter table public.services add column timing_configured boolean not null default false;
alter table public.service_segments add column definition_revision integer not null default 1;
alter table public.service_segments add column kind text not null default 'active' check(kind in ('active','processing'));
create index service_timing_version on public.service_segments(service_id,definition_revision,start_offset_minutes);
alter table public.appointments add column timing_plan jsonb check(timing_plan is null or jsonb_typeof(timing_plan)='array');
-- Never infer release from a label, current catalogue or an unverified old layout.
update public.appointments a set timing_plan=(select jsonb_build_array(jsonb_build_object('serviceSegmentId',s.service_segment_id,'label',coalesce(a.service_snapshot->>'name','Service'),'kind','active','occupied',true,'startOffset',0,'durationMinutes',extract(epoch from a.end_at-a.start_at)::integer/60)) from public.appointment_segments s where s.appointment_id=a.id and s.start_at=a.start_at and s.end_at=a.end_at)
where a.booking_source='professional_v1' and (select count(*) from public.appointment_segments where appointment_id=a.id)=1;
alter table aesthenda_private.booking_preferences add column processing_enabled boolean not null default false;
alter table aesthenda_private.booking_preferences add column max_concurrent_clients integer not null default 2 check(max_concurrent_clients between 2 and 10);
create table aesthenda_private.service_timing_requests(
 business_id uuid not null references public.businesses(id),request_key uuid not null,fingerprint text not null,
 service_id uuid not null references public.services(id),primary key(business_id,request_key)
);
alter table aesthenda_private.service_timing_requests enable row level security;
alter table aesthenda_private.service_timing_requests force row level security;
revoke all on aesthenda_private.service_timing_requests from public,anon,authenticated,aesthenda_runtime;
grant select,insert on aesthenda_private.service_timing_requests to aesthenda_services_owner;
create policy service_timing_scope on aesthenda_private.service_timing_requests to aesthenda_services_owner using(business_id=(select nullif(current_setting('app.business_account_id',true),'')::uuid)) with check(business_id=(select nullif(current_setting('app.business_account_id',true),'')::uuid));
grant update(name,description,duration_minutes,price,price_cents,revision,timing_configured,updated_at) on public.services to aesthenda_services_owner;
grant update(timing_plan) on public.appointments to aesthenda_appointments_owner;
do $$ begin execute format('grant aesthenda_services_owner to %I with set true',current_user);execute format('grant aesthenda_appointments_owner to %I with set true',current_user);end $$;
grant create on schema aesthenda_private to aesthenda_services_owner,aesthenda_appointments_owner;
set local role aesthenda_services_owner;
create function aesthenda_private.normalize_service_steps(p_steps jsonb) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare step jsonb; result jsonb:='[]'; offset_minutes integer:=0; duration integer;
begin
 if p_steps is null or jsonb_typeof(p_steps)<>'array' or jsonb_array_length(p_steps) not between 1 and 20 then raise exception 'INVALID_STEPS';end if;
 for step in select value from jsonb_array_elements(p_steps) loop
  if jsonb_typeof(step)<>'object' or (select count(*) from jsonb_object_keys(step))<>4 or not(step ?& array['label','kind','durationMinutes','released'])
   or jsonb_typeof(step->'label') is distinct from 'string' or length(btrim(step->>'label')) not between 1 and 80
   or step->>'kind' not in ('active','processing') or jsonb_typeof(step->'kind') is distinct from 'string'
   or jsonb_typeof(step->'durationMinutes') is distinct from 'number' or (step->>'durationMinutes') !~ '^[0-9]{1,4}$'
   or jsonb_typeof(step->'released') is distinct from 'boolean' then raise exception 'INVALID_STEPS';end if;
  duration:=(step->>'durationMinutes')::integer;
  if duration not between 1 and 1440 or offset_minutes+duration>1440 or (step->>'kind'='active' and (step->>'released')::boolean) then raise exception 'INVALID_STEPS';end if;
  result:=result||jsonb_build_array(jsonb_build_object('label',btrim(step->>'label'),'kind',step->>'kind','durationMinutes',duration,'occupied',not (step->>'released')::boolean,'startOffset',offset_minutes));offset_minutes:=offset_minutes+duration;
 end loop;
 return result;
end $$;
create function aesthenda_private.save_service_v2(p_actor uuid,p_key uuid,p_id uuid,p_revision integer,p_name text,p_description text,p_cents bigint,p_steps jsonb) returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; sid uuid; prior public.services%rowtype; replay aesthenda_private.service_timing_requests%rowtype; plan jsonb; step jsonb; total integer; version integer; fingerprint text;
begin
 bid:=aesthenda_private.service_context(p_actor);plan:=aesthenda_private.normalize_service_steps(p_steps);
 if p_key is null or p_revision is null or p_revision<0 or (p_id is null and p_revision<>0) or (p_id is not null and p_revision<1) or p_name is null or length(btrim(p_name)) not between 1 and 160 or p_description is null or length(p_description)>2000 or p_cents is null or p_cents not between 0 and 99999999 then raise exception 'INVALID_INPUT';end if;
 fingerprint:=md5(jsonb_build_array(p_id,p_revision,btrim(p_name),btrim(p_description),p_cents,plan)::text);
 perform pg_advisory_xact_lock(hashtextextended(bid::text,2));
 select * into replay from aesthenda_private.service_timing_requests where business_id=bid and request_key=p_key;
 if found then if replay.fingerprint<>fingerprint then raise exception 'IDEMPOTENCY_CONFLICT';end if;return replay.service_id;end if;
 select sum((value->>'durationMinutes')::integer) into total from jsonb_array_elements(plan);
 if p_id is null then
  insert into public.services(business_id,name,description,duration_minutes,price,price_cents,currency,catalog_status,is_active,is_public,create_request_key,timing_configured)
  values(bid,btrim(p_name),btrim(p_description),total,p_cents::numeric/100,p_cents,'USD','draft',false,false,p_key,true) returning id,revision into sid,version;
 else
  select * into prior from public.services where id=p_id for update;
  if not found or prior.catalog_status<>'draft' then raise exception 'SERVICE_UNAVAILABLE';end if;
  if prior.revision<>p_revision then raise exception 'STALE_SERVICE';end if;
  update public.services set name=btrim(p_name),description=btrim(p_description),duration_minutes=total,price=p_cents::numeric/100,price_cents=p_cents,revision=revision+1,timing_configured=true,updated_at=now() where id=p_id returning id,revision into sid,version;
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
 return (select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'description',s.description,'durationMinutes',s.duration_minutes,'priceCents',s.price_cents,'currency',s.currency,'status',s.catalog_status,'revision',s.revision,'steps',(select coalesce(jsonb_agg(jsonb_build_object('label',g.label,'kind',g.kind,'durationMinutes',g.duration_minutes,'released',g.kind='processing' and not g.occupied_by_professional) order by g.start_offset_minutes,g.id),'[]'::jsonb) from public.service_segments g where g.service_id=s.id and g.definition_revision=s.revision)) order by s.created_at,s.id),'[]'::jsonb) from public.services s where p_id is null or s.id=p_id);
end $$;
revoke all on function aesthenda_private.normalize_service_steps(jsonb),aesthenda_private.save_service_v2(uuid,uuid,uuid,integer,text,text,bigint,jsonb) from public,anon,authenticated;
grant execute on function aesthenda_private.save_service_v2(uuid,uuid,uuid,integer,text,text,bigint,jsonb) to aesthenda_runtime;
reset role;
set local role aesthenda_appointments_owner;
create function aesthenda_private.plan_duration(p_plan jsonb) returns integer language sql immutable security invoker set search_path=pg_catalog as $$
 select sum((value->>'durationMinutes')::integer)::integer from jsonb_array_elements(p_plan)
$$;
create function aesthenda_private.legacy_timing_plan(p_snapshot jsonb,p_duration integer) returns jsonb language sql immutable security invoker set search_path=pg_catalog as $$
 select jsonb_build_array(jsonb_build_object('serviceSegmentId',p_snapshot->>'segmentId','label',coalesce(p_snapshot->>'name','Service'),'kind','active','occupied',true,'startOffset',0,'durationMinutes',p_duration))
$$;
create function aesthenda_private.effective_timing_plan(p_id uuid) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare a public.appointments%rowtype;
begin
 select * into a from public.appointments where id=p_id;
 if not found then raise exception 'APPOINTMENT_UNAVAILABLE';end if;
 return coalesce(a.timing_plan,aesthenda_private.legacy_timing_plan(a.service_snapshot,extract(epoch from a.end_at-a.start_at)::integer/60));
end $$;
create function aesthenda_private.timing_matches(p_id uuid,p_plan jsonb) returns boolean language sql security invoker set search_path=pg_catalog as $$
 select (select count(*) from public.appointment_segments where appointment_id=p_id)=jsonb_array_length(p_plan)
 and not exists(select 1 from public.appointments a cross join jsonb_array_elements(p_plan) s where a.id=p_id and not exists(select 1 from public.appointment_segments g where g.appointment_id=a.id and g.service_segment_id=(s->>'serviceSegmentId')::uuid and g.start_at=a.start_at+make_interval(mins=>(s->>'startOffset')::integer) and g.end_at=a.start_at+make_interval(mins=>(s->>'startOffset')::integer+(s->>'durationMinutes')::integer)))
$$;
create function aesthenda_private.sync_timing_segments(p_id uuid) returns void language plpgsql security invoker set search_path=pg_catalog as $$
declare a public.appointments%rowtype; step jsonb; count_before integer;
begin
 select * into a from public.appointments where id=p_id;
 if a.timing_plan is null then raise exception 'APPOINTMENT_REQUIRES_REVIEW';end if;
 select count(*) into count_before from public.appointment_segments where appointment_id=p_id;
 if count_before<>0 and count_before<>jsonb_array_length(a.timing_plan) then raise exception 'APPOINTMENT_REQUIRES_REVIEW';end if;
 for step in select value from jsonb_array_elements(a.timing_plan) loop
  if not exists(select 1 from public.service_segments where id=(step->>'serviceSegmentId')::uuid and service_id=a.service_id) then raise exception 'APPOINTMENT_REQUIRES_REVIEW';end if;
  update public.appointment_segments set start_at=a.start_at+make_interval(mins=>(step->>'startOffset')::integer),end_at=a.start_at+make_interval(mins=>(step->>'startOffset')::integer+(step->>'durationMinutes')::integer) where appointment_id=p_id and service_segment_id=(step->>'serviceSegmentId')::uuid;
  if not found then
   if count_before<>0 then raise exception 'APPOINTMENT_REQUIRES_REVIEW';end if;
   insert into public.appointment_segments(appointment_id,service_segment_id,start_at,end_at) values(p_id,(step->>'serviceSegmentId')::uuid,a.start_at+make_interval(mins=>(step->>'startOffset')::integer),a.start_at+make_interval(mins=>(step->>'startOffset')::integer+(step->>'durationMinutes')::integer));
  end if;
 end loop;
 if not aesthenda_private.timing_matches(p_id,a.timing_plan) then raise exception 'APPOINTMENT_REQUIRES_REVIEW';end if;
end $$;
create or replace function aesthenda_private.civil_visit_fits(p_start timestamptz,p_duration integer,p_hours jsonb) returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
declare zone text:=p_hours->>'timezone'; local_start timestamp; local_end timestamp; finish timestamptz; sm integer; em integer; candidates integer;
begin
 if zone is null or p_start<=statement_timestamp() or date_trunc('minute',p_start)<>p_start then return false; end if;
 local_start:=p_start at time zone zone;finish:=p_start+make_interval(mins=>p_duration);local_end:=finish at time zone zone;
 if local_start::date<'2000-01-01'::date or local_start::date>'2100-12-31'::date or local_end<>local_start+make_interval(mins=>p_duration) or local_end>local_start::date+interval '1 day' then return false; end if;
 -- Determine every relevant UTC offset around the local date, then round-trip.
 select count(*) into candidates from (select distinct local_start-(timezone(zone,x)-timezone('UTC',x)) as utc_time from generate_series(p_start-interval '36 hours',p_start+interval '36 hours',interval '6 hours') x) q where timezone(zone,q.utc_time at time zone 'UTC')=local_start;
 if candidates<>1 then return false; end if;
 sm:=extract(hour from local_start)::integer*60+extract(minute from local_start)::integer;
 em:=sm+p_duration;
 if not exists(select 1 from jsonb_array_elements(p_hours->'windows') w where sm>=(w->>'startMinute')::integer and em<=(w->>'endMinute')::integer) then return false; end if;
 return true;
end $$;
create function aesthenda_private.plan_fits(p_bid uuid,p_pid uuid,p_client uuid,p_start timestamptz,p_plan jsonb,p_hours jsonb,p_ignore uuid) returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
declare duration integer:=aesthenda_private.plan_duration(p_plan); finish timestamptz; overlap_enabled boolean; client_limit integer; a public.appointments%rowtype; existing_plan jsonb; candidate jsonb; existing jsonb; boundary timestamptz;
begin
 finish:=p_start+make_interval(mins=>duration);
 -- Reuse the established civil-time, complete-visit working-hours and DST rules.
 if not aesthenda_private.civil_visit_fits(p_start,duration,p_hours) then return false;end if;
 select processing_enabled,max_concurrent_clients into overlap_enabled,client_limit from aesthenda_private.booking_preferences where business_id=p_bid;
 overlap_enabled:=coalesce(overlap_enabled,false);client_limit:=coalesce(client_limit,2);
 -- Existing blocks and unsnapshotted holds remain conservative full-visit reservations.
 if exists(select 1 from public.calendar_blocks where business_id=p_bid and professional_id=p_pid and removed_at is null and start_at<finish and end_at>p_start) then return false;end if;
 if exists(select 1 from public.booking_holds where business_id=p_bid and professional_id=p_pid and status='active' and expires_at>statement_timestamp() and start_at<finish and end_at>p_start) then return false;end if;
 for a in select * from public.appointments where business_id=p_bid and professional_id=p_pid and (p_ignore is null or id<>p_ignore) and status in ('pending','confirmed') and start_at<finish and end_at>p_start loop
  if not overlap_enabled or (p_client is not null and a.client_id=p_client) then return false;end if;
  existing_plan:=case when a.timing_plan is not null and aesthenda_private.timing_matches(a.id,a.timing_plan) then a.timing_plan else aesthenda_private.legacy_timing_plan(a.service_snapshot,extract(epoch from a.end_at-a.start_at)::integer/60) end;
  for candidate in select value from jsonb_array_elements(p_plan) where (value->>'occupied')::boolean loop
   for existing in select value from jsonb_array_elements(existing_plan) where (value->>'occupied')::boolean loop
    if p_start+make_interval(mins=>(candidate->>'startOffset')::integer)<a.start_at+make_interval(mins=>(existing->>'startOffset')::integer+(existing->>'durationMinutes')::integer)
     and a.start_at+make_interval(mins=>(existing->>'startOffset')::integer)<p_start+make_interval(mins=>(candidate->>'startOffset')::integer+(candidate->>'durationMinutes')::integer) then return false;end if;
   end loop;
  end loop;
 end loop;
 -- Count full client visits at half-open interval boundaries, including released time.
 for boundary in select p_start union select greatest(p_start,start_at) from public.appointments where business_id=p_bid and professional_id=p_pid and (p_ignore is null or id<>p_ignore) and status in ('pending','confirmed') and start_at<finish and end_at>p_start loop
  if (select count(*) from public.appointments where business_id=p_bid and professional_id=p_pid and (p_ignore is null or id<>p_ignore) and status in ('pending','confirmed') and start_at<=boundary and end_at>boundary)+1>client_limit then return false;end if;
 end loop;
 return true;
end $$;

create or replace function aesthenda_private.appointment_fits(p_bid uuid,p_pid uuid,p_start timestamptz,p_duration integer,p_hours jsonb,p_ignore uuid) returns boolean language sql security invoker set search_path=pg_catalog as $$
 select aesthenda_private.plan_fits(p_bid,p_pid,null,p_start,aesthenda_private.legacy_timing_plan('{}',p_duration),p_hours,p_ignore)
$$;
create or replace function aesthenda_private.appointment_service(p_id uuid) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare s public.services%rowtype; plan jsonb; result jsonb; expected integer:=0; step jsonb;
begin
 select * into s from public.services where id=p_id;
 if not found or s.catalog_status<>'draft' then raise exception 'SERVICE_UNAVAILABLE';end if;
 select jsonb_agg(jsonb_build_object('serviceSegmentId',id,'label',label,'kind',kind,'occupied',occupied_by_professional,'startOffset',start_offset_minutes,'durationMinutes',duration_minutes) order by start_offset_minutes,id) into plan from public.service_segments where service_id=p_id and definition_revision=s.revision;
 if plan is null or (not s.timing_configured and (jsonb_array_length(plan)<>1 or not (plan->0->>'occupied')::boolean)) then raise exception 'SERVICE_REQUIRES_REVIEW';end if;
 for step in select value from jsonb_array_elements(plan) loop
  if (step->>'startOffset')::integer<>expected or (step->>'durationMinutes')::integer<1 or (step->>'kind'<>'processing' and not (step->>'occupied')::boolean) then raise exception 'SERVICE_REQUIRES_REVIEW';end if;
  expected:=expected+(step->>'durationMinutes')::integer;
 end loop;
 if expected<>s.duration_minutes then raise exception 'SERVICE_REQUIRES_REVIEW';end if;
 result:=jsonb_build_object('id',s.id,'name',s.name,'durationMinutes',s.duration_minutes,'priceCents',s.price_cents,'currency',s.currency,'policyVersion',s.policy_version,'segmentId',plan->0->>'serviceSegmentId','plan',plan,'serviceRevision',s.revision);
 return result||jsonb_build_object('token',md5(jsonb_build_array(result,s.updated_at)::text));
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
 if not aesthenda_private.plan_fits(bid,pid,p_client,p_start,service->'plan',hours,null) then raise exception 'SLOT_UNAVAILABLE'; end if;
 select case when auto_confirm then 'confirmed' else 'pending' end into initial_status from aesthenda_private.booking_preferences where business_id=bid;
 initial_status:=coalesce(initial_status,'pending');
 insert into public.appointments(business_id,professional_id,client_id,service_id,start_at,end_at,status,policy_version,service_snapshot,created_by,booking_source,timezone,timing_plan)
 values(bid,pid,p_client,p_service,p_start,p_start+make_interval(mins=>duration),initial_status,service->>'policyVersion',(service-'token')||jsonb_build_object('timezone',zone,'localStart',timezone(zone,p_start),'localEnd',timezone(zone,p_start+make_interval(mins=>duration)),'bufferBefore',0,'bufferAfter',0),p_actor,'professional_v1',zone,service->'plan') returning id into cid;
 perform aesthenda_private.sync_timing_segments(cid);
 insert into aesthenda_private.appointment_requests values(bid,p_key,fingerprint,cid);
 insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata) values(bid,p_actor,'Appointment',cid,'createAppointment',jsonb_build_object('action_version',1,'request_key',p_key,'source','professional','status',initial_status,'start_at',p_start,'duration_minutes',duration,'timezone',zone,'service_id',p_service));
 return cid;
end $$;
create or replace function aesthenda_private.appointment_slots_v2(p_actor uuid,p_service uuid,p_date date,p_client uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; pid uuid; service jsonb; hours jsonb; zone text; result jsonb;
begin
 bid:=aesthenda_private.appointment_context(p_actor);
 if p_date is null or p_date<'2000-01-01'::date or p_date>'2100-12-31'::date then raise exception 'INVALID_INPUT'; end if;
 select id into pid from public.professionals where business_id=bid and user_id=p_actor;
 if pid is null then raise exception 'PROFESSIONAL_UNAVAILABLE'; end if;
 if p_client is not null and not exists(select 1 from public.clients where id=p_client and status in ('active','lead')) then raise exception 'CLIENT_UNAVAILABLE';end if;
 service:=aesthenda_private.appointment_service(p_service);
 hours:=aesthenda_private.effective_date_hours_v1(p_actor,p_date);zone:=hours->>'timezone';
 if zone is null then raise exception 'SAVE_WEEKLY_HOURS_FIRST'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('startAt',x,'minute',extract(hour from timezone(zone,x))::integer*60+extract(minute from timezone(zone,x))::integer) order by x),'[]'::jsonb) into result
 from generate_series(p_date::timestamp at time zone zone,((p_date+1)::timestamp at time zone zone)-interval '1 minute',interval '1 minute') x
 where timezone(zone,x)::date=p_date and aesthenda_private.plan_fits(bid,pid,p_client,x,service->'plan',hours,null);
 service:=jsonb_set(service,'{token}',to_jsonb(md5((service->>'token')||zone)));
 return jsonb_build_object('timezone',zone,'service',service,'slots',result);
end $$;
create or replace function aesthenda_private.appointment_slots_v1(p_actor uuid,p_service uuid,p_date date) returns jsonb language sql security definer set search_path=pg_catalog as $$
 select aesthenda_private.appointment_slots_v2(p_actor,p_service,p_date,null)
$$;
create or replace function aesthenda_private.appointment_move_state(p_actor uuid,p_id uuid) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare bid uuid; a public.appointments%rowtype; zone text; duration integer; plan jsonb;
begin
 bid:=aesthenda_private.appointment_context(p_actor);
 select * into a from public.appointments where id=p_id;
 if not found then raise exception 'APPOINTMENT_UNAVAILABLE';end if;
 if a.booking_source<>'professional_v1' or a.status not in ('pending','confirmed') then raise exception 'APPOINTMENT_REQUIRES_REVIEW';end if;
 select timezone into zone from aesthenda_private.weekly_schedules where business_id=bid;
 if zone is null or zone is distinct from a.timezone then raise exception 'TIMEZONE_REVIEW_REQUIRED';end if;
 duration:=extract(epoch from (a.end_at-a.start_at))::integer/60;
 plan:=aesthenda_private.effective_timing_plan(p_id);
 if duration not between 1 and 1440 or a.end_at<>a.start_at+make_interval(mins=>duration) or aesthenda_private.plan_duration(plan)<>duration or not aesthenda_private.timing_matches(p_id,plan) then raise exception 'APPOINTMENT_REQUIRES_REVIEW';end if;
 if not exists(select 1 from public.clients where id=a.client_id and status in ('active','lead')) then raise exception 'CLIENT_UNAVAILABLE';end if;
 return jsonb_build_object('id',a.id,'professionalId',a.professional_id,'clientId',a.client_id,'revision',a.revision,'timezone',zone,'durationMinutes',duration,'service',jsonb_set(a.service_snapshot,'{durationMinutes}',to_jsonb(duration))||jsonb_build_object('plan',plan),'token',md5(jsonb_build_array(a.id,a.revision,a.start_at,a.end_at,a.service_snapshot,zone,plan)::text));
end $$;
create or replace function aesthenda_private.reschedule_slots_v1(p_actor uuid,p_id uuid,p_date date) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; state jsonb; hours jsonb; zone text; result jsonb;
begin
 bid:=aesthenda_private.appointment_context(p_actor);state:=aesthenda_private.appointment_move_state(p_actor,p_id);zone:=state->>'timezone';
 if p_date is null or p_date<'2000-01-01'::date or p_date>'2100-12-31'::date then raise exception 'INVALID_INPUT';end if;
 hours:=aesthenda_private.effective_date_hours_v1(p_actor,p_date);
 select coalesce(jsonb_agg(jsonb_build_object('startAt',x,'minute',extract(hour from timezone(zone,x))::integer*60+extract(minute from timezone(zone,x))::integer) order by x),'[]'::jsonb) into result
 from generate_series(p_date::timestamp at time zone zone,((p_date+1)::timestamp at time zone zone)-interval '1 minute',interval '1 minute') x
 where timezone(zone,x)::date=p_date and aesthenda_private.plan_fits(bid,(state->>'professionalId')::uuid,(state->>'clientId')::uuid,x,state->'service'->'plan',hours,p_id);
 return jsonb_build_object('timezone',zone,'revision',state->'revision','moveToken',state->'token','service',state->'service','slots',result);
end $$;
create or replace function aesthenda_private.reschedule_appointment_v1(p_actor uuid,p_key uuid,p_id uuid,p_revision integer,p_start timestamptz,p_token text) returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; state jsonb; prior public.appointments%rowtype; replay aesthenda_private.appointment_requests%rowtype; fingerprint text; hours jsonb; finish timestamptz;
begin
 bid:=aesthenda_private.appointment_context(p_actor);
 if p_key is null or p_id is null or p_revision is null or p_revision<1 or p_start is null or not isfinite(p_start) or p_token is null or p_token !~ '^[0-9a-f]{32}$' then raise exception 'INVALID_INPUT';end if;
 fingerprint:=md5(jsonb_build_array('reschedule',p_id,p_revision,extract(epoch from p_start),p_token)::text);
 perform pg_advisory_xact_lock(hashtextextended(bid::text,2));
 select * into replay from aesthenda_private.appointment_requests where business_id=bid and request_key=p_key;
 if found then if replay.fingerprint<>fingerprint then raise exception 'IDEMPOTENCY_CONFLICT';end if;return replay.appointment_id;end if;
 select * into prior from public.appointments where id=p_id for update;
 if not found then raise exception 'APPOINTMENT_UNAVAILABLE';end if;
 if prior.revision<>p_revision then raise exception 'STALE_APPOINTMENT';end if;
 perform 1 from public.clients where id=prior.client_id for share;
 state:=aesthenda_private.appointment_move_state(p_actor,p_id);
 if state->>'token'<>p_token then raise exception 'STALE_APPOINTMENT';end if;
 hours:=aesthenda_private.effective_date_hours_v1(p_actor,(p_start at time zone (state->>'timezone'))::date);
 if not aesthenda_private.plan_fits(bid,prior.professional_id,prior.client_id,p_start,state->'service'->'plan',hours,p_id) then raise exception 'SLOT_UNAVAILABLE';end if;
 finish:=p_start+make_interval(mins=>(state->>'durationMinutes')::integer);
 if prior.start_at<>p_start then
  update public.appointments set start_at=p_start,end_at=finish,timing_plan=state->'service'->'plan',revision=revision+1,updated_at=now() where id=p_id;
  perform aesthenda_private.sync_timing_segments(p_id);
  insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata) values(bid,p_actor,'Appointment',p_id,'rescheduleAppointment',jsonb_build_object('action_version',1,'request_key',p_key,'source','professional','prior_revision',prior.revision,'new_revision',prior.revision+1,'prior_start_at',prior.start_at,'prior_end_at',prior.end_at,'start_at',p_start,'end_at',finish,'timezone',prior.timezone,'policy_version',prior.policy_version,'financial_outcome','no_payment_processed'));
 end if;
 insert into aesthenda_private.appointment_requests values(bid,p_key,fingerprint,p_id);
 return p_id;
end $$;

create function aesthenda_private.extend_timing_plan(p_plan jsonb,p_duration integer,p_step integer) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare chosen integer:=p_step; prior_duration integer:=aesthenda_private.plan_duration(p_plan); result jsonb:='[]'; step jsonb; n integer:=0; offset_minutes integer:=0;
begin
 if p_duration<=prior_duration or p_duration>1440 then raise exception 'INVALID_EXTENSION';end if;
 if chosen is null then
  if jsonb_array_length(p_plan)>1 and not(p_plan->(jsonb_array_length(p_plan)-1)->>'occupied')::boolean then raise exception 'SEGMENT_CHOICE_REQUIRED';end if;
  chosen:=jsonb_array_length(p_plan)-1;
 end if;
 if chosen<0 or chosen>=jsonb_array_length(p_plan) then raise exception 'INVALID_STEPS';end if;
 for step in select value from jsonb_array_elements(p_plan) loop
  if n=chosen then step:=jsonb_set(step,'{durationMinutes}',to_jsonb((step->>'durationMinutes')::integer+p_duration-prior_duration));end if;
  step:=jsonb_set(step,'{startOffset}',to_jsonb(offset_minutes));result:=result||jsonb_build_array(step);offset_minutes:=offset_minutes+(step->>'durationMinutes')::integer;n:=n+1;
 end loop;
 return result;
end $$;
create or replace function aesthenda_private.calendar_proposal_v2(p_actor uuid,p_id uuid,p_revision integer,p_mode text,p_date date,p_minute integer,p_duration integer,p_step integer) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare bid uuid; state jsonb; original public.appointments%rowtype; zone text; wall timestamp; base timestamptz; start_instant timestamptz; candidates integer; hours jsonb; result jsonb; plan jsonb;
begin
 bid:=aesthenda_private.appointment_context(p_actor);state:=aesthenda_private.appointment_move_state(p_actor,p_id);
 if p_revision is null or p_revision<>(state->>'revision')::integer then raise exception 'STALE_APPOINTMENT';end if;
 if p_mode is null or p_mode not in ('move','extend') or p_date is null or p_date<'2000-01-01'::date or p_date>'2100-12-31'::date or p_minute is null or p_minute not between 0 and 1439 or p_duration is null or p_duration not between 1 and 1440 then raise exception 'INVALID_INPUT';end if;
 zone:=state->>'timezone';wall:=p_date::timestamp+make_interval(mins=>p_minute);base:=wall at time zone zone;
 select count(*),min(candidate) into candidates,start_instant from (select distinct (wall-(timezone(zone,x)-timezone('UTC',x))) at time zone 'UTC' as candidate from generate_series(base-interval '36 hours',base+interval '36 hours',interval '6 hours') x) q where timezone(zone,candidate)=wall;
 if candidates<>1 then raise exception 'AMBIGUOUS_OR_MISSING_TIME';end if;
 select * into original from public.appointments where id=p_id;
 if p_mode='move' and p_duration<>(state->>'durationMinutes')::integer then raise exception 'INVALID_INPUT';end if;
 if p_mode='extend' and (start_instant<>original.start_at or p_duration<=(state->>'durationMinutes')::integer) then raise exception 'INVALID_EXTENSION';end if;
 if p_mode='move' and start_instant=original.start_at then raise exception 'NO_CHANGE';end if;
 plan:=state->'service'->'plan';
 if p_mode='extend' then plan:=aesthenda_private.extend_timing_plan(plan,p_duration,p_step);end if;
 hours:=aesthenda_private.effective_date_hours_v1(p_actor,p_date);
 if not aesthenda_private.plan_fits(bid,original.professional_id,original.client_id,start_instant,plan,hours,p_id) then raise exception 'SLOT_UNAVAILABLE';end if;
 result:=jsonb_build_object('timingPlan',plan,'step',p_step,'id',p_id,'revision',p_revision,'mode',p_mode,'date',p_date,'minute',p_minute,'duration',p_duration,'oldStartAt',original.start_at,'oldEndAt',original.end_at,'startAt',start_instant,'endAt',start_instant+make_interval(mins=>p_duration),'timezone',zone,'priceCents',original.service_snapshot->'priceCents','currency',original.service_snapshot->>'currency');
 return result||jsonb_build_object('reviewToken',md5(jsonb_build_array(state->>'token',result)::text));
end $$;
create or replace function aesthenda_private.calendar_proposal(p_actor uuid,p_id uuid,p_revision integer,p_mode text,p_date date,p_minute integer,p_duration integer) returns jsonb language sql security invoker set search_path=pg_catalog as $$
 select aesthenda_private.calendar_proposal_v2(p_actor,p_id,p_revision,p_mode,p_date,p_minute,p_duration,null)
$$;
create function aesthenda_private.preview_calendar_change_v2(p_actor uuid,p_id uuid,p_revision integer,p_mode text,p_date date,p_minute integer,p_duration integer,p_step integer) returns jsonb language sql security definer set search_path=pg_catalog as $$
 select aesthenda_private.calendar_proposal_v2(p_actor,p_id,p_revision,p_mode,p_date,p_minute,p_duration,p_step)
$$;
create or replace function aesthenda_private.save_calendar_change_v2(p_actor uuid,p_key uuid,p_id uuid,p_revision integer,p_mode text,p_date date,p_minute integer,p_duration integer,p_token text,p_step integer) returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; prior public.appointments%rowtype; replay aesthenda_private.appointment_requests%rowtype; fingerprint text; proposal jsonb;
begin
 bid:=aesthenda_private.appointment_context(p_actor);
 if p_key is null or p_token is null or p_token !~ '^[0-9a-f]{32}$' then raise exception 'INVALID_INPUT';end if;
 fingerprint:=md5(jsonb_build_array('calendar',p_id,p_revision,p_mode,p_date,p_minute,p_duration,p_token,p_step)::text);
 perform pg_advisory_xact_lock(hashtextextended(bid::text,2));
 select * into replay from aesthenda_private.appointment_requests where business_id=bid and request_key=p_key;
 if found then if replay.fingerprint<>fingerprint then raise exception 'IDEMPOTENCY_CONFLICT';end if;return replay.appointment_id;end if;
 select * into prior from public.appointments where id=p_id for update;
 if not found then raise exception 'APPOINTMENT_UNAVAILABLE';end if;
 perform 1 from public.clients where id=prior.client_id for share;
 proposal:=aesthenda_private.calendar_proposal_v2(p_actor,p_id,p_revision,p_mode,p_date,p_minute,p_duration,p_step);
 if proposal->>'reviewToken'<>p_token then raise exception 'STALE_PREVIEW';end if;
 update public.appointments set timing_plan=proposal->'timingPlan',start_at=(proposal->>'startAt')::timestamptz,end_at=(proposal->>'endAt')::timestamptz,duration_override_minutes=case when p_mode='extend' then p_duration else duration_override_minutes end,revision=revision+1,updated_at=now() where id=p_id;
 perform aesthenda_private.sync_timing_segments(p_id);
 insert into aesthenda_private.appointment_requests values(bid,p_key,fingerprint,p_id);
 insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata) values(bid,p_actor,'Appointment',p_id,case when p_mode='extend' then 'extendAppointment' else 'moveCalendarAppointment' end,jsonb_build_object('action_version',1,'request_key',p_key,'source','professional','prior_revision',prior.revision,'new_revision',prior.revision+1,'prior_start_at',prior.start_at,'prior_end_at',prior.end_at,'start_at',proposal->'startAt','end_at',proposal->'endAt','prior_duration_minutes',extract(epoch from prior.end_at-prior.start_at)/60,'duration_minutes',p_duration,'price_changed',false,'policy_version',prior.policy_version,'explicit_confirmation',true,'confirmed_at',statement_timestamp()));
 return p_id;
end $$;
create or replace function aesthenda_private.save_calendar_change_v1(p_actor uuid,p_key uuid,p_id uuid,p_revision integer,p_mode text,p_date date,p_minute integer,p_duration integer,p_token text) returns uuid language sql security definer set search_path=pg_catalog as $$
 select aesthenda_private.save_calendar_change_v2(p_actor,p_key,p_id,p_revision,p_mode,p_date,p_minute,p_duration,p_token,null)
$$;
create or replace function aesthenda_private.undo_calendar_change_v1(p_actor uuid,p_change bigint) returns void language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; change aesthenda_private.calendar_changes%rowtype; apt public.appointments%rowtype; block public.calendar_blocks%rowtype; target jsonb; start_time timestamptz; end_time timestamptz; zone text; duration integer; hours jsonb; plan jsonb;
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
  if not found or (to_jsonb(apt)-'timing_plan')<>(change.after_state-'timing_plan') or (change.after_state ? 'timing_plan' and apt.timing_plan is distinct from change.after_state->'timing_plan') then raise exception 'STALE_UNDO';end if;
  if apt.start_at<=statement_timestamp() or apt.booking_source<>'professional_v1' or apt.status not in ('pending','confirmed','cancelled') then raise exception 'UNDO_REQUIRES_REVIEW';end if;
  if target is null then
   if apt.status not in ('pending','confirmed') then raise exception 'UNDO_REQUIRES_REVIEW';end if;
   update public.appointments set status='cancelled',revision=revision+1,updated_at=now() where id=apt.id;
  else
   if target->>'status' not in ('pending','confirmed') or target->>'booking_source'<>'professional_v1' then raise exception 'UNDO_REQUIRES_REVIEW';end if;
   start_time:=(target->>'start_at')::timestamptz;end_time:=(target->>'end_at')::timestamptz;zone:=target->>'timezone';duration:=extract(epoch from end_time-start_time)::integer/60;
   select timezone into zone from aesthenda_private.weekly_schedules where business_id=bid;
   if zone is distinct from target->>'timezone' then raise exception 'TIMEZONE_REVIEW_REQUIRED';end if;
   plan:=coalesce(target->'timing_plan',aesthenda_private.legacy_timing_plan(target->'service_snapshot',duration));
   if plan='null'::jsonb then plan:=aesthenda_private.legacy_timing_plan(target->'service_snapshot',duration);end if;
   if duration not between 1 and 1440 or aesthenda_private.plan_duration(plan)<>duration or end_time<>start_time+make_interval(mins=>duration) or not aesthenda_private.timing_matches(apt.id,aesthenda_private.effective_timing_plan(apt.id)) then raise exception 'UNDO_REQUIRES_REVIEW';end if;
   hours:=aesthenda_private.effective_date_hours_v1(p_actor,(start_time at time zone zone)::date);
   if not aesthenda_private.plan_fits(bid,apt.professional_id,apt.client_id,start_time,plan,hours,apt.id) then raise exception 'UNDO_CONFLICT';end if;
   if not exists(select 1 from public.clients where id=apt.client_id and status in ('active','lead')) then raise exception 'UNDO_REQUIRES_REVIEW';end if;
   update public.appointments set timing_plan=plan,start_at=start_time,end_at=end_time,status=target->>'status',duration_override_minutes=(target->>'duration_override_minutes')::integer,revision=revision+1,updated_at=now() where id=apt.id;
   perform aesthenda_private.sync_timing_segments(apt.id);
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
create or replace function aesthenda_private.read_appointments_v1(p_actor uuid,p_date date default null,p_id uuid default null) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; zone text; day date; result jsonb;
begin
 bid:=aesthenda_private.appointment_context(p_actor);
 select timezone into zone from aesthenda_private.weekly_schedules where business_id=bid;
 day:=coalesce(p_date,(now() at time zone coalesce(zone,'UTC'))::date);
 if day<'2000-01-01'::date or day>'2100-12-31'::date then raise exception 'INVALID_INPUT';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'clientId',a.client_id,'clientName',btrim(concat_ws(' ',c.first_name,c.last_name)),'serviceName',a.service_snapshot->>'name','priceCents',a.service_snapshot->'priceCents','currency',a.service_snapshot->>'currency','startAt',a.start_at,'endAt',a.end_at,'status',a.status,'timezone',coalesce(a.timezone,zone,'UTC'),'revision',a.revision,'source',a.booking_source,'segments',coalesce((select jsonb_agg(jsonb_build_object('index',e.ordinality-1,'label',e.value->>'label','kind',e.value->>'kind','occupied',(e.value->>'occupied')::boolean,'durationMinutes',(e.value->>'durationMinutes')::integer,'startAt',a.start_at+make_interval(mins=>(e.value->>'startOffset')::integer),'endAt',a.start_at+make_interval(mins=>(e.value->>'startOffset')::integer+(e.value->>'durationMinutes')::integer)) order by e.ordinality) from jsonb_array_elements(a.timing_plan) with ordinality e(value,ordinality)),'[]'::jsonb)) order by a.start_at,a.id),'[]'::jsonb) into result
 from public.appointments a join public.clients c on c.id=a.client_id where (p_id is not null and a.id=p_id) or (p_id is null and timezone(coalesce(a.timezone,zone,'UTC'),a.start_at)::date=day);
 return jsonb_build_object('date',day,'timezone',zone,'asOf',statement_timestamp(),'appointments',result);
end $$;
create function aesthenda_private.read_booking_preferences_v2(p_actor uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; result jsonb;
begin
 bid:=aesthenda_private.appointment_context(p_actor);
 result:=aesthenda_private.read_booking_preferences_v1(p_actor);
 return result||coalesce((select jsonb_build_object('processingEnabled',processing_enabled,'maxConcurrentClients',max_concurrent_clients) from aesthenda_private.booking_preferences where business_id=bid),'{"processingEnabled":false,"maxConcurrentClients":2}'::jsonb);
end $$;
create function aesthenda_private.save_booking_preferences_v2(p_actor uuid,p_revision integer,p_auto boolean,p_processing boolean,p_limit integer) returns void language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; prior aesthenda_private.booking_preferences%rowtype;
begin
 bid:=aesthenda_private.appointment_context(p_actor);
 if p_revision is null or p_revision<0 or p_auto is null or p_processing is null or p_limit is null or p_limit not between 2 and 10 then raise exception 'INVALID_INPUT';end if;
 perform pg_advisory_xact_lock(hashtextextended(bid::text,2));
 select * into prior from aesthenda_private.booking_preferences where business_id=bid;
 if coalesce(prior.revision,0)<>p_revision then
  if prior.auto_confirm=p_auto and prior.processing_enabled=p_processing and prior.max_concurrent_clients=p_limit and prior.revision=p_revision+1 then return;end if;
  raise exception 'STALE_PREFERENCES';
 end if;
 if not p_processing and exists(select 1 from public.appointments a join public.appointments b on a.id<b.id and a.professional_id=b.professional_id and a.start_at<b.end_at and b.start_at<a.end_at where a.business_id=bid and b.business_id=bid and a.status in ('pending','confirmed') and b.status in ('pending','confirmed') and a.end_at>statement_timestamp() and b.end_at>statement_timestamp()) then raise exception 'PROCESSING_POLICY_REVIEW';end if;
 if exists(select 1 from public.appointments a where a.business_id=bid and a.status in ('pending','confirmed') and a.end_at>statement_timestamp() and (select count(*) from public.appointments b where b.business_id=bid and b.professional_id=a.professional_id and b.status in ('pending','confirmed') and b.start_at<=greatest(a.start_at,statement_timestamp()) and b.end_at>greatest(a.start_at,statement_timestamp()))>p_limit) then raise exception 'PROCESSING_POLICY_REVIEW';end if;
 insert into aesthenda_private.booking_preferences(business_id,auto_confirm,processing_enabled,max_concurrent_clients) values(bid,p_auto,p_processing,p_limit)
 on conflict(business_id) do update set auto_confirm=excluded.auto_confirm,processing_enabled=excluded.processing_enabled,max_concurrent_clients=excluded.max_concurrent_clients,revision=booking_preferences.revision+1;
 insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata) values(bid,p_actor,'Business',bid,'updateBookingPreferences',jsonb_build_object('auto_confirm',p_auto,'processing_enabled',p_processing,'max_concurrent_clients',p_limit,'prior_revision',p_revision));
end $$;
create or replace function aesthenda_private.save_booking_preferences_v1(p_actor uuid,p_revision integer,p_auto boolean) returns void language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; enabled boolean; client_limit integer;
begin
 bid:=aesthenda_private.appointment_context(p_actor);
 select processing_enabled,max_concurrent_clients into enabled,client_limit from aesthenda_private.booking_preferences where business_id=bid;
 perform aesthenda_private.save_booking_preferences_v2(p_actor,p_revision,p_auto,coalesce(enabled,false),coalesce(client_limit,2));
end $$;
do $$ declare fn record;begin
 for fn in select p.oid::regprocedure as signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='aesthenda_private' and p.proname in ('plan_duration','legacy_timing_plan','effective_timing_plan','timing_matches','sync_timing_segments','civil_visit_fits','plan_fits','appointment_slots_v2','extend_timing_plan','calendar_proposal_v2','preview_calendar_change_v2','save_calendar_change_v2','read_booking_preferences_v2','save_booking_preferences_v2') loop
 execute format('revoke all on function %s from public,anon,authenticated',fn.signature);
 if exists(select 1 from pg_roles where rolname='service_role') then execute format('revoke all on function %s from service_role',fn.signature);end if;
 if fn.proname in ('appointment_slots_v2','preview_calendar_change_v2','save_calendar_change_v2','read_booking_preferences_v2','save_booking_preferences_v2') then execute format('grant execute on function %s to aesthenda_runtime',fn.signature);end if;
 end loop;
end $$;
reset role;
set local role aesthenda_services_owner;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then execute 'revoke all on function aesthenda_private.normalize_service_steps(jsonb),aesthenda_private.save_service_v2(uuid,uuid,uuid,integer,text,text,bigint,jsonb) from service_role';end if;end $$;
reset role;
revoke create on schema aesthenda_private from aesthenda_services_owner,aesthenda_appointments_owner;
do $$ begin execute format('grant aesthenda_services_owner to %I with set false',current_user);execute format('grant aesthenda_appointments_owner to %I with set false',current_user);end $$;
