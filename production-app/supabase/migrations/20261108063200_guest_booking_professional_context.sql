-- Match canonical owner booking professional selection, including onboarding.
-- Existing guest session/hold checks and role privileges remain unchanged.
do $$ begin execute format('grant aesthenda_appointments_owner to %I with set true',current_user);end $$;
grant create on schema aesthenda_private to aesthenda_appointments_owner;
set local role aesthenda_appointments_owner;
create or replace function aesthenda_private.start_guest_booking_v1(p_owner uuid,p_hash text,p_service uuid,p_start timestamptz,p_token text,p_date date) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
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
 select id into pid from public.professionals where business_id=bid and user_id=p_owner;if pid is null then raise exception 'PROFESSIONAL_UNAVAILABLE';end if;
 expiry:=statement_timestamp()+interval '10 minutes';end_time:=p_start+make_interval(mins=>(catalog->'service'->>'durationMinutes')::integer);
 insert into aesthenda_private.guest_booking_sessions(business_id,owner_id,session_hash,service_id,service_token,start_at,expires_at,policy_id) values(bid,p_owner,p_hash,p_service,p_token,p_start,expiry,policy) returning id into session_id;
 insert into public.booking_holds(business_id,professional_id,client_id,service_id,start_at,end_at,expires_at,guest_session_id) values(bid,pid,null,p_service,p_start,end_time,expiry,session_id) returning id into hid;
 update aesthenda_private.guest_booking_sessions set hold_id=hid where id=session_id;
 return jsonb_build_object('expiresAt',expiry);
end $$;
reset role;
revoke create on schema aesthenda_private from aesthenda_appointments_owner;
do $$ begin execute format('grant aesthenda_appointments_owner to %I with set false',current_user);end $$;
