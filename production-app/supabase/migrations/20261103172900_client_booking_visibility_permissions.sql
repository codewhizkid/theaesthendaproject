-- Hosted management role cannot grant/revoke functions owned by the restricted
-- routines role after RESET ROLE. Perform ACL changes as the actual owner.
do $$ begin execute format('grant aesthenda_appointments_owner to %I with set true',current_user);end $$;
set local role aesthenda_appointments_owner;
revoke all on function aesthenda_private.read_client_booking_visibility_v1(uuid),aesthenda_private.save_client_booking_visibility_v1(uuid,integer,integer) from public,anon,authenticated;
grant execute on function aesthenda_private.read_client_booking_visibility_v1(uuid),aesthenda_private.save_client_booking_visibility_v1(uuid,integer,integer) to aesthenda_runtime;
reset role;
do $$ begin execute format('grant aesthenda_appointments_owner to %I with set false',current_user);end $$;
