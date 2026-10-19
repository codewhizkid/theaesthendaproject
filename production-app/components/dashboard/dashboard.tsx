import Link from "next/link";
import type { ReactNode } from "react";
import "./dashboard.css";

type IconName = "today" | "calendar" | "clients" | "services" | "clock" | "link" | "payment" | "mail" | "chart" | "settings" | "arrow" | "plus" | "leaf";
const paths: Record<IconName, ReactNode> = {
  today: <><path d="m3 10 9-7 9 7v10H3Z" /><path d="M9 20v-7h6v7" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2" /></>,
  clients: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m3 10v-3a6 6 0 0 0-2-4" /></>,
  services: <><path d="M3 4h9l9 9-8 8-10-9Z" /><circle cx="8" cy="9" r="1" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></>,
  link: <><path d="m10 13 4-4m-6 7-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 12a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1" /></>,
  payment: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 10h18M7 15h3" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m3 6 9 7 9-7" /></>,
  chart: <><path d="M4 20V10h4v10m3 0V4h4v16m3 0V7h4v13" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h6l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3Z" /></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  plus: <path d="M12 4v16M4 12h16" />,
  leaf: <><path d="M20 3C9 2 3 7 5 14s14 7 15-11Z" /><path d="M3 21 15 9" /></>,
};
export function DashboardIcon({ name }: { name: IconName }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
const navigation: { label: string; icon: IconName }[] = [
  { label: "Calendar", icon: "calendar" }, { label: "Clients", icon: "clients" },
  { label: "Services", icon: "services" }, { label: "Availability", icon: "clock" },
  { label: "Booking Page", icon: "link" }, { label: "Payments", icon: "payment" },
  { label: "Communications", icon: "mail" }, { label: "Analytics", icon: "chart" },
];
function Navigation() {
  return <nav aria-label="Main navigation" className="ae-navigation">
    <Link className="ae-nav-item ae-nav-active" href="/dashboard" aria-current="page"><DashboardIcon name="today" />Today</Link>
    {navigation.map(({ label, icon }) => <span className="ae-nav-item ae-nav-unavailable" key={label} aria-disabled="true"><DashboardIcon name={icon} /><span>{label}</span><span className="ae-sr-only"> — not yet available</span></span>)}
    <p className="ae-nav-note">More tools are on their way.</p>
  </nav>;
}

// Missing sources are unavailable, never zero totals, bookable gaps, or demo records.
export function Dashboard({ name }: { name?: string }) {
  const displayName = name?.trim();
  const firstName = displayName?.split(/\s+/)[0];
  const initials = displayName ? Array.from(displayName)[0].toUpperCase() : "A";
  return <div className="ae-dashboard">
    <a className="ae-skip-link" href="#today-content">Skip to today</a>
    <aside className="ae-sidebar">
      <Link href="/dashboard" className="ae-wordmark" aria-label="Aesthenda home">aesthenda</Link>
      <p className="ae-studio-label">Your business, beautifully in rhythm.</p>
      <div className="ae-desktop-navigation"><Navigation /></div>
      <details className="ae-mobile-navigation"><summary>Today <span>Menu +</span></summary><Navigation /></details>
      <div className="ae-sidebar-footer">
        <Link href="/business" className="ae-nav-item"><DashboardIcon name="settings" />Business setup</Link>
        <div className="ae-profile"><span className="ae-avatar">{initials}</span><div><strong>{displayName || "Your account"}</strong><span>Independent professional</span></div></div>
      </div>
    </aside>
    <main id="today-content" className="ae-main" tabIndex={-1}>
      <header className="ae-page-header">
        <div><p className="ae-eyebrow">YOUR DAILY OVERVIEW</p><h1>{firstName ? `Hello, ${firstName}.` : "A little space to focus."}</h1><p>Your day, with room for what you do best.</p></div>
        <div className="ae-create"><button className="ae-button ae-primary" disabled aria-describedby="appointment-unavailable"><DashboardIcon name="plus" />New appointment</button><span id="appointment-unavailable">Scheduling is not yet connected</span></div>
      </header>
      <section className="ae-summary" aria-label="Business overview">
        {[{ icon: "calendar" as const, label: "Appointments today", detail: "Awaiting scheduling connection" }, { icon: "chart" as const, label: "Booked today", detail: "Awaiting booking data" }, { icon: "payment" as const, label: "Awaiting payment", detail: "Awaiting payment connection" }].map(({ icon, label, detail }) => <article className="ae-stat" key={label}><span className="ae-stat-icon"><DashboardIcon name={icon} /></span><div><span className="ae-stat-value" aria-label="Unavailable">—</span><h2>{label}</h2><p>{detail}</p></div></article>)}
      </section>
      <div className="ae-content-grid">
        <div className="ae-primary-column">
          <section className="ae-card ae-up-next" aria-labelledby="up-next-title"><p className="ae-eyebrow" id="up-next-title">UP NEXT</p><div className="ae-next-content"><span className="ae-empty-icon"><DashboardIcon name="leaf" /></span><div><h2>A little breathing room.</h2><p>Your next appointment will appear here once scheduling is connected.</p></div></div><div className="ae-card-foot"><span className="ae-dot" />A place for your next client, their details, and a smooth check-in.</div></section>
          <section className="ae-card" aria-labelledby="appointments-title"><header className="ae-section-header"><h2 id="appointments-title">Today’s appointments</h2><span className="ae-badge">Not connected</span></header><div className="ae-empty-list"><span className="ae-empty-icon ae-outline-icon"><DashboardIcon name="calendar" /></span><h3>Your appointments, all together.</h3><p>Confirmed bookings and client details will live here.<br />Your schedule is not available yet.</p></div></section>
          <section className="ae-card" aria-labelledby="attention-title"><header className="ae-section-header"><h2 id="attention-title">Needs your attention</h2></header><div className="ae-attention-row"><span className="ae-setup-icon"><DashboardIcon name="settings" /></span><div><h3>Your business details</h3><p>Open setup to add your business information.</p></div><Link href="/business" className="ae-text-link">Open setup<DashboardIcon name="arrow" /></Link></div><p className="ae-attention-note">Payment and reminder alerts will appear when those services are connected.</p></section>
        </div>
        <div className="ae-secondary-column">
          <section className="ae-card ae-day" aria-labelledby="day-title"><header className="ae-section-header"><div><h2 id="day-title">Your day</h2><p>A clear view of your rhythm.</p></div><DashboardIcon name="clock" /></header><div className="ae-day-placeholder"><div className="ae-day-lines" aria-hidden="true">{Array.from({ length: 7 }, (_, i) => <span key={i} />)}</div><div className="ae-day-message"><span className="ae-empty-icon"><DashboardIcon name="calendar" /></span><h3>Make space for your day.</h3><p>Appointments and processing time will appear here when your calendar is connected.</p><span className="ae-badge">Calendar not connected</span></div></div><p className="ae-day-note">Availability cannot be determined yet.</p></section>
          <section className="ae-card ae-booking" aria-labelledby="booking-title"><span className="ae-empty-icon"><DashboardIcon name="link" /></span><div><h2 id="booking-title">Your own corner of the web.</h2><p>A booking page that feels like you. Publishing and customization are not yet available.</p><span className="ae-badge">Publishing not connected</span></div></section>
        </div>
      </div>
      <footer className="ae-main-footer"><span>aesthenda</span>A little more calm. A little more you.</footer>
    </main>
  </div>;
}
