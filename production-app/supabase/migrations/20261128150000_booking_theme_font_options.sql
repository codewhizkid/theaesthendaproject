-- Add two curated booking-page fonts while preserving existing saved choices.
alter table public.businesses
  drop constraint businesses_booking_theme_valid,
  add constraint businesses_booking_theme_valid check (
    case when jsonb_typeof(booking_theme) = 'object' then (
      booking_theme - array['background','schedulerBackground','headerText','schedulerText','accentColor','fontFamily'] = '{}'::jsonb
      and booking_theme->>'background' ~ '^#[0-9A-F]{6}$'
      and booking_theme->>'schedulerBackground' ~ '^#[0-9A-F]{6}$'
      and booking_theme->>'headerText' ~ '^#[0-9A-F]{6}$'
      and booking_theme->>'schedulerText' ~ '^#[0-9A-F]{6}$'
      and booking_theme->>'accentColor' ~ '^#[0-9A-F]{6}$'
      and booking_theme->>'fontFamily' in ('sans', 'manrope', 'serif', 'lora')
    ) is true else false end
  );
