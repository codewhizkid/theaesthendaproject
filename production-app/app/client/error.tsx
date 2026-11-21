'use client';
export default function ClientError({reset}:{reset:()=>void}){return <section><h1 className="ca-title">We couldn’t open your salon profile.</h1><p>Try again in a moment.</p><button className="bp-primary bp-next" type="button" onClick={reset}>Try again</button></section>;}
