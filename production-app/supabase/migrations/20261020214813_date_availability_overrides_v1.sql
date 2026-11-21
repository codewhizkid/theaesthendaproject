-- Date-specific local hours supersede weekly hours. No appointments are moved.
do $$ begin execute format('grant aesthenda_availability_owner to %I with set true',current_user); end $$;
grant create on schema aesthenda_private to aesthenda_availability_owner;
create table aesthenda_private.date_hours(
 business_id uuid not null references public.businesses(id) on delete cascade,
 local_date date not null,
 revision integer not null check(revision>0),
 mode text not null check(mode in ('closed','custom','weekly')),
 windows jsonb not null,
 timezone text not null,
 primary key(business_id,local_date)
);
create table aesthenda_private.date_hours_requests(
 business_id uuid not null references public.businesses(id) on delete cascade,
 request_key uuid not null,
 fingerprint text not null,
 primary key(business_id,request_key)
);
alter table aesthenda_private.date_hours enable row level security;
alter table aesthenda_private.date_hours force row level security;
alter table aesthenda_private.date_hours_requests enable row level security;
alter table aesthenda_private.date_hours_requests force row level security;
revoke all on aesthenda_private.date_hours,aesthenda_private.date_hours_requests from public,anon,authenticated,aesthenda_runtime;
grant select,insert,update on aesthenda_private.date_hours to aesthenda_availability_owner;
grant select,insert on aesthenda_private.date_hours_requests to aesthenda_availability_owner;
create policy date_hours_scope on aesthenda_private.date_hours to aesthenda_availability_owner using(business_id=(select nullif(current_setting('app.business_account_id',true),'')::uuid)) with check(business_id=(select nullif(current_setting('app.business_account_id',true),'')::uuid));
create policy date_hours_requests_scope on aesthenda_private.date_hours_requests to aesthenda_availability_owner using(business_id=(select nullif(current_setting('app.business_account_id',true),'')::uuid)) with check(business_id=(select nullif(current_setting('app.business_account_id',true),'')::uuid));
create function aesthenda_private.read_date_hours_v1(p_actor uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid;
begin
 bid:=aesthenda_private.availability_context(p_actor);
 return (select coalesce(jsonb_agg(jsonb_build_object('date',local_date,'revision',revision,'mode',mode,'windows',windows,'timezone',timezone) order by local_date),'[]'::jsonb) from aesthenda_private.date_hours where business_id=bid);
end $$;
create function aesthenda_private.effective_date_hours_v1(p_actor uuid,p_date date) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; row aesthenda_private.date_hours%rowtype; week jsonb;
begin
 bid:=aesthenda_private.availability_context(p_actor);
 if p_date is null then raise exception 'INVALID_INPUT'; end if;
 select * into row from aesthenda_private.date_hours where business_id=bid and local_date=p_date;
 if found and row.mode<>'weekly' then return jsonb_build_object('source',row.mode,'timezone',row.timezone,'windows',row.windows); end if;
 week:=aesthenda_private.read_availability_v1(p_actor);
 return jsonb_build_object('source','weekly','timezone',week->'timezone','windows',(select coalesce(jsonb_agg(jsonb_build_object('startMinute',(value->>'startMinute')::integer,'endMinute',(value->>'endMinute')::integer)),'[]'::jsonb) from jsonb_array_elements(week->'windows') where (value->>'day')::integer=extract(dow from p_date)::integer));
end $$;
create function aesthenda_private.save_date_hours_v1(p_actor uuid,p_key uuid,p_date date,p_revision integer,p_week_revision integer,p_mode text,p_windows jsonb) returns void language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; zone text; week_revision integer; prior aesthenda_private.date_hours%rowtype; canonical jsonb; fingerprint text; previous text; w record;
begin
 bid:=aesthenda_private.availability_context(p_actor);
 perform pg_advisory_xact_lock(hashtextextended(bid::text,2));
 select timezone,revision into zone,week_revision from aesthenda_private.weekly_schedules where business_id=bid;
 if zone is null then raise exception 'SAVE_WEEKLY_HOURS_FIRST'; end if;
 if p_key is null or p_date is null or p_date<'2000-01-01'::date or p_date>'2100-12-31'::date or p_revision is null or p_revision<0 or p_week_revision is null or p_mode is null or p_mode not in ('closed','custom','weekly') or p_windows is null or jsonb_typeof(p_windows)<>'array' then raise exception 'INVALID_INPUT'; end if;
 if jsonb_array_length(p_windows)>16 or (p_mode='custom' and jsonb_array_length(p_windows)=0) or (p_mode<>'custom' and jsonb_array_length(p_windows)<>0) then raise exception 'INVALID_INPUT'; end if;
 for w in select value v from jsonb_array_elements(p_windows) loop
  if jsonb_typeof(w.v)<>'object' or jsonb_typeof(w.v->'startMinute') is distinct from 'number' or jsonb_typeof(w.v->'endMinute') is distinct from 'number' or (w.v->>'startMinute')!~'^[0-9]{1,4}$' or (w.v->>'endMinute')!~'^[0-9]{1,4}$' then raise exception 'INVALID_INPUT'; end if;
  if (w.v->>'startMinute')::integer not between 0 and 1439 or (w.v->>'endMinute')::integer not between 1 and 1440 or (w.v->>'startMinute')::integer >=(w.v->>'endMinute')::integer then raise exception 'INVALID_INPUT'; end if;
 end loop;
 if exists(select 1 from (select (value->>'startMinute')::integer s,lag((value->>'endMinute')::integer) over(order by (value->>'startMinute')::integer) previous_end from jsonb_array_elements(p_windows)) x where previous_end>s) then raise exception 'OVERLAPPING_HOURS'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('startMinute',(value->>'startMinute')::integer,'endMinute',(value->>'endMinute')::integer) order by (value->>'startMinute')::integer),'[]'::jsonb) into canonical from jsonb_array_elements(p_windows);
 fingerprint:=md5(jsonb_build_array(p_date,p_revision,p_week_revision,p_mode,canonical)::text);
 select r.fingerprint into previous from aesthenda_private.date_hours_requests r where business_id=bid and request_key=p_key;
 if found then if previous<>fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if; return; end if;
 select * into prior from aesthenda_private.date_hours where business_id=bid and local_date=p_date;
 if coalesce(prior.revision,0)<>p_revision or week_revision<>p_week_revision then raise exception 'STALE_SCHEDULE'; end if;
 if exists(select 1 from public.appointments where business_id=bid and status in ('pending','confirmed') and end_at>now() and start_at<((p_date+1)::timestamp at time zone zone) and end_at>(p_date::timestamp at time zone zone)) then raise exception 'APPOINTMENT_REVIEW_REQUIRED'; end if;
 insert into aesthenda_private.date_hours(business_id,local_date,revision,mode,windows,timezone) values(bid,p_date,1,p_mode,canonical,zone)
 on conflict(business_id,local_date) do update set revision=date_hours.revision+1,mode=excluded.mode,windows=excluded.windows,timezone=excluded.timezone;
 insert into aesthenda_private.date_hours_requests values(bid,p_key,fingerprint);
 insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata) values(bid,p_actor,'DateAvailability',bid,'saveDateAvailability',jsonb_build_object('date',p_date,'prior_revision',coalesce(prior.revision,0),'new_revision',coalesce(prior.revision,0)+1,'prior_mode',prior.mode,'prior_windows',prior.windows,'mode',p_mode,'windows',canonical,'timezone',zone,'request_key',p_key,'source','professional','action_version',1));
end $$;
create function aesthenda_private.guard_date_hours_timezone() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if old.timezone is distinct from new.timezone and exists(select 1 from aesthenda_private.date_hours where business_id=new.business_id and mode<>'weekly' and local_date>=(now() at time zone old.timezone)::date) then raise exception 'TIMEZONE_REVIEW_REQUIRED'; end if;
 return new;
end $$;
create trigger review_date_hours_timezone before update of timezone on aesthenda_private.weekly_schedules for each row execute function aesthenda_private.guard_date_hours_timezone();
alter function aesthenda_private.read_date_hours_v1(uuid) owner to aesthenda_availability_owner;
alter function aesthenda_private.effective_date_hours_v1(uuid,date) owner to aesthenda_availability_owner;
alter function aesthenda_private.save_date_hours_v1(uuid,uuid,date,integer,integer,text,jsonb) owner to aesthenda_availability_owner;
alter function aesthenda_private.guard_date_hours_timezone() owner to aesthenda_availability_owner;
set local role aesthenda_availability_owner;
revoke all on function aesthenda_private.read_date_hours_v1(uuid),aesthenda_private.effective_date_hours_v1(uuid,date),aesthenda_private.save_date_hours_v1(uuid,uuid,date,integer,integer,text,jsonb),aesthenda_private.guard_date_hours_timezone() from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then execute 'revoke all on function aesthenda_private.read_date_hours_v1(uuid),aesthenda_private.effective_date_hours_v1(uuid,date),aesthenda_private.save_date_hours_v1(uuid,uuid,date,integer,integer,text,jsonb),aesthenda_private.guard_date_hours_timezone() from service_role'; end if; end $$;
grant execute on function aesthenda_private.read_date_hours_v1(uuid),aesthenda_private.effective_date_hours_v1(uuid,date),aesthenda_private.save_date_hours_v1(uuid,uuid,date,integer,integer,text,jsonb) to aesthenda_runtime;
reset role;
revoke create on schema aesthenda_private from aesthenda_availability_owner;
do $$ begin execute format('grant aesthenda_availability_owner to %I with set false',current_user); end $$;
