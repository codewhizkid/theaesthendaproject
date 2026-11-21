-- Supabase applies provider default function grants. After ownership transfer,
-- revoke as the actual owner so managed Postgres does not retain those grants.
do $$ begin
  execute format('grant aesthenda_setup_owner to %I with set true',current_user);
end $$;
set local role aesthenda_setup_owner;
revoke all on all functions in schema aesthenda_private from public,anon,authenticated;
do $$ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    execute 'revoke all on all functions in schema aesthenda_private from service_role';
  end if;
end $$;
grant execute on function aesthenda_private.read_business_setup(uuid),aesthenda_private.create_business_account_v1(uuid,text,uuid,text,text) to aesthenda_runtime;
reset role;
do $$ begin
  execute format('grant aesthenda_setup_owner to %I with set false',current_user);
end $$;
