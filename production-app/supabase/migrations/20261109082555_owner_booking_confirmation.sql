-- Calendar bookings share the transactional receipt outbox, without guest sessions.
-- Existing bookings are not backfilled or emailed by this migration.
alter table aesthenda_private.booking_confirmation_messages alter column session_id drop not null;
create unique index booking_confirmation_owner_appointment on aesthenda_private.booking_confirmation_messages(appointment_id) where session_id is null;
do $$ begin execute format('grant aesthenda_appointments_owner to %I with set true',current_user);end $$;
grant create on schema aesthenda_private to aesthenda_appointments_owner;
set local role aesthenda_appointments_owner;
create function aesthenda_private.create_owner_appointment_v1(p_actor uuid,p_key uuid,p_client uuid,p_service uuid,p_start timestamptz,p_token text) returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid;aid uuid;existed boolean;recipient text;a public.appointments%rowtype;
begin
 bid:=aesthenda_private.appointment_context(p_actor);
 perform pg_advisory_xact_lock(hashtextextended(bid::text,2));
 existed:=exists(select 1 from aesthenda_private.appointment_requests where business_id=bid and request_key=p_key);
 aid:=aesthenda_private.create_appointment_v1(p_actor,p_key,p_client,p_service,p_start,p_token);
 if existed then return aid;end if;
 select * into a from public.appointments where id=aid;
 select lower(btrim(email)) into recipient from public.clients where id=a.client_id;
 if recipient is not null and length(recipient)<=254 and recipient ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
  insert into aesthenda_private.booking_confirmation_messages(business_id,appointment_id,email,payload)
  values(bid,aid,recipient,jsonb_build_object('appointmentId',aid,'revision',a.revision,'status',a.status,'salonName',(select name from public.businesses where id=bid),'professionalName',(select full_name from public.professionals where id=a.professional_id),'serviceName',a.service_snapshot->>'name','priceCents',(a.service_snapshot->>'priceCents')::integer,'currency',a.service_snapshot->>'currency','startAt',a.start_at,'endAt',a.end_at,'timezone',a.timezone));
 end if;
 return aid;
end $$;
create function aesthenda_private.owner_booking_message_v1(p_actor uuid,p_appointment uuid,p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid;m aesthenda_private.booking_confirmation_messages%rowtype;a public.appointments%rowtype;recipient text;
begin
 bid:=aesthenda_private.appointment_context(p_actor);
 if p_appointment is null or p_action is null or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>2048 then raise exception 'INVALID_INPUT';end if;
 -- Same order as calendar mutations: business lock before appointment/message locks.
 perform pg_advisory_xact_lock(hashtextextended(bid::text,2));
 select * into a from public.appointments where id=p_appointment and booking_source='professional_v1';
 if not found then raise exception 'APPOINTMENT_UNAVAILABLE';end if;
 select * into m from aesthenda_private.booking_confirmation_messages where appointment_id=a.id and session_id is null for update;
 if not found then return jsonb_build_object('state','not_requested');end if;
 if p_action='status' then return jsonb_build_object('state',m.state);end if;
 if p_action='claim' then
  if m.state in ('accepted','failed','review_required') then return jsonb_build_object('state',m.state);end if;
  if m.last_attempt_at>statement_timestamp()-interval '60 seconds' then return jsonb_build_object('state','pending');end if;
  select lower(btrim(email)) into recipient from public.clients where id=a.client_id;
  if m.attempts>=3 or m.first_attempt_at<statement_timestamp()-interval '23 hours' or a.start_at<=statement_timestamp() or a.revision is distinct from (m.payload->>'revision')::integer or a.status::text is distinct from m.payload->>'status' or a.start_at is distinct from (m.payload->>'startAt')::timestamptz or a.end_at is distinct from (m.payload->>'endAt')::timestamptz or recipient is distinct from m.email then
   update aesthenda_private.booking_confirmation_messages set state='review_required' where id=m.id;return jsonb_build_object('state','review_required');
  end if;
  update aesthenda_private.booking_confirmation_messages set state='sending',lease=gen_random_uuid(),attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,statement_timestamp()),last_attempt_at=statement_timestamp() where id=m.id returning * into m;
  return jsonb_build_object('state','claimed','id',m.id,'lease',m.lease,'email',m.email,'payload',m.payload);
 elsif p_action='result' then
  if m.state<>'sending' or m.lease::text is distinct from p_data->>'lease' then return jsonb_build_object('state',m.state);end if;
  if p_data->>'state' is null or p_data->>'state' not in ('accepted','pending','failed') then raise exception 'INVALID_INPUT';end if;
  update aesthenda_private.booking_confirmation_messages set state=p_data->>'state',provider_id=left(p_data->>'providerId',128) where id=m.id;return jsonb_build_object('state',p_data->>'state');
 end if;raise exception 'INVALID_ACTION';
end $$;
revoke all on function aesthenda_private.create_owner_appointment_v1(uuid,uuid,uuid,uuid,timestamptz,text),aesthenda_private.owner_booking_message_v1(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function aesthenda_private.create_owner_appointment_v1(uuid,uuid,uuid,uuid,timestamptz,text),aesthenda_private.owner_booking_message_v1(uuid,uuid,text,jsonb) to aesthenda_runtime;
reset role;
revoke create on schema aesthenda_private from aesthenda_appointments_owner;
do $$ begin execute format('grant aesthenda_appointments_owner to %I with set false',current_user);end $$;
