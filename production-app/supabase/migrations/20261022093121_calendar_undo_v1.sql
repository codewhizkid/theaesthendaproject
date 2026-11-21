-- One durable, tenant-scoped Undo for the latest supported scheduling mutation.
-- Capture and inverse writes share the canonical business scheduling lock.
create table aesthenda_private.calendar_changes(
 id bigint generated always as identity primary key,
 business_id uuid not null references public.businesses(id) on delete cascade,
 actor_id uuid not null,
 entity_type text not null check(entity_type in ('appointment','block')),
 entity_id uuid not null,
 before_state jsonb,
 after_state jsonb not null,
 label text not null,
 undone_at timestamptz,
 created_at timestamptz not null default now()
);
create index calendar_changes_latest on aesthenda_private.calendar_changes(business_id,id desc);
alter table aesthenda_private.calendar_changes enable row level security;
alter table aesthenda_private.calendar_changes force row level security;
revoke all on aesthenda_private.calendar_changes from public,anon,authenticated,aesthenda_runtime;
grant select,insert on aesthenda_private.calendar_changes to aesthenda_appointments_owner;
grant update(undone_at) on aesthenda_private.calendar_changes to aesthenda_appointments_owner;
grant usage on sequence aesthenda_private.calendar_changes_id_seq to aesthenda_appointments_owner;
create policy calendar_change_scope on aesthenda_private.calendar_changes to aesthenda_appointments_owner using(business_id=(select nullif(current_setting('app.business_account_id',true),'')::uuid)) with check(business_id=(select nullif(current_setting('app.business_account_id',true),'')::uuid) and actor_id=(select nullif(current_setting('app.verified_actor_id',true),'')::uuid));
do $$ begin execute format('grant aesthenda_appointments_owner to %I with set true',current_user);end $$;
grant create on schema aesthenda_private to aesthenda_appointments_owner;
grant trigger on public.appointments,public.calendar_blocks to aesthenda_appointments_owner;
set local role aesthenda_appointments_owner;
create function aesthenda_private.capture_calendar_change() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid:=nullif(current_setting('app.verified_actor_id',true),'')::uuid; before_data jsonb; label text;
begin
 if current_setting('app.calendar_undo',true)='yes' or actor is null or new.business_id is distinct from nullif(current_setting('app.business_account_id',true),'')::uuid then return new;end if;
 if not exists(select 1 from public.businesses where id=new.business_id and owner_user_id=actor) then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended(new.business_id::text,2));
 if tg_op='UPDATE' then before_data:=to_jsonb(old);end if;
 if tg_table_name='appointments' then
  if new.booking_source<>'professional_v1' then return new;end if;
  if tg_op='INSERT' and new.status='pending' then label:='New appointment';
  elsif tg_op='UPDATE' and old.status='pending' and new.status='cancelled' then label:='Cancel appointment';
  elsif tg_op='UPDATE' and old.status='pending' and new.status='pending' and (new.start_at<>old.start_at or new.end_at<>old.end_at) then label:=case when new.start_at=old.start_at then 'Extend appointment' else 'Move appointment' end;
  else return new;end if;
 else
  if tg_op='INSERT' then label:='New blocked time';
  elsif new.removed_at is distinct from old.removed_at then label:='Remove blocked time';
  elsif new.reason is distinct from old.reason or new.start_at<>old.start_at or new.end_at<>old.end_at then label:='Edit blocked time';
  else return new;end if;
 end if;
 insert into aesthenda_private.calendar_changes(business_id,actor_id,entity_type,entity_id,before_state,after_state,label) values(new.business_id,actor,case when tg_table_name='appointments' then 'appointment' else 'block' end,new.id,before_data,to_jsonb(new),label);
 return new;
end $$;
create trigger capture_appointment_change after insert or update on public.appointments for each row execute function aesthenda_private.capture_calendar_change();
create trigger capture_block_change after insert or update on public.calendar_blocks for each row execute function aesthenda_private.capture_calendar_change();
create function aesthenda_private.read_calendar_undo_v1(p_actor uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; change aesthenda_private.calendar_changes%rowtype;
begin
 bid:=aesthenda_private.appointment_context(p_actor);
 select * into change from aesthenda_private.calendar_changes where business_id=bid order by id desc limit 1;
 if not found or change.undone_at is not null then return null;end if;
 return jsonb_build_object('id',change.id::text,'label',change.label);
end $$;
create function aesthenda_private.undo_calendar_change_v1(p_actor uuid,p_change bigint) returns void language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; change aesthenda_private.calendar_changes%rowtype; apt public.appointments%rowtype; block public.calendar_blocks%rowtype; target jsonb; start_time timestamptz; end_time timestamptz; zone text; duration integer; hours jsonb;
begin
 bid:=aesthenda_private.appointment_context(p_actor);
 if p_change is null or p_change<1 then raise exception 'INVALID_INPUT';end if;
 perform pg_advisory_xact_lock(hashtextextended(bid::text,2));
 select * into change from aesthenda_private.calendar_changes where business_id=bid order by id desc limit 1 for update;
 if not found or change.id<>p_change then raise exception 'STALE_UNDO';end if;
 if change.undone_at is not null then return;end if;
 if change.actor_id<>p_actor then raise exception 'UNDO_UNAVAILABLE';end if;
 target:=change.before_state;
 -- This flag only suppresses inverse capture inside this transaction. Runtime
 -- has no direct DML and no public function accepts or propagates caller flags.
 perform set_config('app.calendar_undo','yes',true);
 if change.entity_type='appointment' then
  select * into apt from public.appointments where id=change.entity_id and business_id=bid for update;
  if not found or to_jsonb(apt)<>change.after_state then raise exception 'STALE_UNDO';end if;
  if apt.start_at<=statement_timestamp() or apt.booking_source<>'professional_v1' or apt.status not in ('pending','cancelled') then raise exception 'UNDO_REQUIRES_REVIEW';end if;
  if target is null then
   if apt.status<>'pending' then raise exception 'UNDO_REQUIRES_REVIEW';end if;
   update public.appointments set status='cancelled',revision=revision+1,updated_at=now() where id=apt.id;
  else
   if target->>'status'<>'pending' or target->>'booking_source'<>'professional_v1' then raise exception 'UNDO_REQUIRES_REVIEW';end if;
   start_time:=(target->>'start_at')::timestamptz;end_time:=(target->>'end_at')::timestamptz;zone:=target->>'timezone';duration:=extract(epoch from end_time-start_time)::integer/60;
   select timezone into zone from aesthenda_private.weekly_schedules where business_id=bid;
   if zone is distinct from target->>'timezone' then raise exception 'TIMEZONE_REVIEW_REQUIRED';end if;
   if duration not between 1 and 1440 or end_time<>start_time+make_interval(mins=>duration) or (select count(*) from public.appointment_segments where appointment_id=apt.id)<>1 or not exists(select 1 from public.appointment_segments where appointment_id=apt.id and start_at=apt.start_at and end_at=apt.end_at) then raise exception 'UNDO_REQUIRES_REVIEW';end if;
   hours:=aesthenda_private.effective_date_hours_v1(p_actor,(start_time at time zone zone)::date);
   if not aesthenda_private.appointment_fits(bid,apt.professional_id,start_time,duration,hours,apt.id) then raise exception 'UNDO_CONFLICT';end if;
   if not exists(select 1 from public.clients where id=apt.client_id and status in ('active','lead')) then raise exception 'UNDO_REQUIRES_REVIEW';end if;
   update public.appointments set start_at=start_time,end_at=end_time,status='pending',duration_override_minutes=(target->>'duration_override_minutes')::integer,revision=revision+1,updated_at=now() where id=apt.id;
   update public.appointment_segments set start_at=start_time,end_at=end_time where appointment_id=apt.id;
  end if;
 else
  select * into block from public.calendar_blocks where id=change.entity_id and business_id=bid for update;
  if not found or to_jsonb(block)<>change.after_state then raise exception 'STALE_UNDO';end if;
  if target is null then
   update public.calendar_blocks set removed_at=statement_timestamp(),revision=revision+1 where id=block.id;
  else
   start_time:=(target->>'start_at')::timestamptz;end_time:=(target->>'end_at')::timestamptz;
   if target->>'removed_at' is not null or end_time<=statement_timestamp() then raise exception 'UNDO_REQUIRES_REVIEW';end if;
   select timezone into zone from aesthenda_private.weekly_schedules where business_id=bid;
   if zone is distinct from target->>'timezone' then raise exception 'TIMEZONE_REVIEW_REQUIRED';end if;
   if exists(select 1 from public.appointments where business_id=bid and professional_id=block.professional_id and status in ('pending','confirmed') and start_at<end_time and end_at>start_time) or exists(select 1 from public.booking_holds where business_id=bid and professional_id=block.professional_id and status='active' and expires_at>statement_timestamp() and start_at<end_time and end_at>start_time) or exists(select 1 from public.calendar_blocks where business_id=bid and professional_id=block.professional_id and id<>block.id and removed_at is null and start_at<end_time and end_at>start_time) then raise exception 'UNDO_CONFLICT';end if;
   update public.calendar_blocks set start_at=start_time,end_at=end_time,reason=target->>'reason',timezone=target->>'timezone',removed_at=null,revision=revision+1 where id=block.id;
  end if;
 end if;
 update aesthenda_private.calendar_changes set undone_at=statement_timestamp() where id=change.id;
 perform set_config('app.calendar_undo','',true);
 insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata) values(bid,p_actor,case when change.entity_type='appointment' then 'Appointment' else 'CalendarBlock' end,change.entity_id,'undoCalendarChange',jsonb_build_object('action_version',1,'change_id',change.id,'undone_action',change.label,'financial_outcome','no_payment_processed'));
end $$;
revoke all on function aesthenda_private.capture_calendar_change(),aesthenda_private.read_calendar_undo_v1(uuid),aesthenda_private.undo_calendar_change_v1(uuid,bigint) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then execute 'revoke all on function aesthenda_private.capture_calendar_change(),aesthenda_private.read_calendar_undo_v1(uuid),aesthenda_private.undo_calendar_change_v1(uuid,bigint) from service_role';end if;end $$;
grant execute on function aesthenda_private.read_calendar_undo_v1(uuid),aesthenda_private.undo_calendar_change_v1(uuid,bigint) to aesthenda_runtime;
reset role;
revoke trigger on public.appointments,public.calendar_blocks from aesthenda_appointments_owner;
revoke create on schema aesthenda_private from aesthenda_appointments_owner;
do $$ begin execute format('grant aesthenda_appointments_owner to %I with set false',current_user);end $$;
