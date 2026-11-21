-- An unused invitation must not prompt an already-linked client to enroll again.
-- Read-only projection checks the exact salon, not its display name.
do $$ begin execute format('grant aesthenda_client_access_owner to %I with set true',current_user);end $$;
grant create on schema aesthenda_private to aesthenda_client_access_owner;
set local role aesthenda_client_access_owner;
create function aesthenda_private.read_client_connection_prompt_v1(p_subject uuid,p_hash text) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare invitation aesthenda_private.client_signin_invites%rowtype; salon text;
begin
 if p_subject is null or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then return null;end if;
 perform set_config('app.verified_actor_id','',true);perform set_config('app.verified_client_user_id',p_subject::text,true);perform set_config('app.client_business_id','',true);perform set_config('app.client_invite_hash',p_hash,true);
 select * into invitation from aesthenda_private.client_signin_invites where token_hash=p_hash and expires_at>statement_timestamp() and used_by is null;
 if not found then return null;end if;
 perform set_config('app.client_business_id',invitation.business_id::text,true);
 if exists(select 1 from aesthenda_private.client_identity_links where business_id=invitation.business_id and auth_user_id=p_subject) then return null;end if;
 select name into salon from public.businesses where id=invitation.business_id and status in ('trial','active');if salon is null then return null;end if;
 return jsonb_build_object('businessName',salon,'expiresAt',invitation.expires_at);
end $$;
revoke all on function aesthenda_private.read_client_connection_prompt_v1(uuid,text) from public,anon,authenticated;
grant execute on function aesthenda_private.read_client_connection_prompt_v1(uuid,text) to aesthenda_runtime;
reset role;
revoke create on schema aesthenda_private from aesthenda_client_access_owner;
do $$ begin execute format('grant aesthenda_client_access_owner to %I with set false',current_user);end $$;
