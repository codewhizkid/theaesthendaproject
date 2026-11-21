-- Unverified historical layouts reserve the exact full visit conservatively.
-- Round up partial legacy minutes, never leave a fractional tail bookable.
do $$ begin execute format('grant aesthenda_appointments_owner to %I with set true',current_user);end $$;
grant create on schema aesthenda_private to aesthenda_appointments_owner;
set local role aesthenda_appointments_owner;
create or replace function aesthenda_private.plan_fits(p_bid uuid,p_pid uuid,p_client uuid,p_start timestamptz,p_plan jsonb,p_hours jsonb,p_ignore uuid) returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
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
reset role;
revoke create on schema aesthenda_private from aesthenda_appointments_owner;
do $$ begin execute format('grant aesthenda_appointments_owner to %I with set false',current_user);end $$;
