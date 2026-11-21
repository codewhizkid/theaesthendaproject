-- Private service catalog: fixed USD prices, draft creation and archival only.
-- Preserve legacy rows; they remain private drafts pending explicit review.
create role aesthenda_services_owner nologin nosuperuser nobypassrls nocreatedb nocreaterole;
do $$ begin
 execute format('grant aesthenda_services_owner to %I with inherit false',current_user);
 execute format('grant aesthenda_services_owner to %I with set true',current_user);
end $$;
grant usage,create on schema aesthenda_private to aesthenda_services_owner;
grant usage on schema public to aesthenda_services_owner;
alter table public.services add column catalog_status text not null default 'draft' check(catalog_status in ('draft','archived'));
alter table public.services add column price_cents bigint;
update public.services set price_cents=round(price*100)::bigint;
alter table public.services alter column price_cents set not null;
alter table public.services add constraint service_price_minor_units check(price_cents between 0 and 99999999);
alter table public.services add column currency text not null default 'USD' check(currency='USD');
alter table public.services add column create_request_key uuid;
create unique index services_request_once on public.services(business_id,create_request_key);
grant select on public.businesses to aesthenda_services_owner;
grant select,insert on public.services,public.service_segments,public.audit_events to aesthenda_services_owner;
grant update(catalog_status,is_active,is_public,updated_at) on public.services to aesthenda_services_owner;
create policy catalog_business_scope on public.businesses for select to aesthenda_services_owner
 using(owner_user_id=nullif(current_setting('app.verified_actor_id',true),'')::uuid);
create policy catalog_services_scope on public.services to aesthenda_services_owner
 using(business_id=nullif(current_setting('app.business_account_id',true),'')::uuid)
 with check(business_id=nullif(current_setting('app.business_account_id',true),'')::uuid and not is_public and not is_active);
create policy catalog_segments_scope on public.service_segments to aesthenda_services_owner
 using(exists(select 1 from public.services s where s.id=service_id))
 with check(exists(select 1 from public.services s where s.id=service_id));
create policy catalog_audit_insert on public.audit_events for insert to aesthenda_services_owner
 with check(actor_id=nullif(current_setting('app.verified_actor_id',true),'')::uuid and business_id=nullif(current_setting('app.business_account_id',true),'')::uuid);

create function aesthenda_private.service_context(p_actor uuid) returns uuid
language plpgsql security invoker set search_path=pg_catalog as $$
declare bid uuid;
begin
 if p_actor is null then raise exception 'UNAUTHENTICATED'; end if;
 perform set_config('app.verified_actor_id',p_actor::text,true);
 perform set_config('app.business_account_id','',true);
 select id into bid from public.businesses where owner_user_id=p_actor and status in ('trial','active');
 if bid is null then raise exception 'BUSINESS_UNAVAILABLE'; end if;
 perform set_config('app.business_account_id',bid::text,true);
 return bid;
end $$;
create function aesthenda_private.read_services_v1(p_actor uuid,p_id uuid default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform aesthenda_private.service_context(p_actor);
 return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'description',description,'durationMinutes',duration_minutes,'priceCents',price_cents,'currency',currency,'status',catalog_status) order by created_at,id),'[]'::jsonb)
 from public.services where p_id is null or id=p_id);
end $$;
create function aesthenda_private.create_service_v1(p_actor uuid,p_key uuid,p_name text,p_description text,p_duration integer,p_cents bigint) returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; sid uuid; prior public.services%rowtype;
begin
 bid:=aesthenda_private.service_context(p_actor);
 if p_key is null or p_name is null or length(btrim(p_name)) not between 1 and 160 or p_description is null or length(p_description)>2000 or p_duration is null or p_duration not between 1 and 1440 or p_cents is null or p_cents not between 0 and 99999999 then raise exception 'INVALID_INPUT'; end if;
 perform pg_advisory_xact_lock(hashtextextended(bid::text||p_key::text,1));
 select * into prior from public.services where business_id=bid and create_request_key=p_key;
 if found then
  if prior.name<>btrim(p_name) or prior.description<>btrim(p_description) or prior.duration_minutes<>p_duration or prior.price_cents<>p_cents then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return prior.id;
 end if;
 insert into public.services(business_id,name,description,duration_minutes,price,price_cents,currency,catalog_status,is_active,is_public,create_request_key)
 values(bid,btrim(p_name),btrim(p_description),p_duration,p_cents::numeric/100,p_cents,'USD','draft',false,false,p_key) returning id into sid;
 insert into public.service_segments(service_id,label,start_offset_minutes,duration_minutes,occupied_by_professional) values(sid,'Service',0,p_duration,true);
 insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata) values(bid,p_actor,'Service',sid,'createService',jsonb_build_object('action_version',1,'request_key',p_key,'prior_state',null,'new_state','draft','source','professional'));
 return sid;
end $$;
create function aesthenda_private.archive_service_v1(p_actor uuid,p_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; prior public.services%rowtype;
begin
 bid:=aesthenda_private.service_context(p_actor);
 select * into prior from public.services where id=p_id for update;
 if not found then raise exception 'SERVICE_NOT_FOUND'; end if;
 if prior.catalog_status='archived' then return; end if;
 update public.services set catalog_status='archived',is_active=false,is_public=false,updated_at=now() where id=p_id;
 insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata) values(bid,p_actor,'Service',p_id,'archiveService',jsonb_build_object('action_version',1,'prior_state',prior.catalog_status,'new_state','archived','source','professional'));
end $$;
alter function aesthenda_private.service_context(uuid) owner to aesthenda_services_owner;
alter function aesthenda_private.read_services_v1(uuid,uuid) owner to aesthenda_services_owner;
alter function aesthenda_private.create_service_v1(uuid,uuid,text,text,integer,bigint) owner to aesthenda_services_owner;
alter function aesthenda_private.archive_service_v1(uuid,uuid) owner to aesthenda_services_owner;
set local role aesthenda_services_owner;
revoke all on function aesthenda_private.service_context(uuid),aesthenda_private.read_services_v1(uuid,uuid),aesthenda_private.create_service_v1(uuid,uuid,text,text,integer,bigint),aesthenda_private.archive_service_v1(uuid,uuid) from public,anon,authenticated;
do $$ begin
 if exists(select 1 from pg_roles where rolname='service_role') then
 execute 'revoke all on function aesthenda_private.service_context(uuid),aesthenda_private.read_services_v1(uuid,uuid),aesthenda_private.create_service_v1(uuid,uuid,text,text,integer,bigint),aesthenda_private.archive_service_v1(uuid,uuid) from service_role';
 end if;
end $$;
grant execute on function aesthenda_private.read_services_v1(uuid,uuid),aesthenda_private.create_service_v1(uuid,uuid,text,text,integer,bigint),aesthenda_private.archive_service_v1(uuid,uuid) to aesthenda_runtime;
reset role;
revoke create on schema aesthenda_private from aesthenda_services_owner;
do $$ begin execute format('grant aesthenda_services_owner to %I with set false',current_user); end $$;
