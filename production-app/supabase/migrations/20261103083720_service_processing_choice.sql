-- Roe approved service-level processing release as the sole opt-in.
-- Keep legacy preference columns/signatures for rolling compatibility; no stored
-- appointment, service release choice, or client limit is rewritten.
do $$ begin execute format('grant aesthenda_appointments_owner to %I with set true',current_user);end $$;
grant create on schema aesthenda_private to aesthenda_appointments_owner;
set local role aesthenda_appointments_owner;
create or replace function aesthenda_private.plan_fits(p_bid uuid,p_pid uuid,p_client uuid,p_start timestamptz,p_plan jsonb,p_hours jsonb,p_ignore uuid) returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
declare duration integer:=aesthenda_private.plan_duration(p_plan); finish timestamptz; client_limit integer; a public.appointments%rowtype; existing_plan jsonb; candidate jsonb; existing jsonb; boundary timestamptz;
begin
 finish:=p_start+make_interval(mins=>duration);
 -- Reuse the established civil-time, complete-visit working-hours and DST rules.
 if not aesthenda_private.civil_visit_fits(p_start,duration,p_hours) then return false;end if;
 select max_concurrent_clients into client_limit from aesthenda_private.booking_preferences where business_id=p_bid;
 client_limit:=coalesce(client_limit,2);
 -- Existing blocks and unsnapshotted holds remain conservative full-visit reservations.
 if exists(select 1 from public.calendar_blocks where business_id=p_bid and professional_id=p_pid and removed_at is null and start_at<finish and end_at>p_start) then return false;end if;
 if exists(select 1 from public.booking_holds where business_id=p_bid and professional_id=p_pid and status='active' and expires_at>statement_timestamp() and start_at<finish and end_at>p_start) then return false;end if;
 for a in select * from public.appointments where business_id=p_bid and professional_id=p_pid and (p_ignore is null or id<>p_ignore) and status in ('pending','confirmed') and start_at<finish and end_at>p_start loop
  if (p_client is not null and a.client_id=p_client) then return false;end if;
  existing_plan:=case when a.timing_plan is not null and jsonb_array_length(a.timing_plan) between 1 and 20 and a.end_at=a.start_at+make_interval(mins=>aesthenda_private.plan_duration(a.timing_plan)) and aesthenda_private.timing_matches(a.id,a.timing_plan) then a.timing_plan else aesthenda_private.legacy_timing_plan(a.service_snapshot,ceil(extract(epoch from a.end_at-a.start_at)/60)::integer) end;
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
create or replace function aesthenda_private.read_booking_preferences_v2(p_actor uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; result jsonb;
begin
 bid:=aesthenda_private.appointment_context(p_actor);
 result:=aesthenda_private.read_booking_preferences_v1(p_actor);
 return result||coalesce((select jsonb_build_object('processingEnabled',true,'maxConcurrentClients',max_concurrent_clients) from aesthenda_private.booking_preferences where business_id=bid),'{"processingEnabled":true,"maxConcurrentClients":2}'::jsonb);
end $$;
create or replace function aesthenda_private.save_booking_preferences_v2(p_actor uuid,p_revision integer,p_auto boolean,p_processing boolean,p_limit integer) returns void language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; prior aesthenda_private.booking_preferences%rowtype;
begin
 -- Deprecated p_processing is ignored; release is controlled by booked steps.
 p_processing:=true;
 bid:=aesthenda_private.appointment_context(p_actor);
 if p_revision is null or p_revision<0 or p_auto is null or p_processing is null or p_limit is null or p_limit not between 2 and 10 then raise exception 'INVALID_INPUT';end if;
 perform pg_advisory_xact_lock(hashtextextended(bid::text,2));
 select * into prior from aesthenda_private.booking_preferences where business_id=bid;
 if coalesce(prior.revision,0)<>p_revision then
  if prior.auto_confirm=p_auto and prior.processing_enabled=p_processing and prior.max_concurrent_clients=p_limit and prior.revision=p_revision+1 then return;end if;
  raise exception 'STALE_PREFERENCES';
 end if;
 if exists(select 1 from public.appointments a where a.business_id=bid and a.status in ('pending','confirmed') and a.end_at>statement_timestamp() and (select count(*) from public.appointments b where b.business_id=bid and b.professional_id=a.professional_id and b.status in ('pending','confirmed') and b.start_at<=greatest(a.start_at,statement_timestamp()) and b.end_at>greatest(a.start_at,statement_timestamp()))>p_limit) then raise exception 'PROCESSING_POLICY_REVIEW';end if;
 insert into aesthenda_private.booking_preferences(business_id,auto_confirm,processing_enabled,max_concurrent_clients) values(bid,p_auto,p_processing,p_limit)
 on conflict(business_id) do update set auto_confirm=excluded.auto_confirm,processing_enabled=excluded.processing_enabled,max_concurrent_clients=excluded.max_concurrent_clients,revision=booking_preferences.revision+1;
 insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata) values(bid,p_actor,'Business',bid,'updateBookingPreferences',jsonb_build_object('auto_confirm',p_auto,'processing_enabled',p_processing,'max_concurrent_clients',p_limit,'prior_revision',p_revision));
end $$;
reset role;
revoke create on schema aesthenda_private from aesthenda_appointments_owner;
do $$ begin execute format('grant aesthenda_appointments_owner to %I with set false',current_user);end $$;
