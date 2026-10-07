import Link from "next/link";

const priorities = [
  {
    title: "Auth + account boundaries",
    description:
      "Real sign-in, secure session handling, and business-scoped access control for the production app.",
    href: "/auth/sign-in",
  },
  {
    title: "Business foundation",
    description:
      "Business account, professional profile, client records, and service catalog as the product base layer.",
    href: "/business",
  },
  {
    title: "Scheduling engine",
    description:
      "Server-authoritative availability, holds, conflicts, and appointment validation derived from the approved product rules.",
    href: "/dashboard",
  },
  {
    title: "Release readiness",
    description:
      "Deployment, security review, and operational checks before the product is treated as production-ready.",
    href: "/dashboard",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-20">
        <div className="inline-flex w-fit items-center rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-cyan-200">
          Production foundation
        </div>

        <header className="space-y-6">
          <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            Aesthenda production app foundation
          </h1>
          <p className="max-w-2xl text-lg text-slate-300">
            This app is intentionally separated from the prototype. The prototype stays as a
            reference sandbox, while the production app becomes the authoritative product
            foundation.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {priorities.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg shadow-slate-950/20 transition hover:border-cyan-500/60 hover:bg-slate-900"
            >
              <h2 className="mb-3 text-lg font-semibold text-white">{item.title}</h2>
              <p className="text-sm leading-6 text-slate-300">{item.description}</p>
            </Link>
          ))}
        </section>

        <section className="grid gap-6 rounded-3xl border border-slate-800 bg-slate-900/70 p-6 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Current focus
            </p>
            <p className="text-xl font-semibold text-white">
              Establish the real business/account foundation before building the product UI.
            </p>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Source of truth
            </p>
            <p className="text-xl font-semibold text-white">
              Product direction stays grounded in the governing docs and the revised phase files.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
