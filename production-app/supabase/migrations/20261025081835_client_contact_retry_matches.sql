-- Duplicate guidance must not intercept a safely replayed create request.
do $$ begin execute format('grant aesthenda_clients_owner to %I with set true',current_user);end $$;
grant create on schema aesthenda_private to aesthenda_clients_owner;
set local role aesthenda_clients_owner;
create function aesthenda_private.client_contact_matches_v1(p_actor uuid,p_email text,p_phone text,p_key uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform aesthenda_private.client_context(p_actor);
 if p_key is null then raise exception 'INVALID_INPUT';end if;
 -- The canonical save still verifies the full payload fingerprint on replay.
 if exists(select 1 from aesthenda_private.client_requests where request_key=p_key) then return '[]'::jsonb;end if;
 return aesthenda_private.client_contact_matches_v1(p_actor,p_email,p_phone);
end $$;
revoke all on function aesthenda_private.client_contact_matches_v1(uuid,text,text,uuid) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then execute 'revoke all on function aesthenda_private.client_contact_matches_v1(uuid,text,text,uuid) from service_role';end if;end $$;
grant execute on function aesthenda_private.client_contact_matches_v1(uuid,text,text,uuid) to aesthenda_runtime;
reset role;
revoke create on schema aesthenda_private from aesthenda_clients_owner;
do $$ begin execute format('grant aesthenda_clients_owner to %I with set false',current_user);end $$;
