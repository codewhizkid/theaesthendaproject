-- Salon-owned appearance settings for the booking page.
-- Values are validated here as well as in the server action; runtime access is
-- limited to these owner-scoped functions.
alter table public.businesses
 add column booking_theme jsonb not null default '{"background":"#F7F3ED","schedulerBackground":"#FFFFFF","headerText":"#382B3C","schedulerText":"#514B52","accentColor":"#78617E","fontFamily":"sans"}'::jsonb,
 add column booking_theme_revision integer not null default 0;
alter table public.businesses
 add constraint businesses_booking_theme_valid check (
  jsonb_typeof(booking_theme)='object'
  and jsonb_object_length(booking_theme)=6
  and booking_theme->>'background' ~* '^#[0-9a-f]{6}$'
  and booking_theme->>'schedulerBackground' ~* '^#[0-9a-f]{6}$'
  and booking_theme->>'headerText' ~* '^#[0-9a-f]{6}$'
  and booking_theme->>'schedulerText' ~* '^#[0-9a-f]{6}$'
  and booking_theme->>'accentColor' ~* '^#[0-9a-f]{6}$'
  and booking_theme->>'fontFamily' in ('sans','serif')
  and booking_theme_revision>=0
 );
grant update (booking_theme,booking_theme_revision) on public.businesses to aesthenda_setup_owner;
drop policy if exists setup_business_theme_update on public.businesses;
create policy setup_business_theme_update on public.businesses for update to aesthenda_setup_owner
 using(owner_user_id=nullif(current_setting('app.verified_actor_id',true),'')::uuid and id=nullif(current_setting('app.business_account_id',true),'')::uuid)
 with check(owner_user_id=nullif(current_setting('app.verified_actor_id',true),'')::uuid and id=nullif(current_setting('app.business_account_id',true),'')::uuid);
create function aesthenda_private.read_booking_page_theme_v1(p_actor uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare saved_theme jsonb; saved_revision integer;
begin
 if p_actor is null then raise exception 'UNAUTHENTICATED'; end if;
 perform set_config('app.verified_actor_id',p_actor::text,true);
 perform set_config('app.business_account_id','',true);
 select booking_theme,booking_theme_revision into saved_theme,saved_revision
 from public.businesses where owner_user_id=p_actor;
 if not found then return null; end if;
 return jsonb_build_object('theme',saved_theme,'revision',saved_revision);
end $$;
alter function aesthenda_private.read_booking_page_theme_v1(uuid) owner to aesthenda_setup_owner;
create function aesthenda_private.save_booking_page_theme_v1(p_actor uuid,p_revision integer,p_theme jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare business uuid; saved_revision integer; saved_theme jsonb; next_revision integer;
begin
 if p_actor is null then raise exception 'UNAUTHENTICATED'; end if;
 if p_revision is null or p_revision<0 or p_revision>=2147483646 then raise exception 'INVALID_REVISION'; end if;
 if p_theme is null or jsonb_typeof(p_theme)<>'object' then raise exception 'INVALID_THEME'; end if;
 if jsonb_object_length(p_theme)<>6
   or not (p_theme ?& array['background','schedulerBackground','headerText','schedulerText','accentColor','fontFamily'])
   or p_theme->>'background' !~* '^#[0-9a-f]{6}
 perform set_config('app.verified_actor_id',p_actor::text,true);
 perform set_config('app.business_account_id','',true);
 select id into business from public.businesses where owner_user_id=p_actor;
 if business is null then raise exception 'BUSINESS_UNAVAILABLE'; end if;
 perform set_config('app.business_account_id',business::text,true);
 perform pg_advisory_xact_lock(hashtextextended('booking-theme:'||business::text,0));
 select booking_theme_revision into saved_revision from public.businesses where id=business for update;
 if not found or saved_revision<>p_revision then raise exception 'BOOKING_THEME_CONFLICT'; end if;
 next_revision:=saved_revision+1;
 update public.businesses set booking_theme=p_theme,booking_theme_revision=next_revision where id=business;
 insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata)
 values(business,p_actor,'Business',business,'updateBookingPageTheme',jsonb_build_object('revision',next_revision));
 return jsonb_build_object('theme',p_theme,'revision',next_revision);
end $$;
alter function aesthenda_private.save_booking_page_theme_v1(uuid,integer,jsonb) owner to aesthenda_setup_owner;
revoke all on function aesthenda_private.read_booking_page_theme_v1(uuid),aesthenda_private.save_booking_page_theme_v1(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function aesthenda_private.read_booking_page_theme_v1(uuid),aesthenda_private.save_booking_page_theme_v1(uuid,integer,jsonb) to aesthenda_runtime;

   or p_theme->>'schedulerBackground' !~* '^#[0-9a-f]{6}
 perform set_config('app.verified_actor_id',p_actor::text,true);
 perform set_config('app.business_account_id','',true);
 select id into business from public.businesses where owner_user_id=p_actor;
 if business is null then raise exception 'BUSINESS_UNAVAILABLE'; end if;
 perform set_config('app.business_account_id',business::text,true);
 perform pg_advisory_xact_lock(hashtextextended('booking-theme:'||business::text,0));
 select booking_theme_revision into saved_revision from public.businesses where id=business for update;
 if not found or saved_revision<>p_revision then raise exception 'BOOKING_THEME_CONFLICT'; end if;
 next_revision:=saved_revision+1;
 update public.businesses set booking_theme=p_theme,booking_theme_revision=next_revision where id=business;
 insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata)
 values(business,p_actor,'Business',business,'updateBookingPageTheme',jsonb_build_object('revision',next_revision));
 return jsonb_build_object('theme',p_theme,'revision',next_revision);
end $$;
alter function aesthenda_private.save_booking_page_theme_v1(uuid,integer,jsonb) owner to aesthenda_setup_owner;
revoke all on function aesthenda_private.read_booking_page_theme_v1(uuid),aesthenda_private.save_booking_page_theme_v1(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function aesthenda_private.read_booking_page_theme_v1(uuid),aesthenda_private.save_booking_page_theme_v1(uuid,integer,jsonb) to aesthenda_runtime;

   or p_theme->>'headerText' !~* '^#[0-9a-f]{6}
 perform set_config('app.verified_actor_id',p_actor::text,true);
 perform set_config('app.business_account_id','',true);
 select id into business from public.businesses where owner_user_id=p_actor;
 if business is null then raise exception 'BUSINESS_UNAVAILABLE'; end if;
 perform set_config('app.business_account_id',business::text,true);
 perform pg_advisory_xact_lock(hashtextextended('booking-theme:'||business::text,0));
 select booking_theme_revision into saved_revision from public.businesses where id=business for update;
 if not found or saved_revision<>p_revision then raise exception 'BOOKING_THEME_CONFLICT'; end if;
 next_revision:=saved_revision+1;
 update public.businesses set booking_theme=p_theme,booking_theme_revision=next_revision where id=business;
 insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata)
 values(business,p_actor,'Business',business,'updateBookingPageTheme',jsonb_build_object('revision',next_revision));
 return jsonb_build_object('theme',p_theme,'revision',next_revision);
end $$;
alter function aesthenda_private.save_booking_page_theme_v1(uuid,integer,jsonb) owner to aesthenda_setup_owner;
revoke all on function aesthenda_private.read_booking_page_theme_v1(uuid),aesthenda_private.save_booking_page_theme_v1(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function aesthenda_private.read_booking_page_theme_v1(uuid),aesthenda_private.save_booking_page_theme_v1(uuid,integer,jsonb) to aesthenda_runtime;

   or p_theme->>'schedulerText' !~* '^#[0-9a-f]{6}
 perform set_config('app.verified_actor_id',p_actor::text,true);
 perform set_config('app.business_account_id','',true);
 select id into business from public.businesses where owner_user_id=p_actor;
 if business is null then raise exception 'BUSINESS_UNAVAILABLE'; end if;
 perform set_config('app.business_account_id',business::text,true);
 perform pg_advisory_xact_lock(hashtextextended('booking-theme:'||business::text,0));
 select booking_theme_revision into saved_revision from public.businesses where id=business for update;
 if not found or saved_revision<>p_revision then raise exception 'BOOKING_THEME_CONFLICT'; end if;
 next_revision:=saved_revision+1;
 update public.businesses set booking_theme=p_theme,booking_theme_revision=next_revision where id=business;
 insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata)
 values(business,p_actor,'Business',business,'updateBookingPageTheme',jsonb_build_object('revision',next_revision));
 return jsonb_build_object('theme',p_theme,'revision',next_revision);
end $$;
alter function aesthenda_private.save_booking_page_theme_v1(uuid,integer,jsonb) owner to aesthenda_setup_owner;
revoke all on function aesthenda_private.read_booking_page_theme_v1(uuid),aesthenda_private.save_booking_page_theme_v1(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function aesthenda_private.read_booking_page_theme_v1(uuid),aesthenda_private.save_booking_page_theme_v1(uuid,integer,jsonb) to aesthenda_runtime;

   or p_theme->>'accentColor' !~* '^#[0-9a-f]{6}
 perform set_config('app.verified_actor_id',p_actor::text,true);
 perform set_config('app.business_account_id','',true);
 select id into business from public.businesses where owner_user_id=p_actor;
 if business is null then raise exception 'BUSINESS_UNAVAILABLE'; end if;
 perform set_config('app.business_account_id',business::text,true);
 perform pg_advisory_xact_lock(hashtextextended('booking-theme:'||business::text,0));
 select booking_theme_revision into saved_revision from public.businesses where id=business for update;
 if not found or saved_revision<>p_revision then raise exception 'BOOKING_THEME_CONFLICT'; end if;
 next_revision:=saved_revision+1;
 update public.businesses set booking_theme=p_theme,booking_theme_revision=next_revision where id=business;
 insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata)
 values(business,p_actor,'Business',business,'updateBookingPageTheme',jsonb_build_object('revision',next_revision));
 return jsonb_build_object('theme',p_theme,'revision',next_revision);
end $$;
alter function aesthenda_private.save_booking_page_theme_v1(uuid,integer,jsonb) owner to aesthenda_setup_owner;
revoke all on function aesthenda_private.read_booking_page_theme_v1(uuid),aesthenda_private.save_booking_page_theme_v1(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function aesthenda_private.read_booking_page_theme_v1(uuid),aesthenda_private.save_booking_page_theme_v1(uuid,integer,jsonb) to aesthenda_runtime;

   or p_theme->>'fontFamily' not in ('sans','serif') then raise exception 'INVALID_THEME'; end if;
 perform set_config('app.verified_actor_id',p_actor::text,true);
 perform set_config('app.business_account_id','',true);
 select id into business from public.businesses where owner_user_id=p_actor;
 if business is null then raise exception 'BUSINESS_UNAVAILABLE'; end if;
 perform set_config('app.business_account_id',business::text,true);
 perform pg_advisory_xact_lock(hashtextextended('booking-theme:'||business::text,0));
 select booking_theme_revision into saved_revision from public.businesses where id=business for update;
 if not found or saved_revision<>p_revision then raise exception 'BOOKING_THEME_CONFLICT'; end if;
 next_revision:=saved_revision+1;
 update public.businesses set booking_theme=p_theme,booking_theme_revision=next_revision where id=business;
 insert into public.audit_events(business_id,actor_id,entity_type,entity_id,action,metadata)
 values(business,p_actor,'Business',business,'updateBookingPageTheme',jsonb_build_object('revision',next_revision));
 return jsonb_build_object('theme',p_theme,'revision',next_revision);
end $$;
alter function aesthenda_private.save_booking_page_theme_v1(uuid,integer,jsonb) owner to aesthenda_setup_owner;
revoke all on function aesthenda_private.read_booking_page_theme_v1(uuid),aesthenda_private.save_booking_page_theme_v1(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function aesthenda_private.read_booking_page_theme_v1(uuid),aesthenda_private.save_booking_page_theme_v1(uuid,integer,jsonb) to aesthenda_runtime;
