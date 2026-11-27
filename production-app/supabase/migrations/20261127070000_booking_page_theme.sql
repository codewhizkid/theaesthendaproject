-- Revision zero is the existing booking appearance, before any salon edits.
alter table public.businesses
  add column booking_theme jsonb not null
    default '{"background":"#FAF8F6","schedulerBackground":"#FFFFFF","headerText":"#3F3142","schedulerText":"#3F3142","accentColor":"#705C76","fontFamily":"sans"}'::jsonb,
  add column booking_theme_revision integer not null default 0,
  add constraint businesses_booking_theme_revision_valid check (booking_theme_revision >= 0),
  add constraint businesses_booking_theme_valid check (
    case when jsonb_typeof(booking_theme) = 'object' then (
      booking_theme - array['background','schedulerBackground','headerText','schedulerText','accentColor','fontFamily'] = '{}'::jsonb
      and booking_theme->>'background' ~ '^#[0-9A-F]{6}$'
      and booking_theme->>'schedulerBackground' ~ '^#[0-9A-F]{6}$'
      and booking_theme->>'headerText' ~ '^#[0-9A-F]{6}$'
      and booking_theme->>'schedulerText' ~ '^#[0-9A-F]{6}$'
      and booking_theme->>'accentColor' ~ '^#[0-9A-F]{6}$'
      and booking_theme->>'fontFamily' in ('sans', 'serif')
    ) is true else false end
  );

grant update (booking_theme, booking_theme_revision) on public.businesses to aesthenda_setup_owner;
create policy setup_business_theme_update on public.businesses for update to aesthenda_setup_owner
  using (
    owner_user_id = nullif(current_setting('app.verified_actor_id', true), '')::uuid
    and id = nullif(current_setting('app.business_account_id', true), '')::uuid
  )
  with check (
    owner_user_id = nullif(current_setting('app.verified_actor_id', true), '')::uuid
    and id = nullif(current_setting('app.business_account_id', true), '')::uuid
  );

-- Follow the existing hosted-migration role pattern. The restricted owner must
-- create its own routines and issue their grants, then give up schema CREATE.
do $$ begin
  execute format('grant aesthenda_setup_owner to %I with set true', current_user);
end $$;
grant create on schema aesthenda_private to aesthenda_setup_owner;
set local role aesthenda_setup_owner;

create function aesthenda_private.read_booking_page_theme_v1(p_actor uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare result jsonb;
begin
  if p_actor is null then raise exception 'UNAUTHENTICATED'; end if;
  perform set_config('app.verified_actor_id', p_actor::text, true);
  perform set_config('app.business_account_id', '', true);

  select jsonb_build_object('theme', booking_theme, 'revision', booking_theme_revision)
    into result from public.businesses where owner_user_id = p_actor;
  return result;
end $$;

create function aesthenda_private.save_booking_page_theme_v1(p_actor uuid, p_revision integer, p_theme jsonb)
returns void language plpgsql security definer set search_path = pg_catalog as $$
declare business uuid; next_revision integer;
begin
  if p_actor is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_revision is null or p_revision < 0 or p_revision >= 2147483647 then raise exception 'INVALID_REVISION'; end if;
  perform set_config('app.verified_actor_id', p_actor::text, true);
  perform set_config('app.business_account_id', '', true);

  select id into business from public.businesses where owner_user_id = p_actor;
  if business is null then raise exception 'BUSINESS_UNAVAILABLE'; end if;
  perform set_config('app.business_account_id', business::text, true);

  -- Check the revision as part of the write so concurrent saves cannot overwrite each other.
  update public.businesses
    set booking_theme = p_theme, booking_theme_revision = booking_theme_revision + 1
    where id = business and owner_user_id = p_actor and booking_theme_revision = p_revision
    returning booking_theme_revision into next_revision;
  if not found then raise exception 'BOOKING_THEME_CONFLICT'; end if;

  insert into public.audit_events(business_id, actor_id, entity_type, entity_id, action, metadata)
    values (business, p_actor, 'BusinessAccount', business, 'updateBookingPageTheme',
      jsonb_build_object('action_version', 1, 'revision', next_revision));
end $$;

revoke all on function aesthenda_private.read_booking_page_theme_v1(uuid),
  aesthenda_private.save_booking_page_theme_v1(uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function aesthenda_private.read_booking_page_theme_v1(uuid),
  aesthenda_private.save_booking_page_theme_v1(uuid, integer, jsonb) to aesthenda_runtime;

reset role;
revoke create on schema aesthenda_private from aesthenda_setup_owner;
do $$ begin
  execute format('grant aesthenda_setup_owner to %I with set false', current_user);
end $$;
