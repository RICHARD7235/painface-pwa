import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import InstallPrompt from "@/components/InstallPrompt";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PainFace",
  description: "Monitoring de douleur faciale pour kinésithérapeutes",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PainFace",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0a0e1a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${inter.variable}`}>
      <body className="h-[100dvh] flex flex-col bg-[#0a0e1a] font-sans antialiased overflow-hidden">
        {/* Glass header */}
        <header
          className="flex-shrink-0 flex items-center justify-between px-5 backdrop-blur-xl border-b border-white/[0.06]"
          style={{
            paddingTop: "max(10px, env(safe-area-inset-top))",
            paddingBottom: "10px",
            background: "linear-gradient(180deg, rgba(99,102,241,0.15) 0%, rgba(10,14,26,0.95) 100%)",
          }}
        >
          <a href="/" className="flex items-center gap-2.5">
            {/* Logo icon */}
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 12h.01M15 12h.01M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5" />
                <circle cx="12" cy="12" r="10" />
              </svg>
            </div>
            <div>
              <span className="text-[17px] font-bold text-white tracking-tight">PainFace</span>
              <span className="ml-1.5 text-[10px] font-medium text-indigo-300/70">PRO</span>
            </div>
          </a>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-slate-500 tracking-wider">v2.0</span>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</main>

        {/* PWA install banner */}
        <InstallPrompt />
      </body>
    </html>
  );
}
