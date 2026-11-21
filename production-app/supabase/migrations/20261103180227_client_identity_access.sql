-- Owner-issued test invitations expose no services, appointments, or private notes.
-- Verified client identity is supplied only by the trusted server runtime after getUser.
create role aesthenda_client_access_owner nologin nosuperuser nobypassrls;
do $$ begin execute format('grant aesthenda_client_access_owner to %I with inherit false',current_user);execute format('grant aesthenda_client_access_owner to %I with set true',current_user);end $$;
grant usage,create on schema aesthenda_private to aesthenda_client_access_owner;
grant usage on schema public to aesthenda_client_access_owner;
create table aesthenda_private.client_signin_invites(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id),owner_user_id uuid not null references auth.users(id),
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),expires_at timestamptz not null,
 used_by uuid references auth.users(id),created_at timestamptz not null default statement_timestamp()
);
create table aesthenda_private.client_identity_links(
 business_id uuid not null references public.businesses(id),auth_user_id uuid not null references auth.users(id),client_id uuid not null,
 email_key text not null default '',phone_key text not null default '',verified_at timestamptz not null default statement_timestamp(),
 primary key(business_id,auth_user_id),unique(business_id,client_id),
 foreign key(business_id,client_id) references public.clients(business_id,id),
 check(email_key<>'' or phone_key<>'')
);
create unique index client_identity_email on aesthenda_private.client_identity_links(business_id,email_key) where email_key<>'';
create unique index client_identity_phone on aesthenda_private.client_identity_links(business_id,phone_key) where phone_key<>'';
alter table aesthenda_private.client_signin_invites enable row level security;
alter table aesthenda_private.client_signin_invites force row level security;
alter table aesthenda_private.client_identity_links enable row level security;
alter table aesthenda_private.client_identity_links force row level security;
revoke all on aesthenda_private.client_signin_invites,aesthenda_private.client_identity_links from public,anon,authenticated,aesthenda_runtime;
grant select,insert on aesthenda_private.client_signin_invites to aesthenda_client_access_owner;
grant update(used_by) on aesthenda_private.client_signin_invites to aesthenda_client_access_owner;
grant select,insert on aesthenda_private.client_identity_links to aesthenda_client_access_owner;
create policy client_invite_scope on aesthenda_private.client_signin_invites to aesthenda_client_access_owner
 using(owner_user_id=nullif(current_setting('app.verified_actor_id',true),'')::uuid or token_hash=nullif(current_setting('app.client_invite_hash',true),''))
 with check(owner_user_id=nullif(current_setting('app.verified_actor_id',true),'')::uuid or (business_id=nullif(current_setting('app.client_business_id',true),'')::uuid and used_by=nullif(current_setting('app.verified_client_user_id',true),'')::uuid));
create policy client_link_scope on aesthenda_private.client_identity_links to aesthenda_client_access_owner
 using(auth_user_id=nullif(current_setting('app.verified_client_user_id',true),'')::uuid or business_id=nullif(current_setting('app.client_business_id',true),'')::uuid)
 with check(auth_user_id=nullif(current_setting('app.verified_client_user_id',true),'')::uuid and business_id=nullif(current_setting('app.client_business_id',true),'')::uuid);
grant select(id,name,owner_user_id,status) on public.businesses to aesthenda_client_access_owner;
create policy client_access_business on public.businesses for select to aesthenda_client_access_owner
 using(owner_user_id=nullif(current_setting('app.verified_actor_id',true),'')::uuid or id=nullif(current_setting('app.client_business_id',true),'')::uuid or exists(select 1 from aesthenda_private.client_identity_links l where l.business_id=businesses.id and l.auth_user_id=nullif(current_setting('app.verified_client_user_id',true),'')::uuid));
grant select(id,business_id,first_name,last_name,email,phone,status) on public.clients to aesthenda_client_access_owner;
grant insert(business_id,first_name,last_name,email,phone,status) on public.clients to aesthenda_client_access_owner;
create policy client_access_profile on public.clients to aesthenda_client_access_owner using(business_id=nullif(current_setting('app.client_business_id',true),'')::uuid) with check(business_id=nullif(current_setting('app.client_business_id',true),'')::uuid);
grant insert on public.audit_events to aesthenda_client_access_owner;
create policy client_access_audit on public.audit_events for insert to aesthenda_client_access_owner with check(business_id=nullif(current_setting('app.client_business_id',true),'')::uuid and (actor_id=nullif(current_setting('app.verified_actor_id',true),'')::uuid or actor_id=nullif(current_setting('app.verified_client_user_id',true),'')::uuid));
set local role aesthenda_client_access_owner;
create function aesthenda_private.create_client_signin_invite_v1(p_owner uuid,p_hash text) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare bid uuid; iid uuid; expiry timestamptz:=statement_timestamp()+interval '24 hours';
begin
 if p_owner is null or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_INPUT';end if;
 perform set_config('app.verified_actor_id',p_owner::text,true);perform set_config('app.verified_client_user_id','',true);perform set_config('app.client_business_id','',true);perform set_config('app.client_invite_hash','',true);
 select id into bid from public.businesses where owner_user_id=p_owner and status in ('trial','active');if bid is null then raise exception 'BUSINESS_UNAVAILABLE';end if;
 perform set_config('app.client_business_id',bid::text,true);
 perform pg_advisory_xact_lock(hashtextextended(bid::text,3));
 -- Bound owner-generated test invites; no public invitation creation endpoint.
 if (select count(*) from aesthenda_private.client_signin_invites where owner_user_id=p_owner and created_at>statement_timestamp()-interval '1 hour')>=10 then raise exception 'INVITE_LIMIT';end if;
 insert into aesthenda_private.client_signin_invites(business_id,owner_user_id,token_hash,expires_at) values(bid,p_owner,p_hash,expiry) returning id into iid;
 insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata) values(bid,p_owner,'Business',bid,'createClientSigninInvite',jsonb_build_object('inviteId',iid,'expiresAt',expiry));
 return jsonb_build_object('expiresAt',expiry);
end $$;
create function aesthenda_private.read_client_signin_invite_v1(p_hash text) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare invitation aesthenda_private.client_signin_invites%rowtype; salon text;
begin
 if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then return null;end if;
 perform set_config('app.verified_actor_id','',true);perform set_config('app.verified_client_user_id','',true);perform set_config('app.client_business_id','',true);perform set_config('app.client_invite_hash',p_hash,true);
 select * into invitation from aesthenda_private.client_signin_invites where token_hash=p_hash and expires_at>statement_timestamp() and used_by is null;
 if not found then return null;end if;perform set_config('app.client_business_id',invitation.business_id::text,true);
 select name into salon from public.businesses where id=invitation.business_id and status in ('trial','active');if salon is null then return null;end if;
 return jsonb_build_object('businessName',salon,'expiresAt',invitation.expires_at);
end $$;
create function aesthenda_private.resolve_client_identity_v1(p_subject uuid,p_email text,p_phone text,p_hash text,p_first text,p_last text,p_phone_hint text default '') returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare invitation aesthenda_private.client_signin_invites%rowtype; bid uuid; cid uuid; ids uuid[]; candidate record; created boolean:=false; salon text;
begin
 p_email:=lower(btrim(p_email));p_phone:=btrim(p_phone);p_first:=btrim(p_first);p_last:=btrim(p_last);p_phone_hint:=btrim(p_phone_hint);
 if p_subject is null or p_email is null or p_phone is null or (p_email='' and p_phone='') or length(p_email)>254 or (p_email<>'' and p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') or (p_phone<>'' and p_phone !~ '^\+[1-9][0-9]{6,14}$') or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or p_first is null or p_last is null or length(p_first)>80 or length(p_last)>80 or p_phone_hint is null or length(p_phone_hint)>40 or (p_phone_hint<>'' and (p_phone_hint !~ '^[+0-9 ().-]+$' or length(regexp_replace(p_phone_hint,'[^0-9]','','g')) not between 7 and 20)) then raise exception 'INVALID_INPUT';end if;
 perform set_config('app.verified_actor_id','',true);perform set_config('app.verified_client_user_id',p_subject::text,true);perform set_config('app.client_business_id','',true);perform set_config('app.client_invite_hash',p_hash,true);
 -- Lock order is invitation, then the same salon client lock used by owner saves.
 select * into invitation from aesthenda_private.client_signin_invites where token_hash=p_hash for update;
 if not found or invitation.expires_at<=statement_timestamp() or (invitation.used_by is not null and invitation.used_by<>p_subject) then raise exception 'INVITE_UNAVAILABLE';end if;
 bid:=invitation.business_id;perform set_config('app.client_business_id',bid::text,true);
 select name into salon from public.businesses where id=bid and status in ('trial','active');if salon is null then raise exception 'INVITE_UNAVAILABLE';end if;
 perform pg_advisory_xact_lock(hashtextextended(bid::text,3));
 select client_id into cid from aesthenda_private.client_identity_links where business_id=bid and auth_user_id=p_subject;
 if cid is null then
  select array_agg(distinct id) into ids from public.clients where business_id=bid and (
   (p_email<>'' and lower(btrim(email))=p_email) or
   (p_phone<>'' and regexp_replace(phone,'[^0-9]','','g')=regexp_replace(p_phone,'[^0-9]','','g')) or
   (p_phone ~ '^\+1[0-9]{10}$' and regexp_replace(phone,'[^0-9]','','g')=right(p_phone,10)));
  if coalesce(cardinality(ids),0)>1 then return jsonb_build_object('state','review_required');end if;
  -- Unverified phone can stop a possible duplicate, but cannot grant profile access.
  if p_phone_hint<>'' and exists(select 1 from public.clients where business_id=bid and (ids is null or not(id=any(ids))) and (
   regexp_replace(phone,'[^0-9]','','g')=regexp_replace(p_phone_hint,'[^0-9]','','g') or
   (length(regexp_replace(p_phone_hint,'[^0-9]','','g'))=10 and regexp_replace(phone,'[^0-9]','','g')='1'||regexp_replace(p_phone_hint,'[^0-9]','','g')) or
   (regexp_replace(p_phone_hint,'[^0-9]','','g') ~ '^1[0-9]{10}$' and regexp_replace(phone,'[^0-9]','','g')=right(regexp_replace(p_phone_hint,'[^0-9]','','g'),10)))) then return jsonb_build_object('state','review_required');end if;
  if coalesce(cardinality(ids),0)=1 then
   cid:=ids[1];select id,first_name,last_name,email,phone,status into candidate from public.clients where business_id=bid and id=cid;
   if candidate.status not in ('active','lead') or
    (p_email<>'' and candidate.email<>'' and lower(btrim(candidate.email))<>p_email) or
    (p_phone<>'' and candidate.phone<>'' and regexp_replace(candidate.phone,'[^0-9]','','g') not in (regexp_replace(p_phone,'[^0-9]','','g'),case when p_phone ~ '^\+1[0-9]{10}$' then right(p_phone,10) else '' end)) or
    (p_phone<>'' and regexp_replace(candidate.phone,'[^0-9]','','g')=right(p_phone,10) and not(p_email<>'' and lower(btrim(candidate.email))=p_email)) or
    exists(select 1 from aesthenda_private.client_identity_links where business_id=bid and client_id=cid and auth_user_id<>p_subject) then return jsonb_build_object('state','review_required');end if;
  else
   if p_first='' then raise exception 'NAME_REQUIRED';end if;
   insert into public.clients(business_id,first_name,last_name,email,phone,status) values(bid,p_first,p_last,p_email,p_phone,'active') returning id into cid;created:=true;
  end if;
  insert into aesthenda_private.client_identity_links(business_id,auth_user_id,client_id,email_key,phone_key) values(bid,p_subject,cid,p_email,p_phone);
  insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata) values(bid,p_subject,'Client',cid,'linkVerifiedClientIdentity',jsonb_build_object('created',created,'emailVerified',p_email<>'','phoneVerified',p_phone<>''));
 end if;
 select id,first_name,last_name,status into candidate from public.clients where id=cid and business_id=bid;
 if candidate.status not in ('active','lead') then return jsonb_build_object('state','review_required');end if;
 update aesthenda_private.client_signin_invites set used_by=p_subject where id=invitation.id;
 return jsonb_build_object('state','linked','created',created,'profile',jsonb_build_object('id',cid,'firstName',candidate.first_name,'lastName',candidate.last_name,'businessName',salon));
exception when unique_violation then
 -- Includes conflicting identity/contact claims. Roll back any just-created profile.
 return jsonb_build_object('state','review_required');
end $$;
create function aesthenda_private.read_client_identity_profiles_v1(p_subject uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare link record; profile record; result jsonb:='[]';
begin
 if p_subject is null then raise exception 'UNAUTHENTICATED';end if;
 perform set_config('app.verified_actor_id','',true);perform set_config('app.verified_client_user_id',p_subject::text,true);perform set_config('app.client_business_id','',true);perform set_config('app.client_invite_hash','',true);
 for link in select l.client_id,l.business_id,b.name,b.status from aesthenda_private.client_identity_links l join public.businesses b on b.id=l.business_id where l.auth_user_id=p_subject order by b.name,l.business_id loop
  perform set_config('app.client_business_id',link.business_id::text,true);
  select first_name,last_name,status into profile from public.clients where id=link.client_id and business_id=link.business_id;
  if link.status in ('trial','active') and profile.status in ('active','lead') then result:=result||jsonb_build_array(jsonb_build_object('id',link.client_id,'firstName',profile.first_name,'lastName',profile.last_name,'businessName',link.name));end if;
 end loop;
 return result;
end $$;
revoke all on function aesthenda_private.create_client_signin_invite_v1(uuid,text),aesthenda_private.read_client_signin_invite_v1(text),aesthenda_private.resolve_client_identity_v1(uuid,text,text,text,text,text,text),aesthenda_private.read_client_identity_profiles_v1(uuid) from public,anon,authenticated;
grant execute on function aesthenda_private.create_client_signin_invite_v1(uuid,text),aesthenda_private.read_client_signin_invite_v1(text),aesthenda_private.resolve_client_identity_v1(uuid,text,text,text,text,text,text),aesthenda_private.read_client_identity_profiles_v1(uuid) to aesthenda_runtime;
reset role;
revoke create on schema aesthenda_private from aesthenda_client_access_owner;
do $$ begin execute format('grant aesthenda_client_access_owner to %I with set false',current_user);end $$;
