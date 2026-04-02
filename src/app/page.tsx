import Link from "next/link";

// ── SVG Icons (Lucide-style) ─────────────────────────────────────────────────

function IconMonitor() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16v5" />
      <path d="M8 21h8" />
      <rect x="2" y="3" width="20" height="13" rx="2" />
      <path d="M7 10l2 2 3-3 2 2 3-3" />
    </svg>
  );
}

function IconPatients() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6M22 11h-6" />
    </svg>
  );
}

function IconHistory() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// ── Nav items ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  {
    href: "/camera",
    label: "Monitor",
    sublabel: "Suivi de la douleur en temps réel",
    Icon: IconMonitor,
    gradient: "from-indigo-500 to-cyan-400",
    glow: "shadow-indigo-500/25",
    iconBg: "bg-indigo-500/20",
    primary: true,
  },
  {
    href: "/patients",
    label: "Patients",
    sublabel: "Liste et gestion des patients",
    Icon: IconPatients,
    gradient: "from-emerald-500 to-teal-400",
    glow: "shadow-emerald-500/20",
    iconBg: "bg-emerald-500/15",
  },
  {
    href: "/history",
    label: "Historique",
    sublabel: "Dernières séances enregistrées",
    Icon: IconHistory,
    gradient: "from-amber-500 to-orange-400",
    glow: "shadow-amber-500/20",
    iconBg: "bg-amber-500/15",
  },
  {
    href: "/settings",
    label: "Réglages",
    sublabel: "Seuils, lissage et calibration",
    Icon: IconSettings,
    gradient: "from-slate-400 to-slate-300",
    glow: "shadow-slate-400/15",
    iconBg: "bg-slate-500/15",
  },
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col bg-[#0a0e1a] px-5 pt-6 pb-4 overflow-auto">
      <div className="mx-auto w-full max-w-md flex flex-col flex-1">
        {/* Hero */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Analyse faciale
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Monitoring FACS de la douleur pour kinésithérapeutes
          </p>
        </div>

        {/* Navigation cards */}
        <nav className="flex flex-col gap-3">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative flex items-center gap-4 rounded-2xl border px-5 py-4 transition-all active:scale-[0.98] ${
                item.primary
                  ? "border-indigo-500/30 bg-gradient-to-r from-indigo-600/20 to-cyan-600/10"
                  : "border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06]"
              }`}
            >
              {/* Icon */}
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${item.iconBg}`}>
                <div className={`bg-gradient-to-br ${item.gradient} bg-clip-text text-transparent`}>
                  <item.Icon />
                </div>
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <span className="text-[15px] font-semibold text-white">{item.label}</span>
                <p className="text-xs text-slate-500 mt-0.5">{item.sublabel}</p>
              </div>

              {/* Arrow */}
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-600 group-hover:text-slate-400 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Link>
          ))}
        </nav>

        {/* Medical disclaimer */}
        <div className="mt-auto pt-5">
          <div className="rounded-xl border border-amber-500/10 bg-amber-500/[0.04] px-4 py-3">
            <div className="flex items-start gap-2.5">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-amber-500/70 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <p className="text-[11px] leading-relaxed text-slate-500">
                <span className="font-semibold text-amber-500/80">Avertissement</span> — Outil d&apos;aide à l&apos;observation destiné aux professionnels de santé. Ne constitue pas un dispositif médical certifié.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
