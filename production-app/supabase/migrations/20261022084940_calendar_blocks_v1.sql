-- Private interval time off shares the booking lock and existing fit engine.
alter table public.calendar_blocks add column revision integer not null default 1 check(revision>0);
alter table public.calendar_blocks add column timezone text;
alter table public.calendar_blocks add column removed_at timestamptz;
alter table public.calendar_blocks add constraint block_positive_range check(end_at>start_at);
alter table public.calendar_blocks add constraint block_professional_business foreign key(business_id,professional_id) references public.professionals(business_id,id);
create table aesthenda_private.block_requests(business_id uuid not null references public.businesses(id),request_key uuid not null,fingerprint text not null,block_id uuid not null,primary key(business_id,request_key));
alter table aesthenda_private.block_requests enable row level security;
alter table aesthenda_private.block_requests force row level security;
revoke all on aesthenda_private.block_requests from public,anon,authenticated,aesthenda_runtime;
grant select,insert on aesthenda_private.block_requests to aesthenda_appointments_owner;
grant insert on public.calendar_blocks to aesthenda_appointments_owner;
grant update(start_at,end_at,reason,timezone,revision,removed_at) on public.calendar_blocks to aesthenda_appointments_owner;
create policy block_request_scope on aesthenda_private.block_requests to aesthenda_appointments_owner using(business_id=(select nullif(current_setting('app.business_account_id',true),'')::uuid)) with check(business_id=(select nullif(current_setting('app.business_account_id',true),'')::uuid));
do $$ begin execute format('grant aesthenda_appointments_owner to %I with set true',current_user);end $$;
grant create on schema aesthenda_private to aesthenda_appointments_owner;
grant trigger on aesthenda_private.weekly_schedules to aesthenda_appointments_owner;
set local role aesthenda_appointments_owner;
create or replace function aesthenda_private.appointment_fits(p_bid uuid,p_pid uuid,p_start timestamptz,p_duration integer,p_hours jsonb,p_ignore uuid) returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
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
 if exists(select 1 from public.calendar_blocks where business_id=p_bid and professional_id=p_pid and removed_at is null and start_at<finish and end_at>p_start) then return false; end if;
 if exists(select 1 from public.booking_holds where business_id=p_bid and professional_id=p_pid and status='active' and expires_at>statement_timestamp() and start_at<finish and end_at>p_start) then return false; end if;
 return true;
end $$;

-- Civil times are resolved on the server. Gaps/folds fail closed.
create function aesthenda_private.block_instant(p_date date,p_minute integer,p_zone text) returns timestamptz language plpgsql security invoker set search_path=pg_catalog as $$
declare wall timestamp; base timestamptz; result timestamptz; candidates integer;
begin
 if p_date is null or p_date not between date '2000-01-01' and date '2100-12-31' or p_minute is null or p_minute not between 0 and 1440 or p_zone is null then raise exception 'INVALID_INPUT';end if;
 wall:=p_date::timestamp+make_interval(mins=>p_minute);base:=wall at time zone p_zone;
 select count(*),min(candidate) into candidates,result from (select distinct (wall-(timezone(p_zone,x)-timezone('UTC',x))) at time zone 'UTC' candidate from generate_series(base-interval '36 hours',base+interval '36 hours',interval '6 hours') x) q where timezone(p_zone,candidate)=wall;
 if candidates<>1 then raise exception 'AMBIGUOUS_OR_MISSING_TIME';end if;
 return result;
end $$;
create function aesthenda_private.read_blocks_v1(p_actor uuid,p_date date) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; zone text;
begin
 bid:=aesthenda_private.appointment_context(p_actor);
 if p_date is null or p_date not between date '2000-01-01' and date '2100-12-31' then raise exception 'INVALID_INPUT';end if;
 select timezone into zone from aesthenda_private.weekly_schedules where business_id=bid;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'revision',revision,'name',coalesce(reason,'Blocked time'),'startAt',start_at,'endAt',end_at,'timezone',coalesce(timezone,zone),'date',p_date,'startMinute',case when start_at< p_date::timestamp at time zone zone then 0 else extract(hour from timezone(zone,start_at))::integer*60+extract(minute from timezone(zone,start_at))::integer end,'endMinute',case when end_at >= (p_date+1)::timestamp at time zone zone then 1440 else extract(hour from timezone(zone,end_at))::integer*60+extract(minute from timezone(zone,end_at))::integer end) order by start_at,id) from public.calendar_blocks where business_id=bid and removed_at is null and start_at<((p_date+1)::timestamp at time zone zone) and end_at>(p_date::timestamp at time zone zone)),'[]'::jsonb);
end $$;
create function aesthenda_private.save_block_v1(p_actor uuid,p_key uuid,p_id uuid,p_revision integer,p_date date,p_start integer,p_end integer,p_name text,p_remove boolean default false) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; pid uuid; zone text; first_instant timestamptz; last_instant timestamptz; prior public.calendar_blocks%rowtype; fingerprint text; replay aesthenda_private.block_requests%rowtype; result_id uuid; conflicts jsonb;
begin
 bid:=aesthenda_private.appointment_context(p_actor);p_name:=btrim(p_name);
 if p_key is null or p_revision is null or p_remove is null or (p_id is null and (p_revision<>0 or p_remove)) or (p_id is not null and p_revision<1) then raise exception 'INVALID_INPUT';end if;
 fingerprint:=md5(jsonb_build_array(p_id,p_revision,p_date,p_start,p_end,p_name,p_remove)::text);
 perform pg_advisory_xact_lock(hashtextextended(bid::text,2));
 select * into replay from aesthenda_private.block_requests where business_id=bid and request_key=p_key;
 if found then if replay.fingerprint<>fingerprint then raise exception 'IDEMPOTENCY_CONFLICT';end if;return jsonb_build_object('id',replay.block_id,'conflicts','[]'::jsonb);end if;
 if p_id is not null then
  select * into prior from public.calendar_blocks where id=p_id and business_id=bid and removed_at is null for update;
  if not found then raise exception 'BLOCK_UNAVAILABLE';end if;
  if prior.revision<>p_revision then raise exception 'STALE_BLOCK';end if;
 end if;
 if p_remove then
  update public.calendar_blocks set removed_at=statement_timestamp(),revision=revision+1 where id=p_id;result_id:=p_id;
 else
  if p_name is null or length(p_name) not between 1 and 120 or p_start is null or p_end is null or p_start<0 or p_end>1440 or p_end<=p_start then raise exception 'INVALID_INPUT';end if;
  select timezone into zone from aesthenda_private.weekly_schedules where business_id=bid;
  if zone is null then raise exception 'HOURS_REQUIRED';end if;
  select id into pid from public.professionals where business_id=bid and user_id=p_actor;
  if pid is null then raise exception 'PROFESSIONAL_UNAVAILABLE';end if;
  first_instant:=aesthenda_private.block_instant(p_date,p_start,zone);last_instant:=aesthenda_private.block_instant(p_date,p_end,zone);
  if last_instant<=statement_timestamp() or last_instant<=first_instant then raise exception 'INVALID_RANGE';end if;
  -- Return every future conflicting reservation. Never modify it implicitly.
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'startAt',start_at,'endAt',end_at,'timezone',coalesce(timezone,zone)) order by start_at,id),'[]'::jsonb) into conflicts from public.appointments where business_id=bid and professional_id=pid and status in ('pending','confirmed') and end_at>statement_timestamp() and start_at<last_instant and end_at>first_instant;
  if jsonb_array_length(conflicts)>0 then return jsonb_build_object('id',null,'conflicts',conflicts);end if;
  if exists(select 1 from public.booking_holds where business_id=bid and professional_id=pid and status='active' and expires_at>statement_timestamp() and start_at<last_instant and end_at>first_instant) then raise exception 'ACTIVE_HOLD_CONFLICT';end if;
  if exists(select 1 from public.calendar_blocks where business_id=bid and professional_id=pid and removed_at is null and (p_id is null or id<>p_id) and start_at<last_instant and end_at>first_instant) then raise exception 'BLOCK_CONFLICT';end if;
  if p_id is null then insert into public.calendar_blocks(business_id,professional_id,start_at,end_at,block_type,reason,timezone) values(bid,pid,first_instant,last_instant,'time_off',p_name,zone) returning id into result_id;
  else update public.calendar_blocks set start_at=first_instant,end_at=last_instant,reason=p_name,timezone=zone,revision=revision+1 where id=p_id;result_id:=p_id;end if;
 end if;
 insert into aesthenda_private.block_requests values(bid,p_key,fingerprint,result_id);
 insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata) values(bid,p_actor,'CalendarBlock',result_id,case when p_remove then 'removeTimeOff' when p_id is null then 'createTimeOff' else 'updateTimeOff' end,jsonb_build_object('action_version',1,'request_key',p_key,'prior_revision',p_revision,'new_revision',p_revision+1,'start_at',coalesce(first_instant,prior.start_at),'end_at',coalesce(last_instant,prior.end_at),'prior_start_at',prior.start_at,'prior_end_at',prior.end_at));
 return jsonb_build_object('id',result_id,'conflicts','[]'::jsonb);
end $$;
create function aesthenda_private.guard_block_timezone() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if old.timezone is distinct from new.timezone and exists(select 1 from public.calendar_blocks where business_id=new.business_id and removed_at is null and end_at>statement_timestamp()) then raise exception 'TIMEZONE_REVIEW_REQUIRED';end if;
 return new;
end $$;
revoke all on function aesthenda_private.guard_block_timezone() from public,anon,authenticated;
revoke all on function aesthenda_private.block_instant(date,integer,text),aesthenda_private.read_blocks_v1(uuid,date),aesthenda_private.save_block_v1(uuid,uuid,uuid,integer,date,integer,integer,text,boolean) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then execute 'revoke all on function aesthenda_private.block_instant(date,integer,text),aesthenda_private.read_blocks_v1(uuid,date),aesthenda_private.save_block_v1(uuid,uuid,uuid,integer,date,integer,integer,text,boolean) from service_role';end if;end $$;
grant execute on function aesthenda_private.read_blocks_v1(uuid,date),aesthenda_private.save_block_v1(uuid,uuid,uuid,integer,date,integer,integer,text,boolean) to aesthenda_runtime;
create trigger block_timezone_review before update of timezone on aesthenda_private.weekly_schedules for each row execute function aesthenda_private.guard_block_timezone();
reset role;
revoke trigger on aesthenda_private.weekly_schedules from aesthenda_appointments_owner;
revoke create on schema aesthenda_private from aesthenda_appointments_owner;
do $$ begin execute format('grant aesthenda_appointments_owner to %I with set false',current_user);end $$;
