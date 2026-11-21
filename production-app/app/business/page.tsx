import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { BusinessForm } from '@/components/business/business-form';
import { requireUser } from '@/lib/supabase/require-user';
import { readBusinessSetup } from '@/lib/business/persistence';

export default async function BusinessPage() {
  const user=await requireUser();
  let unavailable=false;
  let existing;
  try { existing=await readBusinessSetup(user.id); }
  catch { unavailable=true; }
  if (existing) redirect('/dashboard');
  return <main className="min-h-screen bg-slate-950 px-6 py-16 text-white"><div className="mx-auto max-w-xl space-y-7 rounded-3xl border border-slate-800 bg-slate-900 p-8">
    <header className="space-y-3"><div className="flex items-center justify-between gap-4"><p className="text-sm text-cyan-300">Business setup</p></div><h1 className="text-3xl font-semibold">A home for your business.</h1><p className="text-slate-300">Add your business name and confirm the name you work under.</p></header>
    {unavailable?<p role="alert" className="text-slate-200">We can’t load business setup right now. Please try again shortly. No new business has been created.</p>:<BusinessForm requestKey={randomUUID()} email={user.email??''} />}
  </div></main>;
}
