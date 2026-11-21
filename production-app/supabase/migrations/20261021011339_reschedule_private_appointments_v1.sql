-- Move private pending reservations in place, preserving booked service facts.
do $$ begin execute format('grant aesthenda_appointments_owner to %I with set true',current_user);end $$;
grant create on schema aesthenda_private to aesthenda_appointments_owner;
grant update(start_at,end_at) on public.appointments,public.appointment_segments to aesthenda_appointments_owner;
set local role aesthenda_appointments_owner;
create function aesthenda_private.appointment_fits(p_bid uuid,p_pid uuid,p_start timestamptz,p_duration integer,p_hours jsonb,p_ignore uuid) returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
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
 if exists(select 1 from public.appointments where business_id=p_bid and professional_id=p_pid and (p_ignore is null or id<>p_ignore) and status in ('pending','confirmed') and start_at<finish and end_at>p_start) then return false; end if;
 if exists(select 1 from public.calendar_blocks where business_id=p_bid and professional_id=p_pid and start_at<finish and end_at>p_start) then return false; end if;
 if exists(select 1 from public.booking_holds where business_id=p_bid and professional_id=p_pid and status='active' and expires_at>statement_timestamp() and start_at<finish and end_at>p_start) then return false; end if;
 return true;
end $$;

-- Compatibility wrapper: creates and moves share the same eligibility definition.
create or replace function aesthenda_private.appointment_fits(p_bid uuid,p_pid uuid,p_start timestamptz,p_duration integer,p_hours jsonb) returns boolean language sql security invoker set search_path=pg_catalog as $$
 select aesthenda_private.appointment_fits(p_bid,p_pid,p_start,p_duration,p_hours,null::uuid)
$$;
create function aesthenda_private.appointment_move_state(p_actor uuid,p_id uuid) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare bid uuid; a public.appointments%rowtype; zone text; duration integer;
begin
 bid:=aesthenda_private.appointment_context(p_actor);
 select * into a from public.appointments where id=p_id;
 if not found then raise exception 'APPOINTMENT_UNAVAILABLE';end if;
 if a.booking_source<>'professional_v1' or a.status<>'pending' then raise exception 'APPOINTMENT_REQUIRES_REVIEW';end if;
 select timezone into zone from aesthenda_private.weekly_schedules where business_id=bid;
 if zone is null or zone is distinct from a.timezone then raise exception 'TIMEZONE_REVIEW_REQUIRED';end if;
 duration:=extract(epoch from (a.end_at-a.start_at))::integer/60;
 if duration not between 1 and 1440 or a.end_at<>a.start_at+make_interval(mins=>duration)
  or a.service_snapshot->>'durationMinutes' is distinct from duration::text
  or (select count(*) from public.appointment_segments where appointment_id=a.id)<>1
  or not exists(select 1 from public.appointment_segments where appointment_id=a.id and start_at=a.start_at and end_at=a.end_at) then raise exception 'APPOINTMENT_REQUIRES_REVIEW';end if;
 if not exists(select 1 from public.clients where id=a.client_id and status in ('active','lead')) then raise exception 'CLIENT_UNAVAILABLE';end if;
 return jsonb_build_object('id',a.id,'professionalId',a.professional_id,'clientId',a.client_id,'revision',a.revision,'timezone',zone,'durationMinutes',duration,'service',a.service_snapshot,'token',md5(jsonb_build_array(a.id,a.revision,a.start_at,a.end_at,a.service_snapshot,zone)::text));
end $$;
create function aesthenda_private.reschedule_slots_v1(p_actor uuid,p_id uuid,p_date date) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; state jsonb; hours jsonb; zone text; result jsonb;
begin
 bid:=aesthenda_private.appointment_context(p_actor);state:=aesthenda_private.appointment_move_state(p_actor,p_id);zone:=state->>'timezone';
 if p_date is null or p_date<'2000-01-01'::date or p_date>'2100-12-31'::date then raise exception 'INVALID_INPUT';end if;
 hours:=aesthenda_private.effective_date_hours_v1(p_actor,p_date);
 select coalesce(jsonb_agg(jsonb_build_object('startAt',x,'minute',extract(hour from timezone(zone,x))::integer*60+extract(minute from timezone(zone,x))::integer) order by x),'[]'::jsonb) into result
 from generate_series(p_date::timestamp at time zone zone,((p_date+1)::timestamp at time zone zone)-interval '1 minute',interval '1 minute') x
 where timezone(zone,x)::date=p_date and aesthenda_private.appointment_fits(bid,(state->>'professionalId')::uuid,x,(state->>'durationMinutes')::integer,hours,p_id);
 return jsonb_build_object('timezone',zone,'revision',state->'revision','moveToken',state->'token','service',state->'service','slots',result);
end $$;
create function aesthenda_private.reschedule_appointment_v1(p_actor uuid,p_key uuid,p_id uuid,p_revision integer,p_start timestamptz,p_token text) returns uuid language plpgsql security definer set search_path=pg_catalog as $$
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
 if not aesthenda_private.appointment_fits(bid,prior.professional_id,p_start,(state->>'durationMinutes')::integer,hours,p_id) then raise exception 'SLOT_UNAVAILABLE';end if;
 finish:=p_start+make_interval(mins=>(state->>'durationMinutes')::integer);
 if prior.start_at<>p_start then
  update public.appointments set start_at=p_start,end_at=finish,revision=revision+1,updated_at=now() where id=p_id;
  update public.appointment_segments set start_at=p_start,end_at=finish where appointment_id=p_id;
  insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata) values(bid,p_actor,'Appointment',p_id,'rescheduleAppointment',jsonb_build_object('action_version',1,'request_key',p_key,'source','professional','prior_revision',prior.revision,'new_revision',prior.revision+1,'prior_start_at',prior.start_at,'prior_end_at',prior.end_at,'start_at',p_start,'end_at',finish,'timezone',prior.timezone,'policy_version',prior.policy_version,'financial_outcome','no_payment_processed'));
 end if;
 insert into aesthenda_private.appointment_requests values(bid,p_key,fingerprint,p_id);
 return p_id;
end $$;
revoke all on function aesthenda_private.appointment_fits(uuid,uuid,timestamptz,integer,jsonb,uuid),aesthenda_private.appointment_move_state(uuid,uuid),aesthenda_private.reschedule_slots_v1(uuid,uuid,date),aesthenda_private.reschedule_appointment_v1(uuid,uuid,uuid,integer,timestamptz,text) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then execute 'revoke all on function aesthenda_private.appointment_fits(uuid,uuid,timestamptz,integer,jsonb,uuid),aesthenda_private.appointment_move_state(uuid,uuid),aesthenda_private.reschedule_slots_v1(uuid,uuid,date),aesthenda_private.reschedule_appointment_v1(uuid,uuid,uuid,integer,timestamptz,text) from service_role';end if;end $$;
grant execute on function aesthenda_private.reschedule_slots_v1(uuid,uuid,date),aesthenda_private.reschedule_appointment_v1(uuid,uuid,uuid,integer,timestamptz,text) to aesthenda_runtime;
reset role;
revoke create on schema aesthenda_private from aesthenda_appointments_owner;
do $$ begin execute format('grant aesthenda_appointments_owner to %I with set false',current_user);end $$;
