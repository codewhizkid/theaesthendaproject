'use client';
import Link from 'next/link';
export default function AvailabilityError({reset}:{reset:()=>void}) {
 return <main className="p-8"><h1>Availability is temporarily unavailable</h1><p>Your saved hours have not been replaced. Please try again shortly.</p><button onClick={reset}>Try again</button> · <Link href="/dashboard">Dashboard</Link></main>;
}
