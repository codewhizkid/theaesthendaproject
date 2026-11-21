-- First private, normal-fit salon booking path. Pending reservations only;
-- publication, checkout, processing release and professional exceptions are separate.
create role aesthenda_appointments_owner nologin nosuperuser nobypassrls nocreatedb nocreaterole;
do $$ begin
 execute format('grant aesthenda_appointments_owner to %I with inherit false',current_user);
 execute format('grant aesthenda_appointments_owner to %I with set true',current_user);
end $$;
grant usage,create on schema aesthenda_private to aesthenda_appointments_owner;
grant usage on schema public to aesthenda_appointments_owner;
alter table public.clients add constraint clients_business_identity unique(business_id,id);
alter table public.services add constraint services_business_identity unique(business_id,id);
alter table public.appointments add constraint appointment_client_business foreign key(business_id,client_id) references public.clients(business_id,id);
alter table public.appointments add constraint appointment_service_business foreign key(business_id,service_id) references public.services(business_id,id);
alter table public.appointments add constraint appointment_professional_business foreign key(business_id,professional_id) references public.professionals(business_id,id);
alter table public.appointments add constraint appointment_positive_range check(end_at>start_at);
alter table public.appointments add column booking_source text not null default 'legacy';
alter table public.appointments add column timezone text;
alter table public.appointments add column revision integer not null default 1 check(revision>0);
create index appointment_business_time on public.appointments(business_id,start_at,end_at);
create index appointment_client_identity on public.appointments(business_id,client_id);
create index appointment_service_identity on public.appointments(business_id,service_id);
create index appointment_professional_identity on public.appointments(business_id,professional_id);
create index calendar_blocks_business_time on public.calendar_blocks(business_id,start_at,end_at);
create index booking_holds_business_time on public.booking_holds(business_id,start_at,end_at) where status='active';
create table aesthenda_private.appointment_requests(
 business_id uuid not null references public.businesses(id),request_key uuid not null,
 fingerprint text not null,appointment_id uuid not null references public.appointments(id),
 primary key(business_id,request_key)
);
alter table aesthenda_private.appointment_requests enable row level security;
alter table aesthenda_private.appointment_requests force row level security;
revoke all on aesthenda_private.appointment_requests from public,anon,authenticated,aesthenda_runtime;
grant select on public.businesses,public.professionals,public.clients,public.services,public.service_segments,public.appointments,public.appointment_segments,public.calendar_blocks,public.booking_holds,aesthenda_private.weekly_schedules to aesthenda_appointments_owner;
grant insert on public.appointments,public.appointment_segments,public.audit_events,aesthenda_private.appointment_requests to aesthenda_appointments_owner;
grant select on aesthenda_private.appointment_requests to aesthenda_appointments_owner;
grant update(status,revision,updated_at) on public.appointments to aesthenda_appointments_owner;
-- SELECT FOR SHARE/UPDATE also requires some UPDATE privilege, without a path to
-- changing catalog/client/professional data through these private routines.
grant update(updated_at) on public.services,public.clients,public.professionals to aesthenda_appointments_owner;
create policy appointments_business_scope on public.businesses for select to aesthenda_appointments_owner using(owner_user_id=(select nullif(current_setting('app.verified_actor_id',true),'')::uuid));
do $$ declare tab text; begin
 foreach tab in array array['professionals','clients','services','appointments','calendar_blocks','booking_holds'] loop
 execute format('create policy appointment_scope on public.%I to aesthenda_appointments_owner using(business_id=(select nullif(current_setting(''app.business_account_id'',true),'''')::uuid)) with check(business_id=(select nullif(current_setting(''app.business_account_id'',true),'''')::uuid))',tab);
 end loop;
end $$;
create policy appointment_service_segment_scope on public.service_segments for select to aesthenda_appointments_owner using(exists(select 1 from public.services s where s.id=service_id));
create policy appointment_segment_scope on public.appointment_segments to aesthenda_appointments_owner using(exists(select 1 from public.appointments a where a.id=appointment_id)) with check(exists(select 1 from public.appointments a join public.service_segments s on s.service_id=a.service_id where a.id=appointment_id and s.id=service_segment_id));
create policy appointment_week_scope on aesthenda_private.weekly_schedules for select to aesthenda_appointments_owner using(business_id=(select nullif(current_setting('app.business_account_id',true),'')::uuid));
create policy appointment_request_scope on aesthenda_private.appointment_requests to aesthenda_appointments_owner using(business_id=(select nullif(current_setting('app.business_account_id',true),'')::uuid)) with check(business_id=(select nullif(current_setting('app.business_account_id',true),'')::uuid));
create policy appointment_audit_insert on public.audit_events for insert to aesthenda_appointments_owner with check(actor_id=(select nullif(current_setting('app.verified_actor_id',true),'')::uuid) and business_id=(select nullif(current_setting('app.business_account_id',true),'')::uuid));
-- Reuse the existing effective-date-hours contract instead of duplicating precedence.
do $$ begin execute format('grant aesthenda_availability_owner to %I with set true',current_user);end $$;
set local role aesthenda_availability_owner;
grant execute on function aesthenda_private.effective_date_hours_v1(uuid,date) to aesthenda_appointments_owner;
reset role;
do $$ begin execute format('grant aesthenda_availability_owner to %I with set false',current_user);end $$;
create function aesthenda_private.appointment_context(p_actor uuid) returns uuid language plpgsql security invoker set search_path=pg_catalog as $$
declare bid uuid;
begin
 if p_actor is null then raise exception 'UNAUTHENTICATED'; end if;
 perform set_config('app.verified_actor_id',p_actor::text,true);perform set_config('app.business_account_id','',true);
 select id into bid from public.businesses where owner_user_id=p_actor and status in ('trial','active');
 if bid is null then raise exception 'BUSINESS_UNAVAILABLE'; end if;
 perform set_config('app.business_account_id',bid::text,true);return bid;
end $$;
create function aesthenda_private.appointment_service(p_id uuid) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare s public.services%rowtype; seg public.service_segments%rowtype;
begin
 select * into s from public.services where id=p_id;
 if not found or s.catalog_status<>'draft' then raise exception 'SERVICE_UNAVAILABLE'; end if;
 if (select count(*) from public.service_segments where service_id=p_id)<>1 then raise exception 'SERVICE_REQUIRES_REVIEW'; end if;
 select * into seg from public.service_segments where service_id=p_id;
 if not seg.occupied_by_professional or seg.start_offset_minutes<>0 or seg.duration_minutes<>s.duration_minutes then raise exception 'SERVICE_REQUIRES_REVIEW'; end if;
 return jsonb_build_object('id',s.id,'name',s.name,'durationMinutes',s.duration_minutes,'priceCents',s.price_cents,'currency',s.currency,'policyVersion',s.policy_version,'segmentId',seg.id,'token',md5(jsonb_build_array(s.id,s.name,s.duration_minutes,s.price_cents,s.currency,s.policy_version,s.updated_at,seg.id,seg.duration_minutes)::text));
end $$;
-- Single eligibility definition used by both suggestions and the locked commit.
-- Half-open intervals allow adjacent appointments. DST ambiguity fails closed.
create function aesthenda_private.appointment_fits(p_bid uuid,p_pid uuid,p_start timestamptz,p_duration integer,p_hours jsonb) returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
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
 if exists(select 1 from public.appointments where business_id=p_bid and professional_id=p_pid and status in ('pending','confirmed') and start_at<finish and end_at>p_start) then return false; end if;
 if exists(select 1 from public.calendar_blocks where business_id=p_bid and professional_id=p_pid and start_at<finish and end_at>p_start) then return false; end if;
 if exists(select 1 from public.booking_holds where business_id=p_bid and professional_id=p_pid and status='active' and expires_at>statement_timestamp() and start_at<finish and end_at>p_start) then return false; end if;
 return true;
end $$;
create function aesthenda_private.appointment_slots_v1(p_actor uuid,p_service uuid,p_date date) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; pid uuid; service jsonb; hours jsonb; zone text; result jsonb;
begin
 bid:=aesthenda_private.appointment_context(p_actor);
 if p_date is null or p_date<'2000-01-01'::date or p_date>'2100-12-31'::date then raise exception 'INVALID_INPUT'; end if;
 select id into pid from public.professionals where business_id=bid and user_id=p_actor;
 if pid is null then raise exception 'PROFESSIONAL_UNAVAILABLE'; end if;
 service:=aesthenda_private.appointment_service(p_service);
 hours:=aesthenda_private.effective_date_hours_v1(p_actor,p_date);zone:=hours->>'timezone';
 if zone is null then raise exception 'SAVE_WEEKLY_HOURS_FIRST'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('startAt',x,'minute',extract(hour from timezone(zone,x))::integer*60+extract(minute from timezone(zone,x))::integer) order by x),'[]'::jsonb) into result
 from generate_series(p_date::timestamp at time zone zone,((p_date+1)::timestamp at time zone zone)-interval '1 minute',interval '1 minute') x
 where timezone(zone,x)::date=p_date and aesthenda_private.appointment_fits(bid,pid,x,(service->>'durationMinutes')::integer,hours);
 service:=jsonb_set(service,'{token}',to_jsonb(md5((service->>'token')||zone)));
 return jsonb_build_object('timezone',zone,'service',service,'slots',result);
end $$;
create function aesthenda_private.create_appointment_v1(p_actor uuid,p_key uuid,p_client uuid,p_service uuid,p_start timestamptz,p_token text) returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; pid uuid; cid uuid; service jsonb; hours jsonb; zone text; fingerprint text; prior aesthenda_private.appointment_requests%rowtype; duration integer;
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
 insert into public.appointments(business_id,professional_id,client_id,service_id,start_at,end_at,status,policy_version,service_snapshot,created_by,booking_source,timezone)
 values(bid,pid,p_client,p_service,p_start,p_start+make_interval(mins=>duration),'pending',service->>'policyVersion',(service-'token')||jsonb_build_object('timezone',zone,'localStart',timezone(zone,p_start),'localEnd',timezone(zone,p_start+make_interval(mins=>duration)),'bufferBefore',0,'bufferAfter',0),p_actor,'professional_v1',zone) returning id into cid;
 insert into public.appointment_segments(appointment_id,service_segment_id,start_at,end_at) values(cid,(service->>'segmentId')::uuid,p_start,p_start+make_interval(mins=>duration));
 insert into aesthenda_private.appointment_requests values(bid,p_key,fingerprint,cid);
 insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata) values(bid,p_actor,'Appointment',cid,'createAppointment',jsonb_build_object('action_version',1,'request_key',p_key,'source','professional','status','pending','start_at',p_start,'duration_minutes',duration,'timezone',zone,'service_id',p_service));
 return cid;
end $$;
create function aesthenda_private.read_appointments_v1(p_actor uuid,p_date date default null,p_id uuid default null) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; zone text; day date; result jsonb;
begin
 bid:=aesthenda_private.appointment_context(p_actor);
 select timezone into zone from aesthenda_private.weekly_schedules where business_id=bid;
 day:=coalesce(p_date,(now() at time zone coalesce(zone,'UTC'))::date);
 if day<'2000-01-01'::date or day>'2100-12-31'::date then raise exception 'INVALID_INPUT';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'clientName',btrim(concat_ws(' ',c.first_name,c.last_name)),'serviceName',a.service_snapshot->>'name','priceCents',a.service_snapshot->'priceCents','currency',a.service_snapshot->>'currency','startAt',a.start_at,'endAt',a.end_at,'status',a.status,'timezone',coalesce(a.timezone,zone,'UTC'),'revision',a.revision,'source',a.booking_source) order by a.start_at,a.id),'[]'::jsonb) into result
 from public.appointments a join public.clients c on c.id=a.client_id where (p_id is not null and a.id=p_id) or (p_id is null and timezone(coalesce(a.timezone,zone,'UTC'),a.start_at)::date=day);
 return jsonb_build_object('date',day,'timezone',zone,'asOf',statement_timestamp(),'appointments',result);
end $$;
create function aesthenda_private.cancel_appointment_v1(p_actor uuid,p_id uuid,p_revision integer) returns void language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; prior public.appointments%rowtype;
begin
 bid:=aesthenda_private.appointment_context(p_actor);perform pg_advisory_xact_lock(hashtextextended(bid::text,2));
 select * into prior from public.appointments where id=p_id and booking_source='professional_v1' for update;
 if not found then raise exception 'APPOINTMENT_UNAVAILABLE';end if;
 if prior.status='cancelled' then return;end if;
 if p_revision is null or prior.revision<>p_revision then raise exception 'STALE_APPOINTMENT';end if;
 if prior.status<>'pending' then raise exception 'APPOINTMENT_REQUIRES_REVIEW';end if;
 update public.appointments set status='cancelled',revision=revision+1,updated_at=now() where id=p_id;
 insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata) values(bid,p_actor,'Appointment',p_id,'cancelAppointment',jsonb_build_object('action_version',1,'prior_revision',prior.revision,'new_revision',prior.revision+1,'source','professional'));
end $$;
do $$ declare fn record; begin
 for fn in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='aesthenda_private' and p.proname in ('appointment_context','appointment_service','appointment_fits','appointment_slots_v1','create_appointment_v1','read_appointments_v1','cancel_appointment_v1') loop
 execute format('alter function %s owner to aesthenda_appointments_owner',fn.signature);
 end loop;
end $$;
set local role aesthenda_appointments_owner;
do $$ declare fn record; begin
 for fn in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='aesthenda_private' and p.proname in ('appointment_context','appointment_service','appointment_fits','appointment_slots_v1','create_appointment_v1','read_appointments_v1','cancel_appointment_v1') loop
 execute format('revoke all on function %s from public,anon,authenticated',fn.signature);
 if exists(select 1 from pg_roles where rolname='service_role') then execute format('revoke all on function %s from service_role',fn.signature);end if;
 end loop;
end $$;
grant execute on function aesthenda_private.appointment_slots_v1(uuid,uuid,date),aesthenda_private.create_appointment_v1(uuid,uuid,uuid,uuid,timestamptz,text),aesthenda_private.read_appointments_v1(uuid,date,uuid),aesthenda_private.cancel_appointment_v1(uuid,uuid,integer) to aesthenda_runtime;
reset role;
revoke create on schema aesthenda_private from aesthenda_appointments_owner;
do $$ begin execute format('grant aesthenda_appointments_owner to %I with set false',current_user);end $$;
