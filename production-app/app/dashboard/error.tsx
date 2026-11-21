"use client";

import Link from "next/link";
import "@/components/dashboard/dashboard.css";

export default function DashboardError({ retry }: { retry: () => void }) {
  return <main className="ae-dashboard ae-fallback"><section className="ae-card"><span className="ae-wordmark">aesthenda</span><h1>Your day couldn’t load.</h1><p>We couldn’t retrieve your dashboard. Try again, or return to sign-in if your session has ended.</p><button className="ae-button ae-primary" onClick={retry}>Try again</button><Link href="/auth/sign-in">Return to sign-in</Link></section></main>;
}
