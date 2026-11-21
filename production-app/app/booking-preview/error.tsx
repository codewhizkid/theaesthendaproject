'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="p-8"><h1 className="text-2xl">We couldn’t open your booking preview.</h1><p>Your salon information has not been changed.</p><button type="button" className="mt-4 underline" onClick={reset}>Try again</button></main>;}
