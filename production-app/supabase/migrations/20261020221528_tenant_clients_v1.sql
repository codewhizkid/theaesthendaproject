-- Private salon client records. The verified actor comes only from server actions.
create role aesthenda_clients_owner nologin nosuperuser nobypassrls nocreatedb nocreaterole;
do $$ begin
 execute format('grant aesthenda_clients_owner to %I with inherit false',current_user);
 execute format('grant aesthenda_clients_owner to %I with set true',current_user);
end $$;
grant usage,create on schema aesthenda_private to aesthenda_clients_owner;
grant usage on schema public to aesthenda_clients_owner;
alter table public.clients add column notes text not null default '';
alter table public.clients add column revision integer not null default 1 check(revision>0);
create index clients_directory on public.clients(business_id,lower(first_name),lower(last_name),id);
create table aesthenda_private.client_requests (
 business_id uuid not null references public.businesses(id),
 request_key uuid not null,
 payload_hash text not null,
 client_id uuid not null references public.clients(id),
 created_at timestamptz not null default now(),
 primary key(business_id,request_key)
);
alter table aesthenda_private.client_requests enable row level security;
alter table aesthenda_private.client_requests force row level security;
grant select on public.businesses to aesthenda_clients_owner;
grant select,insert on public.clients,public.audit_events,aesthenda_private.client_requests to aesthenda_clients_owner;
grant update(first_name,last_name,email,phone,notes,revision,updated_at) on public.clients to aesthenda_clients_owner;
create policy clients_business_scope on public.businesses for select to aesthenda_clients_owner
 using(owner_user_id=nullif(current_setting('app.verified_actor_id',true),'')::uuid);
create policy clients_records_scope on public.clients to aesthenda_clients_owner
 using(business_id=nullif(current_setting('app.business_account_id',true),'')::uuid)
 with check(business_id=nullif(current_setting('app.business_account_id',true),'')::uuid);
create policy client_requests_scope on aesthenda_private.client_requests to aesthenda_clients_owner
 using(business_id=nullif(current_setting('app.business_account_id',true),'')::uuid)
 with check(business_id=nullif(current_setting('app.business_account_id',true),'')::uuid);
create policy clients_audit_insert on public.audit_events for insert to aesthenda_clients_owner
 with check(actor_id=nullif(current_setting('app.verified_actor_id',true),'')::uuid and business_id=nullif(current_setting('app.business_account_id',true),'')::uuid);

create function aesthenda_private.client_context(p_actor uuid) returns uuid
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
create function aesthenda_private.read_clients_v1(p_actor uuid,p_id uuid default null,p_search text default '',p_page integer default 0) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare records jsonb;
begin
 perform aesthenda_private.client_context(p_actor);
 if p_search is null or length(p_search)>160 or p_page is null or p_page not between 0 and 20000 then raise exception 'INVALID_INPUT'; end if;
 select coalesce(jsonb_agg(to_jsonb(c) order by c.position),'[]'::jsonb) into records from (
 select id,coalesce(first_name,'') as "firstName",coalesce(last_name,'') as "lastName",coalesce(email,'') as email,coalesce(phone,'') as phone,
 case when p_id is not null then notes else '' end as notes,revision,
 row_number() over(order by lower(first_name),lower(last_name),id) as position
 from public.clients where (p_id is null or id=p_id) and
 (p_id is not null or p_search='' or strpos(lower(concat_ws(' ',first_name,last_name,email,phone)),lower(p_search))>0)
 order by lower(first_name),lower(last_name),id limit 51 offset (case when p_id is null then p_page*50 else 0 end)
 ) c;
 return jsonb_build_object('clients',(select coalesce(jsonb_agg(x.value-'position' order by x.ordinality),'[]'::jsonb) from jsonb_array_elements(records) with ordinality x(value,ordinality) where x.ordinality<=50),'hasMore',jsonb_array_length(records)>50);
end $$;
create function aesthenda_private.save_client_v1(p_actor uuid,p_key uuid,p_id uuid,p_revision integer,p_first text,p_last text,p_email text,p_phone text,p_notes text) returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; cid uuid; prior public.clients%rowtype; payload jsonb; replay aesthenda_private.client_requests%rowtype;
begin
 bid:=aesthenda_private.client_context(p_actor);
 p_first:=btrim(p_first);p_last:=btrim(p_last);p_email:=btrim(p_email);p_phone:=btrim(p_phone);p_notes:=btrim(p_notes);
 if p_key is null or p_first is null or length(p_first) not between 1 and 80 or p_last is null or length(p_last)>80 or p_email is null or length(p_email)>254 or (p_email<>'' and p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') or p_phone is null or length(p_phone)>40 or (p_phone<>'' and (p_phone !~ '^[+0-9 ().-]+$' or length(regexp_replace(p_phone,'[^0-9]','','g')) not between 7 and 20)) or p_notes is null or length(p_notes)>2000 or p_revision is null or p_revision<0 or (p_id is null and p_revision<>0) or (p_id is not null and p_revision<1) then raise exception 'INVALID_INPUT'; end if;
 payload:=jsonb_build_object('id',p_id,'revision',p_revision,'first',p_first,'last',p_last,'email',p_email,'phone',p_phone,'notes',p_notes);
 perform pg_advisory_xact_lock(hashtextextended(bid::text,3));
 select * into replay from aesthenda_private.client_requests where business_id=bid and request_key=p_key;
 if found then
  if replay.payload_hash<>md5(payload::text) then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return replay.client_id;
 end if;
 if p_id is null then
  insert into public.clients(business_id,first_name,last_name,email,phone,notes,status) values(bid,p_first,p_last,p_email,p_phone,p_notes,'active') returning id into cid;
 else
  select * into prior from public.clients where id=p_id for update;
  if not found then raise exception 'CLIENT_NOT_FOUND'; end if;
  if prior.revision<>p_revision then raise exception 'STALE_CLIENT'; end if;
  update public.clients set first_name=p_first,last_name=p_last,email=p_email,phone=p_phone,notes=p_notes,revision=revision+1,updated_at=now() where id=p_id;
  cid:=p_id;
 end if;
 insert into aesthenda_private.client_requests(business_id,request_key,payload_hash,client_id) values(bid,p_key,md5(payload::text),cid);
 -- Contact details and note text are deliberately omitted from audit metadata.
 insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata) values(bid,p_actor,'Client',cid,case when p_id is null then 'createClient' else 'updateClient' end,jsonb_build_object('action_version',1,'request_key',p_key,'prior_revision',p_revision,'new_revision',p_revision+1,'source','professional'));
 return cid;
end $$;
alter function aesthenda_private.client_context(uuid) owner to aesthenda_clients_owner;
alter function aesthenda_private.read_clients_v1(uuid,uuid,text,integer) owner to aesthenda_clients_owner;
alter function aesthenda_private.save_client_v1(uuid,uuid,uuid,integer,text,text,text,text,text) owner to aesthenda_clients_owner;
set local role aesthenda_clients_owner;
revoke all on function aesthenda_private.client_context(uuid),aesthenda_private.read_clients_v1(uuid,uuid,text,integer),aesthenda_private.save_client_v1(uuid,uuid,uuid,integer,text,text,text,text,text) from public,anon,authenticated;
do $$ begin
 if exists(select 1 from pg_roles where rolname='service_role') then
 execute 'revoke all on function aesthenda_private.client_context(uuid),aesthenda_private.read_clients_v1(uuid,uuid,text,integer),aesthenda_private.save_client_v1(uuid,uuid,uuid,integer,text,text,text,text,text) from service_role';
 end if;
end $$;
grant execute on function aesthenda_private.read_clients_v1(uuid,uuid,text,integer),aesthenda_private.save_client_v1(uuid,uuid,uuid,integer,text,text,text,text,text) to aesthenda_runtime;
reset role;
revoke create on schema aesthenda_private from aesthenda_clients_owner;
do $$ begin execute format('grant aesthenda_clients_owner to %I with set false',current_user); end $$;
