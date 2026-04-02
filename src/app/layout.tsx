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
  themeColor: "#4F46E5",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${inter.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-gray-50 font-sans antialiased">
        {/* Header */}
        <header className="bg-indigo-600 text-white px-4 py-3 flex items-center justify-between shadow-md">
          <a href="/" className="text-xl font-bold tracking-tight">
            PainFace
          </a>
          <span className="text-xs text-indigo-200">v2.0 PWA</span>
        </header>

        {/* Main content */}
        <main className="flex-1 flex flex-col">{children}</main>
      </body>
    </html>
  );
}
