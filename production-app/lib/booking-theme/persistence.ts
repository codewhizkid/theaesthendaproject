import 'server-only';
import {cache} from 'react';
import {checkedRuntime} from '@/lib/business/persistence';
import {parseBookingTheme, type BookingTheme, type BookingThemeState} from './input';

export const readBookingPageTheme = cache(async (actor: string): Promise<BookingThemeState | null> => {
  const db = await checkedRuntime();
  try {
    const {rows} = await db.query(
      'select aesthenda_private.read_booking_page_theme_v1($1::uuid) as result', [actor],
    );
    const result = rows[0]?.result;
    return result ? {
      theme: parseBookingTheme(result.theme),
      revision: result.revision,
      workspaceMatchesBooking: result.workspaceMatchesBooking === true,
    } : null;
  } finally {
    db.release();
  }
});

export async function saveBookingPageTheme(actor: string, revision: number, theme: BookingTheme) {
  const db = await checkedRuntime();
  try {
    await db.query(
      'select aesthenda_private.save_booking_page_theme_v1($1::uuid, $2::integer, $3::jsonb)',
      [actor, revision, JSON.stringify(theme)],
    );
  } finally {
    db.release();
  }
}

export async function saveWorkspaceMatch(actor: string, matches: boolean) {
  const db = await checkedRuntime();
  try {
    await db.query(
      'select aesthenda_private.save_workspace_match_v1($1::uuid, $2::boolean)', [actor, matches],
    );
  } finally {
    db.release();
  }
}
