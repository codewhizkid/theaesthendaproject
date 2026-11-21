-- Private invitation-only guest checkout. No public catalog or Auth identities.
-- Managed as an extension of the existing constrained appointment routines role.
create table aesthenda_private.guest_booking_policies(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id),terms text not null check(length(terms) between 1 and 4000),created_at timestamptz not null default statement_timestamp()
);
create table aesthenda_private.guest_booking_sessions(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id),owner_id uuid not null references auth.users(id),session_hash text not null unique check(session_hash ~ '^[0-9a-f]{64}$'),
 service_id uuid not null references public.services(id),service_token text not null,start_at timestamptz not null,expires_at timestamptz not null,policy_id uuid not null references aesthenda_private.guest_booking_policies(id),
 hold_id uuid,appointment_id uuid references public.appointments(id),first_name text,last_name text,email text,phone_hint text,updates_email boolean not null default false,
 verified_at timestamptz,challenge_id uuid,token_hash text,encrypted_token text,delivery_state text not null default 'not_requested' check(delivery_state in ('not_requested','accepted','pending','failed')),send_count integer not null default 0,last_send_at timestamptz,created_at timestamptz not null default statement_timestamp()
);
alter table public.booking_holds add column guest_session_id uuid references aesthenda_private.guest_booking_sessions(id);
alter table public.booking_holds alter column client_id drop not null;
alter table public.booking_holds add constraint hold_client_or_guest check(client_id is not null or guest_session_id is not null);
alter table aesthenda_private.guest_booking_sessions add constraint guest_hold_fk foreign key(hold_id) references public.booking_holds(id);
create index guest_booking_rate on aesthenda_private.guest_booking_sessions(business_id,created_at);
create index guest_booking_email_rate on aesthenda_private.guest_booking_sessions(business_id,email,last_send_at);
alter table aesthenda_private.guest_booking_policies enable row level security;
alter table aesthenda_private.guest_booking_policies force row level security;
alter table aesthenda_private.guest_booking_sessions enable row level security;
alter table aesthenda_private.guest_booking_sessions force row level security;
revoke all on aesthenda_private.guest_booking_policies,aesthenda_private.guest_booking_sessions from public,anon,authenticated,aesthenda_runtime;
grant select,insert on aesthenda_private.guest_booking_policies to aesthenda_appointments_owner;
grant select,insert,update on aesthenda_private.guest_booking_sessions to aesthenda_appointments_owner;
create policy guest_policy_scope on aesthenda_private.guest_booking_policies to aesthenda_appointments_owner using(business_id=nullif(current_setting('app.business_account_id',true),'')::uuid) with check(business_id=nullif(current_setting('app.business_account_id',true),'')::uuid);
create policy guest_session_scope on aesthenda_private.guest_booking_sessions to aesthenda_appointments_owner using(session_hash=nullif(current_setting('app.guest_session_hash',true),'') or owner_id=nullif(current_setting('app.verified_actor_id',true),'')::uuid) with check(business_id=nullif(current_setting('app.business_account_id',true),'')::uuid and (session_hash=nullif(current_setting('app.guest_session_hash',true),'') or owner_id=nullif(current_setting('app.verified_actor_id',true),'')::uuid));
grant insert on public.booking_holds to aesthenda_appointments_owner;
grant update(status) on public.booking_holds to aesthenda_appointments_owner;
grant insert(business_id,first_name,last_name,email,phone,status) on public.clients to aesthenda_appointments_owner;
-- Audit actor remains NULL for guest actions; the owner is only the invitation issuer.
create policy guest_audit_insert on public.audit_events for insert to aesthenda_appointments_owner with check(actor_id is null and business_id=nullif(current_setting('app.business_account_id',true),'')::uuid and exists(select 1 from aesthenda_private.guest_booking_sessions where session_hash=nullif(current_setting('app.guest_session_hash',true),'') and business_id=audit_events.business_id));
do $$ begin execute format('grant aesthenda_appointments_owner to %I with set true',current_user);end $$;
grant create on schema aesthenda_private to aesthenda_appointments_owner;
set local role aesthenda_appointments_owner;
create function aesthenda_private.save_guest_policy_v1(p_owner uuid,p_terms text) returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; result uuid;
begin bid:=aesthenda_private.appointment_context(p_owner);if p_terms is null or length(btrim(p_terms)) not between 1 and 4000 then raise exception 'INVALID_POLICY';end if;perform pg_advisory_xact_lock(hashtextextended(bid::text,2));insert into aesthenda_private.guest_booking_policies(business_id,terms) values(bid,btrim(p_terms)) returning id into result;return result;end $$;
create function aesthenda_private.start_guest_booking_v1(p_owner uuid,p_hash text,p_service uuid,p_start timestamptz,p_token text,p_date date) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; prior aesthenda_private.guest_booking_sessions%rowtype; pid uuid; policy uuid; catalog jsonb; slots jsonb; eligible jsonb; n integer; percent integer; session_id uuid; hid uuid; expiry timestamptz; end_time timestamptz;
begin
 if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or p_start is null or not isfinite(p_start) or p_start<=statement_timestamp() or p_service is null or p_token is null or p_date is null then raise exception 'INVALID_INPUT';end if;
 bid:=aesthenda_private.appointment_context(p_owner);perform set_config('app.guest_session_hash',p_hash,true);perform pg_advisory_xact_lock(hashtextextended(bid::text,2));
 select * into prior from aesthenda_private.guest_booking_sessions where session_hash=p_hash;
 if found then if prior.business_id<>bid or prior.service_id<>p_service or prior.start_at<>p_start or prior.service_token<>p_token then raise exception 'SESSION_EXISTS';end if;return jsonb_build_object('expiresAt',prior.expires_at);end if;
 select id into policy from aesthenda_private.guest_booking_policies where business_id=bid order by created_at desc,id desc limit 1;if policy is null then raise exception 'POLICY_REQUIRED';end if;
 if (select count(*) from aesthenda_private.guest_booking_sessions where business_id=bid and created_at>statement_timestamp()-interval '1 hour')>=30 then raise exception 'RATE_LIMIT';end if;
 catalog:=aesthenda_private.appointment_slots_v2(p_owner,p_service,p_date,null);
 if catalog->'service'->>'token'<>p_token then raise exception 'SERVICE_CHANGED';end if;
 select coalesce(client_visible_percent,100) into percent from aesthenda_private.booking_preferences where business_id=bid;percent:=coalesce(percent,100);
 select coalesce(jsonb_agg(value order by value->>'startAt'),'[]') into eligible from jsonb_array_elements(catalog->'slots') where (value->>'minute')::integer%30=0 and (value->>'startAt')::timestamptz>statement_timestamp();n:=jsonb_array_length(eligible);
 -- Same deterministic bucket selection as visibleClientSlots, computed server-side.
 if not exists(select 1 from generate_series(0,ceil(n*percent/100.0)::integer-1) i where ((eligible->floor((i+0.5)*n/ceil(n*percent/100.0))::integer)->>'startAt')::timestamptz=p_start) then raise exception 'SLOT_UNAVAILABLE';end if;
 select id into pid from public.professionals where business_id=bid and user_id=p_owner and status='active';if pid is null then raise exception 'PROFESSIONAL_UNAVAILABLE';end if;
 expiry:=statement_timestamp()+interval '10 minutes';end_time:=p_start+make_interval(mins=>(catalog->'service'->>'durationMinutes')::integer);
 insert into aesthenda_private.guest_booking_sessions(business_id,owner_id,session_hash,service_id,service_token,start_at,expires_at,policy_id) values(bid,p_owner,p_hash,p_service,p_token,p_start,expiry,policy) returning id into session_id;
 insert into public.booking_holds(business_id,professional_id,client_id,service_id,start_at,end_at,expires_at,guest_session_id) values(bid,pid,null,p_service,p_start,end_time,expiry,session_id) returning id into hid;
 update aesthenda_private.guest_booking_sessions set hold_id=hid where id=session_id;
 return jsonb_build_object('expiresAt',expiry);
end $$;
create function aesthenda_private.guest_booking_v1(p_hash text,p_action text,p_data jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare s aesthenda_private.guest_booking_sessions%rowtype; bid uuid; service jsonb; terms text; current_policy uuid; h public.booking_holds%rowtype; zone text; cid uuid; ids uuid[]; candidate record; aid uuid; status_value text; email_value text; first_value text; last_value text; phone_value text;
begin
 if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or p_action is null or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>12000 then raise exception 'INVALID_INPUT';end if;
 perform set_config('app.verified_actor_id','',true);perform set_config('app.business_account_id','',true);perform set_config('app.guest_session_hash',p_hash,true);
 select * into s from aesthenda_private.guest_booking_sessions where session_hash=p_hash;if not found then raise exception 'SESSION_UNAVAILABLE';end if;
 bid:=aesthenda_private.appointment_context(s.owner_id);perform pg_advisory_xact_lock(hashtextextended(bid::text,2));
 select * into s from aesthenda_private.guest_booking_sessions where session_hash=p_hash for update;
 select * into h from public.booking_holds where id=s.hold_id for update;
 select p.terms into terms from aesthenda_private.guest_booking_policies p where p.id=s.policy_id;
 if p_action='status' then
  select timezone into zone from aesthenda_private.weekly_schedules where business_id=bid;
  if s.appointment_id is not null then
   select service_snapshot into service from public.appointments where id=s.appointment_id;
  else
   select jsonb_build_object('name',name,'durationMinutes',duration_minutes,'priceCents',price_cents,'currency',currency) into service from public.services where id=s.service_id;
  end if;
  return jsonb_build_object('state',case when s.appointment_id is not null then 'booked' when h.status='released' then 'released' when s.expires_at<=statement_timestamp() then 'expired' when s.verified_at is not null then 'verified' else 'unverified' end,'expiresAt',s.expires_at,'serverNow',statement_timestamp(),'service',service,'startAt',s.start_at,'endAt',h.end_at,'timezone',zone,'terms',terms,'policyId',s.policy_id,'firstName',s.first_name,'lastName',s.last_name,'email',s.email,'updatesEmail',s.updates_email,'delivery',s.delivery_state,'phoneHint',s.phone_hint,'salonName',(select name from public.businesses where id=bid),'professionalName',(select full_name from public.professionals where id=h.professional_id),'appointmentId',s.appointment_id,'appointmentStatus',(select status from public.appointments where id=s.appointment_id));
 end if;
 if p_action='confirm' and s.appointment_id is not null then return jsonb_build_object('state','booked','appointmentId',s.appointment_id);end if;
 if s.appointment_id is not null then raise exception 'ALREADY_BOOKED';end if;
 if p_action='release' then update public.booking_holds set status='released' where id=h.id and status='active';return jsonb_build_object('state','released');end if;
 if s.expires_at<=statement_timestamp() or h.status<>'active' or h.expires_at<=statement_timestamp() then return jsonb_build_object('state','expired');end if;
 if p_action='email' then
  email_value:=lower(btrim(p_data->>'email'));first_value:=btrim(p_data->>'firstName');last_value:=coalesce(btrim(p_data->>'lastName'),'');phone_value:=coalesce(btrim(p_data->>'phone'),'');
  if email_value is null or length(email_value)>254 or email_value !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or first_value is null or length(first_value) not between 1 and 80 or length(last_value)>80 or length(phone_value)>40 or (phone_value<>'' and phone_value !~ '^[+0-9 ().-]{7,40}$') or coalesce(p_data->>'tokenHash','') !~ '^[0-9a-f]{64}$' or length(coalesce(p_data->>'encryptedToken','')) not between 64 and 512 then raise exception 'INVALID_INPUT';end if;
  if s.verified_at is not null and s.email=email_value and s.first_name=first_value and s.last_name=last_value and s.phone_hint=phone_value and s.updates_email=coalesce((p_data->>'updatesEmail')::boolean,false) then return jsonb_build_object('state','verified');end if;
  if s.last_send_at>statement_timestamp()-interval '60 seconds' then raise exception 'RATE_LIMIT';end if;
  if s.send_count>=3 or (select count(*) from aesthenda_private.guest_booking_sessions where business_id=bid and email=email_value and last_send_at>statement_timestamp()-interval '1 hour')>=5 then raise exception 'RATE_LIMIT';end if;
  if s.email is distinct from email_value or s.first_name is distinct from first_value or s.last_name is distinct from last_value or s.phone_hint is distinct from phone_value or s.updates_email is distinct from coalesce((p_data->>'updatesEmail')::boolean,false) or s.challenge_id is null then
   update aesthenda_private.guest_booking_sessions set challenge_id=gen_random_uuid(),token_hash=p_data->>'tokenHash',encrypted_token=p_data->>'encryptedToken',verified_at=null where id=s.id;
  end if;
  update aesthenda_private.guest_booking_sessions set first_name=first_value,last_name=last_value,email=email_value,phone_hint=phone_value,updates_email=coalesce((p_data->>'updatesEmail')::boolean,false),delivery_state='pending',send_count=send_count+1,last_send_at=statement_timestamp() where id=s.id returning * into s;
  return jsonb_build_object('state','pending','challengeId',s.challenge_id,'email',s.email,'encryptedToken',s.encrypted_token);
 elsif p_action='email_result' then
  if p_data->>'challengeId'<>s.challenge_id::text then raise exception 'INVALID_CHALLENGE';end if;
  if p_data->>'status' not in ('accepted','pending','failed') then raise exception 'INVALID_INPUT';end if;
  update aesthenda_private.guest_booking_sessions set delivery_state=p_data->>'status' where id=s.id;return jsonb_build_object('state',p_data->>'status');
 elsif p_action='verify' then
  if s.token_hash is null or p_data->>'tokenHash' is null or s.token_hash<>p_data->>'tokenHash' then return jsonb_build_object('state','invalid');end if;
  if s.verified_at is null then update aesthenda_private.guest_booking_sessions set verified_at=statement_timestamp(),encrypted_token=null where id=s.id;end if;
  return jsonb_build_object('state','verified');
 elsif p_action='confirm' then
  if s.verified_at is null or p_data->>'policyId' is distinct from s.policy_id::text or p_data->>'accepted' is distinct from 'true' then raise exception 'VERIFICATION_AND_POLICY_REQUIRED';end if;
  select id into current_policy from aesthenda_private.guest_booking_policies where business_id=bid order by created_at desc,id desc limit 1;if current_policy<>s.policy_id then return jsonb_build_object('state','policy_changed');end if;
  perform pg_advisory_xact_lock(hashtextextended(bid::text,3));
  select array_agg(id) into ids from public.clients where business_id=bid and lower(btrim(email))=s.email;
  if coalesce(cardinality(ids),0)>1 then return jsonb_build_object('state','review_required');end if;
  -- An unverified phone is a collision hint only, never identity proof.
  if s.phone_hint<>'' and exists(select 1 from public.clients where business_id=bid and (ids is null or not(id=any(ids))) and right(regexp_replace(phone,'[^0-9]','','g'),10)=right(regexp_replace(s.phone_hint,'[^0-9]','','g'),10)) then return jsonb_build_object('state','review_required');end if;
  if cardinality(ids)=1 then cid:=ids[1];select status into candidate from public.clients where id=cid;if candidate.status not in ('active','lead') then return jsonb_build_object('state','review_required');end if;end if;
  service:=aesthenda_private.appointment_service(s.service_id);select timezone into zone from aesthenda_private.weekly_schedules where business_id=bid;
  if md5((service->>'token')||zone)<>s.service_token then return jsonb_build_object('state','service_changed');end if;
  -- Release our own hold only inside this transaction. Fit recheck sees all
  -- other live holds and bookings; rollback restores it if any write fails.
  update public.booking_holds set status='consumed' where id=h.id;
  if s.start_at<=statement_timestamp() or not aesthenda_private.plan_fits(bid,h.professional_id,cid,s.start_at,service->'plan',aesthenda_private.effective_date_hours_v1(s.owner_id,(s.start_at at time zone zone)::date),null) then update public.booking_holds set status='active' where id=h.id;return jsonb_build_object('state','unavailable');end if;
  if cid is null then insert into public.clients(business_id,first_name,last_name,email,phone,status) values(bid,s.first_name,s.last_name,s.email,'','active') returning id into cid;end if;
  select case when auto_confirm then 'confirmed' else 'pending' end into status_value from aesthenda_private.booking_preferences where business_id=bid;status_value:=coalesce(status_value,'pending');
  insert into public.appointments(business_id,professional_id,client_id,service_id,start_at,end_at,status,policy_version,service_snapshot,created_by,booking_source,timezone,timing_plan)
  values(bid,h.professional_id,cid,s.service_id,s.start_at,h.end_at,status_value,service->>'policyVersion',(service-'token')||jsonb_build_object('timezone',zone,'guestPolicyId',s.policy_id,'guestPolicyTerms',terms,'guestPolicyAcceptedAt',statement_timestamp(),'updatesEmail',s.updates_email),null,'guest_v1',zone,service->'plan') returning id into aid;
  perform aesthenda_private.sync_timing_segments(aid);
  update aesthenda_private.guest_booking_sessions set appointment_id=aid,encrypted_token=null where id=s.id;
  insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata) values(bid,null,'Appointment',aid,'createGuestAppointment',jsonb_build_object('guestSessionId',s.id,'verifiedEmail',true,'policyId',s.policy_id,'updatesEmail',s.updates_email,'source','guest','status',status_value));
  return jsonb_build_object('state','booked','appointmentId',aid,'appointmentStatus',status_value);
 end if;
 raise exception 'INVALID_ACTION';
end $$;
revoke all on function aesthenda_private.save_guest_policy_v1(uuid,text),aesthenda_private.start_guest_booking_v1(uuid,text,uuid,timestamptz,text,date),aesthenda_private.guest_booking_v1(text,text,jsonb) from public,anon,authenticated;
grant execute on function aesthenda_private.save_guest_policy_v1(uuid,text),aesthenda_private.start_guest_booking_v1(uuid,text,uuid,timestamptz,text,date),aesthenda_private.guest_booking_v1(text,text,jsonb) to aesthenda_runtime;
reset role;
revoke create on schema aesthenda_private from aesthenda_appointments_owner;
do $$ begin execute format('grant aesthenda_appointments_owner to %I with set false',current_user);end $$;
