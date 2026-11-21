'use client';
import Link from 'next/link';
export default function CalendarError() {
 return <main className="min-h-screen bg-[#f7f3ed] p-8 text-[#382b3c]"><h1 className="font-serif text-3xl">The calendar is temporarily unavailable</h1><p className="my-4">Your schedule could not be loaded. Please try again.</p><button onClick={()=>window.location.reload()} className="mr-5 min-h-11 rounded-lg border px-4 py-2">Try again</button><Link href="/dashboard" className="underline">Return to dashboard</Link></main>;
}
