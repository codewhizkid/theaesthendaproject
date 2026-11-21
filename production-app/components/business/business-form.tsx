'use client';

import { useActionState } from 'react';
import { createBusinessAccount } from '@/app/business/actions';

export function BusinessForm({requestKey, email}: {requestKey:string; email:string}) {
  const [state, action, pending] = useActionState(createBusinessAccount, {message:''});
  const inputClass='w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white focus:outline-2 focus:outline-cyan-400';
  return <form action={action} className="space-y-5">
    <input type="hidden" name="actionVersion" value="1" />
    <input type="hidden" name="requestKey" value={requestKey} />
    <div><label htmlFor="business-name" className="mb-2 block text-sm">Business name</label><input id="business-name" name="businessName" required maxLength={160} autoComplete="organization" className={inputClass} /></div>
    <div><label htmlFor="professional-name" className="mb-2 block text-sm">Your full name</label><input id="professional-name" name="professionalName" required maxLength={160} autoComplete="name" className={inputClass} /></div>
    <p className="text-sm text-slate-300">Signed in as {email}</p>
    <button disabled={pending} className="min-h-11 w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 disabled:opacity-60">{pending?'Saving your business…':'Create business'}</button>
    <p role="status" className="text-sm text-slate-200">{state.message}</p>
  </form>;
}
