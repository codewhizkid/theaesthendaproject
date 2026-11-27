'use server';

import {revalidatePath} from 'next/cache';
import {requireUser} from '@/lib/supabase/require-user';
import {saveBookingPageTheme} from '@/lib/booking-theme/persistence';
import {BOOKING_COLOR_FIELDS, parseBookingTheme} from '@/lib/booking-theme/input';

type SaveDesignResult = {message: string; failed?: boolean};
export async function saveBookingPageDesign(_previous: SaveDesignResult, form: FormData): Promise<SaveDesignResult> {
  const user = await requireUser();
  const submittedRevision = form.get('revision');
  const revision = typeof submittedRevision === 'string' && /^\d+$/.test(submittedRevision)
    ? Number(submittedRevision)
    : NaN;
  if (!Number.isSafeInteger(revision) || revision < 0 || revision >= 2147483647) {
    return {message: 'Refresh this page before saving.', failed: true};
  }

  let theme;
  try {
    theme = parseBookingTheme({
      ...Object.fromEntries(BOOKING_COLOR_FIELDS.map(({key}) => [key, form.get(key)])),
      fontFamily: form.get('fontFamily'),
    });
  } catch (error) {
    return {message: error instanceof Error ? error.message : 'Check your design settings.', failed: true};
  }

  try {
    await saveBookingPageTheme(user.id, revision, theme);
  } catch (error) {
    const conflict = error instanceof Error && error.message.includes('BOOKING_THEME_CONFLICT');
    return {
      message: conflict ? 'These settings changed in another tab. Refresh the page before saving.'
        : 'Your design could not be saved. Please try again.',
      failed: true,
    };
  }

  revalidatePath('/settings/booking-page');
  revalidatePath('/booking-preview');
  return {message: 'Booking page design saved.'};
}
