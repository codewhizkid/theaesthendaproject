-- Account booking requires the trusted server's verified identity, never form claims.
alter table aesthenda_private.guest_booking_sessions add column entry_mode text not null default 'guest' check(entry_mode in ('guest','create','signin'));
alter table aesthenda_private.guest_booking_sessions add column account_subject uuid references auth.users(id);
alter table aesthenda_private.guest_booking_sessions add column account_client_id uuid references public.clients(id);
create table aesthenda_private.booking_confirmation_messages(
 id uuid primary key default gen_random_uuid(),session_id uuid not null unique references aesthenda_private.guest_booking_sessions(id),business_id uuid not null references public.businesses(id),appointment_id uuid not null references public.appointments(id),email text not null,payload jsonb not null,
 state text not null default 'queued' check(state in ('queued','sending','accepted','pending','failed','review_required')),attempts integer not null default 0,first_attempt_at timestamptz,last_attempt_at timestamptz,lease uuid,provider_id text,created_at timestamptz not null default statement_timestamp()
);
alter table aesthenda_private.booking_confirmation_messages enable row level security;
alter table aesthenda_private.booking_confirmation_messages force row level security;
revoke all on aesthenda_private.booking_confirmation_messages from public,anon,authenticated,aesthenda_runtime;
grant select,insert,update on aesthenda_private.booking_confirmation_messages to aesthenda_appointments_owner;
create policy booking_message_scope on aesthenda_private.booking_confirmation_messages to aesthenda_appointments_owner using(business_id=nullif(current_setting('app.business_account_id',true),'')::uuid) with check(business_id=nullif(current_setting('app.business_account_id',true),'')::uuid);
do $$ begin execute format('grant aesthenda_client_access_owner to %I with set true',current_user);end $$;
set local role aesthenda_client_access_owner;
grant execute on function aesthenda_private.create_client_signin_invite_v1(uuid,text),aesthenda_private.resolve_client_identity_v1(uuid,text,text,text,text,text,text) to aesthenda_appointments_owner;
reset role;
do $$ begin execute format('grant aesthenda_client_access_owner to %I with set false',current_user);end $$;
do $$ begin execute format('grant aesthenda_appointments_owner to %I with set true',current_user);end $$;
grant create on schema aesthenda_private to aesthenda_appointments_owner;
set local role aesthenda_appointments_owner;
create or replace function aesthenda_private.guest_booking_v1(p_hash text,p_action text,p_data jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
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
  return jsonb_build_object('state',case when s.appointment_id is not null then 'booked' when h.status='released' then 'released' when s.expires_at<=statement_timestamp() then 'expired' when s.verified_at is not null then 'verified' else 'unverified' end,'entryMode',s.entry_mode,'notification',coalesce((select state from aesthenda_private.booking_confirmation_messages where session_id=s.id),'not_requested'),'expiresAt',s.expires_at,'serverNow',statement_timestamp(),'service',service,'startAt',s.start_at,'endAt',h.end_at,'timezone',zone,'terms',terms,'policyId',s.policy_id,'firstName',s.first_name,'lastName',s.last_name,'email',s.email,'updatesEmail',s.updates_email,'delivery',s.delivery_state,'phoneHint',s.phone_hint,'salonName',(select name from public.businesses where id=bid),'professionalName',(select full_name from public.professionals where id=h.professional_id),'appointmentId',s.appointment_id,'appointmentStatus',(select status from public.appointments where id=s.appointment_id));
 end if;
 if s.entry_mode<>'guest' and p_action not in ('status','release') and (s.account_subject is null or s.account_subject::text is distinct from nullif(current_setting('app.verified_booking_subject',true),'')) then raise exception 'ACCOUNT_REQUIRED';end if;
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
  if s.account_client_id is not null then ids:=array[s.account_client_id];else
  select array_agg(id) into ids from public.clients where business_id=bid and lower(btrim(email))=s.email;
  if coalesce(cardinality(ids),0)>1 then return jsonb_build_object('state','review_required');end if;
  -- An unverified phone is a collision hint only, never identity proof.
  if s.phone_hint<>'' and exists(select 1 from public.clients where business_id=bid and (ids is null or not(id=any(ids))) and right(regexp_replace(phone,'[^0-9]','','g'),10)=right(regexp_replace(s.phone_hint,'[^0-9]','','g'),10)) then return jsonb_build_object('state','review_required');end if;
  end if;
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
  if s.updates_email then
   insert into aesthenda_private.booking_confirmation_messages(session_id,business_id,appointment_id,email,payload)
   values(s.id,bid,aid,s.email,jsonb_build_object('appointmentId',aid,'status',status_value,'salonName',(select name from public.businesses where id=bid),'professionalName',(select full_name from public.professionals where id=h.professional_id),'serviceName',service->>'name','priceCents',service->'priceCents','currency',service->>'currency','startAt',s.start_at,'endAt',h.end_at,'timezone',zone));
  end if;
  update aesthenda_private.guest_booking_sessions set appointment_id=aid,encrypted_token=null where id=s.id;
  insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata) values(bid,null,'Appointment',aid,'createGuestAppointment',jsonb_build_object('guestSessionId',s.id,'verifiedEmail',true,'policyId',s.policy_id,'updatesEmail',s.updates_email,'source','guest','status',status_value));
  return jsonb_build_object('state','booked','appointmentId',aid,'appointmentStatus',status_value);
 end if;
 raise exception 'INVALID_ACTION';
end $$;

create function aesthenda_private.start_account_booking_v1(p_owner uuid,p_hash text,p_service uuid,p_start timestamptz,p_token text,p_date date,p_mode text) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare result jsonb; s aesthenda_private.guest_booking_sessions%rowtype;
begin
 if p_mode not in ('signin','create') or p_mode is null then raise exception 'INVALID_INPUT';end if;
 result:=aesthenda_private.start_guest_booking_v1(p_owner,p_hash,p_service,p_start,p_token,p_date);
 select * into s from aesthenda_private.guest_booking_sessions where session_hash=p_hash for update;
 if s.email is not null or s.appointment_id is not null or s.entry_mode not in ('guest',p_mode) then raise exception 'SESSION_EXISTS';end if;
 update aesthenda_private.guest_booking_sessions set entry_mode=p_mode where id=s.id;return result;
end $$;
create function aesthenda_private.confirm_account_booking_v1(p_hash text,p_subject uuid,p_email text,p_phone text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare s aesthenda_private.guest_booking_sessions%rowtype; bid uuid; invitation_hash text; linked jsonb; result jsonb; failure text;
begin
 if p_subject is null or p_email is null or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'VERIFIED_EMAIL_REQUIRED';end if;
 perform set_config('app.verified_booking_subject','',true);
 result:=aesthenda_private.guest_booking_v1(p_hash,'status','{}');
 select * into s from aesthenda_private.guest_booking_sessions where session_hash=p_hash for update;
 if s.entry_mode='guest' then raise exception 'ACCOUNT_REQUIRED';end if;
 if s.account_subject is not null and s.account_subject<>p_subject then raise exception 'ACCOUNT_MISMATCH';end if;
 if s.appointment_id is not null then return jsonb_build_object('state','booked','appointmentId',s.appointment_id);end if;
 if result->>'state' in ('expired','released') then return jsonb_build_object('state',result->>'state');end if;
 if p_data->>'accepted' is distinct from 'true' or p_data->>'policyId' is distinct from s.policy_id::text then raise exception 'VERIFICATION_AND_POLICY_REQUIRED';end if;
 if length(btrim(coalesce(p_data->>'firstName',''))) not between 1 and 80 or length(coalesce(p_data->>'lastName',''))>80 then raise exception 'INVALID_INPUT';end if;
 -- A subtransaction keeps profile enrollment atomic with final booking.
 begin
  invitation_hash:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  perform aesthenda_private.create_client_signin_invite_v1(s.owner_id,invitation_hash);
  linked:=aesthenda_private.resolve_client_identity_v1(p_subject,p_email,coalesce(p_phone,''),invitation_hash,p_data->>'firstName',coalesce(p_data->>'lastName',''),coalesce(p_data->>'phone',''));
  if linked->>'state'<>'linked' then failure:='review_required';raise exception using errcode='P0002',message='ACCOUNT_BOOKING_NOT_SAVED';end if;
  bid:=aesthenda_private.appointment_context(s.owner_id);perform set_config('app.guest_session_hash',p_hash,true);
  update aesthenda_private.guest_booking_sessions set account_subject=p_subject,account_client_id=(linked->'profile'->>'id')::uuid,first_name=btrim(p_data->>'firstName'),last_name=btrim(coalesce(p_data->>'lastName','')),email=lower(btrim(p_email)),phone_hint=coalesce(p_data->>'phone',''),updates_email=coalesce((p_data->>'updatesEmail')::boolean,false),verified_at=statement_timestamp() where id=s.id;
  perform set_config('app.verified_booking_subject',p_subject::text,true);
  result:=aesthenda_private.guest_booking_v1(p_hash,'confirm',p_data);
  if result->>'state'<>'booked' then failure:=result->>'state';raise exception using errcode='P0002',message='ACCOUNT_BOOKING_NOT_SAVED';end if;
 exception when no_data_found then
  if SQLERRM<>'ACCOUNT_BOOKING_NOT_SAVED' then raise;end if;result:=jsonb_build_object('state',failure);
 end;
 perform set_config('app.verified_booking_subject','',true);return result;
end $$;
create function aesthenda_private.booking_message_v1(p_hash text,p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare s aesthenda_private.guest_booking_sessions%rowtype;m aesthenda_private.booking_confirmation_messages%rowtype;a public.appointments%rowtype;
begin
 perform aesthenda_private.guest_booking_v1(p_hash,'status','{}');
 select * into s from aesthenda_private.guest_booking_sessions where session_hash=p_hash;
 select * into m from aesthenda_private.booking_confirmation_messages where session_id=s.id for update;
 if not found then return jsonb_build_object('state','not_requested');end if;
 if p_action='claim' then
  if m.state in ('accepted','failed','review_required') then return jsonb_build_object('state',m.state);end if;
  if m.last_attempt_at>statement_timestamp()-interval '60 seconds' then return jsonb_build_object('state','pending');end if;
  select * into a from public.appointments where id=m.appointment_id;
  if m.attempts>=3 or m.first_attempt_at<statement_timestamp()-interval '23 hours' or a.status::text<>m.payload->>'status' or a.start_at<>(m.payload->>'startAt')::timestamptz or a.end_at<>(m.payload->>'endAt')::timestamptz then
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
revoke all on function aesthenda_private.start_account_booking_v1(uuid,text,uuid,timestamptz,text,date,text),aesthenda_private.confirm_account_booking_v1(text,uuid,text,text,jsonb),aesthenda_private.booking_message_v1(text,text,jsonb) from public,anon,authenticated;
grant execute on function aesthenda_private.start_account_booking_v1(uuid,text,uuid,timestamptz,text,date,text),aesthenda_private.confirm_account_booking_v1(text,uuid,text,text,jsonb),aesthenda_private.booking_message_v1(text,text,jsonb) to aesthenda_runtime;
reset role;
revoke create on schema aesthenda_private from aesthenda_appointments_owner;
do $$ begin execute format('grant aesthenda_appointments_owner to %I with set false',current_user);end $$;
