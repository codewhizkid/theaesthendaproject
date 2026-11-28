-- Let an owner replace the service on a future professional appointment.
-- Availability is rechecked inside the same locked transaction as the update.
do $$ begin execute format('grant aesthenda_appointments_owner to %I with set true',current_user);end $$;
grant create on schema aesthenda_private to aesthenda_appointments_owner;
grant update(service_id,service_snapshot,policy_version,start_at,end_at,timing_plan,revision,updated_at) on public.appointments to aesthenda_appointments_owner;
grant delete on public.appointment_segments to aesthenda_appointments_owner;
set local role aesthenda_appointments_owner;

create function aesthenda_private.service_change_slots_v1(p_actor uuid,p_id uuid,p_service uuid,p_date date) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; state jsonb; service jsonb; hours jsonb; zone text; current_service uuid; starts jsonb; token text;
begin
 bid:=aesthenda_private.appointment_context(p_actor);
 if p_id is null or p_service is null or p_date is null or p_date<'2000-01-01'::date or p_date>'2100-12-31'::date then raise exception 'INVALID_INPUT';end if;
 state:=aesthenda_private.appointment_move_state(p_actor,p_id);
 select service_id into current_service from public.appointments where id=p_id;
 if current_service=p_service then raise exception 'NO_SERVICE_CHANGE';end if;
 if (select start_at from public.appointments where id=p_id)<=statement_timestamp() then raise exception 'APPOINTMENT_REQUIRES_REVIEW';end if;
 perform 1 from public.services where id=p_service for share;
 service:=aesthenda_private.appointment_service(p_service);
 zone:=state->>'timezone';hours:=aesthenda_private.effective_date_hours_v1(p_actor,p_date);
 if zone is null or zone is distinct from hours->>'timezone' then raise exception 'TIMEZONE_REVIEW_REQUIRED';end if;
 select coalesce(jsonb_agg(jsonb_build_object('startAt',x,'minute',extract(hour from timezone(zone,x))::integer*60+extract(minute from timezone(zone,x))::integer) order by x),'[]'::jsonb) into starts
 from generate_series(p_date::timestamp at time zone zone,((p_date+1)::timestamp at time zone zone)-interval '1 minute',interval '1 minute') x
 where timezone(zone,x)::date=p_date and aesthenda_private.plan_fits(bid,(state->>'professionalId')::uuid,(state->>'clientId')::uuid,x,service->'plan',hours,p_id);
 token:=md5(jsonb_build_array(state->>'token',service->>'token',zone)::text);
 return jsonb_build_object('timezone',zone,'revision',state->'revision','changeToken',token,'service',jsonb_set(service,'{token}',to_jsonb(token)),'slots',starts);
end $$;

create function aesthenda_private.change_appointment_service_v1(p_actor uuid,p_key uuid,p_id uuid,p_revision integer,p_service uuid,p_start timestamptz,p_token text) returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; prior public.appointments%rowtype; state jsonb; service jsonb; replay aesthenda_private.appointment_requests%rowtype; fingerprint text; hours jsonb; zone text; finish timestamptz; snapshot jsonb;
begin
 bid:=aesthenda_private.appointment_context(p_actor);
 if p_key is null or p_id is null or p_revision is null or p_revision<1 or p_service is null or p_start is null or not isfinite(p_start) or p_token is null or p_token !~ '^[0-9a-f]{32}$' then raise exception 'INVALID_INPUT';end if;
 fingerprint:=md5(jsonb_build_array('change-service',p_id,p_revision,p_service,extract(epoch from p_start),p_token)::text);
 perform pg_advisory_xact_lock(hashtextextended(bid::text,2));
 select * into replay from aesthenda_private.appointment_requests where business_id=bid and request_key=p_key;
 if found then if replay.fingerprint<>fingerprint then raise exception 'IDEMPOTENCY_CONFLICT';end if;return replay.appointment_id;end if;
 select * into prior from public.appointments where id=p_id for update;
 if not found then raise exception 'APPOINTMENT_UNAVAILABLE';end if;
 if prior.revision<>p_revision then raise exception 'STALE_APPOINTMENT';end if;
 if prior.start_at<=statement_timestamp() then raise exception 'APPOINTMENT_REQUIRES_REVIEW';end if;
 if prior.service_id=p_service then raise exception 'NO_SERVICE_CHANGE';end if;
 perform 1 from public.clients where id=prior.client_id for share;
 state:=aesthenda_private.appointment_move_state(p_actor,p_id);
 if state->>'token' is null then raise exception 'STALE_APPOINTMENT';end if;
 perform 1 from public.services where id=p_service for share;
 service:=aesthenda_private.appointment_service(p_service);
 zone:=state->>'timezone';
 if md5(jsonb_build_array(state->>'token',service->>'token',zone)::text)<>p_token then raise exception 'SERVICE_CHANGED';end if;
 hours:=aesthenda_private.effective_date_hours_v1(p_actor,(p_start at time zone zone)::date);
 if zone is distinct from hours->>'timezone' or not aesthenda_private.plan_fits(bid,prior.professional_id,prior.client_id,p_start,service->'plan',hours,p_id) then raise exception 'SLOT_UNAVAILABLE';end if;
 finish:=p_start+make_interval(mins=>(service->>'durationMinutes')::integer);
 snapshot:=(service-'token')||jsonb_build_object('timezone',zone,'localStart',timezone(zone,p_start),'localEnd',timezone(zone,finish),'bufferBefore',0,'bufferAfter',0);
 update public.appointments set service_id=p_service,start_at=p_start,end_at=finish,timing_plan=service->'plan',policy_version=service->>'policyVersion',service_snapshot=snapshot,revision=revision+1,updated_at=now() where id=p_id;
 delete from public.appointment_segments where appointment_id=p_id;
 perform aesthenda_private.sync_timing_segments(p_id);
 insert into aesthenda_private.appointment_requests values(bid,p_key,fingerprint,p_id);
 insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata) values(bid,p_actor,'Appointment',p_id,'changeAppointmentService',jsonb_build_object('action_version',1,'request_key',p_key,'source','professional','prior_revision',prior.revision,'new_revision',prior.revision+1,'prior_service_id',prior.service_id,'service_id',p_service,'prior_service_name',prior.service_snapshot->>'name','service_name',service->>'name','prior_price_cents',prior.service_snapshot->'priceCents','price_cents',service->'priceCents','prior_start_at',prior.start_at,'prior_end_at',prior.end_at,'start_at',p_start,'end_at',finish,'timezone',zone,'financial_outcome','no_payment_processed'));
 return p_id;
end $$;

revoke all on function aesthenda_private.service_change_slots_v1(uuid,uuid,uuid,date),aesthenda_private.change_appointment_service_v1(uuid,uuid,uuid,integer,uuid,timestamptz,text) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then execute 'revoke all on function aesthenda_private.service_change_slots_v1(uuid,uuid,uuid,date),aesthenda_private.change_appointment_service_v1(uuid,uuid,uuid,integer,uuid,timestamptz,text) from service_role';end if;end $$;
grant execute on function aesthenda_private.service_change_slots_v1(uuid,uuid,uuid,date),aesthenda_private.change_appointment_service_v1(uuid,uuid,uuid,integer,uuid,timestamptz,text) to aesthenda_runtime;
reset role;
revoke create on schema aesthenda_private from aesthenda_appointments_owner;
do $$ begin execute format('grant aesthenda_appointments_owner to %I with set false',current_user);end $$;
