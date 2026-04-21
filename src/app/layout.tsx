import type { Metadata, Viewport } from "next";
import "./globals.css";
import InstallPrompt from "@/components/InstallPrompt";

export const metadata: Metadata = {
  title: "PainFace",
  description: "Monitoring de douleur faciale pour kinésithérapeutes",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PainFace",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#F4F1EA",
};

// ─── Clinical wordmark — "Painface" serif + monogram ───────────────────────
function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#14171C" />
      <path
        d="M8 22 Q9 13 12 13 Q13 13 13 16 Q14 13 16 13 Q19 13 18 22"
        stroke="#F4F1EA" strokeWidth="1.6" fill="none" strokeLinecap="round"
      />
      <circle cx="22" cy="13" r="1.1" fill="#F4F1EA" />
      <path d="M22 18 L22 22" stroke="#F4F1EA" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="h-[100dvh] flex flex-col bg-[var(--color-ivory)] text-[var(--color-ink)] antialiased overflow-hidden">
        {/* Editorial header — ivory + hairline rule */}
        <header
          className="flex-shrink-0 flex items-center justify-between px-5 border-b border-[var(--color-ink-08)] bg-[var(--color-ivory)]"
          style={{
            paddingTop: "max(10px, env(safe-area-inset-top))",
            paddingBottom: "10px",
          }}
        >
          <a href="/" className="flex items-center gap-2.5">
            <Logo size={28} />
            <div className="flex flex-col leading-none">
              <span
                className="text-[20px] text-[var(--color-ink)]"
                style={{ fontFamily: "var(--font-serif)", letterSpacing: "-0.3px" }}
              >
                Painface
              </span>
              <span
                className="mt-[3px] text-[9px] uppercase text-[var(--color-ink-50)]"
                style={{ fontFamily: "var(--font-mono)", letterSpacing: "1.5px" }}
              >
                Clinical · v2.1
              </span>
            </div>
          </a>
        </header>

        {/* Main content */}
        <main className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</main>

        {/* PWA install banner */}
        <InstallPrompt />
      </body>
    </html>
  );
}
