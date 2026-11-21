'use client';
import Link from 'next/link';
export default function ServicesError({reset}:{reset:()=>void}) {
 return <main className="p-8"><h1>Services are temporarily unavailable</h1><p>Please try again shortly.</p><button onClick={reset}>Try again</button> · <Link href="/dashboard">Dashboard</Link></main>;
}
