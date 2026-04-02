import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

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
  themeColor: "#4F46E5",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${inter.variable}`}>
      <body className="h-[100dvh] flex flex-col bg-gray-50 font-sans antialiased overflow-hidden">
        {/* Fixed header */}
        <header
          className="flex-shrink-0 bg-indigo-600 text-white px-4 flex items-center justify-between shadow-md"
          style={{ paddingTop: "max(8px, env(safe-area-inset-top))", paddingBottom: "8px" }}
        >
          <a href="/" className="text-xl font-bold tracking-tight">
            PainFace
          </a>
          <span className="text-xs text-indigo-200">v2.0</span>
        </header>

        {/* Main content fills remaining space */}
        <main className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</main>
      </body>
    </html>
  );
}
