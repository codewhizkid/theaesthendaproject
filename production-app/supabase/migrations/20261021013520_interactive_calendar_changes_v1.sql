-- Explicit professional extension preserves original service snapshot and price.
alter table public.appointments add column duration_override_minutes integer check(duration_override_minutes between 1 and 1440);
grant update(duration_override_minutes) on public.appointments to aesthenda_appointments_owner;
do $$ begin execute format('grant aesthenda_appointments_owner to %I with set true',current_user);end $$;
grant create on schema aesthenda_private to aesthenda_appointments_owner;
set local role aesthenda_appointments_owner;
create or replace function aesthenda_private.appointment_move_state(p_actor uuid,p_id uuid) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
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
  or coalesce(a.duration_override_minutes,(a.service_snapshot->>'durationMinutes')::integer) is distinct from duration
  or (select count(*) from public.appointment_segments where appointment_id=a.id)<>1
  or not exists(select 1 from public.appointment_segments where appointment_id=a.id and start_at=a.start_at and end_at=a.end_at) then raise exception 'APPOINTMENT_REQUIRES_REVIEW';end if;
 if not exists(select 1 from public.clients where id=a.client_id and status in ('active','lead')) then raise exception 'CLIENT_UNAVAILABLE';end if;
 return jsonb_build_object('id',a.id,'professionalId',a.professional_id,'clientId',a.client_id,'revision',a.revision,'timezone',zone,'durationMinutes',duration,'service',jsonb_set(a.service_snapshot,'{durationMinutes}',to_jsonb(duration)),'token',md5(jsonb_build_array(a.id,a.revision,a.start_at,a.end_at,a.service_snapshot,zone)::text));
end $$;

create function aesthenda_private.calendar_proposal(p_actor uuid,p_id uuid,p_revision integer,p_mode text,p_date date,p_minute integer,p_duration integer) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare bid uuid; state jsonb; original public.appointments%rowtype; zone text; wall timestamp; base timestamptz; start_instant timestamptz; candidates integer; hours jsonb; result jsonb;
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
 hours:=aesthenda_private.effective_date_hours_v1(p_actor,p_date);
 if not aesthenda_private.appointment_fits(bid,original.professional_id,start_instant,p_duration,hours,p_id) then raise exception 'SLOT_UNAVAILABLE';end if;
 result:=jsonb_build_object('id',p_id,'revision',p_revision,'mode',p_mode,'date',p_date,'minute',p_minute,'duration',p_duration,'oldStartAt',original.start_at,'oldEndAt',original.end_at,'startAt',start_instant,'endAt',start_instant+make_interval(mins=>p_duration),'timezone',zone,'priceCents',original.service_snapshot->'priceCents','currency',original.service_snapshot->>'currency');
 return result||jsonb_build_object('reviewToken',md5(jsonb_build_array(state->>'token',result)::text));
end $$;
create function aesthenda_private.preview_calendar_change_v1(p_actor uuid,p_id uuid,p_revision integer,p_mode text,p_date date,p_minute integer,p_duration integer) returns jsonb language sql security definer set search_path=pg_catalog as $$
 select aesthenda_private.calendar_proposal(p_actor,p_id,p_revision,p_mode,p_date,p_minute,p_duration)
$$;
create function aesthenda_private.save_calendar_change_v1(p_actor uuid,p_key uuid,p_id uuid,p_revision integer,p_mode text,p_date date,p_minute integer,p_duration integer,p_token text) returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; prior public.appointments%rowtype; replay aesthenda_private.appointment_requests%rowtype; fingerprint text; proposal jsonb;
begin
 bid:=aesthenda_private.appointment_context(p_actor);
 if p_key is null or p_token is null or p_token !~ '^[0-9a-f]{32}$' then raise exception 'INVALID_INPUT';end if;
 fingerprint:=md5(jsonb_build_array('calendar',p_id,p_revision,p_mode,p_date,p_minute,p_duration,p_token)::text);
 perform pg_advisory_xact_lock(hashtextextended(bid::text,2));
 select * into replay from aesthenda_private.appointment_requests where business_id=bid and request_key=p_key;
 if found then if replay.fingerprint<>fingerprint then raise exception 'IDEMPOTENCY_CONFLICT';end if;return replay.appointment_id;end if;
 select * into prior from public.appointments where id=p_id for update;
 if not found then raise exception 'APPOINTMENT_UNAVAILABLE';end if;
 perform 1 from public.clients where id=prior.client_id for share;
 proposal:=aesthenda_private.calendar_proposal(p_actor,p_id,p_revision,p_mode,p_date,p_minute,p_duration);
 if proposal->>'reviewToken'<>p_token then raise exception 'STALE_PREVIEW';end if;
 update public.appointments set start_at=(proposal->>'startAt')::timestamptz,end_at=(proposal->>'endAt')::timestamptz,duration_override_minutes=case when p_mode='extend' then p_duration else duration_override_minutes end,revision=revision+1,updated_at=now() where id=p_id;
 update public.appointment_segments set start_at=(proposal->>'startAt')::timestamptz,end_at=(proposal->>'endAt')::timestamptz where appointment_id=p_id;
 insert into aesthenda_private.appointment_requests values(bid,p_key,fingerprint,p_id);
 insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata) values(bid,p_actor,'Appointment',p_id,case when p_mode='extend' then 'extendAppointment' else 'moveCalendarAppointment' end,jsonb_build_object('action_version',1,'request_key',p_key,'source','professional','prior_revision',prior.revision,'new_revision',prior.revision+1,'prior_start_at',prior.start_at,'prior_end_at',prior.end_at,'start_at',proposal->'startAt','end_at',proposal->'endAt','prior_duration_minutes',extract(epoch from prior.end_at-prior.start_at)/60,'duration_minutes',p_duration,'price_changed',false,'policy_version',prior.policy_version,'explicit_confirmation',true,'confirmed_at',statement_timestamp()));
 return p_id;
end $$;
revoke all on function aesthenda_private.calendar_proposal(uuid,uuid,integer,text,date,integer,integer),aesthenda_private.preview_calendar_change_v1(uuid,uuid,integer,text,date,integer,integer),aesthenda_private.save_calendar_change_v1(uuid,uuid,uuid,integer,text,date,integer,integer,text) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then execute 'revoke all on function aesthenda_private.calendar_proposal(uuid,uuid,integer,text,date,integer,integer),aesthenda_private.preview_calendar_change_v1(uuid,uuid,integer,text,date,integer,integer),aesthenda_private.save_calendar_change_v1(uuid,uuid,uuid,integer,text,date,integer,integer,text) from service_role';end if;end $$;
grant execute on function aesthenda_private.preview_calendar_change_v1(uuid,uuid,integer,text,date,integer,integer),aesthenda_private.save_calendar_change_v1(uuid,uuid,uuid,integer,text,date,integer,integer,text) to aesthenda_runtime;
reset role;
revoke create on schema aesthenda_private from aesthenda_appointments_owner;
do $$ begin execute format('grant aesthenda_appointments_owner to %I with set false',current_user);end $$;
