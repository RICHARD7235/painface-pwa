import Link from "next/link";

// ── Icons (1.5px stroke, clinical line style) ────────────────────────────────

function IconPatients() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.3 3.4-5.5 6.5-5.5s5.7 2.2 6.5 5.5" />
      <path d="M17 6v4M19 8h-4" />
    </svg>
  );
}

function IconHistory() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </svg>
  );
}

function IconChev() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l8 3v6c0 4.5-3.5 8-8 9-4.5-1-8-4.5-8-9V6l8-3z" />
    </svg>
  );
}

// ── Secondary items ──────────────────────────────────────────────────────────

const SECONDARY = [
  { href: "/patients", label: "Patients", sub: "Dossiers · consentements RGPD", Icon: IconPatients },
  { href: "/history", label: "Historique", sub: "Séances enregistrées", Icon: IconHistory },
  { href: "/settings", label: "Paramètres", sub: "Seuils AU · calibration · lissage", Icon: IconSettings },
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const today = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <div className="flex flex-1 flex-col overflow-auto bg-[var(--color-ivory)]">
      <div className="mx-auto w-full max-w-md flex flex-col flex-1">
        {/* Editorial hero */}
        <div className="px-7 pt-4 pb-6 border-b border-[var(--color-ink-rule)]">
          <p
            className="text-[10px] uppercase text-[var(--color-ink-50)]"
            style={{ letterSpacing: "0.12em", fontWeight: 500 }}
          >
            Aujourd&apos;hui · {today.charAt(0).toUpperCase() + today.slice(1)}
          </p>
          <h1
            className="mt-2.5 text-[var(--color-ink)]"
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 40,
              lineHeight: 1.05,
              letterSpacing: "-0.5px",
            }}
          >
            Analyse faciale <em className="italic text-[var(--color-accent-ink)]">clinique</em>.
          </h1>
          <p className="mt-2.5 max-w-[290px] text-[14px] leading-[1.45] text-[var(--color-ink-70)]">
            Monitoring FACS de la douleur — score PSPI calculé en local, à partir des Action Units.
          </p>
        </div>

        {/* Primary action — dark card */}
        <div className="px-5 pt-5">
          <Link
            href="/camera"
            className="relative block overflow-hidden rounded-3xl bg-[var(--color-ink)] px-6 py-5 text-[#F4F1EA]"
          >
            <div className="flex items-start justify-between">
              <div>
                <span
                  className="text-[10px] uppercase"
                  style={{ letterSpacing: "0.12em", fontWeight: 500, color: "rgba(244,241,234,0.5)" }}
                >
                  Démarrer
                </span>
                <div
                  className="mt-1.5"
                  style={{ fontFamily: "var(--font-serif)", fontSize: 26, letterSpacing: "-0.3px", lineHeight: 1 }}
                >
                  Nouveau monitoring
                </div>
                <div className="mt-1 text-[12.5px]" style={{ color: "rgba(244,241,234,0.65)" }}>
                  Caméra + analyse FACS en temps réel
                </div>
              </div>
              <div
                className="flex h-[38px] w-[38px] items-center justify-center rounded-full"
                style={{ background: "rgba(244,241,234,0.08)" }}
              >
                <IconChev />
              </div>
            </div>
            <svg width="100%" height="36" viewBox="0 0 300 36" className="mt-3 opacity-50">
              <path
                d="M0 18 L20 18 L28 10 L38 22 L48 6 L58 26 L68 14 L78 20 L90 12 L100 24 L108 18 L300 18"
                stroke="#F4F1EA"
                strokeWidth="1"
                fill="none"
                strokeLinecap="round"
              />
            </svg>
          </Link>
        </div>

        {/* Secondary list — hairline-separated rows */}
        <nav className="px-5 mt-2">
          {SECONDARY.map((it, i) => (
            <Link
              key={it.href}
              href={it.href}
              className="flex items-center gap-3.5 px-2 py-4 no-underline"
              style={{
                borderBottom: i < SECONDARY.length - 1 ? "1px solid var(--color-ink-rule)" : "none",
              }}
            >
              <div
                className="flex h-9 w-9 items-center justify-center rounded-[10px] text-[var(--color-ink)]"
                style={{ border: "1px solid var(--color-ink-15)" }}
              >
                <it.Icon />
              </div>
              <div className="flex-1">
                <div className="text-[15.5px] font-medium text-[var(--color-ink)]" style={{ letterSpacing: "-0.2px" }}>
                  {it.label}
                </div>
                <div className="mt-[1px] text-[12px] text-[var(--color-ink-50)]">{it.sub}</div>
              </div>
              <span className="text-[var(--color-ink-30)]"><IconChev /></span>
            </Link>
          ))}
        </nav>

        {/* Footnote — editorial disclaimer */}
        <div
          className="mt-auto mx-7 pt-3 pb-4 flex items-center gap-2"
          style={{ borderTop: "1px solid var(--color-ink-rule)" }}
        >
          <span className="text-[var(--color-ink-50)]"><IconShield /></span>
          <span className="text-[10.5px] leading-[1.4] text-[var(--color-ink-50)]" style={{ letterSpacing: "-0.1px" }}>
            Outil d&apos;aide à l&apos;observation FACS · PSPI (Prkachin &amp; Solomon, 2008). Non certifié dispositif médical.
          </span>
        </div>
      </div>
    </div>
  );
}
