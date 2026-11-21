'use client';
import {useId,type InputHTMLAttributes} from 'react';
type Props=Omit<InputHTMLAttributes<HTMLInputElement>,'type'|'role'|'className'>&{label:string;description:string};
export function SettingSwitch({label,description,...props}:Props){
 const id=useId();
 return <div><label htmlFor={id} className="flex min-h-11 cursor-pointer items-center justify-between gap-4"><span className="font-medium">{label}</span><span className="relative inline-flex shrink-0 items-center gap-2"><input {...props} id={id} type="checkbox" role="switch" aria-describedby={`${id}-help`} className="peer sr-only"/><span aria-hidden="true" className="h-7 w-12 rounded-full border border-stone-400 bg-stone-300 transition-colors peer-checked:border-[#382b3c] peer-checked:bg-[#382b3c] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-[#78617e] peer-disabled:opacity-50"/><span aria-hidden="true" className="pointer-events-none absolute left-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5"/><span aria-hidden="true" className="w-6 text-xs text-stone-600 peer-checked:hidden">Off</span><span aria-hidden="true" className="hidden w-6 text-xs font-semibold peer-checked:inline">On</span></span></label><p id={`${id}-help`} className="mt-1 text-sm text-stone-600">{description}</p></div>;
}
