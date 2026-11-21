-- Presentation controls only: existing appointment planning/commit APIs stay intact.
alter table aesthenda_private.booking_preferences add column client_visible_percent integer not null default 100 check(client_visible_percent in (20,50,80,100));
do $$ begin execute format('grant aesthenda_appointments_owner to %I with set true',current_user);end $$;
grant create on schema aesthenda_private to aesthenda_appointments_owner;
set local role aesthenda_appointments_owner;
create function aesthenda_private.read_client_booking_visibility_v1(p_actor uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid;
begin
 bid:=aesthenda_private.appointment_context(p_actor);
 return coalesce((select jsonb_build_object('showPercent',client_visible_percent,'revision',revision) from aesthenda_private.booking_preferences where business_id=bid),'{"showPercent":100,"revision":0}'::jsonb);
end $$;
create function aesthenda_private.save_client_booking_visibility_v1(p_actor uuid,p_revision integer,p_percent integer) returns void language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; prior aesthenda_private.booking_preferences%rowtype;
begin
 bid:=aesthenda_private.appointment_context(p_actor);
 if p_revision is null or p_revision<0 or p_revision>2147483646 or p_percent is null or p_percent not in (20,50,80,100) then raise exception 'INVALID_INPUT';end if;
 perform pg_advisory_xact_lock(hashtextextended(bid::text,2));
 select * into prior from aesthenda_private.booking_preferences where business_id=bid;
 if coalesce(prior.revision,0)<>p_revision then
  -- A retry may acknowledge only the immediately preceding identical save.
  if prior.revision=p_revision+1 and prior.client_visible_percent=p_percent then return;end if;
  raise exception 'STALE_PREFERENCES';
 end if;
 insert into aesthenda_private.booking_preferences(business_id,client_visible_percent) values(bid,p_percent)
 on conflict(business_id) do update set client_visible_percent=excluded.client_visible_percent,revision=booking_preferences.revision+1;
 insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata) values(bid,p_actor,'Business',bid,'updateClientBookingVisibility',jsonb_build_object('showPercent',p_percent,'startIntervalMinutes',30,'priorRevision',p_revision));
end $$;
reset role;
revoke all on function aesthenda_private.read_client_booking_visibility_v1(uuid),aesthenda_private.save_client_booking_visibility_v1(uuid,integer,integer) from public,anon,authenticated;
grant execute on function aesthenda_private.read_client_booking_visibility_v1(uuid),aesthenda_private.save_client_booking_visibility_v1(uuid,integer,integer) to aesthenda_runtime;
revoke create on schema aesthenda_private from aesthenda_appointments_owner;
do $$ begin execute format('grant aesthenda_appointments_owner to %I with set false',current_user);end $$;
