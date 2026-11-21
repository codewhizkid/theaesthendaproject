import "@/components/dashboard/dashboard.css";

export default function DashboardLoading() {
  return <main className="ae-dashboard ae-fallback" aria-busy="true"><section className="ae-card" role="status"><span className="ae-wordmark">aesthenda</span><h1>A moment for your day.</h1><p>Loading your dashboard…</p></section></main>;
}
