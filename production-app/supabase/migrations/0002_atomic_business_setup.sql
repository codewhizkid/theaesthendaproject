-- Apply through the migration runner, in a transaction. Existing duplicate or
-- inconsistent owners deliberately stop migration for reviewed remediation.
create schema if not exists aesthenda_private;
revoke all on schema aesthenda_private from public;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='aesthenda_setup_owner') then
    create role aesthenda_setup_owner nologin nosuperuser nobypassrls;
  end if;
  if not exists(select 1 from pg_roles where rolname='aesthenda_runtime') then
    create role aesthenda_runtime nologin nosuperuser nobypassrls;
  end if;
end $$;
-- Managed Postgres migration roles may create a role without SET permission.
-- Temporarily permit ownership transfer; never grant this membership to runtime.
do $$ begin
  execute format('grant aesthenda_setup_owner to %I with inherit false',current_user);
  execute format('grant aesthenda_setup_owner to %I with set true',current_user);
end $$;
grant usage, create on schema aesthenda_private to aesthenda_setup_owner;
grant usage on schema public to aesthenda_setup_owner;
grant usage on schema aesthenda_private to aesthenda_runtime;

alter table public.businesses alter column status set default 'trial';
alter table public.professionals alter column status set default 'onboarding';
alter table public.businesses add constraint businesses_one_owner unique(owner_user_id);
alter table public.businesses add constraint businesses_identity unique(id,owner_user_id);
alter table public.businesses add constraint businesses_owner_identity foreign key(owner_user_id) references auth.users(id);
alter table public.professionals add constraint professionals_one_per_business unique(business_id);
alter table public.professionals add constraint professionals_owner_identity foreign key(business_id,user_id) references public.businesses(id,owner_user_id);

create table aesthenda_private.setup_requests (
  actor_id uuid not null references auth.users(id),
  request_key uuid not null,
  payload_hash text not null,
  business_id uuid not null references public.businesses(id),
  created_at timestamptz not null default now(),
  primary key(actor_id,request_key)
);
alter table aesthenda_private.setup_requests enable row level security;
alter table aesthenda_private.setup_requests force row level security;
create policy setup_request_scope on aesthenda_private.setup_requests to aesthenda_setup_owner
  using(actor_id=nullif(current_setting('app.verified_actor_id',true),'')::uuid)
  with check(actor_id=nullif(current_setting('app.verified_actor_id',true),'')::uuid);

-- Other draft tables remain inaccessible until their canonical contracts land.
do $$ declare t text; begin
 foreach t in array array['businesses','professionals','clients','services','service_segments','availability_windows','calendar_blocks','appointments','appointment_segments','booking_holds','audit_events'] loop
   execute format('alter table public.%I enable row level security',t);
   execute format('alter table public.%I force row level security',t);
   execute format('revoke all on public.%I from public, anon, authenticated, aesthenda_runtime',t);
 end loop;
end $$;
drop policy if exists "Business owners can manage their account" on public.businesses;
drop policy if exists "Users can manage their professional record" on public.professionals;

grant select,insert on public.businesses, public.professionals, public.audit_events, aesthenda_private.setup_requests to aesthenda_setup_owner;
create policy setup_business_read on public.businesses for select to aesthenda_setup_owner
 using(owner_user_id=nullif(current_setting('app.verified_actor_id',true),'')::uuid);
create policy setup_business_insert on public.businesses for insert to aesthenda_setup_owner
 with check(owner_user_id=nullif(current_setting('app.verified_actor_id',true),'')::uuid and status='trial');
create policy setup_professional_read on public.professionals for select to aesthenda_setup_owner
 using(user_id=nullif(current_setting('app.verified_actor_id',true),'')::uuid and business_id=nullif(current_setting('app.business_account_id',true),'')::uuid);
create policy setup_professional_insert on public.professionals for insert to aesthenda_setup_owner
 with check(user_id=nullif(current_setting('app.verified_actor_id',true),'')::uuid and business_id=nullif(current_setting('app.business_account_id',true),'')::uuid and status='onboarding');
create policy setup_audit_insert on public.audit_events for insert to aesthenda_setup_owner
 with check(actor_id=nullif(current_setting('app.verified_actor_id',true),'')::uuid and business_id=nullif(current_setting('app.business_account_id',true),'')::uuid);

create function aesthenda_private.read_business_setup(p_actor uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare b public.businesses%rowtype; p public.professionals%rowtype;
begin
 if p_actor is null then raise exception 'UNAUTHENTICATED'; end if;
 perform set_config('app.verified_actor_id',p_actor::text,true);
 perform set_config('app.business_account_id','',true);
 select * into b from public.businesses where owner_user_id=p_actor;
 if not found then return null; end if;
 perform set_config('app.business_account_id',b.id::text,true);
 select * into p from public.professionals where business_id=b.id and user_id=p_actor;
 if not found then raise exception 'SETUP_INCOMPLETE'; end if;
 return jsonb_build_object('businessAccountId',b.id,'businessName',b.name,'professionalName',p.full_name,'businessStatus',b.status,'professionalStatus',p.status);
end $$;
alter function aesthenda_private.read_business_setup(uuid) owner to aesthenda_setup_owner;

create function aesthenda_private.create_business_account_v1(p_actor uuid,p_email text,p_request uuid,p_name text,p_full_name text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare result jsonb; bid uuid; fingerprint text; prior aesthenda_private.setup_requests%rowtype;
begin
 if p_actor is null or p_request is null then raise exception 'INVALID_REQUEST'; end if;
 if p_name is null or length(btrim(p_name)) not between 1 and 160 or p_full_name is null or length(btrim(p_full_name)) not between 1 and 160 or p_email is null or length(p_email) not between 3 and 320 then raise exception 'INVALID_INPUT'; end if;
 perform set_config('app.verified_actor_id',p_actor::text,true);
 perform set_config('app.business_account_id','',true);
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
 fingerprint:=md5(jsonb_build_array(btrim(p_name),btrim(p_full_name),p_email)::text);
 select * into prior from aesthenda_private.setup_requests where actor_id=p_actor and request_key=p_request;
 if found and prior.payload_hash<>fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
 result:=aesthenda_private.read_business_setup(p_actor);
 if result is null then
   insert into public.businesses(name,owner_user_id,status) values(btrim(p_name),p_actor,'trial') returning id into bid;
   perform set_config('app.business_account_id',bid::text,true);
   insert into public.professionals(business_id,user_id,full_name,email,status) values(bid,p_actor,btrim(p_full_name),p_email,'onboarding');
   insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata) values(bid,p_actor,'BusinessAccount',bid,'createBusinessAccount',jsonb_build_object('action_version',1,'request_key',p_request));
   result:=aesthenda_private.read_business_setup(p_actor);
 end if;
 if prior.request_key is null then
   insert into aesthenda_private.setup_requests(actor_id,request_key,payload_hash,business_id) values(p_actor,p_request,fingerprint,(result->>'businessAccountId')::uuid);
 end if;
 return result;
end $$;
alter function aesthenda_private.create_business_account_v1(uuid,text,uuid,text,text) owner to aesthenda_setup_owner;
revoke create on schema aesthenda_private from aesthenda_setup_owner;
revoke all on all functions in schema aesthenda_private from public,anon,authenticated;
grant execute on function aesthenda_private.read_business_setup(uuid),aesthenda_private.create_business_account_v1(uuid,text,uuid,text,text) to aesthenda_runtime;
alter default privileges in schema aesthenda_private revoke execute on functions from public;

-- Keep the administrator's role-management ability without inherited privileges
-- or a standing SET ROLE capability for the function owner.
do $$ begin
  execute format('grant aesthenda_setup_owner to %I with set false',current_user);
end $$;
