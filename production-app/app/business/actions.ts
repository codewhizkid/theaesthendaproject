'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/supabase/require-user';
import { parseSetupInput } from '@/lib/business/input';
import { persistBusinessSetup } from '@/lib/business/persistence';

export async function createBusinessAccount(_previous: {message: string}, form: FormData): Promise<{message: string}> {
  const user = await requireUser();
  let input;
  try { input = parseSetupInput(form); }
  catch (error) { return {message: error instanceof Error ? error.message : 'Check your business details.'}; }
  if (!user.email) return {message: 'Your account needs a verified email address before continuing.'};
  try {
    await persistBusinessSetup({id:user.id, email:user.email}, input);
  } catch (error) {
    // Never disclose connection strings, SQL diagnostics, or protected records.
    const code = error instanceof Error ? error.message : '';
    if (code.includes('IDEMPOTENCY_CONFLICT')) return {message:'This request was already used for different details. Refresh the page to continue.'};
    if (!process.env.AESTHENDA_DATABASE_URL) return {message:'Business setup is not connected yet. Database configuration needs to be completed.'};
    return {message:'We couldn’t complete setup. Your details were not partially saved. Try again; retries won’t create another business.'};
  }
  revalidatePath('/dashboard');
  redirect('/dashboard');
}
