-- The workspace opt-in belongs to the same salon account as the booking palette.
alter table public.businesses
  add column workspace_matches_booking boolean not null default false;

grant update (workspace_matches_booking) on public.businesses to aesthenda_setup_owner;

do $$ begin
  execute format('grant aesthenda_setup_owner to %I with set true', current_user);
end $$;
grant create on schema aesthenda_private to aesthenda_setup_owner;
set local role aesthenda_setup_owner;

-- Existing readers can ignore the new JSON field and retain the same result shape.
create or replace function aesthenda_private.read_booking_page_theme_v1(p_actor uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare result jsonb;
begin
  if p_actor is null then raise exception 'UNAUTHENTICATED'; end if;
  perform set_config('app.verified_actor_id', p_actor::text, true);
  perform set_config('app.business_account_id', '', true);

  select jsonb_build_object(
    'theme', booking_theme,
    'revision', booking_theme_revision,
    'workspaceMatchesBooking', workspace_matches_booking
  ) into result from public.businesses where owner_user_id = p_actor;
  return result;
end $$;

create function aesthenda_private.save_workspace_match_v1(p_actor uuid, p_match boolean) returns void
language plpgsql security definer set search_path = pg_catalog as $$
declare business uuid;
begin
  if p_actor is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_match is null then raise exception 'INVALID_WORKSPACE_MATCH'; end if;
  perform set_config('app.verified_actor_id', p_actor::text, true);
  perform set_config('app.business_account_id', '', true);

  select id into business from public.businesses where owner_user_id = p_actor;
  if business is null then raise exception 'BUSINESS_UNAVAILABLE'; end if;
  perform set_config('app.business_account_id', business::text, true);

  update public.businesses
    set workspace_matches_booking = p_match
    where id = business and owner_user_id = p_actor and workspace_matches_booking is distinct from p_match;
  if found then
    insert into public.audit_events(business_id, actor_id, entity_type, entity_id, action, metadata)
      values (business, p_actor, 'BusinessAccount', business, 'updateWorkspaceAppearance',
        jsonb_build_object('action_version', 1, 'workspaceMatchesBooking', p_match));
  end if;
end $$;

revoke all on function aesthenda_private.save_workspace_match_v1(uuid, boolean) from public, anon, authenticated;
grant execute on function aesthenda_private.save_workspace_match_v1(uuid, boolean) to aesthenda_runtime;

reset role;
revoke create on schema aesthenda_private from aesthenda_setup_owner;
do $$ begin
  execute format('grant aesthenda_setup_owner to %I with set false', current_user);
end $$;
